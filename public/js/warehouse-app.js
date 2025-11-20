// public/js/warehouse-app.js

// Globals from other files:
// - WAREHOUSE_CONFIG
// - LOCATIONS
// - loadStateFromServer()
// - saveLocationToServer()

// -----------------------------------------------------------------------------
// Admin state
// -----------------------------------------------------------------------------
let isAdmin = false;

// -----------------------------------------------------------------------------
// FIXED DEFAULT VIEW (from your captured values)
// -----------------------------------------------------------------------------
const INITIAL_TARGET = new THREE.Vector3(1.0, 2.0, 6.7);
const INITIAL_CAMERA_POS = new THREE.Vector3(
  -25.19236066284855,
  8.43019699516454,
  7.482821506245841
);

// -----------------------------------------------------------------------------
// THREE.js setup
// -----------------------------------------------------------------------------
const sceneEl = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(sceneEl.clientWidth, sceneEl.clientHeight);
sceneEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);

const camera = new THREE.PerspectiveCamera(
  50,
  sceneEl.clientWidth / sceneEl.clientHeight,
  0.1,
  1000
);

camera.position.copy(INITIAL_CAMERA_POS);
camera.lookAt(INITIAL_TARGET);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.target.copy(INITIAL_TARGET);

window.addEventListener('resize', () => {
  renderer.setSize(sceneEl.clientWidth, sceneEl.clientHeight);
  camera.aspect = sceneEl.clientWidth / sceneEl.clientHeight;
  camera.updateProjectionMatrix();
});

// -----------------------------------------------------------------------------
// Lights & grid
// -----------------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dir = new THREE.DirectionalLight(0xffffff, 0.7);
dir.position.set(10, 15, 10);
scene.add(dir);

const grid = new THREE.GridHelper(80, 80, 0x333333, 0x222222);
scene.add(grid);

function makeTextSprite(text) {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#cccccc';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2, 2, 1);
  return sprite;
}

(function addRowLabels() {
  const order = ['A', 'B', 'C', 'D'];
  let zBase = 0;
  for (const row of order) {
    const label = makeTextSprite('Row ' + row);
    label.position.set(-8, 2.2, zBase - 1.6);
    scene.add(label);
    zBase += WAREHOUSE_CONFIG.rowSpacingZ;
  }
})();

// -----------------------------------------------------------------------------
// Materials & meshes
// -----------------------------------------------------------------------------
const cubeGeo = new THREE.BoxGeometry(
  WAREHOUSE_CONFIG.cubeSize.x,
  WAREHOUSE_CONFIG.cubeSize.y,
  WAREHOUSE_CONFIG.cubeSize.z
);
const matEmpty = new THREE.MeshStandardMaterial({ color: 0x555555 });
const matOccupied = new THREE.MeshStandardMaterial({ color: 0x1f6f1f });
const matSelected = new THREE.MeshStandardMaterial({ color: 0x9c6f1f });
const matSource = new THREE.MeshStandardMaterial({ color: 0x2a7fff });

const meshByCode = new Map();
let selectedCode = null;
let sourceCode = null;

function isOccupied(loc) {
  return loc.items && loc.items.length > 0;
}

function matFor(loc) {
  if (loc.code === sourceCode) return matSource;
  if (loc.code === selectedCode) return matSelected;
  return isOccupied(loc) ? matOccupied : matEmpty;
}

function refreshMaterials() {
  for (const loc of LOCATIONS) {
    const mesh = meshByCode.get(loc.code);
    if (mesh) mesh.material = matFor(loc);
  }
}

for (const loc of LOCATIONS) {
  const cube = new THREE.Mesh(cubeGeo, matFor(loc));
  cube.position.set(loc.x, loc.y, loc.z);
  cube.userData.code = loc.code;
  scene.add(cube);
  meshByCode.set(loc.code, cube);
}

// -----------------------------------------------------------------------------
// Filters + SKU dropdown
// -----------------------------------------------------------------------------
const fRowEl = document.getElementById('fRow');
const fSkuInputEl = document.getElementById('fSkuInput');
const fSkuToggleEl = document.getElementById('fSkuToggle');
const fSkuListPanelEl = document.getElementById('fSkuListPanel');
const searchStatusEl = document.getElementById('searchStatus');

// Match navigation
const matchNavRow = document.getElementById('matchNavRow');
const prevMatchBtn = document.getElementById('prevMatchBtn');
const nextMatchBtn = document.getElementById('nextMatchBtn');
const matchInfoEl = document.getElementById('matchInfo');

let allSkus = [];
let lastMatchingCodes = [];
let currentMatchIndex = -1;

function updateMatchNavUI() {
  if (lastMatchingCodes.length === 0) {
    matchNavRow.style.display = 'none';
    matchInfoEl.textContent = 'Match 0 of 0';
    prevMatchBtn.disabled = true;
    nextMatchBtn.disabled = true;
    return;
  }

  matchNavRow.style.display = 'flex';
  matchInfoEl.textContent =
    'Match ' + (currentMatchIndex + 1) + ' of ' + lastMatchingCodes.length;

  const disable = lastMatchingCodes.length <= 1;
  prevMatchBtn.disabled = disable;
  nextMatchBtn.disabled = disable;
}

function setMatchResults(codes) {
  lastMatchingCodes = codes.slice();
  currentMatchIndex = lastMatchingCodes.length > 0 ? 0 : -1;
  updateMatchNavUI();
}

function rebuildSkuList() {
  const skuSet = new Set();
  for (const loc of LOCATIONS) {
    if (!loc.items) continue;
    for (const it of loc.items) {
      const sku = (it.sku || '').trim();
      if (sku) skuSet.add(sku);
    }
  }

  allSkus = Array.from(skuSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  const previous = fSkuInputEl.value;
  renderSkuPanel(allSkus, previous);
}

function renderSkuPanel(list) {
  fSkuListPanelEl.innerHTML = '';

  if (!list.length) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'sku-option empty';
    emptyDiv.textContent = 'No SKUs available';
    fSkuListPanelEl.appendChild(emptyDiv);
    return;
  }

  list.forEach((sku) => {
    const div = document.createElement('div');
    div.className = 'sku-option';
    div.textContent = sku;
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      fSkuInputEl.value = sku;
      hideSkuPanel();
    });
    fSkuListPanelEl.appendChild(div);
  });
}

function showSkuPanel() {
  if (!allSkus.length) rebuildSkuList();
  fSkuListPanelEl.style.display = 'block';
}

function hideSkuPanel() {
  fSkuListPanelEl.style.display = 'none';
}

function toggleSkuPanel() {
  if (fSkuListPanelEl.style.display === 'block') showSkuPanel();
  else showSkuPanel();
}

fSkuInputEl.addEventListener('input', (e) => {
  const term = e.target.value.trim().toUpperCase();
  searchStatusEl.textContent = '';

  if (!allSkus.length) rebuildSkuList();

  const filtered = term
    ? allSkus.filter((sku) => sku.toUpperCase().includes(term))
    : allSkus.slice();

  renderSkuPanel(filtered);

  if (term) showSkuPanel();
});

fSkuToggleEl.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSkuPanel();
});

document.addEventListener('click', () => hideSkuPanel());
fSkuListPanelEl.addEventListener('click', (e) => e.stopPropagation());
fSkuInputEl.addEventListener('click', (e) => e.stopPropagation());

// Load DB state then refresh materials + SKUs
loadStateFromServer().then(() => {
  refreshMaterials();
  rebuildSkuList();
  updateMatchNavUI();
});

// -----------------------------------------------------------------------------
// Picking & hover
// -----------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Array.from(meshByCode.values()));
  if (hits.length > 0) {
    selectLocation(hits[0].object.userData.code);
  }
});

// -----------------------------------------------------------------------------
// Admin UI: multi-SKU, notes
// -----------------------------------------------------------------------------
const selCodeEl = document.getElementById('selCode');
const itemsContainer = document.getElementById('itemsContainer');
const addItemBtn = document.getElementById('addItemBtn');
const notesEl = document.getElementById('notes');

function createItemRow(item = { sku: '', qty: null }) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const skuInput = document.createElement('input');
  skuInput.type = 'text';
  skuInput.placeholder = 'SKU';
  skuInput.className = 'item-sku';
  skuInput.value = item.sku || '';

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.placeholder = 'Qty';
  qtyInput.className = 'item-qty';
  qtyInput.value =
    item.qty === 0 || typeof item.qty === 'number' ? item.qty : '';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '×';
  removeBtn.className = 'remove-item-btn';
  removeBtn.addEventListener('click', () => {
    itemsContainer.removeChild(row);
  });

  row.appendChild(skuInput);
  row.appendChild(qtyInput);
  row.appendChild(removeBtn);

  return row;
}

function renderItemsForLocation(loc) {
  itemsContainer.innerHTML = '';
  let items = loc && Array.isArray(loc.items) ? loc.items : [];
  if (items.length === 0) items = [{ sku: '', qty: null }];
  for (const it of items) {
    itemsContainer.appendChild(createItemRow(it));
  }
}

function collectItemsFromUI() {
  const rows = itemsContainer.querySelectorAll('.item-row');
  const items = [];
  rows.forEach((row) => {
    const skuInput = row.querySelector('.item-sku');
    const qtyInput = row.querySelector('.item-qty');
    const sku = skuInput.value.trim();
    const qtyStr = qtyInput.value;
    if (!sku) return;
    const qty = qtyStr === '' ? null : Number(qtyStr);
    items.push({ sku, qty });
  });
  return items;
}

addItemBtn.addEventListener('click', () => {
  if (!isAdmin) {
    alert('Admin login required to edit items.');
    return;
  }
  itemsContainer.appendChild(createItemRow());
});

// -----------------------------------------------------------------------------
// Selection logic
// -----------------------------------------------------------------------------
function selectLocation(code) {
  selectedCode = code;
  const loc = LOCATIONS.find((l) => l.code === code);
  if (!loc) {
    selCodeEl.textContent = 'No location selected';
    itemsContainer.innerHTML = '';
    notesEl.value = '';
    refreshMaterials();
    return;
  }

  selCodeEl.textContent = code;
  renderItemsForLocation(loc);
  notesEl.value = loc.notes || '';
  refreshMaterials();
}

// -----------------------------------------------------------------------------
// Admin buttons: save / clear / move
// -----------------------------------------------------------------------------
document.getElementById('saveBtn').onclick = async () => {
  if (!isAdmin) {
    alert('Admin only: please login on the Admin tab.');
    return;
  }
  if (!selectedCode) return;
  const loc = LOCATIONS.find((l) => l.code === selectedCode);
  if (!loc) return;

  loc.items = collectItemsFromUI();
  loc.notes = notesEl.value.trim();

  try {
    await saveLocationToServer(loc);
  } catch (err) {
    alert(err.message || 'Save failed');
  }
  refreshMaterials();
  rebuildSkuList();
};

document.getElementById('clearBtn').onclick = async () => {
  if (!isAdmin) {
    alert('Admin only: please login on the Admin tab.');
    return;
  }
  if (!selectedCode) return;
  const loc = LOCATIONS.find((l) => l.code === selectedCode);
  if (!loc) return;

  loc.items = [];
  loc.notes = '';
  notesEl.value = '';
  renderItemsForLocation(loc);

  try {
    await saveLocationToServer(loc);
  } catch (err) {
    alert(err.message || 'Clear failed');
  }
  refreshMaterials();
  rebuildSkuList();
};

document.getElementById('setSrcBtn').onclick = () => {
  if (!isAdmin) {
    alert('Admin only: please login on the Admin tab.');
    return;
  }
  if (!selectedCode) return;
  sourceCode = selectedCode;
  document.getElementById('moveStatus').textContent =
    'Source set: ' + sourceCode;
  refreshMaterials();
};

document.getElementById('moveHereBtn').onclick = async () => {
  if (!isAdmin) {
    alert('Admin only: please login on the Admin tab.');
    return;
  }
  if (!selectedCode || !sourceCode) {
    document.getElementById('moveStatus').textContent =
      'Select a source, then a destination.';
    return;
  }
  if (selectedCode === sourceCode) {
    document.getElementById('moveStatus').textContent =
      'Source and destination are the same.';
    return;
  }

  const src = LOCATIONS.find((l) => l.code === sourceCode);
  const dst = LOCATIONS.find((l) => l.code === selectedCode);
  if (!src || !dst) return;

  const srcEmpty = !src.items || src.items.length === 0;
  if (srcEmpty) {
    document.getElementById('moveStatus').textContent =
      'Source is empty.';
    return;
  }

  const dstEmpty = !dst.items || dst.items.length === 0;

  if (dstEmpty) {
    dst.items = src.items;
    dst.notes = src.notes;
    src.items = [];
    src.notes = '';
  } else {
    const tItems = dst.items;
    const tNotes = dst.notes;
    dst.items = src.items;
    dst.notes = src.notes;
    src.items = tItems;
    src.notes = tNotes;
  }

  try {
    await saveLocationToServer(src);
    await saveLocationToServer(dst);
  } catch (err) {
    alert(err.message || 'Move failed');
  }

  selectLocation(selectedCode);
  document.getElementById('moveStatus').textContent = 'Moved/swapped.';
  sourceCode = null;
  refreshMaterials();
  rebuildSkuList();
};

// -----------------------------------------------------------------------------
// Flashing + camera fly
// -----------------------------------------------------------------------------
const FLASH_DURATION_MS = 1200;
const FLASH_FREQ_HZ = 4;
const FLASH_SCALE_AMPLITUDE = 0.35;
let flashTargets = [];

function flashCubes(codes) {
  const now = performance.now();
  flashTargets = [];
  codes.forEach((code) => {
    const mesh = meshByCode.get(code);
    if (!mesh) return;
    mesh.scale.set(1, 1, 1);
    flashTargets.push({ mesh, startTime: now });
  });
}

let flyState = null;
const FLY_DURATION_MS = 700;

function flyToLocation(code) {
  const mesh = meshByCode.get(code);
  if (!mesh) return;

  const targetPos = mesh.position.clone();
  const currentTarget = controls.target.clone();
  const offset = camera.position.clone().sub(currentTarget);
  const distance = offset.length();
  offset.normalize();

  const endTarget = targetPos;
  const endPos = targetPos.clone().add(offset.multiplyScalar(distance));

  flyState = {
    startTime: performance.now(),
    duration: FLY_DURATION_MS,
    startPos: camera.position.clone(),
    startTarget: controls.target.clone(),
    endPos,
    endTarget,
  };
}

// -----------------------------------------------------------------------------
// Filters / search
// -----------------------------------------------------------------------------
document.getElementById('applyFilters').onclick = () => {
  const rowFilter = fRowEl.value.trim().toUpperCase();
  const skuTerm = fSkuInputEl.value.trim().toUpperCase();

  searchStatusEl.textContent = '';

  if (!rowFilter && !skuTerm) {
    searchStatusEl.textContent = '';
    setMatchResults([]);
    return;
  }

  for (const mesh of meshByCode.values()) {
    mesh.visible = true;
  }

  const matchingCodes = [];

  for (const loc of LOCATIONS) {
    let match = true;

    if (rowFilter && loc.row !== rowFilter) match = false;

    if (skuTerm) {
      let hasMatch = false;
      if (loc.items && loc.items.length > 0) {
        for (const it of loc.items) {
          const sku = (it.sku || '').toUpperCase();
          if (sku.includes(skuTerm)) {
            hasMatch = true;
            break;
          }
        }
      }
      if (!hasMatch) match = false;
    }

    if (match) matchingCodes.push(loc.code);
  }

  if (matchingCodes.length === 0) {
    searchStatusEl.textContent = 'No locations found for given filters.';
    setMatchResults([]);
    return;
  }

  setMatchResults(matchingCodes);

  const firstCode = lastMatchingCodes[0];
  selectLocation(firstCode);
  flashCubes(matchingCodes);
  flyToLocation(firstCode);
};

document.getElementById('clearFilters').onclick = () => {
  fRowEl.value = '';
  fSkuInputEl.value = '';
  searchStatusEl.textContent = '';

  for (const mesh of meshByCode.values()) mesh.visible = true;

  setMatchResults([]);
};

prevMatchBtn.addEventListener('click', () => {
  if (lastMatchingCodes.length === 0) return;
  currentMatchIndex =
    (currentMatchIndex - 1 + lastMatchingCodes.length) %
    lastMatchingCodes.length;
  const code = lastMatchingCodes[currentMatchIndex];
  selectLocation(code);
  flashCubes([code]);
  flyToLocation(code);
  updateMatchNavUI();
});

nextMatchBtn.addEventListener('click', () => {
  if (lastMatchingCodes.length === 0) return;
  currentMatchIndex =
    (currentMatchIndex + 1) % lastMatchingCodes.length;
  const code = lastMatchingCodes[currentMatchIndex];
  selectLocation(code);
  flashCubes([code]);
  flyToLocation(code);
  updateMatchNavUI();
});

// -----------------------------------------------------------------------------
// Camera controls
// -----------------------------------------------------------------------------
const PAN_SPEED = 1.2;
const MIN_DIST = 6;
const MAX_DIST = 60;

function getCameraForwardVector() {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  return forward;
}

function getCameraRightVector() {
  const forward = getCameraForwardVector();
  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
  right.normalize();
  return right;
}

function panCamera(direction) {
  const forward = getCameraForwardVector();
  const right = getCameraRightVector();
  const delta = new THREE.Vector3();

  if (direction === 'up') delta.copy(forward).multiplyScalar(PAN_SPEED);
  if (direction === 'down') delta.copy(forward).multiplyScalar(-PAN_SPEED);
  if (direction === 'left') delta.copy(right).multiplyScalar(-PAN_SPEED);
  if (direction === 'right') delta.copy(right).multiplyScalar(PAN_SPEED);

  camera.position.add(delta);
  controls.target.add(delta);
}

function zoomCamera(direction) {
  const target = controls.target.clone();
  const offset = camera.position.clone().sub(target);
  const distance = offset.length();

  const factor = direction > 0 ? 1.15 : 0.85;
  let newDistance = distance * factor;

  if (newDistance < MIN_DIST) newDistance = MIN_DIST;
  if (newDistance > MAX_DIST) newDistance = MAX_DIST;

  offset.setLength(newDistance);
  camera.position.copy(target.clone().add(offset));
}

function recenterCamera() {
  camera.position.copy(INITIAL_CAMERA_POS);
  controls.target.copy(INITIAL_TARGET);
  controls.update();
}

document.querySelectorAll('.cam-btn').forEach((btn) => {
  const action = btn.dataset.action;
  if (!action) return;
  btn.addEventListener('click', () => {
    if (action === 'pan-up') panCamera('up');
    if (action === 'pan-down') panCamera('down');
    if (action === 'pan-left') panCamera('left');
    if (action === 'pan-right') panCamera('right');
  });
});

document.querySelectorAll('.zoom-btn').forEach((btn) => {
  const action = btn.dataset.action;
  btn.addEventListener('click', () => {
    if (action === 'zoom-in') zoomCamera(-1);
    else if (action === 'zoom-out') zoomCamera(1);
    else if (action === 'recenter') recenterCamera();
  });
});

// -----------------------------------------------------------------------------
// Hover tooltip
// -----------------------------------------------------------------------------
const tooltipEl = document.getElementById('cubeTooltip');
const tooltipCodeEl = tooltipEl.querySelector('.loc-code');
const tooltipContentEl = tooltipEl.querySelector('.content');

function hideTooltip() {
  tooltipEl.style.display = 'none';
}

function showTooltipForLocation(loc, screenX, screenY) {
  if (!loc) {
    hideTooltip();
    return;
  }

  tooltipCodeEl.textContent = loc.code;

  if (!loc.items || loc.items.length === 0) {
    tooltipContentEl.innerHTML = '<div class="empty-label">Empty</div>';
  } else {
    const lines = loc.items.map((it) => {
      const qty =
        it.qty === 0 || typeof it.qty === 'number' ? ` (${it.qty})` : '';
      return `<div>${it.sku}${qty}</div>`;
    });
    tooltipContentEl.innerHTML = lines.join('');
  }

  tooltipEl.style.display = 'block';

  const rect = sceneEl.getBoundingClientRect();
  const localX = screenX - rect.left;
  const localY = screenY - rect.top;

  const offsetX = 12;
  const offsetY = 12;

  tooltipEl.style.left = `${localX + offsetX}px`;
  tooltipEl.style.top = `${localY + offsetY}px`;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Array.from(meshByCode.values()));

  if (hits.length === 0) {
    hideTooltip();
    return;
  }

  const hit = hits[0];
  const code = hit.object.userData.code;
  const loc = LOCATIONS.find((l) => l.code === code);
  showTooltipForLocation(loc, e.clientX, e.clientY);
});

renderer.domElement.addEventListener('pointerleave', () => hideTooltip());

// -----------------------------------------------------------------------------
// Tabs & admin login (via /api/login)
// -----------------------------------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const adminPanelEl = document.getElementById('adminPanel');
const adminLoginBoxEl = document.getElementById('adminLoginBox');
const adminControlsEl = document.getElementById('adminControls');
const adminPasswordInputEl = document.getElementById('adminPasswordInput');
const adminLoginStatusEl = document.getElementById('adminLoginStatus');
const adminLoginBtn = document.getElementById('adminLoginBtn');

let currentTab = 'general';

function setAdminState(value) {
  isAdmin = value;
  if (isAdmin) {
    adminLoginBoxEl.style.display = 'none';
    adminControlsEl.style.display = 'block';
  } else {
    adminLoginBoxEl.style.display = 'block';
    adminControlsEl.style.display = 'none';
    try {
      localStorage.removeItem('warehouseAdminToken');
    } catch {}
  }
}

function applyTabUI() {
  tabButtons.forEach((btn) => {
    const tab = btn.dataset.tab;
    btn.classList.toggle('active', tab === currentTab);
  });

  adminPanelEl.style.display = currentTab === 'admin' ? 'block' : 'none';
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    applyTabUI();
  });
});

adminLoginBtn.addEventListener('click', async () => {
  const pw = adminPasswordInputEl.value.trim();
  if (!pw) {
    adminLoginStatusEl.style.color = '#ffb347';
    adminLoginStatusEl.textContent = 'Please enter a password.';
    return;
  }

  try {
    const resp = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });

    if (!resp.ok) {
      adminLoginStatusEl.style.color = '#ff5555';
      adminLoginStatusEl.textContent = 'Login failed: incorrect password.';
      setAdminState(false);
      return;
    }

    const data = await resp.json();
    const token = data.token;
    if (!token) {
      adminLoginStatusEl.style.color = '#ff5555';
      adminLoginStatusEl.textContent = 'Login failed: no token returned.';
      setAdminState(false);
      return;
    }

    try {
      localStorage.setItem('warehouseAdminToken', token);
    } catch {}

    adminLoginStatusEl.style.color = '#7CFC00';
    adminLoginStatusEl.textContent = 'Success – admin access enabled.';
    setAdminState(true);
  } catch (err) {
    console.error('Admin login error', err);
    adminLoginStatusEl.style.color = '#ff5555';
    adminLoginStatusEl.textContent = 'Login failed – network/server error.';
    setAdminState(false);
  }
});

// Restore admin state if token is present (best-effort)
try {
  const existing = localStorage.getItem('warehouseAdminToken');
  setAdminState(!!existing);
} catch {
  setAdminState(false);
}
applyTabUI();

// -----------------------------------------------------------------------------
// Main render loop
// -----------------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);

  if (flyState) {
    const now = performance.now();
    const elapsed = now - flyState.startTime;
    let t = elapsed / flyState.duration;
    if (t >= 1) t = 1;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    camera.position.lerpVectors(flyState.startPos, flyState.endPos, ease);
    controls.target.lerpVectors(
      flyState.startTarget,
      flyState.endTarget,
      ease
    );

    if (t === 1) flyState = null;
  }

  controls.update();

  if (flashTargets.length > 0) {
    const now = performance.now();
    flashTargets = flashTargets.filter((t) => {
      const elapsed = now - t.startTime;
      if (elapsed > FLASH_DURATION_MS) {
        t.mesh.scale.set(1, 1, 1);
        return false;
      }
      const tSec = elapsed / 1000;
      const phase = Math.sin(tSec * FLASH_FREQ_HZ * Math.PI * 2);
      const scale = 1 + FLASH_SCALE_AMPLITUDE * Math.abs(phase);
      t.mesh.scale.set(scale, scale, scale);
      return true;
    });
  }

  renderer.render(scene, camera);
}
animate();
