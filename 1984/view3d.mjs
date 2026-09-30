/** Ashfields in 3D. Original meshes. The camera turns around the player through a full circle. */

import * as THREE from "./vendor/three.module.js";
import { ROADSTER_PARK, SHOPS, standTile } from "./world.mjs";

const TILE = 1.15;
const UP = new THREE.Vector3(0, 1, 0);
const BANK_BODY = 5.1;
const SHOP_BODY = 3.45;
const ROOF_RISE = 1.35;

/** Radians per pixel while the left button is held. A 1000px drag is about 240 degrees. */
export const LOOK_YAW = 0.0042;
export const LOOK_PITCH = 0.0026;
/** Pitch stays above the floor and short of upside down. Yaw is a full circle. */
export const PITCH_MIN = 0.2;
export const PITCH_MAX = 1.45;
/**
 * First view after you walk in. Pitch 1.2 is nearly level, so the camera
 * stands inside the room instead of looking down through the open roof.
 * Walls run to y=3.6 and z=±4.4, with a door gap |x|<1.4.
 */
export const ROOM_YAW = 0.18;
export const ROOM_PITCH = 1.2;
export const ROOM_DISTANCE = 3.8;
export const ROOM_DISTANCE_MIN = 2.4;
export const ROOM_DISTANCE_MAX = 7.5;
export const ROOM_LOOK_Y = 1.05;
export const ROOM_LOOK_Z = 0.15;

/** Camera offset from the look target. yaw 0 and pitch = π/2 sits the camera on +Z. */
export function orbitOffset(yaw, pitch) {
  return {
    x: Math.sin(pitch) * Math.sin(yaw),
    y: Math.cos(pitch),
    z: Math.sin(pitch) * Math.cos(yaw),
  };
}

/** Yaw for a mesh whose front is local −z. Moving +x returns −π/2. */
export function headingYaw(dx, dz) {
  return Math.atan2(-dx, -dz);
}

/** Hood marker. The roadster's nose is this local point, the same −z front as a figure. */
export const CAR_NOSE = { x: 0, y: 0.5, z: -0.9 };
/** ConeGeometry's tip is local +Y. This X turn sends that tip to local +Z, the rear. */
export const THRUST_PITCH = Math.PI / 2;

/** 0 when the car is still. Long enough to read as a plume when it is moving. */
export function thrustLength(moving) {
  return moving ? 2.8 : 0;
}

/** Cone base sits on the bumper. Scaling local Y grows the plume toward +Y, which THRUST_PITCH turns to +Z. */
export function thrustCone() {
  const geo = new THREE.ConeGeometry(0.14, 1, 7);
  geo.translate(0, 0.5, 0);
  return geo;
}
export const WALK_MS = 140;
export const DRIVE_MS = 75;

/** Outdoors with the keys, the car is the body. A shop interior is on foot. */
export function drives(owns, tile) {
  return !!owns && tile !== "i";
}

/** none before the sale, foot when walking or indoors, drive when the seat is chosen outdoors. */
export function seat(owns, aboard, tile) {
  if (!owns) return "none";
  if (tile === "i" || !aboard) return "foot";
  return "drive";
}

/** One next step. The gold ring shows the same thing. The card stays shut. */
export const ENTRY_HINT = {
  bank: "Click a clerk.",
  cafe: "Take a seat.",
  restaurant: "Take a seat.",
  groceries: "Click the counter.",
  roadster: "Click Pike or the sign.",
};

/** Hits that glow. Seats until you sit, then the menu and the card. */
export function invite(venue, seated) {
  if (venue === "bank") return ["clerk"];
  if (venue === "cafe" || venue === "restaurant") return seated ? ["menu", "qr"] : ["seat"];
  if (venue === "groceries") return ["counter"];
  if (venue === "roadster") return ["keeper", "sign"];
  return [];
}

/**
 * A click inside a room. Entering never calls this.
 * open is the panel to show. sit means the chair counts.
 * clerk "books" opens the books desk. A bank clerk leaves clerk empty and uses the rail on the mesh.
 */
export function roomUse(venue, seated, hit) {
  const none = { open: "", sit: false, say: "", clerk: "" };
  if (venue === "bank") {
    if (hit === "clerk") return { open: "bank", sit: false, say: "", clerk: "" };
    if (hit === "books") return { open: "bank", sit: false, say: "", clerk: "books" };
    return { ...none, say: "Click a clerk." };
  }
  if (venue === "cafe" || venue === "restaurant") {
    if (hit === "seat") {
      return { open: "", sit: true, say: "The menu, or the card on the table.", clerk: "" };
    }
    const service = hit === "menu" || hit === "qr" || hit === "keeper" || hit === "counter";
    if (service && !seated) return { ...none, say: "Take a seat first." };
    if (service) return { open: venue, sit: true, say: "", clerk: "" };
    return { ...none, say: seated ? "The menu, or the card on the table." : "Take a seat." };
  }
  if (venue === "groceries") {
    if (hit === "counter" || hit === "menu" || hit === "keeper") return { open: "groceries", sit: false, say: "", clerk: "" };
    return { ...none, say: "Click the counter." };
  }
  if (venue === "roadster") {
    if (hit === "keeper" || hit === "sign" || hit === "counter" || hit === "menu") {
      return { open: "roadster", sit: false, say: "", clerk: "" };
    }
    return { ...none, say: "Click Pike or the sign." };
  }
  return none;
}

/** Esc closes the card first, then leaves the room, then a side panel. */
export function escapeRoom(panelOpen, inside) {
  if (panelOpen) return "counter";
  if (inside) return "leave";
  return "close";
}

/** Wall menu lines. Prices come from the shop list, in toy dollars. */
export function menuLines(shopId) {
  const shop = SHOPS.find((item) => item.id === shopId);
  if (!shop) return [];
  return shop.items.map((item) => item.name + " " + (item.cents / 100).toFixed(2));
}

/** One tile along a ground direction. Tile +x is world +x. Tile +y is world +z. */
export function gridStep(wx, wz) {
  const ax = Math.abs(wx);
  const az = Math.abs(wz);
  if (ax + az < 1e-8) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  if (ax >= az * 0.55) sx = wx > 0 ? 1 : -1;
  if (az >= ax * 0.55) sy = wz > 0 ? 1 : -1;
  if (!sx && !sy) {
    if (ax >= az) sx = wx > 0 ? 1 : -1;
    else sy = wz > 0 ? 1 : -1;
  }
  return { x: sx, y: sy };
}

/** forward +1 walks the way the camera looks. strafe +1 walks to the camera's right. */
export function groundStep(fwdX, fwdZ, rightX, rightZ, forward, strafe) {
  return gridStep(fwdX * forward + rightX * strafe, fwdZ * forward + rightZ * strafe);
}

/** Arrow keys match W A S D. On-screen Left and Right send TurnLeft and TurnRight. */
export function moveIntent(held) {
  let forward = 0;
  let strafe = 0;
  let spin = 0;
  if (held.has("KeyW") || held.has("ArrowUp")) forward += 1;
  if (held.has("KeyS") || held.has("ArrowDown")) forward -= 1;
  if (held.has("KeyD") || held.has("ArrowRight")) strafe += 1;
  if (held.has("KeyA") || held.has("ArrowLeft")) strafe -= 1;
  if (held.has("KeyQ") || held.has("TurnLeft")) spin += 1;
  if (held.has("KeyR") || held.has("TurnRight")) spin -= 1;
  return { forward, strafe, spin };
}

/** Roof peaks for the drawn buildings. Footprints match the meshes. */
export function buildingBoxes(map) {
  return map.buildings.map((b) => {
    const w = b.w * TILE * 0.9;
    const d = b.h * TILE * 0.9;
    const body = b.id === "bank" ? BANK_BODY : SHOP_BODY;
    const cx = (b.x + b.w / 2 - map.w / 2) * TILE;
    const cz = (b.y + b.h / 2 - map.h / 2) * TILE;
    return {
      id: b.id,
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      roofY: body + 0.12 + ROOF_RISE,
    };
  });
}

/** Lift a camera that would sit inside a roof to just above that roof. */
export function clearCamera(pos, boxes) {
  let y = pos.y;
  for (const box of boxes) {
    if (pos.x < box.minX - 0.4 || pos.x > box.maxX + 0.4) continue;
    if (pos.z < box.minZ - 0.4 || pos.z > box.maxZ + 0.4) continue;
    const floor = box.roofY + 0.45;
    if (y < floor) y = floor;
  }
  return y;
}

function worldOf(map, tx, ty, y = 0) {
  return new THREE.Vector3((tx - map.w / 2) * TILE, y, (ty - map.h / 2) * TILE);
}

function tileOf(map, point) {
  return {
    x: Math.floor(point.x / TILE + map.w / 2),
    y: Math.floor(point.z / TILE + map.h / 2),
  };
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function stone(color, roughness = 0.86, map = null) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04, map });
}

function paintTex(size, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeMaps() {
  const grass = paintTex(128, (g, s) => {
    g.fillStyle = "#5c6840";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      const x = (hash(i, 1) * s) | 0;
      const y = (hash(i, 2) * s) | 0;
      g.fillStyle = ["#4e5a34", "#6d7844", "#7a6840", "#3f4e30", "#8a6238"][i % 5];
      g.fillRect(x, y, 2 + (i % 3), 2 + ((i * 3) % 4));
    }
  });
  const cobble = paintTex(128, (g, s) => {
    g.fillStyle = "#8a7b6c";
    g.fillRect(0, 0, s, s);
    for (let y = 4; y < s; y += 16) {
      for (let x = ((y / 16) % 2) * 8; x < s; x += 16) {
        g.fillStyle = hash(x, y) > 0.5 ? "#a89480" : "#6e6054";
        g.beginPath();
        g.ellipse(x + 6, y + 6, 6, 5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  const dirt = paintTex(128, (g, s) => {
    g.fillStyle = "#8a6244";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = i % 2 ? "#a88462" : "#6a4830";
      g.fillRect((hash(i, 3) * s) | 0, (hash(i, 4) * s) | 0, 3, 2);
    }
  });
  const plaster = paintTex(128, (g, s) => {
    g.fillStyle = "#d9d3c8";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(90,70,50,${0.04 + (i % 5) * 0.02})`;
      g.fillRect((hash(i, 5) * s) | 0, (hash(i, 6) * s) | 0, 4, 3);
    }
  });
  const blocks = paintTex(128, (g, s) => {
    g.fillStyle = "#b7b2aa";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#8a8680";
    g.lineWidth = 2;
    for (let y = 0; y < s; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(s, y);
      g.stroke();
      const shift = (y / 16) % 2 ? 16 : 0;
      for (let x = shift; x < s; x += 32) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 16);
        g.stroke();
      }
    }
  });
  const wood = paintTex(64, (g, s) => {
    g.fillStyle = "#6b4428";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#4a2e1c";
    for (let x = 4; x < s; x += 7) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, s);
      g.stroke();
    }
  });
  const tiles = paintTex(64, (g, s) => {
    g.fillStyle = "#c8c8c8";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) {
      const shift = (y / 8) % 2 ? 8 : 0;
      for (let x = -8 + shift; x < s; x += 16) {
        g.fillStyle = (x + y) % 32 ? "#dedede" : "#b0b0b0";
        g.fillRect(x, y, 15, 7);
        g.fillStyle = "#8a8a8a";
        g.fillRect(x, y + 6, 15, 1);
      }
    }
  });
  const water = paintTex(64, (g, s) => {
    const grd = g.createLinearGradient(0, 0, s, s);
    grd.addColorStop(0, "#3d82b8");
    grd.addColorStop(1, "#2a6494");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(220,240,255,0.35)";
    for (let y = 6; y < s; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y - 3, s * 0.6, y + 3, s, y);
      g.stroke();
    }
  });
  const sky = paintTex(32, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, "#243456");
    grd.addColorStop(0.42, "#c45a32");
    grd.addColorStop(0.72, "#e89458");
    grd.addColorStop(1, "#f0c49a");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
  return { grass, cobble, dirt, plaster, blocks, wood, tiles, water, sky };
}

function limb(geo, mat, x, y, z, name) {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.set(x, y, z);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -(geo.parameters.height / 2);
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

let skinMat;
let bootMat;
let legGeo;
let armGeo;

function figure(color) {
  if (!skinMat) {
    skinMat = stone("#f3e0c8", 0.55);
    bootMat = stone("#2a241c", 0.8);
    legGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.34, 7);
    armGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.3, 6);
  }
  const group = new THREE.Group();
  const cloth = stone(color, 0.7);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.4, 8), cloth);
  body.position.y = 0.62;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), skinMat);
  head.position.y = 1.02;
  head.castShadow = true;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    bootMat,
  );
  hair.position.y = 1.04;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), skinMat);
  nose.position.set(0, 1.02, -0.16);
  nose.name = "nose";
  group.add(
    limb(legGeo, bootMat, -0.07, 0.4, 0, "legL"),
    limb(legGeo, bootMat, 0.07, 0.4, 0, "legR"),
    limb(armGeo, cloth, -0.2, 0.78, 0, "armL"),
    limb(armGeo, cloth, 0.2, 0.78, 0, "armR"),
    body,
    head,
    hair,
    nose,
  );
  group.scale.setScalar(1.25);
  return group;
}

function pose(group, now, moving) {
  const swing = Math.sin(now / 150 + group.position.x) * (moving ? 0.7 : 0.1);
  const legL = group.getObjectByName("legL");
  const legR = group.getObjectByName("legR");
  const armL = group.getObjectByName("armL");
  const armR = group.getObjectByName("armR");
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  if (armL) armL.rotation.x = -swing * 0.65;
  if (armR) armR.rotation.x = swing * 0.65;
}

function nameTag(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "rgba(20,16,12,0.82)";
  g.fillRect(8, 8, 240, 48);
  g.strokeStyle = "#e1c27a";
  g.strokeRect(8.5, 8.5, 239, 47);
  g.fillStyle = "#f3e6c8";
  g.font = "600 26px Segoe UI, sans-serif";
  g.textAlign = "center";
  g.fillText(text, 128, 42);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false });
  material.map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.y = 1.85;
  sprite.userData.label = text;
  return sprite;
}

function tagPick(object, pick, shop) {
  object.traverse((child) => {
    child.userData.pick = pick;
    if (shop) child.userData.shop = shop;
  });
}

function gableGeometry(width, depth, rise) {
  const hw = width / 2;
  const hd = depth / 2;
  const positions = [];
  const uvs = [];
  const sw = [-hw, 0, -hd];
  const se = [hw, 0, -hd];
  const ne = [hw, 0, hd];
  const nw = [-hw, 0, hd];
  const rw = [-hw, rise, 0];
  const re = [hw, rise, 0];
  const faces = [
    [sw, se, re], [sw, re, rw],
    [ne, nw, rw], [ne, rw, re],
    [sw, rw, nw],
    [se, ne, re],
  ];
  for (const face of faces) {
    for (const p of face) {
      positions.push(p[0], p[1], p[2]);
      uvs.push(p[0] / width + 0.5, p[2] / depth + 0.5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function doorFacing(b) {
  if (b.door.x <= b.x) return { nx: -1, nz: 0 };
  if (b.door.x >= b.x + b.w - 1) return { nx: 1, nz: 0 };
  if (b.door.y <= b.y) return { nx: 0, nz: -1 };
  return { nx: 0, nz: 1 };
}

function addGround(parent, map, maps, pick) {
  const geo = new THREE.PlaneGeometry(TILE * 1.02, TILE * 1.02);
  geo.rotateX(-Math.PI / 2);
  const kindMap = {
    g: maps.grass,
    f: maps.grass,
    t: maps.grass,
    c: maps.cobble,
    d: maps.cobble,
    p: maps.dirt,
    r: maps.dirt,
    w: maps.water,
  };
  const buckets = new Map();
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const kind = map.grid[y][x];
      if (kind === "i" || kind === "W") continue;
      const list = buckets.get(kind) || [];
      list.push({ x, y, kind });
      buckets.set(kind, list);
    }
  }
  for (const [kind, cells] of buckets) {
    const mat = stone("#ffffff", kind === "w" ? 0.22 : 0.92, kindMap[kind] || maps.grass);
    if (kind === "w") mat.metalness = 0.18;
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    if (kind === "w") mesh.name = "pond-water";
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    cells.forEach((cell, i) => {
      const p = worldOf(map, cell.x + 0.5, cell.y + 0.5, kind === "w" ? -0.08 : hash(cell.x, cell.y) * 0.035);
      dummy.position.copy(p);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const j = 0.9 + hash(cell.y, cell.x) * 0.16;
      tint.setRGB(j, j, j);
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
  }
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(map.w * TILE, map.h * TILE),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  plane.rotateX(-Math.PI / 2);
  plane.position.y = 0.04;
  plane.name = "walk";
  parent.add(plane);
  pick.push(plane);
}

function hangLantern(parent, x, y, z) {
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#ffb15a", emissive: "#ff8a2a", emissiveIntensity: 1.6, roughness: 0.35 }),
  );
  glow.position.set(x, y, z);
  const light = new THREE.PointLight("#ffb15a", 0.85, 7.5, 2);
  light.position.set(x, y, z);
  parent.add(glow, light);
}

function frontTrim(parent, maps, center, w, d, h, face, doorPos, isBank) {
  const wood = stone("#ffffff", 0.72, maps.wood);
  const tx = -face.nz;
  const tz = face.nx;
  const span = Math.abs(face.nz) ? w : d;
  const wallX = center.x + face.nx * (Math.abs(face.nx) ? w / 2 : 0);
  const wallZ = center.z + face.nz * (Math.abs(face.nz) ? d / 2 : 0);
  if (!isBank) {
    for (const frac of [0.34, 0.72]) {
      const beam = new THREE.BoxGeometry(Math.abs(face.nz) ? span * 0.92 : 0.1, 0.08, Math.abs(face.nx) ? span * 0.92 : 0.1);
      const timber = new THREE.Mesh(beam, wood);
      timber.position.set(wallX + face.nx * 0.1, h * frac, wallZ + face.nz * 0.1);
      parent.add(timber);
    }
  }
  const ridge = new THREE.Mesh(
    new THREE.BoxGeometry(Math.abs(face.nz) ? w * 0.98 : 0.14, 0.1, Math.abs(face.nx) ? d * 0.98 : 0.14),
    stone("#5c4030", 0.7),
  );
  ridge.position.set(center.x, h + 0.12 + ROOF_RISE + 0.02, center.z);
  parent.add(ridge);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.38, 0.12), wood);
    post.position.set(
      doorPos.x - face.nx * 0.28 + tx * side * 0.44,
      0.7,
      doorPos.z - face.nz * 0.28 + tz * side * 0.44,
    );
    if (face.nx) post.rotation.y = Math.PI / 2;
    parent.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.1, 0.14), wood);
  lintel.position.set(doorPos.x - face.nx * 0.28, 1.36, doorPos.z - face.nz * 0.28);
  if (face.nx) lintel.rotation.y = Math.PI / 2;
  parent.add(lintel);
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.42), stone("#ffffff", 0.9, maps.blocks));
  step.position.set(doorPos.x + face.nx * 0.12, 0.05, doorPos.z + face.nz * 0.12);
  if (face.nx) step.rotation.y = Math.PI / 2;
  parent.add(step);
  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.02, 0.28),
    stone("#3a241c", 0.8),
  );
  mat.position.set(doorPos.x + face.nx * 0.22, 0.1, doorPos.z + face.nz * 0.22);
  if (face.nx) mat.rotation.y = Math.PI / 2;
  parent.add(mat);
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 6, 5),
    new THREE.MeshStandardMaterial({ color: "#e8c56b", metalness: 0.7, roughness: 0.28 }),
  );
  handle.position.set(
    doorPos.x - face.nx * 0.18 + tx * 0.22,
    0.72,
    doorPos.z - face.nz * 0.18 + tz * 0.22,
  );
  parent.add(handle);
}

function addBuildings(parent, map, maps, pick, awnings) {
  const winMat = new THREE.MeshStandardMaterial({
    color: "#1a120c",
    emissive: "#e08a30",
    emissiveIntensity: 0.7,
    roughness: 0.35,
  });
  for (const b of map.buildings) {
    const w = b.w * TILE * 0.9;
    const d = b.h * TILE * 0.9;
    const h = b.id === "bank" ? BANK_BODY : SHOP_BODY;
    const center = worldOf(map, b.x + b.w / 2, b.y + b.h / 2, 0);
    const plaster = stone("#ffffff", 0.9, maps.plaster);
    const shell = b.id === "bank" ? stone("#d8d4cc", 0.88, maps.blocks) : plaster;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shell);
    body.position.set(center.x, h / 2 + 0.12, center.z);
    body.castShadow = true;
    body.receiveShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.22, d + 0.18), stone("#ffffff", 0.9, maps.blocks));
    foot.position.set(center.x, 0.11, center.z);
    foot.receiveShadow = true;
    const face = doorFacing(b);
    const ridgeAlongX = w >= d;
    const roof = new THREE.Mesh(
      gableGeometry(ridgeAlongX ? w + 0.45 : d + 0.45, ridgeAlongX ? d + 0.45 : w + 0.45, ROOF_RISE),
      new THREE.MeshStandardMaterial({ map: maps.tiles, color: b.roof, roughness: 0.74, side: THREE.DoubleSide }),
    );
    roof.position.set(center.x, h + 0.12, center.z);
    if (!ridgeAlongX) roof.rotation.y = Math.PI / 2;
    roof.castShadow = true;
    const span = Math.abs(face.nz) ? w : d;
    const wallX = center.x + face.nx * (Math.abs(face.nx) ? w / 2 : 0);
    const wallZ = center.z + face.nz * (Math.abs(face.nz) ? d / 2 : 0);
    parent.add(foot, body, roof);
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.08), winMat);
      win.position.set(
        wallX + (-face.nz) * side * span * 0.28 + face.nx * 0.05,
        h * 0.58,
        wallZ + face.nx * side * span * 0.28 + face.nz * 0.05,
      );
      if (face.nx) win.rotation.y = Math.PI / 2;
      parent.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.07), stone("#ffffff", 0.7, maps.wood));
      frame.position.set(win.position.x - face.nx * 0.03, win.position.y, win.position.z - face.nz * 0.03);
      frame.rotation.copy(win.rotation);
      parent.add(frame);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.16), stone("#ffffff", 0.75, maps.wood));
      sill.position.set(win.position.x + face.nx * 0.08, win.position.y - 0.32, win.position.z + face.nz * 0.08);
      if (face.nx) sill.rotation.y = Math.PI / 2;
      parent.add(sill);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.18), stone("#6a4028", 0.8));
      box.position.set(win.position.x + face.nx * 0.14, win.position.y - 0.42, win.position.z + face.nz * 0.14);
      if (face.nx) box.rotation.y = Math.PI / 2;
      parent.add(box);
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), stone(side < 0 ? "#d24a3a" : "#f2d16b", 0.45));
      bloom.position.set(box.position.x + face.nx * 0.06, box.position.y + 0.1, box.position.z + face.nz * 0.06);
      parent.add(bloom);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), stone("#2f6a34", 0.6));
      leaf.position.set(box.position.x - face.nx * 0.02 + (-face.nz) * side * 0.1, box.position.y + 0.08, box.position.z + face.nx * side * 0.1);
      parent.add(leaf);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.2, 0.1), stone("#ffffff", 0.7, maps.wood));
    const doorPos = worldOf(map, b.door.x + 0.5, b.door.y + 0.5, 0.62);
    door.position.set(doorPos.x - face.nx * 0.28, 0.62, doorPos.z - face.nz * 0.28);
    if (face.nx) door.rotation.y = Math.PI / 2;
    door.castShadow = true;
    parent.add(door);
    hangLantern(parent, doorPos.x + face.nx * 0.2, 1.62, doorPos.z + face.nz * 0.2);
    if (b.id !== "bank") {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.95), stone(b.roof, 0.62));
      cloth.position.set(doorPos.x + face.nx * 0.55, 1.72, doorPos.z + face.nz * 0.55);
      if (face.nx) cloth.rotation.y = Math.PI / 2;
      cloth.castShadow = true;
      parent.add(cloth);
      if (awnings) awnings.push(cloth);
      tagPick(cloth, { x: b.npc.x, y: b.npc.y }, b.shop);
      pick.push(cloth);
    }
    const sign = nameTag(b.sign);
    sign.position.set(wallX + face.nx * 0.35, h + 0.55, wallZ + face.nz * 0.35);
    parent.add(sign);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.28), stone("#ffffff", 0.85, maps.blocks));
    chimney.position.set(center.x + w * 0.22, h + 0.85, center.z - d * 0.12);
    chimney.castShadow = true;
    parent.add(chimney);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.18, 6), stone("#4a4038", 0.8));
    pot.position.set(chimney.position.x, chimney.position.y + 0.42, chimney.position.z);
    parent.add(pot);
    frontTrim(parent, maps, center, w, d, h, face, doorPos, b.id === "bank");
    if (b.id === "bank") {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const quoin = new THREE.Mesh(new THREE.BoxGeometry(0.32, h, 0.32), stone("#ffffff", 0.82, maps.blocks));
          quoin.position.set(center.x + sx * (w / 2 + 0.02), h / 2 + 0.12, center.z + sz * (d / 2 + 0.02));
          parent.add(quoin);
        }
      }
    }
    if (b.id === "bank") {
      for (let i = 0; i < 6; i++) {
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), stone("#ffffff", 0.8, maps.blocks));
        merlon.position.set(center.x - w / 2 + 0.35 + i * (w / 6), h + 0.28, center.z - d / 2);
        parent.add(merlon);
      }
    }
    const visit = { x: b.npc.x, y: b.npc.y };
    tagPick(body, visit, b.shop);
    tagPick(door, visit, b.shop);
    tagPick(roof, visit, b.shop);
    tagPick(sign, visit, b.shop);
    pick.push(body, door, roof, sign);
  }
}

function addDressing(parent, map, maps) {
  const wallGeo = new THREE.BoxGeometry(TILE * 0.98, 2.4, TILE * 0.98);
  const edges = [];
  const trees = [];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.grid[y][x] !== "t") continue;
      const edge = x === 0 || y === 0 || x === map.w - 1 || y === map.h - 1;
      if (edge) edges.push({ x, y });
      else trees.push({ x, y });
    }
  }
  if (edges.length) {
    const mesh = new THREE.InstancedMesh(wallGeo, stone("#ffffff", 0.9, maps.blocks), edges.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    edges.forEach((cell, i) => {
      const p = worldOf(map, cell.x + 0.5, cell.y + 0.5, 1.2);
      dummy.position.copy(p);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    parent.add(mesh);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.85, 6);
  const leafGeo = new THREE.ConeGeometry(0.62, 1.25, 7);
  const autumn = ["#c45a28", "#e0a030", "#8a3a28"];
  trees.forEach((cell, i) => {
    const p = worldOf(map, cell.x + 0.5, cell.y + 0.5, 0);
    const trunk = new THREE.Mesh(trunkGeo, stone("#5c3a22", 0.85));
    trunk.position.set(p.x, 0.42, p.z);
    trunk.castShadow = true;
    const canopy = new THREE.Mesh(leafGeo, stone(autumn[i % 3], 0.8));
    canopy.position.set(p.x, 1.25, p.z);
    canopy.castShadow = true;
    const under = canopy.clone();
    under.position.set(p.x + 0.18, 0.95, p.z - 0.1);
    under.scale.setScalar(0.62);
    parent.add(trunk, canopy, under);
  });
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.grid[y][x] !== "f") continue;
      const p = worldOf(map, x + 0.5, y + 0.5, 0);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 4), stone("#2f6a34", 0.7));
      stem.position.set(p.x, 0.16, p.z);
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), stone((x + y) % 2 ? "#d24a3a" : "#f2d16b", 0.55));
      bloom.position.set(p.x, 0.34, p.z);
      parent.add(stem, bloom);
    }
  }
  const fountain = worldOf(map, 21, 16.5, 0);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.32, 10), stone("#6e8f86", 0.55));
  basin.position.set(fountain.x, 0.16, fountain.z);
  basin.castShadow = true;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.07, 6, 14), stone("#8fb8ae", 0.4));
  lip.rotation.x = Math.PI / 2;
  lip.position.set(fountain.x, 0.32, fountain.z);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.12, 0.08, 18),
    new THREE.MeshStandardMaterial({ map: maps.water, color: "#d7e6ef", roughness: 0.18, metalness: 0.22 }),
  );
  water.position.set(fountain.x, 0.28, fountain.z);
  water.name = "fountain-water";
  const lap = new THREE.Mesh(
    new THREE.TorusGeometry(8.2, 0.05, 4, 72),
    new THREE.MeshBasicMaterial({ color: "#e7c27a", transparent: true, opacity: 0.8 }),
  );
  lap.rotation.x = Math.PI / 2;
  lap.position.set(fountain.x, 0.06, fountain.z);
  lap.name = "lap-line";
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.85, 8), stone("#d5e8f5", 0.08));
  jet.position.set(fountain.x, 0.72, fountain.z);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), stone("#e8f4ff", 0.08));
  cap.position.set(fountain.x, 1.12, fountain.z);
  parent.add(basin, lip, water, jet, cap, lap);
  const cobbleMat = stone("#8a7d72", 0.9, maps.blocks);
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), cobbleMat);
    block.position.set(fountain.x + Math.cos(ang) * 1.85, 0.08, fountain.z + Math.sin(ang) * 1.85);
    block.rotation.y = -ang;
    parent.add(block);
  }
  for (const [lx, lz] of [[-2.4, -1.6], [2.5, 1.8]]) {
    hangLantern(parent, fountain.x + lx, 1.7, fountain.z + lz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6), stone("#5c3a22", 0.8));
    pole.position.set(fountain.x + lx, 0.85, fountain.z + lz);
    parent.add(pole);
  }
  const carAt = worldOf(map, ROADSTER_PARK.x + 0.5, ROADSTER_PARK.y + 0.5, 0);
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 2.15), stone("#c0392b", 0.4));
  body.position.set(0, 0.36, 0.05);
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.28, 0.85), stone("#1a1612", 0.45));
  cabin.position.set(0, 0.58, 0.28);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.2, 0.7),
    new THREE.MeshStandardMaterial({ color: "#9fd4ee", roughness: 0.12, metalness: 0.25 }),
  );
  glass.position.set(0, 0.62, 0.22);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.42), stone("#922b21", 0.32));
  hood.position.set(CAR_NOSE.x, CAR_NOSE.y, CAR_NOSE.z);
  hood.name = "hood";
  const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.5, -0.62], [0.5, -0.62], [-0.5, 0.72], [0.5, 0.72]]) {
    const hanger = new THREE.Group();
    hanger.position.set(wx, 0.18, wz);
    const wheel = new THREE.Mesh(wheelGeo, stone("#1a1612", 0.7));
    wheel.rotation.z = Math.PI / 2;
    hanger.add(wheel);
    car.add(hanger);
    wheels.push(hanger);
  }
  const flames = [];
  const flameGeo = thrustCone();
  for (const fx of [-0.28, 0.28]) {
    for (const [color, hot] of [["#ff6a1a", false], ["#ffe14a", true]]) {
      const flame = new THREE.Mesh(
        flameGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: hot ? 0.95 : 0.88, depthWrite: false }),
      );
      flame.rotation.x = THRUST_PITCH;
      flame.position.set(fx, 0.42, 1.18);
      flame.visible = false;
      flame.scale.y = 0.001;
      flame.userData.hot = hot;
      car.add(flame);
      flames.push(flame);
    }
  }
  const thrustLight = new THREE.PointLight("#ff7a2a", 0, 7, 2);
  thrustLight.position.set(0, 0.42, 1.35);
  for (const hx of [-0.34, 0.34]) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#fff6d8", emissive: "#ffe7a0", emissiveIntensity: 0.9, roughness: 0.25 }),
    );
    lamp.position.set(hx, 0.4, -1.05);
    car.add(lamp);
  }
  car.add(body, cabin, glass, hood, thrustLight);
  car.position.set(carAt.x, 0, carAt.z);
  car.userData.wheels = wheels;
  car.userData.flames = flames;
  car.userData.thrustLight = thrustLight;
  car.userData.lastPos = car.position.clone();
  car.name = "roadster-car";
  car.userData.park = car.position.clone();
  car.userData.parkYaw = 0;
  car.userData.center = new THREE.Vector3(fountain.x, 0, fountain.z);
  parent.add(car);
  const hayAt = worldOf(map, 9.5, 29, 0);
  const hay = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.85, 8), stone("#c4a15a", 0.9));
  hay.position.set(hayAt.x, 0.42, hayAt.z);
  hay.castShadow = true;
  parent.add(hay);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.2, 6), stone("#5c3a22", 0.8));
  const plaza = worldOf(map, 18, 13.2, 0);
  post.position.set(plaza.x, 0.6, plaza.z);
  const plaque = nameTag("Ashfields");
  plaque.position.set(plaza.x, 1.35, plaza.z);
  parent.add(post, plaque);
  for (const side of [-1, 1]) {
    const bench = new THREE.Group();
    const wood = stone("#ffffff", 0.75, maps.wood);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.36), wood);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.36, 0.06), wood);
    back.position.set(0, 0.68, 0.15);
    bench.add(seat, back);
    for (const x of [-0.48, 0.48]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 0.3), wood);
      leg.position.set(x, 0.23, 0);
      bench.add(leg);
    }
    bench.position.set(plaza.x + side * 1.55, 0, plaza.z);
    parent.add(bench);
  }
}

function diamondGlass() {
  return paintTex(64, (g, s) => {
    g.fillStyle = "#1b4a30";
    g.fillRect(0, 0, s, s);
    for (let y = -8; y < s + 8; y += 16) {
      for (let x = -8; x < s + 8; x += 16) {
        g.beginPath();
        g.moveTo(x + 8, y);
        g.lineTo(x + 16, y + 8);
        g.lineTo(x + 8, y + 16);
        g.lineTo(x, y + 8);
        g.closePath();
        g.fillStyle = ((x + y) / 16) % 2 ? "#2f7a46" : "#3e9a58";
        g.fill();
        g.strokeStyle = "#d5ead0";
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
  });
}

function rugKnot() {
  return paintTex(128, (g, s) => {
    g.fillStyle = "#1a4f88";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#e4c27a";
    g.lineWidth = 4;
    g.strokeRect(10, 10, s - 20, s - 20);
    g.lineWidth = 3;
    g.beginPath();
    g.arc(s * 0.4, s * 0.5, 24, 0.5, Math.PI * 1.6);
    g.stroke();
    g.beginPath();
    g.arc(s * 0.6, s * 0.5, 24, Math.PI + 0.5, Math.PI * 2.6);
    g.stroke();
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.26);
    g.quadraticCurveTo(s * 0.78, s * 0.5, s * 0.5, s * 0.74);
    g.quadraticCurveTo(s * 0.22, s * 0.5, s * 0.5, s * 0.26);
    g.stroke();
  });
}

let inviteMat = null;

function inviteMaterial() {
  if (!inviteMat) {
    inviteMat = new THREE.MeshBasicMaterial({
      color: "#f2d16b",
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  return inviteMat;
}

/**
 * One ring on the group, added after tagHit so it has no hit of its own.
 * floor lies flat (local +z becomes +y). wall faces +z, into the room.
 * person: the figure's yaw is π, so another π turns this ring's +z toward the camera.
 * shelf sits in front of the unit. A centered ring would cross the side wall.
 */
function addInvite(group, radius, mode) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.78, radius, 28), inviteMaterial());
  ring.name = "invite";
  ring.visible = false;
  if (mode === "person") {
    ring.rotation.y = Math.PI;
    ring.position.y = 0.95;
  } else if (mode === "wall") {
    ring.position.z = 0.22;
  } else if (mode === "shelf") {
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.06, 0.95);
  } else {
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
  }
  group.add(ring);
}

function showInvites(root, kinds) {
  const on = new Set(kinds);
  root.traverse((node) => {
    if (node.name !== "invite") return;
    const hit = node.parent && node.parent.userData ? node.parent.userData.hit : "";
    node.visible = on.has(hit);
  });
}

function tagHit(object, hit, extra) {
  object.traverse((child) => {
    child.userData.hit = hit;
    if (extra) {
      for (const key of Object.keys(extra)) child.userData[key] = extra[key];
    }
  });
}

function pickPad(w, h, d) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
}

function buildBankRoom(maps) {
  const room = new THREE.Group();
  room.name = "bank";
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 9), stone("#8a5a32", 0.86, maps.wood));
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  room.add(floor);
  const wallMat = stone("#d8d4cc", 0.9, maps.blocks);
  wallMat.side = THREE.DoubleSide;
  const back = new THREE.Mesh(new THREE.BoxGeometry(12, 3.6, 0.28), wallMat);
  back.position.set(0, 1.7, -4.4);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.6, 9), wallMat);
  left.position.set(-6, 1.7, 0);
  const right = left.clone();
  right.position.x = 6;
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.6, 0.28), wallMat);
  frontL.position.set(-3.7, 1.7, 4.4);
  const frontR = frontL.clone();
  frontR.position.x = 3.7;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 0.28), wallMat);
  lintel.position.set(0, 3.05, 4.4);
  room.add(back, left, right, frontL, frontR, lintel);
  const rugMap = rugKnot();
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.04, 3.2),
    new THREE.MeshStandardMaterial({ map: rugMap, color: "#ffffff", roughness: 0.8 }),
  );
  rug.position.set(0, 0.02, 0.6);
  room.add(rug);
  const plant = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), stone("#2f6a34", 0.7));
  plant.position.set(-4.8, 0.72, 2.4);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.32, 8), stone("#ffffff", 0.75, maps.wood));
  pot.position.set(-4.8, 0.18, 2.4);
  room.add(plant, pot);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 0.55), stone("#8a5a32", 0.7, maps.wood));
  counter.position.set(0, 0.5, -3.15);
  counter.castShadow = true;
  room.add(counter);
  const lamp = new THREE.PointLight("#ffd2a8", 0, 16, 1.6);
  lamp.position.set(0, 2.7, -0.4);
  lamp.name = "bank-lamp";
  room.add(lamp);
  const booths = [];
  const rails = [
    { id: "kas", label: "tKAS", x: -2.4 },
    { id: "poc", label: "POCencept", x: 0 },
    { id: "kusdt", label: "KUSDT", x: 2.4 },
  ];
  const glassMat = new THREE.MeshStandardMaterial({
    map: diamondGlass(),
    color: "#d7f0dc",
    roughness: 0.18,
    metalness: 0.04,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  const woodFrame = stone("#ffffff", 0.72, maps.wood);
  for (const rail of rails) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.85, 2.25, 0.18), woodFrame);
    frame.position.set(rail.x, 1.55, -4.2);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.28, 0.05), glassMat);
    glass.position.set(rail.x, 1.58, -4.08);
    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 1.35, 0.08),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    opening.position.set(rail.x, 1.55, -3.98);
    opening.userData.rail = rail.id;
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(1.28, 1.36, 0.08), stone("#ffffff", 0.75, maps.wood));
    shutter.position.set(rail.x, 1.55, -3.9);
    let chain = null;
    if (rail.id === "kusdt") {
      chain = new THREE.Group();
      chain.name = "kusdt-chain";
      chain.visible = false;
      for (let i = 0; i < 4; i++) {
        const link = new THREE.Mesh(
          new THREE.TorusGeometry(0.09, 0.022, 4, 8),
          new THREE.MeshStandardMaterial({ color: "#9aa3ad", metalness: 0.72, roughness: 0.32 }),
        );
        link.position.set(rail.x - 0.27 + i * 0.18, 1.12, -3.72);
        link.rotation.y = Math.PI / 2;
        chain.add(link);
      }
      room.add(chain);
    }
    const postL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8),
      new THREE.MeshStandardMaterial({ color: "#e8c56b", metalness: 0.62, roughness: 0.28 }),
    );
    postL.position.set(rail.x - 0.42, 0.48, -2.15);
    const postR = postL.clone();
    postR.position.x = rail.x + 0.42;
    room.add(frame, glass, opening, shutter, postL, postR);
    booths.push({ id: rail.id, opening, shutter, postL, postR, chain });
  }
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.84, 6),
    new THREE.MeshStandardMaterial({ color: "#2f6a34", roughness: 0.6 }),
  );
  rope.rotation.z = Math.PI / 2;
  room.add(rope);
  const clerks = [];
  const picks = [];
  const coats = { kas: "#9ecbff", poc: "#d5ecc4", kusdt: "#f0c4c4" };
  for (const rail of rails) {
    const clerk = figure(coats[rail.id]);
    clerk.position.set(rail.x, 0, -3.62);
    clerk.rotation.y = headingYaw(0, 1);
    const tag = nameTag(rail.label);
    clerk.add(tag);
    tagHit(clerk, "clerk", { rail: rail.id });
    addInvite(clerk, 0.48, "person");
    const easy = pickPad(1.35, 1.7, 1.15);
    easy.position.set(rail.x, 1.05, -3.15);
    tagHit(easy, "clerk", { rail: rail.id });
    room.add(clerk, easy);
    clerks.push(clerk);
    picks.push(clerk, easy);
    const booth = booths.find((item) => item.id === rail.id);
    if (booth) {
      booth.opening.userData.hit = "clerk";
      picks.push(booth.opening);
    }
  }
  const books = new THREE.Group();
  books.position.set(4.55, 0, 1.15);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.74, 0.72), stone("#ffffff", 0.72, maps.wood));
  desk.position.y = 0.37;
  books.add(desk);
  ["#2f4d6a", "#8d3b2f", "#3d6b45", "#e7c27a"].forEach((color, i) => {
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.32), stone(color, 0.55));
    book.position.set(-0.4 + i * 0.26, 0.78, 0);
    book.rotation.z = (i - 1.5) * 0.08;
    books.add(book);
  });
  const booksTag = nameTag("Books");
  booksTag.position.set(0, 1.2, 0);
  books.add(booksTag);
  const booksPad = pickPad(1.5, 1.3, 0.9);
  booksPad.position.y = 0.7;
  books.add(booksPad);
  tagHit(books, "books");
  room.add(books);
  picks.push(books);
  for (let i = -1; i <= 1; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.1, 0.14), stone("#ffffff", 0.75, maps.wood));
    beam.position.set(0, 3.32, i * 1.5);
    room.add(beam);
  }
  return { room, booths, rope, clerks, lamp, picks };
}

const STALLS = [
  { id: "cafe", color: "#e7b3c2", title: "Cafe", tint: "#8d3b2f", wash: "#3a2420" },
  { id: "restaurant", color: "#e6c15a", title: "Table", tint: "#8a5a2a", wash: "#3a2c1c" },
  { id: "groceries", color: "#b7e38d", title: "Market", tint: "#3d6b45", wash: "#243028" },
  { id: "roadster", color: "#f0a36a", title: "Roadster", tint: "#6e2430", wash: "#321820" },
];

function stallCup(color) {
  const group = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.12, 10), stone(color, 0.4));
  bowl.position.y = 0.06;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 10), stone(color, 0.4));
  handle.position.set(0.07, 0.06, 0);
  handle.rotation.y = Math.PI / 2;
  group.add(bowl, handle);
  return group;
}

function stallGoods(id) {
  const group = new THREE.Group();
  if (id === "cafe") {
    const milk = stallCup("#f4efe6");
    milk.position.set(-0.34, 0, 0.04);
    const coffee = stallCup("#6b3a2a");
    coffee.position.set(0.02, 0, -0.02);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), stone("#e0b060", 0.55));
    bun.position.set(0.4, 0.08, 0.02);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.32, 0.42),
      new THREE.MeshStandardMaterial({ color: "#d7eef8", transparent: true, opacity: 0.28, roughness: 0.05 }),
    );
    glass.position.set(0.02, 0.16, 0.02);
    group.add(milk, coffee, bun, glass);
  } else if (id === "restaurant") {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16), stone("#f4efe6", 0.35));
    plate.position.set(-0.22, 0.02, 0);
    const supper = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), stone("#c45a28", 0.5));
    supper.position.set(-0.22, 0.08, 0);
    const cake = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), stone("#e7c27a", 0.55));
    cake.position.set(0.28, 0.08, 0);
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: "#f4efe6", emissive: "#ffb15a", emissiveIntensity: 0.35, roughness: 0.5 }),
    );
    candle.position.set(0.02, 0.1, 0.12);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 5),
      new THREE.MeshStandardMaterial({ color: "#ffe14a", emissive: "#ff8a2a", emissiveIntensity: 1.4, roughness: 0.3 }),
    );
    flame.position.set(0.02, 0.18, 0.12);
    group.add(plate, supper, cake, candle, flame);
  } else if (id === "groceries") {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.24), stone("#8a5a32", 0.75));
    crate.position.set(-0.22, 0.1, 0);
    group.add(crate);
    const colors = ["#d24a3a", "#3d6b45", "#e0b060"];
    colors.forEach((color, i) => {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), stone(color, 0.45));
      fruit.position.set(0.18 + i * 0.14, 0.06, (i - 1) * 0.06);
      group.add(fruit);
    });
  } else {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), stone("#2a241c", 0.7));
    plinth.position.y = 0.03;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.32), stone("#6e2430", 0.42));
    body.position.y = 0.18;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.26), stone("#d7e6ef", 0.28));
    cab.position.set(-0.05, 0.32, 0);
    group.add(plinth, body, cab);
    for (const [x, z] of [[-0.22, -0.16], [-0.22, 0.16], [0.22, -0.16], [0.22, 0.16]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), stone("#1c1916", 0.7));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.08, z);
      group.add(wheel);
    }
  }
  return group;
}

function menuBoard(shopId, title, tint, foot, hit) {
  const lines = menuLines(shopId);
  const map = paintTex(512, (g, s) => {
    g.fillStyle = "#241910";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = tint;
    g.lineWidth = 18;
    g.strokeRect(16, 16, s - 32, s - 32);
    g.fillStyle = "#f3e6c8";
    g.font = "700 52px Georgia, serif";
    g.textAlign = "center";
    g.fillText(title, s / 2, 86);
    g.font = "600 34px Georgia, serif";
    lines.forEach((line, i) => {
      const cut = line.lastIndexOf(" ");
      const name = cut > 0 ? line.slice(0, cut) : line;
      const price = cut > 0 ? line.slice(cut + 1) : "";
      const y = 156 + i * 62;
      g.textAlign = "left";
      g.fillText(name, 48, y);
      g.textAlign = "right";
      g.fillText(price, s - 48, y);
    });
    g.font = "600 28px Georgia, serif";
    g.textAlign = "center";
    g.fillStyle = "#e7c27a";
    g.fillText(foot, s / 2, s - 46);
  });
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.85, 0.07),
    new THREE.MeshStandardMaterial({ map, roughness: 0.55 }),
  );
  const easy = pickPad(2.7, 2.05, 0.24);
  group.add(board, easy);
  group.position.set(0, 2.05, -4.12);
  tagHit(group, hit);
  addInvite(group, 1.7, "wall");
  return group;
}

function chair(maps, cushion, yaw) {
  const group = new THREE.Group();
  const wood = stone("#ffffff", 0.72, maps.wood);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.48), wood);
  seat.position.y = 0.46;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.4), stone(cushion, 0.5));
  pad.position.y = 0.51;
  pad.name = "cushion";
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.46, 0.06), wood);
  back.position.set(0, 0.74, 0.2);
  group.add(seat, pad, back);
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.05), wood);
    leg.position.set(x, 0.23, z);
    group.add(leg);
  }
  group.rotation.y = yaw;
  group.userData.yaw = yaw;
  const easy = pickPad(0.78, 1.2, 0.78);
  easy.position.y = 0.58;
  group.add(easy);
  tagHit(group, "seat");
  addInvite(group, 0.62, "floor");
  return group;
}

function roundTable(maps, cloth) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 14), stone(cloth, 0.48));
  top.position.y = 0.74;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.74, 8), stone("#ffffff", 0.75, maps.wood));
  leg.position.y = 0.37;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#ffb15a", emissive: "#ff8a2a", emissiveIntensity: 1.3, roughness: 0.3 }),
  );
  bulb.position.y = 1.45;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4), stone("#2a241c", 0.6));
  cord.position.y = 1.15;
  group.add(top, leg, bulb, cord);
  return group;
}

function qrCard() {
  const map = paintTex(96, (g, s) => {
    g.fillStyle = "#f7f4ee";
    g.fillRect(0, 0, s, s);
    const n = 9;
    const cell = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const finder = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5);
        const edge = x === 0 || y === 0 || x === 2 || y === 2;
        const on = finder ? edge || (x === 1 && y === 1) || (x === 7 && y === 1) || (x === 1 && y === 7) : ((x * 3 + y * 5) % 4) !== 0;
        if (!on) continue;
        g.fillStyle = "#1c1916";
        g.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      }
    }
  });
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  const group = new THREE.Group();
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.02, 0.34),
    new THREE.MeshStandardMaterial({ map, roughness: 0.4 }),
  );
  card.position.y = 0.02;
  const easy = pickPad(0.62, 0.28, 0.62);
  easy.position.y = 0.14;
  group.add(card, easy);
  tagHit(group, "qr");
  addInvite(group, 0.36, "floor");
  return group;
}

function groceryShelf(maps) {
  const group = new THREE.Group();
  const wood = stone("#ffffff", 0.75, maps.wood);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.9, 0.08), wood);
  back.position.y = 1.15;
  group.add(back);
  const colors = ["#d24a3a", "#e0b060", "#f4efe6", "#3d6b45", "#c45a28", "#e7c27a"];
  for (let row = 0; row < 3; row++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 0.4), wood);
    plank.position.set(0, 0.48 + row * 0.55, 0.18);
    group.add(plank);
    for (let i = 0; i < 4; i++) {
      const item = new THREE.Mesh(
        i % 2 ? new THREE.SphereGeometry(0.1, 8, 6) : new THREE.BoxGeometry(0.18, 0.22, 0.14),
        stone(colors[(row + i) % colors.length], 0.5),
      );
      item.position.set(-0.85 + i * 0.55, 0.66 + row * 0.55, 0.18);
      group.add(item);
    }
  }
  tagHit(group, "counter");
  addInvite(group, 0.85, "shelf");
  return group;
}

function showCar() {
  const group = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.08, 16), stone("#2a241c", 0.6));
  plinth.position.y = 0.04;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 2.2), stone("#c0392b", 0.35));
  body.position.set(0, 0.42, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.85), stone("#9fd4ee", 0.18));
  cab.position.set(0, 0.68, 0.15);
  group.add(plinth, body, cab);
  for (const [x, z] of [[-0.5, -0.7], [0.5, -0.7], [-0.5, 0.7], [0.5, 0.7]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), stone("#1c1916", 0.7));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.18, z);
    group.add(wheel);
  }
  tagHit(group, "sign");
  addInvite(group, 1.55, "floor");
  return group;
}

/** One counter room. The shop you entered dresses it. Walls face inward. */
function buildStallRoom(maps) {
  const room = new THREE.Group();
  room.name = "stall";
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 9), stone("#8a5a32", 0.86, maps.wood));
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  room.add(floor);
  const wallMat = stone("#f0e2cc", 0.9, maps.plaster);
  wallMat.side = THREE.DoubleSide;
  const back = new THREE.Mesh(new THREE.BoxGeometry(12, 3.6, 0.28), wallMat);
  back.position.set(0, 1.7, -4.4);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.6, 9), wallMat);
  left.position.set(-6, 1.7, 0);
  const right = left.clone();
  right.position.x = 6;
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.6, 0.28), wallMat);
  frontL.position.set(-3.7, 1.7, 4.4);
  const frontR = frontL.clone();
  frontR.position.x = 3.7;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 0.28), wallMat);
  lintel.position.set(0, 3.05, 4.4);
  room.add(back, left, right, frontL, frontR, lintel);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.7), stone("#8a5a32", 0.7, maps.wood));
  counter.position.set(0, 0.5, -2.9);
  counter.castShadow = true;
  room.add(counter);
  const runner = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.04, 0.72),
    new THREE.MeshStandardMaterial({ color: "#8d3b2f", roughness: 0.55 }),
  );
  runner.position.set(0, 0.97, -2.9);
  room.add(runner);
  const lamp = new THREE.PointLight("#ffd2a8", 0, 16, 1.6);
  lamp.position.set(0, 2.7, -1.2);
  room.add(lamp);
  hangLantern(room, 0, 2.45, -1.2);
  const counterPad = pickPad(3.8, 1.35, 1.15);
  counterPad.position.set(0, 1.05, -2.9);
  tagHit(counter, "counter");
  tagHit(counterPad, "counter");
  room.add(counterPad);
  for (let i = -1; i <= 1; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.1, 0.14), stone("#ffffff", 0.75, maps.wood));
    beam.position.set(0, 3.32, i * 1.5);
    room.add(beam);
  }
  const keepers = {};
  const goods = {};
  const boards = {};
  const dress = {};
  const picks = {};
  const feet = {
    cafe: ["Click the menu", "menu"],
    restaurant: ["Click the menu", "menu"],
    groceries: ["Click the counter", "counter"],
    roadster: ["Click the sign", "sign"],
  };
  const names = { cafe: "Nia", restaurant: "Orin", groceries: "Mara", roadster: "Pike" };
  for (const stall of STALLS) {
    const keeper = figure(stall.color);
    keeper.position.set(-1.15, 0, -3.45);
    keeper.rotation.y = headingYaw(0, 1);
    keeper.add(nameTag(names[stall.id]));
    tagHit(keeper, "keeper");
    addInvite(keeper, 0.48, "person");
    keeper.visible = false;
    room.add(keeper);
    keepers[stall.id] = keeper;
    const tray = stallGoods(stall.id);
    tray.position.set(0.15, 1.0, -2.85);
    tray.visible = false;
    room.add(tray);
    goods[stall.id] = tray;
    const foot = feet[stall.id];
    const board = menuBoard(stall.id, stall.title, stall.tint, foot[0], foot[1]);
    board.visible = false;
    room.add(board);
    boards[stall.id] = board;
    const set = new THREE.Group();
    set.visible = false;
    if (stall.id === "cafe" || stall.id === "restaurant") {
      const rug = new THREE.Mesh(
        new THREE.BoxGeometry(stall.id === "cafe" ? 5.4 : 6.2, 0.03, 3.4),
        new THREE.MeshStandardMaterial({ color: stall.tint, roughness: 0.82 }),
      );
      rug.position.set(0, 0.02, 0.1);
      set.add(rug);
      const spots = stall.id === "cafe" ? [[-1.7, -0.35], [1.6, 0.25]] : [[0, 0.05]];
      for (const [x, z] of spots) {
        if (stall.id === "cafe") {
          const table = roundTable(maps, "#f4efe6");
          table.position.set(x, 0, z);
          const card = qrCard();
          card.position.set(0.16, 0.79, 0.12);
          table.add(card);
          set.add(table);
        }
        const here = chair(maps, stall.color, headingYaw(0, -1));
        here.position.set(x, 0, z + (stall.id === "cafe" ? 0.95 : 0.95));
        const far = chair(maps, stall.color, headingYaw(0, 1));
        far.position.set(x, 0, z - 0.95);
        set.add(here, far);
      }
      if (stall.id === "restaurant") {
        const table = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.15), stone("#f4efe6", 0.4));
        table.position.set(0, 0.76, 0.05);
        const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.76, 0.1), stone("#ffffff", 0.75, maps.wood));
        legL.position.set(-1.4, 0.38, 0.05);
        const legR = legL.clone();
        legR.position.x = 1.4;
        const card = qrCard();
        card.position.set(0.4, 0.8, 0.05);
        set.add(table, legL, legR, card);
        const sideSeat = chair(maps, stall.color, headingYaw(-1, 0));
        sideSeat.position.set(2.15, 0, 0.05);
        set.add(sideSeat);
      }
    } else if (stall.id === "groceries") {
      const left = groceryShelf(maps);
      left.position.set(-5.15, 0, 0.2);
      left.rotation.y = Math.PI / 2;
      const right = groceryShelf(maps);
      right.position.set(5.15, 0, 0.2);
      right.rotation.y = -Math.PI / 2;
      set.add(left, right);
    } else {
      const car = showCar();
      car.position.set(0.2, 0, 0.7);
      car.rotation.y = 0.4;
      set.add(car);
    }
    room.add(set);
    dress[stall.id] = set;
    const list = [keeper, board, counter, counterPad];
    set.traverse((child) => {
      if (child.userData && child.userData.hit) list.push(child);
    });
    picks[stall.id] = list;
  }
  const guest = figure("#f2d16b");
  guest.visible = false;
  room.add(guest);
  return { room, keepers, goods, boards, lamp, runner, stalls: STALLS, dress, picks, guest };
}

export function mountWorld(canvas, map, api) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (err) {
    console.error(err);
    canvas.dataset.gl = "fail";
    canvas.dataset.err = String(err && err.message ? err.message : err);
    return { render() {}, resize() {}, hold() {}, feel() {} };
  }
  canvas.dataset.gl = "ok";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const maps = makeMaps();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const tex of Object.values(maps)) tex.anisotropy = aniso;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c47a52");
  scene.fog = new THREE.Fog("#6e5348", 22, 72);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(140, 20, 12),
    new THREE.MeshBasicMaterial({ map: maps.sky, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 240);
  const hemi = new THREE.HemisphereLight("#8aa4c8", "#6a4030", 0.55);
  const sun = new THREE.DirectionalLight("#ffb06a", 1.65);
  sun.position.set(-26, 11, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.0006;
  scene.add(hemi, sun, new THREE.AmbientLight("#ffd8b0", 0.12));

  const town = new THREE.Group();
  scene.add(town);
  const pick = [];
  const awnings = [];
  addGround(town, map, maps, pick);
  addBuildings(town, map, maps, pick, awnings);
  addDressing(town, map, maps);
  const player = figure("#f2d16b");
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 14),
    new THREE.MeshBasicMaterial({ color: "#140f0c", transparent: true, opacity: 0.4, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  player.add(shadow);
  town.add(player);
  const actors = [player];
  for (const npc of map.npcs) {
    const person = figure(npc.color);
    const at = worldOf(map, npc.x + 0.5, npc.y + 0.5, 0);
    person.position.copy(at);
    person.add(nameTag(npc.name));
    tagPick(person, { x: npc.x, y: npc.y }, npc.shop);
    pick.push(person);
    town.add(person);
    actors.push(person);
  }

  const bank = buildBankRoom(maps);
  scene.add(bank.room);
  const stall = buildStallRoom(maps);
  scene.add(stall.room);
  bank.room.visible = false;
  stall.room.visible = false;

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.46, 24),
    new THREE.MeshBasicMaterial({ color: "#f2d16b", side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.08;
  marker.visible = false;
  town.add(marker);
  let markTile = null;

  const boxes = buildingBoxes(map);
  let yaw = 2.55;
  let pitch = 0.88;
  let townDistance = 24;
  let bankDistance = ROOM_DISTANCE;
  let townYaw = yaw;
  let townPitch = pitch;
  let wasInside = false;
  let satMesh = null;
  let satVenue = "";
  const roomLook = new THREE.Vector3(0, ROOM_LOOK_Y, ROOM_LOOK_Z);
  const shown = worldOf(map, map.spawn.x + 0.5, map.spawn.y + 0.5, 1.15);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;
  let lastStep = shown.clone();
  const held = new Set();
  let lastNow = 0;
  let nextStep = 0;
  let frameDistance = townDistance;
  let juicePitch = 0;
  let juiceYaw = 0;
  let nod = 0;
  let shake = 0;
  let lapLeft = 0;
  let talk = 0;
  const camFocus = shown.clone();
  const focusGoal = new THREE.Vector3();
  const carGoal = new THREE.Vector3();
  const puffs = [];
  for (let i = 0; i < 8; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 5, 4),
      new THREE.MeshBasicMaterial({ color: "#c4a882", transparent: true, opacity: 0, depthWrite: false }),
    );
    puff.userData.life = 0;
    town.add(puff);
    puffs.push(puff);
  }
  let puffAt = 0;
  let puffI = 0;

  function feel(kind) {
    if (kind === "nod" || kind === "purse") nod = 1;
    if (kind === "shake") shake = 1;
    if (kind === "lap") lapLeft = 6;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(2, rect.width);
    const h = Math.max(2, rect.height);
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function placeCamera(target, liftRoof) {
    const usePitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + juicePitch));
    const offset = orbitOffset(yaw + juiceYaw, usePitch);
    const distance = frameDistance;
    const pos = {
      x: target.x + offset.x * distance,
      y: target.y + offset.y * distance,
      z: target.z + offset.z * distance,
    };
    // Indoors the camera stands in the room. Lifting it onto the town roof would throw it outside.
    if (liftRoof) pos.y = clearCamera(pos, boxes);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.up.copy(UP);
    camera.lookAt(target);
  }

  function stepFromKeys() {
    const intent = moveIntent(held);
    if (!intent.forward && !intent.strafe) return null;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-8) return null;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP);
    if (right.lengthSq() < 1e-8) return null;
    right.normalize();
    return groundStep(fwd.x, fwd.z, right.x, right.z, intent.forward, intent.strafe);
  }

  function render(now) {
    resize();
    const venue = (api.venue && api.venue()) || "";
    const indoors = !!(api.room && api.room()) || !!venue;
    if (indoors !== wasInside) {
      if (indoors) {
        townYaw = yaw;
        townPitch = pitch;
        yaw = ROOM_YAW;
        pitch = ROOM_PITCH;
        bankDistance = ROOM_DISTANCE;
      } else {
        yaw = townYaw;
        pitch = townPitch;
      }
      wasInside = indoors;
    }
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    nod = Math.max(0, nod - dt * 1.4);
    shake = Math.max(0, shake - dt * 2.2);
    juicePitch = nod > 0 ? Math.sin(nod * Math.PI) * 0.045 : 0;
    juiceYaw = shake > 0 ? Math.sin(now / 28) * 0.03 * shake : 0;
    const talking = !indoors && api.mode() !== "world" && api.mode() !== "rules" && api.mode() !== "bench" && api.mode() !== "guide";
    talk += ((talking ? 1 : 0) - talk) * Math.min(1, dt * 2.5);
    frameDistance = indoors ? bankDistance : townDistance * (1 - 0.2 * talk);
    const spin = moveIntent(held).spin;
    if (spin) yaw += spin * dt * 1.5;
    const stallId = stall.stalls.some((item) => item.id === venue) ? venue : "";
    town.visible = !indoors;
    sky.visible = !indoors;
    bank.room.visible = indoors && venue === "bank";
    stall.room.visible = indoors && !!stallId;
    bank.lamp.intensity = bank.room.visible ? 7 : 0;
    stall.lamp.intensity = stall.room.visible ? 7 : 0;
    renderer.toneMappingExposure = indoors ? 1.05 : 0.94;
    for (const item of stall.stalls) {
      const on = stall.room.visible && item.id === stallId;
      stall.keepers[item.id].visible = on;
      stall.goods[item.id].visible = on;
      stall.boards[item.id].visible = on;
      if (stall.dress[item.id]) stall.dress[item.id].visible = on;
      if (on) stall.runner.material.color.set(item.tint);
    }
    scene.fog.near = indoors ? 18 : 22;
    scene.fog.far = indoors ? 46 : 70;
    const wash = bank.room.visible ? "#2a241c" : stall.room.visible ? stall.stalls.find((item) => item.id === stallId).wash : "#c47a52";
    scene.background.set(wash);
    const clerk = api.clerk ? api.clerk() : "";
    const panelBank = api.mode() === "bank";
    for (const booth of bank.booths) {
      const open = panelBank && booth.id === clerk;
      booth.shutter.visible = !open;
      booth.postL.visible = open;
      booth.postR.visible = open;
    }
    const active = bank.booths.find((booth) => panelBank && booth.id === clerk);
    bank.rope.visible = !!active;
    if (active) bank.rope.position.set(active.postL.position.x + 0.42, 0.72, active.postL.position.z);
    const cold = !!(api.frozen && api.frozen());
    for (const booth of bank.booths) {
      if (!booth.chain) continue;
      booth.chain.visible = cold;
      booth.shutter.material.color.set(cold ? "#7d8b98" : "#ffffff");
    }
    const water = town.getObjectByName("fountain-water");
    if (water) water.position.y = 0.28 + Math.sin(now / 420) * 0.012;
    if (maps.water) maps.water.offset.y = (now / 3800) % 1;
    for (const cloth of awnings) {
      const stir = api.mode() === cloth.userData.shop ? 0.14 : 0.035;
      cloth.rotation.x = Math.sin(now / 280 + cloth.position.x) * stir;
    }
    if (venue !== satVenue) {
      satVenue = venue;
      satMesh = null;
    }
    if (indoors) {
      const sitting = !!(api.seated && api.seated()) && !!satMesh;
      roomLook.set(0, ROOM_LOOK_Y, ROOM_LOOK_Z);
      if (sitting) roomLook.set(satMesh.position.x * 0.4, 0.9, Math.min(1.1, satMesh.position.z * 0.35));
      placeCamera(roomLook, false);
      if (bank.room.visible) for (const person of bank.clerks) pose(person, now, false);
      if (stallId && stall.keepers[stallId].visible) pose(stall.keepers[stallId], now, false);
      stall.guest.visible = sitting && (stallId === "cafe" || stallId === "restaurant");
      if (stall.guest.visible) {
        stall.guest.position.set(satMesh.position.x, 0, satMesh.position.z);
        stall.guest.rotation.y = satMesh.userData.yaw || 0;
        pose(stall.guest, now, false);
      }
    } else {
      stall.guest.visible = false;
      placeCamera(new THREE.Vector3(shown.x, 1.15, shown.z), true);
      const owns = !!(api.driving && api.driving());
      if (lapLeft <= 0 && now >= nextStep) {
        const step = stepFromKeys();
        if (step && (step.x || step.y) && api.step) {
          api.step(step.x, step.y);
          const after = api.player();
          const ground = map.grid[after.y] && map.grid[after.y][after.x];
          nextStep = now + (drives(owns, ground) ? DRIVE_MS : WALK_MS);
        }
      }
      const who = api.player();
      const face = api.facing();
      const goal = worldOf(map, who.x + 0.5, who.y + 0.5, 1.15);
      shown.lerp(goal, 0.28);
      const moving = shown.distanceTo(lastStep) > 0.004;
      lastStep.lerp(shown, 0.4);
      const tile = map.grid[who.y] && map.grid[who.y][who.x];
      const drive = drives(owns, tile) && lapLeft <= 0;
      const car = town.getObjectByName("roadster-car");
      if (car && lapLeft > 0) {
        lapLeft = Math.max(0, lapLeft - dt);
        const u = 1 - lapLeft / 6;
        const ang = u * Math.PI * 2;
        const center = car.userData.center;
        car.position.set(center.x + Math.cos(ang) * 8.2, 0, center.z + Math.sin(ang) * 8.2);
        car.rotation.y = headingYaw(-Math.sin(ang), Math.cos(ang));
        if (lapLeft === 0) {
          if (owns && api.place) {
            const spot = tileOf(map, car.position);
            const stand = standTile(map, spot.x, spot.y);
            api.place(stand.x, stand.y);
            const parked = worldOf(map, stand.x + 0.5, stand.y + 0.5, shown.y);
            shown.copy(parked);
            lastStep.copy(shown);
          } else {
            car.position.copy(car.userData.park);
            car.rotation.y = car.userData.parkYaw;
          }
        }
      }
      const riding = !!(car && owns && (drive || lapLeft > 0));
      if (riding) {
        if (player.parent !== car) car.add(player);
        player.position.set(0, 0.22, 0.28);
        player.rotation.y = 0;
        if (drive) {
          carGoal.set(shown.x, 0, shown.z);
          car.position.lerp(carGoal, car.userData.riding ? 0.5 : 0.16);
          car.userData.riding = true;
          if (face && (face.x || face.y)) car.rotation.y = headingYaw(face.x, face.y);
        }
      } else {
        if (player.parent !== town) town.add(player);
        player.position.set(shown.x, 0, shown.z);
        if (car) {
          car.userData.riding = false;
          if (lapLeft <= 0) {
            car.position.copy(car.userData.park);
            car.rotation.y = car.userData.parkYaw;
          }
        }
        if (face && (face.x || face.y)) player.rotation.y = headingYaw(face.x, face.y);
      }
      if (car && car.userData.wheels) {
        const spin = lapLeft > 0 || (drive && moving) ? 0.55 : 0;
        for (const hanger of car.userData.wheels) hanger.rotation.x += spin;
      }
      if (car && car.userData.flames) {
        const carMoved = car.position.distanceTo(car.userData.lastPos) > 0.012;
        car.userData.lastPos.copy(car.position);
        const thrusting = riding && (lapLeft > 0 || (drive && (moving || carMoved)));
        const length = thrustLength(thrusting);
        for (const flame of car.userData.flames) {
          flame.visible = length > 0;
          const flick = length > 0 ? 0.82 + 0.28 * Math.abs(Math.sin(now / 38 + flame.position.x * 8)) : 0;
          flame.scale.y = length > 0 ? length * (flame.userData.hot ? flick * 0.62 : flick) : 0.001;
        }
        car.userData.thrustLight.intensity = length > 0 ? 6 : 0;
      }
      canvas.dataset.ride = riding ? "car" : "foot";
      for (const puff of puffs) {
        if (puff.userData.life <= 0) continue;
        puff.userData.life -= dt;
        puff.position.y += dt * 0.35;
        puff.material.opacity = Math.max(0, puff.userData.life * 1.4);
        if (puff.userData.life <= 0) puff.visible = false;
      }
      if (moving && now >= puffAt) {
        const whoNow = api.player();
        const ground = map.grid[whoNow.y] && map.grid[whoNow.y][whoNow.x];
        puffAt = now + (ground === "p" || ground === "d" ? 120 : 220);
        const puff = puffs[puffI % puffs.length];
        puffI += 1;
        puff.visible = true;
        puff.userData.life = ground === "c" ? 0.28 : 0.45;
        puff.position.set(shown.x, 0.08, shown.z);
        puff.material.opacity = 0.45;
      }
      if (markTile && markTile.x === who.x && markTile.y === who.y) marker.visible = false;
      marker.rotation.z = now / 700;
      const look = riding && car ? car.position : shown;
      focusGoal.set(look.x, 1.15, look.z);
      camFocus.lerp(focusGoal, 1 - Math.exp(-dt * 4.5));
      placeCamera(camFocus, true);
      for (const actor of actors) pose(actor, now, actor === player && moving && !riding);
    }
    if (inviteMat) inviteMat.opacity = 0.38 + 0.5 * (0.5 + 0.5 * Math.sin(now / 320));
    const glow = indoors ? invite(venue, !!(api.seated && api.seated())) : [];
    showInvites(bank.room, venue === "bank" ? glow : []);
    showInvites(stall.room, stallId ? glow : []);
    canvas.dataset.mode = indoors ? venue : "world";
    renderer.render(scene, camera);
  }

  function ndc(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function markedHit(list) {
    const hits = list.length ? raycaster.intersectObjects(list, true) : [];
    let marked = null;
    if (hits[0]) {
      let node = hits[0].object;
      while (node) {
        if (node.userData && node.userData.hit) marked = node;
        node = node.parent;
      }
    }
    return marked;
  }

  function hoverCursor(ev) {
    const indoorsNow = (api.room && api.room()) || (api.venue && api.venue());
    if (!indoorsNow) {
      canvas.style.cursor = "grab";
      return;
    }
    ndc(ev);
    raycaster.setFromCamera(pointer, camera);
    const here = (api.venue && api.venue()) || "";
    const list = here === "bank" ? bank.picks : (stall.picks[here] || []);
    canvas.style.cursor = markedHit(list) ? "pointer" : "grab";
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 && ev.button !== 2) return;
    drag = { x: ev.clientX, y: ev.clientY, moved: false, button: ev.button };
    canvas.style.cursor = "grabbing";
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* lost pointer */ }
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag) {
      hoverCursor(ev);
      return;
    }
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved || drag.button !== 0) return;
    yaw -= dx * LOOK_YAW;
    pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + dy * LOOK_PITCH));
    drag.x = ev.clientX;
    drag.y = ev.clientY;
  });
  canvas.addEventListener("pointerup", (ev) => {
    const was = drag;
    drag = null;
    hoverCursor(ev);
    if (!was || was.moved || was.button !== 0) return;
    ndc(ev);
    raycaster.setFromCamera(pointer, camera);
    if ((api.room && api.room()) || (api.venue && api.venue())) {
      const here = (api.venue && api.venue()) || "";
      const list = here === "bank" ? bank.picks : (stall.picks[here] || []);
      const marked = markedHit(list);
      if (marked && marked.userData.hit === "seat") satMesh = marked;
      if (api.use) api.use(marked ? marked.userData.hit : "", marked ? marked.userData.rail || "" : "");
      return;
    }
    const car = town.getObjectByName("roadster-car");
    if (car && api.car) {
      const carHits = raycaster.intersectObject(car, true);
      if (carHits.length) {
        marker.visible = false;
        markTile = null;
        api.car();
        return;
      }
    }
    const hits = raycaster.intersectObjects(pick, true);
    if (!hits[0]) return;
    let owner = hits[0].object;
    while (owner && !owner.userData.pick && owner.name !== "walk") owner = owner.parent;
    if (owner && owner.userData.pick) {
      const shop = owner.userData.shop;
      if (shop && api.near && api.near(shop)) {
        marker.visible = false;
        markTile = null;
        api.enter(shop);
        return;
      }
      markTile = { x: owner.userData.pick.x, y: owner.userData.pick.y };
      const at = worldOf(map, markTile.x + 0.5, markTile.y + 0.5, 0.08);
      marker.position.set(at.x, 0.08, at.z);
      marker.visible = true;
      api.walk(markTile.x, markTile.y);
      return;
    }
    const tile = tileOf(map, hits[0].point);
    markTile = tile;
    marker.position.set(hits[0].point.x, 0.08, hits[0].point.z);
    marker.visible = true;
    api.walk(tile.x, tile.y);
  });
  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    if ((api.room && api.room()) || (api.venue && api.venue())) {
      bankDistance = Math.min(ROOM_DISTANCE_MAX, Math.max(ROOM_DISTANCE_MIN, bankDistance + Math.sign(ev.deltaY) * 0.35));
    }
    else townDistance = Math.min(42, Math.max(12, townDistance + Math.sign(ev.deltaY) * 0.8));
  }, { passive: false });
  function typing(ev) {
    const el = ev.target;
    return !!(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
  }
  const codes = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyR"]);
  window.addEventListener("keydown", (ev) => {
    if (typing(ev) || !codes.has(ev.code)) return;
    ev.preventDefault();
    if (!ev.repeat) nextStep = 0;
    held.add(ev.code);
  });
  window.addEventListener("keyup", (ev) => {
    held.delete(ev.code);
  });
  window.addEventListener("blur", () => held.clear());

  function hold(code, down) {
    if (down) {
      nextStep = 0;
      held.add(code);
    } else held.delete(code);
  }

  resize();
  placeCamera(shown, true);
  return { render, resize, hold, feel };
}

/** Builds the rooms so a test can see the clerks, seats, menu, and card. */
export function assembleInteriors() {
  const maps = makeMaps();
  const bank = buildBankRoom(maps);
  const stall = buildStallRoom(maps);
  const hits = (list, hit) => list.filter((item) => item.userData && item.userData.hit === hit).length;
  const wall = bank.room.children.find((child) => child.material && child.material.side === THREE.DoubleSide);
  const stallWall = stall.room.children.find((child) => child.material && child.material.side === THREE.DoubleSide);
  const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(bank.clerks[0].quaternion);
  bank.room.updateMatrixWorld(true);
  stall.room.updateMatrixWorld(true);
  const allowed = new Set(["clerk", "seat", "menu", "qr", "counter", "keeper", "sign"]);
  let invites = 0;
  let inviteMarked = 0;
  let inviteBad = 0;
  const first = (root, hit) => {
    let found = null;
    root.traverse((node) => {
      if (found || node.name !== "invite") return;
      const parentHit = node.parent && node.parent.userData ? node.parent.userData.hit : "";
      if (parentHit === hit) found = node;
    });
    return found;
  };
  for (const root of [bank.room, stall.room]) {
    root.traverse((node) => {
      if (node.name !== "invite") return;
      invites += 1;
      if (node.userData && node.userData.hit) inviteMarked += 1;
      const parentHit = node.parent && node.parent.userData ? node.parent.userData.hit : "";
      if (!allowed.has(parentHit)) inviteBad += 1;
    });
  }
  const axis = (node) => {
    const q = new THREE.Quaternion();
    node.updateWorldMatrix(true, false);
    node.getWorldQuaternion(q);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  };
  const seatRing = first(stall.room, "seat");
  const clerkRing = first(bank.room, "clerk");
  const menuRing = first(stall.room, "menu");
  const seatAxis = seatRing ? axis(seatRing) : new THREE.Vector3();
  const clerkAxis = clerkRing ? axis(clerkRing) : new THREE.Vector3();
  const menuAxis = menuRing ? axis(menuRing) : new THREE.Vector3();
  return {
    clerkNoseZ: nose.z,
    clerks: bank.clerks.length,
    bankClerkPicks: hits(bank.picks, "clerk"),
    books: hits(bank.picks, "books"),
    wallsFaceBothWays: !!wall && !!stallWall,
    cafeSeats: hits(stall.picks.cafe, "seat"),
    cafeCards: hits(stall.picks.cafe, "qr"),
    cafeMenu: hits(stall.picks.cafe, "menu"),
    tableSeats: hits(stall.picks.restaurant, "seat"),
    marketCounter: hits(stall.picks.groceries, "counter"),
    showroomSign: hits(stall.picks.roadster, "sign"),
    showroomKeeper: hits(stall.picks.roadster, "keeper"),
    invites,
    inviteMarked,
    inviteBad,
    seatRingUp: seatAxis.y,
    clerkRingForward: clerkAxis.z,
    menuRingForward: menuAxis.z,
    railLabels: countRailLabels(bank.room),
  };
}

function countRailLabels(root) {
  const counts = { tKAS: 0, POCencept: 0, KUSDT: 0 };
  root.traverse((node) => {
    const label = node.userData && node.userData.label;
    if (label && Object.prototype.hasOwnProperty.call(counts, label)) counts[label] += 1;
  });
  return counts;
}
