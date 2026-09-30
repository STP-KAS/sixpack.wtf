/** Ashfields in 3D. Original meshes. The camera turns around the player through a full circle. */

import * as THREE from "./vendor/three.module.js";
import { ROADSTER_PARK, standTile } from "./world.mjs";

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
    parent.add(trunk, canopy);
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
    const tag = nameTag(rail.label);
    tag.position.set(rail.x, 2.55, -3.65);
    const postL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8),
      new THREE.MeshStandardMaterial({ color: "#e8c56b", metalness: 0.62, roughness: 0.28 }),
    );
    postL.position.set(rail.x - 0.42, 0.48, -2.15);
    const postR = postL.clone();
    postR.position.x = rail.x + 0.42;
    room.add(frame, glass, opening, shutter, tag, postL, postR);
    booths.push({ id: rail.id, opening, shutter, postL, postR, chain });
  }
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.84, 6),
    new THREE.MeshStandardMaterial({ color: "#2f6a34", roughness: 0.6 }),
  );
  rope.rotation.z = Math.PI / 2;
  room.add(rope);
  const teller = figure("#9ecbff");
  teller.position.set(-2.4, 0, -3.62);
  teller.rotation.y = headingYaw(0, 1);
  room.add(teller);
  return { room, booths, rope, teller, lamp };
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
    group.add(milk, coffee, bun);
  } else if (id === "restaurant") {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16), stone("#f4efe6", 0.35));
    plate.position.set(-0.22, 0.02, 0);
    const supper = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), stone("#c45a28", 0.5));
    supper.position.set(-0.22, 0.08, 0);
    const cake = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), stone("#e7c27a", 0.55));
    cake.position.set(0.28, 0.08, 0);
    group.add(plate, supper, cake);
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

function stallBoard(title, tint) {
  const map = paintTex(256, (g, s) => {
    g.fillStyle = "#241910";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = tint;
    g.lineWidth = 14;
    g.strokeRect(12, 12, s - 24, s - 24);
    g.fillStyle = "#f3e6c8";
    g.font = "700 40px Georgia, serif";
    g.textAlign = "center";
    g.fillText(title, s / 2, 148);
  });
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.9, 0.06),
    new THREE.MeshStandardMaterial({ map, roughness: 0.6 }),
  );
  board.position.set(0, 2.15, -4.15);
  return board;
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
  const keepers = {};
  const goods = {};
  const boards = {};
  for (const stall of STALLS) {
    const keeper = figure(stall.color);
    keeper.position.set(-1.15, 0, -3.45);
    keeper.rotation.y = headingYaw(0, 1);
    keeper.visible = false;
    room.add(keeper);
    keepers[stall.id] = keeper;
    const tray = stallGoods(stall.id);
    tray.position.set(0.15, 1.0, -2.85);
    tray.visible = false;
    room.add(tray);
    goods[stall.id] = tray;
    const board = stallBoard(stall.title, stall.tint);
    board.visible = false;
    room.add(board);
    boards[stall.id] = board;
  }
  return { room, keepers, goods, boards, lamp, runner, stalls: STALLS };
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
  let bankDistance = 9;
  let townYaw = yaw;
  let townPitch = pitch;
  let wasInside = false;
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

  function placeCamera(target) {
    const usePitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + juicePitch));
    const offset = orbitOffset(yaw + juiceYaw, usePitch);
    const distance = frameDistance;
    const pos = {
      x: target.x + offset.x * distance,
      y: target.y + offset.y * distance,
      z: target.z + offset.z * distance,
    };
    if (api.mode() !== "bank") pos.y = clearCamera(pos, boxes);
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
    const indoors = !!(api.room && api.room());
    if (indoors !== wasInside) {
      if (indoors) {
        townYaw = yaw;
        townPitch = pitch;
        yaw = 0.22;
        pitch = 0.98;
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
    const stallId = stall.stalls.some((item) => item.id === api.mode()) ? api.mode() : "";
    town.visible = !indoors;
    sky.visible = !indoors;
    bank.room.visible = indoors && api.mode() === "bank";
    stall.room.visible = indoors && !!stallId;
    bank.lamp.intensity = bank.room.visible ? 7 : 0;
    stall.lamp.intensity = stall.room.visible ? 7 : 0;
    for (const item of stall.stalls) {
      const on = stall.room.visible && item.id === stallId;
      stall.keepers[item.id].visible = on;
      stall.goods[item.id].visible = on;
      stall.boards[item.id].visible = on;
      if (on) stall.runner.material.color.set(item.tint);
    }
    scene.fog.near = indoors ? 10 : 22;
    scene.fog.far = indoors ? 28 : 70;
    const wash = bank.room.visible ? "#2a241c" : stall.room.visible ? stall.stalls.find((item) => item.id === stallId).wash : "#c47a52";
    scene.background.set(wash);
    const rail = api.rail();
    for (const booth of bank.booths) {
      const open = booth.id === rail;
      booth.shutter.visible = !open;
      booth.postL.visible = open;
      booth.postR.visible = open;
    }
    const active = bank.booths.find((booth) => booth.id === rail) || bank.booths[0];
    bank.rope.position.set(active.postL.position.x + 0.42, 0.72, active.postL.position.z);
    bank.teller.position.x = active.opening.position.x;
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
    if (indoors) {
      placeCamera(new THREE.Vector3(0, 0.9, -0.8));
      if (bank.room.visible) pose(bank.teller, now, false);
      if (stallId && stall.keepers[stallId].visible) pose(stall.keepers[stallId], now, false);
    } else {
      placeCamera(new THREE.Vector3(shown.x, 1.15, shown.z));
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
      placeCamera(camFocus);
      for (const actor of actors) pose(actor, now, actor === player && moving && !riding);
    }
    canvas.dataset.mode = indoors ? api.mode() : "world";
    renderer.render(scene, camera);
  }

  function ndc(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 && ev.button !== 2) return;
    drag = { x: ev.clientX, y: ev.clientY, moved: false, button: ev.button };
    canvas.style.cursor = "grabbing";
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* lost pointer */ }
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag) return;
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
    canvas.style.cursor = "grab";
    if (!was || was.moved || was.button !== 0) return;
    ndc(ev);
    raycaster.setFromCamera(pointer, camera);
    if (api.room && api.room() && api.mode() === "bank") {
      const hits = raycaster.intersectObjects(bank.booths.map((booth) => booth.opening), false);
      if (hits[0]) api.booth(hits[0].object.userData.rail);
      return;
    }
    if (api.room && api.room()) return;
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
    if (api.room && api.room()) bankDistance = Math.min(14, Math.max(6.5, bankDistance + Math.sign(ev.deltaY) * 0.45));
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
  placeCamera(shown);
  return { render, resize, hold, feel };
}
