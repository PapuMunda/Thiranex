import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Database Setup
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_super_secret_key";
let isDbConnected = false;

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log("MongoDB Connected Successfully");
      isDbConnected = true;
    })
    .catch((err) => console.error("Database Connection Error:", err));
} else {
  console.log(
    "⚠️ Running locally without an external database instance. Running in Mock Data mode.",
  );
}

// Data Models
const User = mongoose.model(
  "User",
  new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  }),
);

const Task = mongoose.model(
  "Task",
  new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    completed: { type: Boolean, default: false },
  }),
);

// Mock Database Fallback (For instant out-of-the-box local execution)
let mockUsers = [];
let mockTasks = [];

// --- SECURITY MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access token missing" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
};

// --- AUTHENTICATION ENDPOINTS ---

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    if (isDbConnected) {
      const existingUser = await User.findOne({ username });
      if (existingUser)
        return res.status(400).json({ error: "Username already taken" });
      const user = new User({ username, password: hashedPassword });
      await user.save();
    } else {
      if (mockUsers.find((u) => u.username === username))
        return res.status(400).json({ error: "Username taken" });
      mockUsers.push({
        id: Date.now().toString(),
        username,
        password: hashedPassword,
      });
    }
    res.status(201).json({ message: "User registered successfully!" });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    let user;

    if (isDbConnected) {
      user = await User.findOne({ username });
    } else {
      user = mockUsers.find((u) => u.username === username);
      if (user)
        user = {
          _id: user.id,
          username: user.username,
          password: user.password,
        };
    }

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: "1h" },
    );
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Login engine error" });
  }
});

// --- TASK CRUD ENDPOINTS (PROTECTED BY JWT) ---

// READ: Get all tasks for logged-in user
app.get("/api/tasks", authenticateToken, async (req, res) => {
  if (isDbConnected) {
    const tasks = await Task.find({ userId: req.user.id });
    res.json(tasks);
  } else {
    const tasks = mockTasks.filter((t) => t.userId === req.user.id);
    res.json(tasks);
  }
});

// CREATE: Add a task
app.post("/api/tasks", authenticateToken, async (req, res) => {
  const { title } = req.body;
  if (isDbConnected) {
    const newTask = new Task({ userId: req.user.id, title });
    await newTask.save();
    res.status(201).json(newTask);
  } else {
    const newTask = {
      _id: Date.now().toString(),
      userId: req.user.id,
      title,
      completed: false,
    };
    mockTasks.push(newTask);
    res.status(201).json(newTask);
  }
});

// UPDATE: Toggle task status or change name
app.put("/api/tasks/:id", authenticateToken, async (req, res) => {
  const { title, completed } = req.body;
  if (isDbConnected) {
    const updatedTask = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { title, completed },
      { new: true },
    );
    res.json(updatedTask);
  } else {
    const task = mockTasks.find(
      (t) => t._id === req.params.id && t.userId === req.user.id,
    );
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (title !== undefined) task.title = title;
    if (completed !== undefined) task.completed = completed;
    res.json(task);
  }
});

// DELETE: Remove task
app.delete("/api/tasks/:id", authenticateToken, async (req, res) => {
  if (isDbConnected) {
    await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } else {
    mockTasks = mockTasks.filter(
      (t) => !(t._id === req.params.id && t.userId === req.user.id),
    );
    res.json({ success: true });
  }
});

// Structural page routings
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html")),
);
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html")),
);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Task Manager running at: http://localhost:${PORT}`),
);
