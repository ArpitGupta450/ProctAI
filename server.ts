import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("proctor.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    name TEXT
  );

  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    status TEXT DEFAULT 'ongoing',
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    type TEXT,
    description TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    screenshot_url TEXT,
    FOREIGN KEY(exam_id) REFERENCES exams(id)
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API Routes
  app.post("/api/auth", (req, res) => {
    const { email, name } = req.body;
    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user) {
      const info = db.prepare("INSERT INTO users (email, name) VALUES (?, ?)").run(email, name);
      user = { id: info.lastInsertRowid, email, name };
    }
    res.json(user);
  });

  app.post("/api/exams/start", (req, res) => {
    const { userId } = req.body;
    const info = db.prepare("INSERT INTO exams (user_id) VALUES (?)").run(userId);
    res.json({ examId: info.lastInsertRowid });
  });

  app.post("/api/exams/finish", (req, res) => {
    const { examId } = req.body;
    db.prepare("UPDATE exams SET end_time = CURRENT_TIMESTAMP, status = 'finished' WHERE id = ?").run(examId);
    
    const exam = db.prepare(`
      SELECT e.*, u.name, u.email 
      FROM exams e 
      JOIN users u ON e.user_id = u.id 
      WHERE e.id = ?
    `).get(examId) as any;

    const violations = db.prepare("SELECT * FROM violations WHERE exam_id = ? ORDER BY timestamp ASC").all(examId);
    
    res.json({ exam, violations });
  });

  app.post("/api/violations", (req, res) => {
    const { examId, type, description, screenshotUrl } = req.body;
    db.prepare("INSERT INTO violations (exam_id, type, description, screenshot_url) VALUES (?, ?, ?, ?)").run(examId, type, description, screenshotUrl);
    res.json({ success: true });
  });

  app.get("/api/reports/:examId", (req, res) => {
    const { examId } = req.params;
    const exam = db.prepare(`
      SELECT e.*, u.name, u.email 
      FROM exams e 
      JOIN users u ON e.user_id = u.id 
      WHERE e.id = ?
    `).get(examId) as any;
    const violations = db.prepare("SELECT * FROM violations WHERE exam_id = ? ORDER BY timestamp ASC").all(examId);
    res.json({ exam, violations });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
