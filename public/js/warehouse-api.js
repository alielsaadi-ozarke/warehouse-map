// public/js/warehouse-api.js

const CURRENT_USER = 'warehouse-user';

// Load all saved locations from backend and merge into LOCATIONS
async function loadStateFromServer() {
  try {
    const res = await fetch('/api/layout');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json(); // [{code, notes, items:[...]}, ...]

    const map = new Map(data.map((loc) => [loc.code, loc]));

    for (const loc of LOCATIONS) {
      const row = map.get(loc.code);
      if (!row) {
        loc.items = [];
        loc.notes = '';
        continue;
      }

      loc.notes = row.notes || '';

      const items = Array.isArray(row.items) ? row.items : [];
      loc.items = items
        .filter((it) => it && typeof it.sku === 'string' && it.sku.trim() !== '')
        .map((it) => ({
          sku: it.sku.trim(),
          qty:
            it.qty === 0 || typeof it.qty === 'number'
              ? it.qty
              : null,
        }));
    }

    console.log('Layout loaded from server (multi-SKU)');
  } catch (err) {
    console.error('Failed to load layout from server:', err);
  }
}

// Save a single location (notes + all items) to backend
async function saveLocationToServer(loc) {
  try {
    const payload = {
      notes: loc.notes || '',
      items: (loc.items || []).map((it) => ({
        sku: it.sku,
        qty: it.qty,
      })),
      updated_by: CURRENT_USER,
    };

    await fetch('/api/location/' + encodeURIComponent(loc.code), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Failed to save location to server:', err);
  }
}
