import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Middleware Configuration
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE CONNECTIVITY AND ARCHITECTURE ---
const MONGO_URI = process.env.MONGO_URI;
let isDbConnected = false;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log('Connected smoothly to MongoDB Production Engine');
      isDbConnected = true;
    })
    .catch(err => console.error('Database configuration connection error:', err));
} else {
  console.log('⚠️ Running locally without an external database instance. Using built-in portfolio items fallback.');
}

// Data Architecture Model Schemas
const Project = mongoose.model('Project', new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  technologies: [String],
  liveLink: { type: String, default: '#' },
  githubLink: { type: String, default: '#' }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  name: String, email: String, message: String, createdAt: { type: Date, default: Date.now }
}));

// --- APPLICATION API ENDPOINTS ---

// GET API: Expose production assets
app.get('/api/projects', async (req, res) => {
  try {
    if (isDbConnected) {
      const dbProjects = await Project.find();
      return res.status(200).json(dbProjects);
    }
    
    // Dynamic Fallback Matrix if your MongoDB Atlas cluster isn't ready yet
    return res.status(200).json([
      {
        title: "Dynamic Grid E-Commerce Engine",
        description: "An automated full-stack platform incorporating payment architectures and real-time inventory management loops.",
        technologies: ["Node.js", "Express", "MongoDB"],
        liveLink: "https://example.com",
        githubLink: "https://github.com"
      },
      {
        title: "Distributed Pipeline CLI Tool",
        description: "Automated server performance metric mapping script written for optimization of modern container environments.",
        technologies: ["JavaScript", "Node.js", "Express"],
        liveLink: "https://example.com",
        githubLink: "https://github.com"
      }
    ]);
  } catch (error) {
    res.status(500).json({ error: 'Internal system tracking exception while reading data structural array.' });
  }
});

// POST API: Process Portfolio Inquiries
app.post('/api/contact', async (req, res) => {
  try {
    console.log('Incoming Message Body Captured:', req.body);
    if (isDbConnected) {
      const incomingMessage = new Message(req.body);
      await incomingMessage.save();
    }
    res.status(201).json({ success: true, statusMessage: 'Message handled perfectly by application runtime context.' });
  } catch (error) {
    res.status(400).json({ error: 'Invalid submission data mapping schema.' });
  }
});

// Catch-all structural client router fallback path redirection
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const RUNTIME_PORT = process.env.PORT || 5000;
app.listen(RUNTIME_PORT, () => {
  console.log(`🚀 Monolithic Core Instance Active: http://localhost:${RUNTIME_PORT}`);
});