// server.js
// Node backend for 3D warehouse map with real admin auth (JWT)

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 10000;

// IMPORTANT: set these as environment variables on Render
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'warehouse_layout.db');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CHANGE_ME_ADMIN_PASSWORD';
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_JWT_SECRET';

// JSON body parsing
app.use(express.json());

// -----------------------------------------------------------------------------
// SQLite setup
// -----------------------------------------------------------------------------
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(
    `
    CREATE TABLE IF NOT EXISTS locations (
      code  TEXT PRIMARY KEY,
      items TEXT,
      notes TEXT
    )
    `
  );
});

// Promisified helpers
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// -----------------------------------------------------------------------------
// Static files
// -----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// -----------------------------------------------------------------------------
// Auth: login + middleware
// -----------------------------------------------------------------------------

// POST /api/login  { password }
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign(
    { role: 'admin' },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token });
});

// Middleware: require valid admin token
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7); // strip "Bearer "
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = payload;
    next();
  } catch (err) {
    console.error('JWT verify failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// -----------------------------------------------------------------------------
// Layout APIs
// -----------------------------------------------------------------------------

// GET /api/layout  -> list of { code, items, notes }
app.get('/api/layout', async (req, res) => {
  try {
    const rows = await allAsync('SELECT code, items, notes FROM locations', []);
    const data = rows.map((r) => ({
      code: r.code,
      items: r.items ? JSON.parse(r.items) : [],
      notes: r.notes || '',
    }));
    res.json(data);
  } catch (err) {
    console.error('Error in /api/layout:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/location/:code  (ADMIN ONLY)
// Body: { code, items, notes }
app.post('/api/location/:code', requireAdmin, async (req, res) => {
  const code = req.params.code;
  const { items, notes } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: 'Location code is required' });
  }

  try {
    await runAsync(
      `
      INSERT INTO locations (code, items, notes)
      VALUES (?, ?, ?)
      ON CONFLICT(code)
      DO UPDATE SET
        items = excluded.items,
        notes = excluded.notes
      `,
      [code, JSON.stringify(items || []), notes || '']
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Error saving location:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -----------------------------------------------------------------------------
// SPA fallback – serve the main HTML for any other route
// -----------------------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'warehouse_3d_shared.html'));
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log('DB file:', DB_FILE);
});
