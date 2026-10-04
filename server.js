const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'database.sqlite');
const fs = require('fs');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      subject TEXT,
      body TEXT,
      is_read INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      status TEXT DEFAULT 'inbox',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Seed initial users if empty
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO users (email, display_name) VALUES ('admin@local', 'System Administrator')");
        db.run("INSERT INTO users (email, display_name) VALUES ('user@local', 'Standard User')");
        db.run("INSERT INTO users (email, display_name) VALUES ('support@local', 'Support Desk')");
      }
    });
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  db.get("SELECT 1", (err) => {
    if (err) {
      res.status(500).json({ status: 'error', database: err.message });
    } else {
      res.json({ status: 'ok', database: 'connected' });
    }
  });
});

// API Routes
app.get('/api/users', (req, res) => {
  db.all("SELECT * FROM users ORDER BY email ASC", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/users', (req, res) => {
  const { email, display_name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  db.run("INSERT INTO users (email, display_name) VALUES (?, ?)", [email, display_name || email.split('@')[0]], function(err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({ id: this.lastID, email, display_name: display_name || email.split('@')[0] });
  });
});

app.get('/api/emails', (req, res) => {
  const { userId, folder } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  let query = `
    SELECT e.*, u.email as sender_email, u.display_name as sender_name 
    FROM emails e 
    JOIN users u ON e.sender_id = u.id 
    WHERE e.receiver_id = ?
  `;
  const params = [userId];

  if (folder === 'sent') {
    query = `
      SELECT e.*, u.email as receiver_email, u.display_name as receiver_name 
      FROM emails e 
      JOIN users u ON e.receiver_id = u.id 
      WHERE e.sender_id = ?
    `;
  } else if (folder === 'starred') {
    query += " AND e.is_starred = 1";
  } else if (folder === 'trash') {
    query += " AND e.status = 'trash'";
  } else {
    query += " AND e.status != 'trash'";
  }

  query += " ORDER BY e.created_at DESC";

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/emails', (req, res) => {
  const { sender_id, receiver_email, subject, body } = req.body;
  if (!sender_id || !receiver_email || !subject) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.get("SELECT id FROM users WHERE email = ?", [receiver_email], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Receiver email not found in local system' });
    }
    const receiver_id = row.id;

    db.run(
      "INSERT INTO emails (sender_id, receiver_id, subject, body, status) VALUES (?, ?, ?, ?, 'inbox')",
      [sender_id, receiver_id, subject, body || ''],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, success: true });
      }
    );
  });
});

app.patch('/api/emails/:id', (req, res) => {
  const { id } = req.params;
  const { is_read, is_starred, status } = req.body;
  
  let updates = [];
  let params = [];

  if (is_read !== undefined) {
    updates.push("is_read = ?");
    params.push(is_read);
  }
  if (is_starred !== undefined) {
    updates.push("is_starred = ?");
    params.push(is_starred);
  }
  if (status !== undefined) {
    updates.push("status = ?");
    params.push(status);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(id);
  const sql = `UPDATE emails SET ${updates.join(', ')} WHERE id = ?`;

  db.run(sql, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, changes: this.changes });
  });
});

app.delete('/api/emails/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM emails WHERE id = ?", [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
