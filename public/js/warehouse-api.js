// public/js/warehouse-api.js
// Backend communication for 3D warehouse map.
//
// Expects a global LOCATIONS array created in warehouse-config.js.
//
// Endpoints used:
//   GET  /api/layout
//   POST /api/location/:code   (admin-only, JWT protected)

async function loadStateFromServer() {
  try {
    const resp = await fetch('/api/layout');
    if (!resp.ok) {
      console.error('loadStateFromServer: HTTP', resp.status);
      return;
    }
    const rows = await resp.json();

    const byCode = new Map(rows.map((r) => [r.code, r]));

    // Merge DB data (items + notes) into existing LOCATIONS
    LOCATIONS.forEach((loc) => {
      const dbRow = byCode.get(loc.code);
      if (!dbRow) return;
      loc.items = Array.isArray(dbRow.items) ? dbRow.items : [];
      loc.notes = dbRow.notes || '';
    });
  } catch (err) {
    console.error('loadStateFromServer failed:', err);
  }
}

// Helper to get stored admin token
function getAdminToken() {
  try {
    return localStorage.getItem('warehouseAdminToken') || null;
  } catch {
    return null;
  }
}

async function saveLocationToServer(loc) {
  const token = getAdminToken();
  if (!token) {
    throw new Error('Admin token missing – please log in again.');
  }

  const payload = {
    code: loc.code,
    items: loc.items || [],
    notes: loc.notes || '',
  };

  const resp = await fetch('/api/location/' + encodeURIComponent(loc.code), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('Not authorized – session may have expired. Please log in again.');
    }
    const txt = await resp.text().catch(() => '');
    throw new Error(
      'Save failed with status ' +
        resp.status +
        (txt ? ': ' + txt : '')
    );
  }
}
