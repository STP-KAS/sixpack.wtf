/** The square. Original map. Walk up and trade, the way a village stall works. */

export const MAP_W = 42;
export const MAP_H = 32;

export const SHOPS = [
  {
    id: "cafe",
    name: "Nia's Cafe",
    keeper: "Nia",
    line: "Coffee is a toy-dollar tag. tKAS moves. This tag does not.",
    items: [
      { sku: "water", name: "Water", cents: 10 },
      { sku: "coffee", name: "Coffee", cents: 250 },
      { sku: "tea", name: "Tea", cents: 180 },
      { sku: "bun", name: "Bun", cents: 300 },
    ],
  },
  {
    id: "restaurant",
    name: "Orin's Table",
    keeper: "Orin",
    line: "Supper is quoted in toy dollars. You pick the rail.",
    items: [
      { sku: "soup", name: "Soup", cents: 800 },
      { sku: "supper", name: "Supper", cents: 1400 },
      { sku: "cake", name: "Cake", cents: 600 },
    ],
  },
  {
    id: "groceries",
    name: "Mara's Groceries",
    keeper: "Mara",
    line: "The pebble is the cheap test. Bread is a normal tag.",
    items: [
      { sku: "pebble", name: "Square pebble", cents: 1 },
      { sku: "bread", name: "Bread", cents: 200 },
      { sku: "milk", name: "Milk", cents: 150 },
      { sku: "apples", name: "Apples", cents: 300 },
    ],
  },
  {
    id: "roadster",
    name: "Pike's Roadster",
    keeper: "Pike",
    line: "The roadster is 1.00 toy dollar. It parks on the lot in front of this shop. Click it, or Get in, to drive. Get out is the gold button. A lap is one paid circuit.",
    items: [
      { sku: "keys", name: "The roadster", cents: 100 },
      { sku: "postcard", name: "Postcard of the car", cents: 100 },
      { sku: "sit", name: "Sit in it", cents: 2500 },
      { sku: "lap", name: "Lap of the square", cents: 10000 },
    ],
  },
];

const BUILDINGS = [
  { id: "cafe", shop: "cafe", x: 2, y: 2, w: 12, h: 8, door: { x: 8, y: 9 }, npc: { x: 8, y: 10 }, roof: "#8d3b2f", sign: "Cafe" },
  { id: "restaurant", shop: "restaurant", x: 28, y: 2, w: 12, h: 8, door: { x: 34, y: 9 }, npc: { x: 34, y: 10 }, roof: "#8a5a2a", sign: "Table" },
  { id: "bank", shop: "bank", x: 2, y: 14, w: 10, h: 8, door: { x: 11, y: 18 }, npc: { x: 12, y: 18 }, roof: "#2f4d6a", sign: "Bank" },
  { id: "groceries", shop: "groceries", x: 30, y: 14, w: 10, h: 8, door: { x: 30, y: 18 }, npc: { x: 29, y: 18 }, roof: "#3d6b45", sign: "Market" },
  { id: "roadster", shop: "roadster", x: 14, y: 23, w: 14, h: 7, door: { x: 21, y: 23 }, npc: { x: 21, y: 22 }, roof: "#6e2430", sign: "Roadster" },
];

const KEEPERS = {
  cafe: { name: "Nia", color: "#e7b3c2" },
  restaurant: { name: "Orin", color: "#e6c15a" },
  bank: { name: "Venn", color: "#9ecbff" },
  groceries: { name: "Mara", color: "#b7e38d" },
  roadster: { name: "Pike", color: "#f0a36a" },
};

export function shopById(id) {
  return SHOPS.find((s) => s.id === id) || null;
}

export function itemBySku(shopId, sku) {
  const shop = shopById(shopId);
  if (!shop) return null;
  return shop.items.find((item) => item.sku === sku) || null;
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function walkable(tile) {
  return tile === "g" || tile === "c" || tile === "p" || tile === "d" || tile === "i" || tile === "f";
}

/** Three stalls on the cobble in front of Pike. The car uses the middle one, nose north. */
export const PARKING_BAYS = [
  { x: 16, y: 21 },
  { x: 18, y: 21 },
  { x: 20, y: 21 },
];
export const ROADSTER_PARK = PARKING_BAYS[1];

/** Bank and shop panels are the indoor room. Rules, the bench, and the guide are not. */
export function shopVisit(mode) {
  return mode === "bank" || mode === "cafe" || mode === "restaurant" || mode === "groceries" || mode === "roadster";
}

/** Which open card to redraw after a payment. An empty string means no card is open. */
export function counterFace(mode) {
  if (!shopVisit(mode)) return "";
  return mode === "bank" ? "bank" : "shop";
}

/** A tile the roadster can stop on. Indoors is for feet, so the car waits outside. */
export function standTile(map, x, y) {
  const tx = Math.round(x);
  const ty = Math.round(y);
  for (let r = 0; r <= 5; r++) {
    for (let yy = ty - r; yy <= ty + r; yy++) {
      for (let xx = tx - r; xx <= tx + r; xx++) {
        if (Math.max(Math.abs(xx - tx), Math.abs(yy - ty)) !== r) continue;
        if (yy < 0 || xx < 0 || yy >= map.h || xx >= map.w) continue;
        const tile = map.grid[yy][xx];
        if (walkable(tile) && tile !== "i") return { x: xx, y: yy };
      }
    }
  }
  return { x: map.spawn.x, y: map.spawn.y };
}

function paint(grid, x, y, tile) {
  if (!inBounds(x, y)) throw new Error("Map paint fell off the square.");
  grid[y][x] = tile;
}

function build() {
  const grid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill("g"));
  for (let x = 0; x < MAP_W; x++) {
    paint(grid, x, 0, "t");
    paint(grid, x, MAP_H - 1, "t");
  }
  for (let y = 0; y < MAP_H; y++) {
    paint(grid, 0, y, "t");
    paint(grid, MAP_W - 1, y, "t");
  }

  const occupied = new Set();
  for (const b of BUILDINGS) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const key = y * MAP_W + x;
        if (occupied.has(key)) throw new Error("Buildings overlap at " + x + "," + y);
        occupied.add(key);
        const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
        paint(grid, x, y, edge ? "W" : "i");
      }
    }
    const doorEdge =
      b.door.x === b.x ||
      b.door.y === b.y ||
      b.door.x === b.x + b.w - 1 ||
      b.door.y === b.y + b.h - 1;
    if (!doorEdge) throw new Error(b.id + " door is not on a wall.");
    paint(grid, b.door.x, b.door.y, "d");
  }

  for (let y = 11; y <= 21; y++) {
    for (let x = 14; x <= 27; x++) {
      if (grid[y][x] === "g") paint(grid, x, y, "c");
    }
  }
  for (let y = 15; y <= 17; y++) {
    for (let x = 19; x <= 22; x++) paint(grid, x, y, "w");
  }

  const paths = [
    [8, 10, 14, 10],
    [14, 10, 14, 11],
    [34, 10, 27, 10],
    [27, 10, 27, 11],
    [12, 18, 14, 18],
    [29, 18, 27, 18],
    [21, 22, 21, 21],
  ];
  for (const [x0, y0, x1, y1] of paths) {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let x = x0;
    let y = y0;
    while (x !== x1 || y !== y1) {
      if (grid[y][x] === "g") paint(grid, x, y, "p");
      if (x !== x1) x += dx;
      else y += dy;
    }
    if (grid[y][x] === "g") paint(grid, x, y, "p");
  }

  const trees = [
    [16, 4],
    [24, 5],
    [5, 12],
    [36, 12],
    [6, 26],
    [36, 26],
  ];
  for (const [x, y] of trees) {
    if (grid[y][x] === "g") paint(grid, x, y, "t");
  }

  const flowers = [
    [15, 12],
    [26, 12],
    [15, 20],
    [26, 20],
    [13, 16],
  ];
  for (const [x, y] of flowers) {
    if (grid[y][x] === "g" || grid[y][x] === "c") paint(grid, x, y, "f");
  }

  for (let y = 25; y <= 26; y++) {
    for (let x = 18; x <= 22; x++) paint(grid, x, y, "r");
  }

  const npcs = BUILDINGS.map((b) => ({
    id: b.id,
    shop: b.shop,
    name: KEEPERS[b.shop].name,
    color: KEEPERS[b.shop].color,
    x: b.npc.x,
    y: b.npc.y,
    line: b.shop === "bank" ? "Push a clerk. Each window swaps into the other two." : shopById(b.shop).line,
  }));

  return {
    w: MAP_W,
    h: MAP_H,
    grid,
    buildings: BUILDINGS,
    npcs,
    spawn: { x: 20, y: 20 },
    car: { x: 18, y: 25, w: 5, h: 2 },
  };
}

let cached;
export function world() {
  if (!cached) cached = build();
  return cached;
}

export function findPath(grid, from, to) {
  if (!inBounds(to.x, to.y) || !walkable(grid[to.y][to.x])) return null;
  if (from.x === to.x && from.y === to.y) return [{ x: from.x, y: from.y }];
  const key = (x, y) => y * MAP_W + x;
  const prev = new Map();
  const q = [{ x: from.x, y: from.y }];
  prev.set(key(from.x, from.y), null);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (q.length) {
    const cur = q.shift();
    for (const [dx, dy] of dirs) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (!inBounds(x, y) || !walkable(grid[y][x])) continue;
      const k = key(x, y);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      if (x === to.x && y === to.y) {
        const path = [{ x, y }];
        let p = cur;
        while (p) {
          path.push({ x: p.x, y: p.y });
          p = prev.get(key(p.x, p.y));
        }
        path.reverse();
        return path;
      }
      q.push({ x, y });
    }
  }
  return null;
}

export function buildingAt(x, y) {
  return (
    world().buildings.find((b) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) || null
  );
}

export function destinationFor(x, y) {
  const map = world();
  if (!inBounds(x, y)) return null;
  if (walkable(map.grid[y][x])) return { x, y, shop: null };
  const b = buildingAt(x, y);
  if (b) return { x: b.npc.x, y: b.npc.y, shop: b.shop };
  return null;
}

/** Inside that building, or on a tile that touches its door or its keeper. */
export function nearShop(map, x, y, shop) {
  const b = map.buildings.find((item) => item.shop === shop);
  if (!b) return false;
  if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return true;
  const touch = (spot) => Math.max(Math.abs(spot.x - x), Math.abs(spot.y - y)) <= 1;
  return touch(b.door) || touch(b.npc);
}
