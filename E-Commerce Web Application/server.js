import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'ecommerce_secret_override_key';
let isDbConnected = false;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => { console.log('MongoDB Connected to E-Commerce Data Cluster'); isDbConnected = true; })
    .catch(err => console.error('E-Commerce DB Connection Failure:', err));
} else {
  console.log('⚠️ Running in Local Mock Data mode. No active MONGO_URI discovered.');
}

// Data Architecture Model Schemas
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}));

const Product = mongoose.model('Product', new mongoose.Schema({
  name: String, price: Number, description: String, stock: Number
}));

const Order = mongoose.model('Order', new mongoose.Schema({
  userId: String, username: String, items: Array, total: Number, status: { type: String, default: 'Pending' }, createdAt: { type: Date, default: Date.now }
}));

// Fallback runtime arrays if standard cloud instances are decoupled
let mockUsers = [];
let mockProducts = [
  { _id: "p1", name: "Mechanical Keyboard", price: 99, description: "RGB Backlit tactile mechanical gaming peripheral.", stock: 15 },
  { _id: "p2", name: "Ergonomic Wireless Mouse", price: 49, description: "Precision tracking multi-surface productivity tool.", stock: 20 }
];
let mockOrders = [];

// --- GATEWAY MIDDLEWARES ---
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token validation failure' });
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied. Administrative rights required.' });
  next();
};

// --- AUTHENTICATION APIS ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userRole = role === 'admin' ? 'admin' : 'user';

  if (isDbConnected) {
    try {
      const newUser = new User({ username, password: hashedPassword, role: userRole });
      await newUser.save();
    } catch { return res.status(400).json({ error: 'Username already registered.' }); }
  } else {
    if (mockUsers.find(u => u.username === username)) return res.status(400).json({ error: 'Username registered.' });
    mockUsers.push({ id: Date.now().toString(), username, password: hashedPassword, role: userRole });
  }
  res.status(201).json({ message: 'User provisioned.' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  let user = isDbConnected ? await User.findOne({ username }) : mockUsers.find(u => u.username === username);
  if (user && user.id && !user._id) user._id = user.id; // Map mock identity parameters

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: 'Authentication details mismatch.' });
  }
  const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, username: user.username, role: user.role });
});

// --- CATALOG MANAGEMENT & PUBLIC SHOPPING ENDPOINTS ---
app.get('/api/products', async (req, res) => {
  res.json(isDbConnected ? await Product.find() : mockProducts);
});

// Admin-Protected Route: Create Product
app.post('/api/products', authenticateToken, isAdmin, async (req, res) => {
  if (isDbConnected) {
    const item = await new Product(req.body).save();
    res.status(201).json(item);
  } else {
    const item = { _id: Date.now().toString(), ...req.body };
    mockProducts.push(item);
    res.status(201).json(item);
  }
});

// --- ORDER PIPELINE & TRANSACTION TRACKING ---
app.post('/api/orders', authenticateToken, async (req, res) => {
  const { items, total } = req.body;
  const layout = { userId: req.user.id, username: req.user.username, items, total, status: 'Processing', createdAt: new Date() };

  if (isDbConnected) {
    const orderObj = await new Order(layout).save();
    res.status(201).json(orderObj);
  } else {
    const orderObj = { _id: Date.now().toString(), ...layout };
    mockOrders.push(orderObj);
    res.status(201).json(orderObj);
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  if (req.user.role === 'admin') {
    res.json(isDbConnected ? await Order.find() : mockOrders);
  } else {
    res.json(isDbConnected ? await Order.find({ userId: req.user.id }) : mockOrders.filter(o => o.userId === req.user.id));
  }
});

// Static Routing fallbacks
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Store Matrix deploying at: http://localhost:${PORT}`));