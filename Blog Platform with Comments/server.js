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
const JWT_SECRET = process.env.JWT_SECRET || 'blog_platform_secret_key';
let isDbConnected = false;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => { console.log('Connected to MongoDB Blog Cluster'); isDbConnected = true; })
    .catch(err => console.error('Database connection error:', err));
} else {
  console.log('⚠️ Running locally without an external database instance. Running in Mock Data mode.');
}

// Data Models
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}));

const Post = mongoose.model('Post', new mongoose.Schema({
  authorId: String,
  authorName: String,
  title: String,
  content: String,
  comments: [{
    authorName: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
}));

// Fallback arrays for instant local compilation
let mockUsers = [];
let mockPosts = [
  {
    _id: "b1",
    authorId: "u1",
    authorName: "Alice",
    title: "The Future of Web Engineering",
    content: "Full-stack compilation architectures are minimizing production operational footprints cleanly.",
    comments: [{ authorName: "Bob", text: "Completely agree, clean code structures rule!" }],
    createdAt: new Date()
  }
];

// --- SECURITY ROUTE GATEWAY ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authorization header required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token missing or invalid' });
    req.user = user;
    next();
  });
};

// --- AUTHENTICATION ENDPOINTS ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  if (isDbConnected) {
    try {
      const user = new User({ username, password: hashedPassword });
      await user.save();
    } catch { return res.status(400).json({ error: 'Username already taken.' }); }
  } else {
    if (mockUsers.find(u => u.username === username)) return res.status(400).json({ error: 'Username taken.' });
    mockUsers.push({ id: Date.now().toString(), username, password: hashedPassword });
  }
  res.status(201).json({ message: 'User created' });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  let user = isDbConnected ? await User.findOne({ username }) : mockUsers.find(u => u.username === username);
  if (user && user.id && !user._id) user._id = user.id;

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: 'Invalid login details.' });
  }
  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, username: user.username });
});

// --- BLOG CONTENT CRUD MANAGEMENT ---
app.get('/api/posts', async (req, res) => {
  res.json(isDbConnected ? await Post.find().sort({ createdAt: -1 }) : [...mockPosts].reverse());
});

app.post('/api/posts', authenticateToken, async (req, res) => {
  const { title, content } = req.body;
  const rawPostData = { authorId: req.user.id, authorName: req.user.username, title, content, comments: [] };

  if (isDbConnected) {
    const newPost = await new Post(rawPostData).save();
    res.status(201).json(newPost);
  } else {
    const newPost = { _id: Date.now().toString(), ...rawPostData, createdAt: new Date() };
    mockPosts.push(newPost);
    res.status(201).json(newPost);
  }
});

app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
  if (isDbConnected) {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post missing.' });
    if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Action unauthorized' });
    await Post.findByIdAndDelete(req.params.id);
  } else {
    const postIndex = mockPosts.findIndex(p => p._id === req.params.id);
    if (postIndex === -1) return res.status(404).json({ error: 'Post missing.' });
    if (mockPosts[postIndex].authorId !== req.user.id) return res.status(403).json({ error: 'Action unauthorized' });
    mockPosts.splice(postIndex, 1);
  }
  res.json({ success: true });
});

// --- ENGAGEMENT / COMMENTS SUB-ENGINE ---
app.post('/api/posts/:id/comments', authenticateToken, async (req, res) => {
  const { text } = req.body;
  const commentPayload = { authorName: req.user.username, text, createdAt: new Date() };

  if (isDbConnected) {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    post.comments.push(commentPayload);
    await post.save();
    res.status(201).json(post);
  } else {
    const post = mockPosts.find(p => p._id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    post.comments.push(commentPayload);
    res.status(201).json(post);
  }
});

// Root template route fallback
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Content Node live at: http://localhost:${PORT}`));