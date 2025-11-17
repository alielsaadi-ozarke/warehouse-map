// server.js
// Node.js backend for 3D warehouse map with shared SQLite state.

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// --- CONFIG ---
const PORT = process.env.PORT || 3000;

// DB_FILE:
//  - Locally: defaults to ./warehouse_layout.db
//  - On Render: set env var DB_FILE=/var/data/warehouse_layout.db (with a Disk attached)
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'warehouse_layout.db');

// --- SQLITE SETUP ---
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS warehouse_layout (
      code        TEXT PRIMARY KEY,
      sku         TEXT,
      qty         INTEGER,
      notes       TEXT,
      updated_at  TEXT,
      updated_by  TEXT
    )
  `);
});

// --- EXPRESS APP ---
const app = express();

// Parse JSON bodies
app.use(express.json());

// Serve static files (frontend) from /public
app.use(express.static(path.join(__dirname, 'public')));

// Simple health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// GET /api/layout  -> return all locations we have stored
app.get('/api/layout', (req, res) => {
  db.all(
    'SELECT code, sku, qty, notes FROM warehouse_layout',
    [],
    (err, rows) => {
      if (err) {
        console.error('DB error on /api/layout:', err);
        return res.status(500).json({ error: 'db_error' });
      }
      res.json(rows || []);
    }
  );
});

// PATCH /api/location/:code  -> upsert a single location
app.patch('/api/location/:code', (req, res) => {
  const code = req.params.code;
  if (!code) {
    return res.status(400).json({ error: 'missing_code' });
  }

  const body = req.body || {};
  const sku = typeof body.sku === 'string' ? body.sku : '';
  const qty =
    body.qty === null || body.qty === undefined || body.qty === ''
      ? null
      : Number(body.qty);
  const notes = typeof body.notes === 'string' ? body.notes : '';
  const updated_by =
    typeof body.updated_by === 'string' ? body.updated_by : 'unknown';
  const updated_at = new Date().toISOString();

  const sql = `
    INSERT INTO warehouse_layout (code, sku, qty, notes, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      sku = excluded.sku,
      qty = excluded.qty,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `;

  db.run(
    sql,
    [code, sku, qty, notes, updated_at, updated_by],
    function (err) {
      if (err) {
        console.error('DB error on /api/location:', err);
        return res.status(500).json({ error: 'db_error' });
      }
      res.json({ success: true });
    }
  );
});

// Fallback: serve the main HTML for unknown routes (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'warehouse_3d_shared.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`DB file: ${DB_FILE}`);
});
