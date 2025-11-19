// server.js

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'warehouse_layout.db');
console.log('DB file:', DB_FILE);

const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  // Location-level info (notes, last updated)
  db.run(`
    CREATE TABLE IF NOT EXISTS locations (
      code TEXT PRIMARY KEY,
      notes TEXT,
      updated_by TEXT,
      updated_at TEXT
    )
  `);

  // Multiple SKUs per location
  db.run(`
    CREATE TABLE IF NOT EXISTS location_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      sku TEXT,
      qty INTEGER,
      FOREIGN KEY(code) REFERENCES locations(code)
    )
  `);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------------
// GET /api/layout  ->  [{ code, notes, updated_by, updated_at, items:[{id, sku, qty}] }, ...]
// -----------------------------------------------------------------------------
app.get('/api/layout', (req, res) => {
  db.all(
    `SELECT code, notes, updated_by, updated_at FROM locations`,
    (err, locationRows) => {
      if (err) {
        console.error('Error reading locations', err);
        return res.status(500).json({ error: 'db error' });
      }

      db.all(
        `SELECT code, sku, qty, id FROM location_items`,
        (err2, itemRows) => {
          if (err2) {
            console.error('Error reading location_items', err2);
            return res.status(500).json({ error: 'db error' });
          }

          const map = new Map();

          // Start from locations table
          for (const row of locationRows) {
            map.set(row.code, {
              code: row.code,
              notes: row.notes || '',
              updated_by: row.updated_by || null,
              updated_at: row.updated_at || null,
              items: [],
            });
          }

          // Add items
          for (const row of itemRows) {
            if (!map.has(row.code)) {
              map.set(row.code, {
                code: row.code,
                notes: '',
                updated_by: null,
                updated_at: null,
                items: [],
              });
            }
            const bucket = map.get(row.code);
            bucket.items.push({
              id: row.id,
              sku: row.sku || '',
              qty: row.qty,
            });
          }

          res.json(Array.from(map.values()));
        }
      );
    }
  );
});

// -----------------------------------------------------------------------------
// PATCH /api/location/:code
// Body: { notes, items:[{sku, qty}], updated_by }
// -----------------------------------------------------------------------------
app.patch('/api/location/:code', (req, res) => {
  const code = req.params.code;
  const { notes, items, updated_by } = req.body || {};
  const cleanNotes = typeof notes === 'string' ? notes : '';
  const list = Array.isArray(items) ? items : [];
  const user = typeof updated_by === 'string' ? updated_by : null;

  db.serialize(() => {
    // Upsert into locations (notes + last updated info)
    db.run(
      `
      INSERT INTO locations (code, notes, updated_by, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(code) DO UPDATE SET
        notes = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
      `,
      [code, cleanNotes, user],
      (err) => {
        if (err) {
          console.error('Error upserting location', err);
        }
      }
    );

    // Clear existing items for this code
    db.run(
      `DELETE FROM location_items WHERE code = ?`,
      [code],
      (err) => {
        if (err) {
          console.error('Error deleting old items', err);
        } else {
          // Insert new items
          const stmt = db.prepare(
            `INSERT INTO location_items (code, sku, qty) VALUES (?, ?, ?)`
          );
          for (const it of list) {
            const sku =
              it && typeof it.sku === 'string' ? it.sku.trim() : '';
            if (!sku) continue; // skip empty sku rows
            let qty = null;
            if (it && (it.qty === 0 || typeof it.qty === 'number')) {
              qty = it.qty;
            }
            stmt.run(code, sku, qty, (err2) => {
              if (err2) {
                console.error('Error inserting item', err2);
              }
            });
          }
          stmt.finalize();
        }
      }
    );
  });

  res.json({ ok: true });
});

// -----------------------------------------------------------------------------
// Fallback to main HTML
// -----------------------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'warehouse_3d_shared.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
