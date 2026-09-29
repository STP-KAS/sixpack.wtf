/** Ashfields in 3D. Original meshes. The camera turns around the player through a full circle. */

import * as THREE from "./vendor/three.module.js";

const TILE = 1.15;
const UP = new THREE.Vector3(0, 1, 0);

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

/** Roof peaks for the drawn buildings. Footprints match the meshes. */
export function buildingBoxes(map) {
  return map.buildings.map((b) => {
    const w = b.w * TILE * 0.9;
    const d = b.h * TILE * 0.9;
    const body = b.id === "bank" ? 2.7 : 2.25;
    const cx = (b.x + b.w / 2 - map.w / 2) * TILE;
    const cz = (b.y + b.h / 2 - map.h / 2) * TILE;
    return {
      id: b.id,
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      roofY: body + 0.12 + 1.15,
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
    g.fillStyle = "#6f8a3c";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      const x = (hash(i, 1) * s) | 0;
      const y = (hash(i, 2) * s) | 0;
      g.fillStyle = ["#5d7630", "#87a34a", "#7c9440", "#8a7340", "#4f6a32"][i % 5];
      g.fillRect(x, y, 2 + (i % 3), 2 + ((i * 3) % 4));
    }
  });
  const cobble = paintTex(128, (g, s) => {
    g.fillStyle = "#8d8982";
    g.fillRect(0, 0, s, s);
    for (let y = 4; y < s; y += 16) {
      for (let x = ((y / 16) % 2) * 8; x < s; x += 16) {
        g.fillStyle = hash(x, y) > 0.5 ? "#a39e96" : "#7a756e";
        g.beginPath();
        g.ellipse(x + 6, y + 6, 6, 5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
  const dirt = paintTex(128, (g, s) => {
    g.fillStyle = "#a89070";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = i % 2 ? "#c6b896" : "#8a7048";
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
    grd.addColorStop(0, "#6ea0d8");
    grd.addColorStop(0.45, "#d7c4a2");
    grd.addColorStop(1, "#e7c49a");
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

function tagPick(object, pick) {
  object.traverse((child) => {
    child.userData.pick = pick;
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

function addBuildings(parent, map, maps, pick) {
  const winMat = new THREE.MeshStandardMaterial({
    color: "#1a120c",
    emissive: "#e08a30",
    emissiveIntensity: 0.7,
    roughness: 0.35,
  });
  for (const b of map.buildings) {
    const w = b.w * TILE * 0.9;
    const d = b.h * TILE * 0.9;
    const h = b.id === "bank" ? 2.7 : 2.25;
    const center = worldOf(map, b.x + b.w / 2, b.y + b.h / 2, 0);
    const plaster = stone("#ffffff", 0.9, maps.plaster);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plaster);
    body.position.set(center.x, h / 2 + 0.12, center.z);
    body.castShadow = true;
    body.receiveShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.22, d + 0.18), stone("#ffffff", 0.9, maps.blocks));
    foot.position.set(center.x, 0.11, center.z);
    foot.receiveShadow = true;
    const face = doorFacing(b);
    const ridgeAlongX = w >= d;
    const roof = new THREE.Mesh(
      gableGeometry(ridgeAlongX ? w + 0.45 : d + 0.45, ridgeAlongX ? d + 0.45 : w + 0.45, 1.15),
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
    tagPick(body, { x: b.npc.x, y: b.npc.y });
    pick.push(body);
  }
}

function addDressing(parent, map, maps) {
  const wallGeo = new THREE.BoxGeometry(TILE * 0.98, 1.25, TILE * 0.98);
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
      const p = worldOf(map, cell.x + 0.5, cell.y + 0.5, 0.62);
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
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.32, 10), stone("#d7d2c8", 0.62));
  basin.position.set(fountain.x, 0.16, fountain.z);
  basin.castShadow = true;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.07, 6, 14), stone("#eee8de", 0.45));
  lip.rotation.x = Math.PI / 2;
  lip.position.set(fountain.x, 0.32, fountain.z);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.12, 0.08, 18),
    new THREE.MeshLambertMaterial({ color: "#1f649c" }),
  );
  water.position.set(fountain.x, 0.28, fountain.z);
  water.name = "fountain-water";
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.85, 8), stone("#d5e8f5", 0.08));
  jet.position.set(fountain.x, 0.72, fountain.z);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), stone("#e8f4ff", 0.08));
  cap.position.set(fountain.x, 1.12, fountain.z);
  parent.add(basin, lip, water, jet, cap);
  const carAt = worldOf(map, 17.6, 21.7, 0);
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.32, 1.05), stone("#c0392b", 0.4));
  body.position.y = 0.38;
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 0.92), stone("#1a1612", 0.45));
  cabin.position.set(-0.15, 0.62, 0);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.22, 0.84),
    new THREE.MeshStandardMaterial({ color: "#9fd4ee", roughness: 0.12, metalness: 0.25 }),
  );
  glass.position.set(-0.15, 0.66, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10);
  for (const [wx, wz] of [[-0.75, -0.48], [-0.75, 0.48], [0.75, -0.48], [0.75, 0.48]]) {
    const wheel = new THREE.Mesh(wheelGeo, stone("#1a1612", 0.7));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.18, wz);
    car.add(wheel);
  }
  car.add(body, cabin, glass);
  car.position.set(carAt.x, 0, carAt.z);
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

function buildBankRoom(maps) {
  const room = new THREE.Group();
  room.name = "bank";
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 9), stone("#ffffff", 0.78, maps.wood));
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  room.add(floor);
  const wallMat = stone("#ffffff", 0.9, maps.blocks);
  wallMat.side = THREE.DoubleSide;
  const back = new THREE.Mesh(new THREE.BoxGeometry(12, 3.3, 0.28), wallMat);
  back.position.set(0, 1.55, -4.4);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.3, 9), wallMat);
  left.position.set(-6, 1.55, 0);
  const right = left.clone();
  right.position.x = 6;
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.3, 0.28), wallMat);
  frontL.position.set(-3.7, 1.55, 4.4);
  const frontR = frontL.clone();
  frontR.position.x = 3.7;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 0.28), wallMat);
  lintel.position.set(0, 2.85, 4.4);
  room.add(back, left, right, frontL, frontR, lintel);
  const rug = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 3.2), stone("#1d4e89", 0.6));
  rug.position.set(0, 0.02, 0.6);
  room.add(rug);
  const plant = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), stone("#2f6a34", 0.7));
  plant.position.set(-4.8, 0.72, 2.4);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.32, 8), stone("#ffffff", 0.75, maps.wood));
  pot.position.set(-4.8, 0.18, 2.4);
  room.add(plant, pot);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 0.55), stone("#ffffff", 0.65, maps.wood));
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
  for (const rail of rails) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.15, 0.16), stone("#e6d3b0", 0.55));
    frame.position.set(rail.x, 1.5, -4.18);
    const opening = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.35, 0.08), stone("#2a2118", 0.8));
    opening.position.set(rail.x, 1.55, -4.05);
    opening.userData.rail = rail.id;
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.32, 0.07), stone("#ffffff", 0.75, maps.wood));
    shutter.position.set(rail.x, 1.55, -3.92);
    const tag = nameTag(rail.label);
    tag.position.set(rail.x, 2.35, -3.7);
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 6), stone("#e1c27a", 0.4));
    postL.position.set(rail.x - 0.42, 0.48, -2.15);
    const postR = postL.clone();
    postR.position.x = rail.x + 0.42;
    room.add(frame, opening, shutter, tag, postL, postR);
    booths.push({ id: rail.id, opening, shutter, postL, postR });
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

export function mountWorld(canvas, map, api) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (err) {
    console.error(err);
    canvas.dataset.gl = "fail";
    canvas.dataset.err = String(err && err.message ? err.message : err);
    return { render() {}, resize() {}, hold() {} };
  }
  canvas.dataset.gl = "ok";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const maps = makeMaps();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const tex of Object.values(maps)) tex.anisotropy = aniso;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#9eb6d4");
  scene.fog = new THREE.Fog("#d5c4a4", 28, 78);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(140, 20, 12),
    new THREE.MeshBasicMaterial({ map: maps.sky, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 240);
  const hemi = new THREE.HemisphereLight("#d5e4f5", "#6a7a40", 0.85);
  const sun = new THREE.DirectionalLight("#ffe0b8", 2.15);
  sun.position.set(-18, 28, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.bias = -0.00045;
  scene.add(hemi, sun, new THREE.AmbientLight("#fff4e4", 0.16));

  const town = new THREE.Group();
  scene.add(town);
  const pick = [];
  addGround(town, map, maps, pick);
  addBuildings(town, map, maps, pick);
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
    tagPick(person, { x: npc.x, y: npc.y });
    pick.push(person);
    town.add(person);
    actors.push(person);
  }

  const bank = buildBankRoom(maps);
  scene.add(bank.room);

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
  let pitch = 0.72;
  let townDistance = 12;
  let bankDistance = 4.8;
  let townYaw = yaw;
  let townPitch = pitch;
  let seenMode = api.mode();
  const shown = worldOf(map, map.spawn.x + 0.5, map.spawn.y + 0.5, 1.15);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;
  let lastStep = shown.clone();
  const held = new Set();
  let lastNow = 0;
  let nextStep = 0;

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
    const offset = orbitOffset(yaw, pitch);
    const distance = api.mode() === "bank" ? bankDistance : townDistance;
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
    let forward = 0;
    let strafe = 0;
    if (held.has("KeyW") || held.has("ArrowUp")) forward += 1;
    if (held.has("KeyS") || held.has("ArrowDown")) forward -= 1;
    if (held.has("KeyD")) strafe += 1;
    if (held.has("KeyA")) strafe -= 1;
    if (!forward && !strafe) return null;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-8) return null;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP);
    if (right.lengthSq() < 1e-8) return null;
    right.normalize();
    return groundStep(fwd.x, fwd.z, right.x, right.z, forward, strafe);
  }

  function render(now) {
    resize();
    const inside = api.mode() === "bank";
    if (inside !== (seenMode === "bank")) {
      if (inside) {
        townYaw = yaw;
        townPitch = pitch;
        yaw = 0.22;
        pitch = 1.26;
      } else {
        yaw = townYaw;
        pitch = townPitch;
      }
      seenMode = api.mode();
    }
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    let spin = 0;
    if (held.has("ArrowLeft") || held.has("KeyQ")) spin += 1;
    if (held.has("ArrowRight") || held.has("KeyR")) spin -= 1;
    if (spin) yaw += spin * dt * 1.5;
    town.visible = !inside;
    sky.visible = !inside;
    bank.room.visible = inside;
    bank.lamp.intensity = inside ? 7 : 0;
    scene.fog.near = inside ? 10 : 28;
    scene.fog.far = inside ? 28 : 78;
    scene.background.set(inside ? "#3a342c" : "#9eb6d4");
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
    const water = town.getObjectByName("fountain-water");
    if (water) water.position.y = 0.28 + Math.sin(now / 420) * 0.012;
    if (inside) {
      placeCamera(new THREE.Vector3(0, 1.15, -1.8));
      pose(bank.teller, now, false);
    } else {
      placeCamera(new THREE.Vector3(shown.x, 1.15, shown.z));
      if (now >= nextStep) {
        const step = stepFromKeys();
        if (step && (step.x || step.y) && api.step) {
          api.step(step.x, step.y);
          nextStep = now + 140;
        }
      }
      const who = api.player();
      const face = api.facing();
      const goal = worldOf(map, who.x + 0.5, who.y + 0.5, 1.15);
      shown.lerp(goal, 0.28);
      const moving = shown.distanceTo(lastStep) > 0.004;
      lastStep.lerp(shown, 0.4);
      player.position.set(shown.x, 0, shown.z);
      if (face && (face.x || face.y)) player.rotation.y = headingYaw(face.x, face.y);
      if (markTile && markTile.x === who.x && markTile.y === who.y) marker.visible = false;
      marker.rotation.z = now / 700;
      placeCamera(new THREE.Vector3(shown.x, 1.15, shown.z));
      for (const actor of actors) pose(actor, now, actor === player && moving);
    }
    canvas.dataset.mode = inside ? "bank" : "world";
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
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    yaw -= dx * 0.008;
    pitch = Math.min(1.28, Math.max(0.28, pitch + dy * 0.005));
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
    if (api.mode() === "bank") {
      const hits = raycaster.intersectObjects(bank.booths.map((booth) => booth.opening), false);
      if (hits[0]) api.booth(hits[0].object.userData.rail);
      return;
    }
    const hits = raycaster.intersectObjects(pick, true);
    if (!hits[0]) return;
    let owner = hits[0].object;
    while (owner && !owner.userData.pick && owner.name !== "walk") owner = owner.parent;
    if (owner && owner.userData.pick) {
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
    if (api.mode() === "bank") bankDistance = Math.min(12, Math.max(4.4, bankDistance + Math.sign(ev.deltaY) * 0.45));
    else townDistance = Math.min(32, Math.max(6.5, townDistance + Math.sign(ev.deltaY) * 0.8));
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
  return { render, resize, hold };
}
