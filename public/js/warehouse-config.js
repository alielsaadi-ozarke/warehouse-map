// public/js/warehouse-config.js

// Layout + naming config
const WAREHOUSE_CONFIG = {
  rows: {
    A: { racks: 6, sides: ['Front'] },
    B: { racks: 7, sides: ['Front', 'Back'] },
    C: { racks: 8, sides: ['Front', 'Back'] },
    D: { racks: 17, sides: ['Front'] },
  },
  levels: ['Floor', 'Level 1', 'Level 2'],
  bays: ['Left', 'Right'],
  rackSpacingX: 2.0,
  rowSpacingZ: 5.0,
  sideOffsetZ: 0.8,
  levelSpacingY: 0.75,
  bayOffsetX: 0.4,
  cubeSize: { x: 0.7, y: 0.35, z: 0.7 },
};

const sideAbbrev = (s) => (s === 'Front' ? 'F' : 'B');
const levelAbbrev = (l) =>
  l === 'Floor' ? 'FL' : l === 'Level 1' ? 'L1' : 'L2';
const bayAbbrev = (b) => (b === 'Left' ? 'L' : 'R');

function makeLocationCode(row, rack, side, level, bay) {
  const r = String(rack).padStart(2, '0');
  const s =
    WAREHOUSE_CONFIG.rows[row].sides.length > 1 ? sideAbbrev(side) : 'F';
  return row + r + '-' + s + '-' + levelAbbrev(level) + '-' + bayAbbrev(bay);
}

// Build all logical locations and export as LOCATIONS
const LOCATIONS = [];
(function buildLocations() {
  const order = ['A', 'B', 'C', 'D'];
  let zBase = 0;
  for (const row of order) {
    const spec = WAREHOUSE_CONFIG.rows[row];
    const count = spec.racks;
    const totalWidth = (count - 1) * WAREHOUSE_CONFIG.rackSpacingX;
    const xStart = -totalWidth / 2;

    for (let rack = 1; rack <= count; rack++) {
      const xRack = xStart + (rack - 1) * WAREHOUSE_CONFIG.rackSpacingX;
      for (const side of spec.sides) {
        const zSide =
          zBase +
          (side === 'Front'
            ? -WAREHOUSE_CONFIG.sideOffsetZ
            : WAREHOUSE_CONFIG.sideOffsetZ);
        for (let li = 0; li < WAREHOUSE_CONFIG.levels.length; li++) {
          const level = WAREHOUSE_CONFIG.levels[li];
          const y = li * WAREHOUSE_CONFIG.levelSpacingY + 0.25;
          for (const bay of WAREHOUSE_CONFIG.bays) {
            const code = makeLocationCode(row, rack, side, level, bay);
            const x =
              xRack +
              (bay === 'Left'
                ? -WAREHOUSE_CONFIG.bayOffsetX
                : WAREHOUSE_CONFIG.bayOffsetX);
            LOCATIONS.push({
              code,
              row,
              rack,
              side,
              level,
              bay,
              x,
              y,
              z: zSide,
              items: [],   // [{sku, qty}]
              notes: '',   // location-level note
            });
          }
        }
      }
    }
    zBase += WAREHOUSE_CONFIG.rowSpacingZ;
  }
})();
