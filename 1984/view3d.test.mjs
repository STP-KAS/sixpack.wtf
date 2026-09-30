import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "./vendor/three.module.js";
import { world } from "./world.mjs";
import { CAR_NOSE, DRIVE_MS, LOOK_PITCH, LOOK_YAW, PITCH_MAX, PITCH_MIN, ROOM_DISTANCE, ROOM_LOOK_Y, ROOM_LOOK_Z, ROOM_PITCH, ROOM_YAW, THRUST_PITCH, WALK_MS, assembleInteriors, buildingBoxes, clearCamera, drives, escapeRoom, groundStep, headingYaw, menuLines, moveIntent, orbitOffset, roomUse, seat, thrustCone, thrustLength } from "./view3d.mjs";

test("a long left-button drag turns most of a circle and stays short of two", () => {
  const sweep = 1000 * LOOK_YAW;
  assert.ok(sweep > Math.PI / 2);
  assert.ok(sweep < 2.2 * Math.PI);
  assert.ok(LOOK_PITCH > 0 && LOOK_PITCH < LOOK_YAW);
  assert.ok(PITCH_MIN > 0 && PITCH_MIN < 0.5);
  assert.ok(PITCH_MAX > 1.2 && PITCH_MAX < Math.PI / 2);
  const here = orbitOffset(0.4, 0.9);
  const around = orbitOffset(0.4 + Math.PI * 2, 0.9);
  assert.ok(Math.abs(here.x - around.x) < 1e-9);
  assert.ok(Math.abs(here.y - around.y) < 1e-9);
  assert.ok(Math.abs(here.z - around.z) < 1e-9);
});

test("yaw 0 and a right-angle pitch puts the camera on +Z", () => {
  const offset = orbitOffset(0, Math.PI / 2);
  assert.ok(Math.abs(offset.x) < 1e-6);
  assert.ok(Math.abs(offset.y) < 1e-6);
  assert.ok(offset.z > 0.99);
});

test("pitch 0 looks straight down from above", () => {
  const offset = orbitOffset(0.4, 0);
  assert.ok(offset.y > 0.99);
  assert.ok(Math.hypot(offset.x, offset.z) < 1e-6);
});

test("a stopped roadster has no thrust and a moving one throws a long plume", () => {
  assert.equal(thrustLength(false), 0);
  assert.ok(thrustLength(true) > 2);
  const tip = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), THRUST_PITCH);
  assert.ok(tip.z > 0.99);
  assert.ok(Math.abs(tip.y) < 1e-6);
  assert.ok(Math.abs(tip.x) < 1e-6);
  assert.ok(CAR_NOSE.z < 0);
  const cone = thrustCone();
  cone.computeBoundingBox();
  assert.ok(Math.abs(cone.boundingBox.min.y) < 1e-6);
  assert.ok(cone.boundingBox.max.y > 0.99);
});

test("a figure nose follows the tile the player steps toward", () => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const yaw = headingYaw(dx, dz);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const nose = new THREE.Vector3(0, 1.12, -0.16).applyQuaternion(turn);
    const chest = new THREE.Vector3(0, 1.12, 0.04).applyQuaternion(turn);
    const cue = nose.sub(chest).setY(0).normalize();
    const move = new THREE.Vector3(dx, 0, dz).normalize();
    assert.ok(cue.dot(move) > 0.9, cue.dot(move) + " for " + dx + "," + dz);
  }
});

test("the roadster hood follows the way the car travels", () => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const yaw = headingYaw(dx, dz);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const nose = new THREE.Vector3(CAR_NOSE.x, CAR_NOSE.y, CAR_NOSE.z).applyQuaternion(turn);
    const mid = new THREE.Vector3(0, CAR_NOSE.y, 0).applyQuaternion(turn);
    const cue = nose.sub(mid).setY(0).normalize();
    const move = new THREE.Vector3(dx, 0, dz).normalize();
    assert.ok(cue.dot(move) > 0.9, cue.dot(move) + " for " + dx + "," + dz);
  }
});

test("you drive on the grass and walk inside a shop", () => {
  assert.equal(drives(true, "g"), true);
  assert.equal(drives(true, "d"), true);
  assert.equal(drives(true, "i"), false);
  assert.equal(drives(false, "g"), false);
  assert.equal(drives(false, "i"), false);
  assert.equal(WALK_MS, 140);
  assert.ok(DRIVE_MS < WALK_MS);
});

test("get in drives outdoors, get out walks, and a shop is on foot", () => {
  assert.equal(seat(false, true, "g"), "none");
  assert.equal(seat(true, false, "g"), "foot");
  assert.equal(seat(true, true, "g"), "drive");
  assert.equal(seat(true, true, "d"), "drive");
  assert.equal(seat(true, true, "i"), "foot");
  assert.equal(seat(true, false, "i"), "foot");
});

test("at the opening view, forward is north and right is east", () => {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 240);
  const target = new THREE.Vector3(0, 1.15, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const offset = orbitOffset(0, Math.PI / 2);
  camera.position.set(target.x + offset.x * 12, target.y + offset.y * 12, target.z + offset.z * 12);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  assert.deepEqual(groundStep(fwd.x, fwd.z, right.x, right.z, 1, 0), { x: 0, y: -1 });
  assert.deepEqual(groundStep(fwd.x, fwd.z, right.x, right.z, -1, 0), { x: 0, y: 1 });
  assert.deepEqual(groundStep(fwd.x, fwd.z, right.x, right.z, 0, 1), { x: 1, y: 0 });
  assert.deepEqual(groundStep(fwd.x, fwd.z, right.x, right.z, 0, -1), { x: -1, y: 0 });
});

test("arrow keys walk like W A S D, and the on-screen buttons still turn", () => {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 240);
  const target = new THREE.Vector3(0, 1.15, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const offset = orbitOffset(0, Math.PI / 2);
  camera.position.set(target.x + offset.x * 12, target.y + offset.y * 12, target.z + offset.z * 12);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  const step = (code) => {
    const intent = moveIntent(new Set([code]));
    return { intent, tile: groundStep(fwd.x, fwd.z, right.x, right.z, intent.forward, intent.strafe) };
  };
  const ahead = step("ArrowUp");
  assert.deepEqual(ahead.intent, { forward: 1, strafe: 0, spin: 0 });
  assert.deepEqual(ahead.tile, step("KeyW").tile);
  assert.deepEqual(ahead.tile, { x: 0, y: -1 });
  const east = step("ArrowRight");
  assert.deepEqual(east.intent, { forward: 0, strafe: 1, spin: 0 });
  assert.deepEqual(east.tile, step("KeyD").tile);
  assert.deepEqual(east.tile, { x: 1, y: 0 });
  const west = step("ArrowLeft");
  assert.deepEqual(west.intent, { forward: 0, strafe: -1, spin: 0 });
  assert.deepEqual(west.tile, step("KeyA").tile);
  assert.deepEqual(west.tile, { x: -1, y: 0 });
  assert.deepEqual(step("ArrowDown").intent, { forward: -1, strafe: 0, spin: 0 });
  assert.deepEqual(step("ArrowDown").tile, step("KeyS").tile);
  assert.deepEqual(moveIntent(new Set(["KeyQ"])), { forward: 0, strafe: 0, spin: 1 });
  assert.deepEqual(moveIntent(new Set(["TurnLeft"])), { forward: 0, strafe: 0, spin: 1 });
  assert.deepEqual(moveIntent(new Set(["KeyR"])), { forward: 0, strafe: 0, spin: -1 });
  assert.deepEqual(moveIntent(new Set(["TurnRight"])), { forward: 0, strafe: 0, spin: -1 });
});

test("a turned camera still steps the way it looks", () => {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 240);
  const up = new THREE.Vector3(0, 1, 0);
  for (const yaw of [0.4, 2.55, -1.1, Math.PI]) {
    const offset = orbitOffset(yaw, 0.72);
    camera.position.set(offset.x * 12, 1.15 + offset.y * 12, offset.z * 12);
    camera.up.copy(up);
    camera.lookAt(0, 1.15, 0);
    camera.updateMatrixWorld(true);
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const step = groundStep(fwd.x, fwd.z, right.x, right.z, 1, 0);
    const move = new THREE.Vector3(step.x, 0, step.y).normalize();
    assert.ok(move.dot(fwd) > 0.7, yaw + " cos " + move.dot(fwd));
    const side = groundStep(fwd.x, fwd.z, right.x, right.z, 0, 1);
    const sideMove = new THREE.Vector3(side.x, 0, side.y).normalize();
    assert.ok(sideMove.dot(right) > 0.7, yaw + " right cos " + sideMove.dot(right));
  }
});

test("a camera inside a roof is lifted above it", () => {
  const map = world();
  const boxes = buildingBoxes(map);
  const road = boxes.find((box) => box.id === "roadster");
  const buried = { x: (road.minX + road.maxX) / 2, y: 1.2, z: (road.minZ + road.maxZ) / 2 };
  assert.ok(clearCamera(buried, boxes) > road.roofY);
  assert.equal(clearCamera({ x: 0, y: 8, z: 0 }, boxes), 8);
});

test("walking into a room starts the camera inside the walls", () => {
  const offset = orbitOffset(ROOM_YAW, ROOM_PITCH);
  const x = offset.x * ROOM_DISTANCE;
  const y = ROOM_LOOK_Y + offset.y * ROOM_DISTANCE;
  const z = ROOM_LOOK_Z + offset.z * ROOM_DISTANCE;
  assert.ok(Math.abs(x) < 1.4, "x " + x);
  assert.ok(y > 1.4 && y < 3.4, "y " + y);
  assert.ok(z > 1 && z < 4.0, "z " + z);
});

test("the wall menu uses the shop prices", () => {
  assert.equal(menuLines("cafe")[1], "Coffee 2.50");
  assert.equal(menuLines("restaurant")[1], "Supper 14.00");
  assert.equal(menuLines("groceries")[0], "Square pebble 0.01");
  assert.equal(menuLines("roadster")[0], "The roadster 1.00");
});

test("a room opens the card only from the counter, a clerk, or a seat", () => {
  assert.equal(roomUse("bank", false, "").open, "");
  assert.equal(roomUse("bank", false, "").say, "Click a clerk.");
  assert.equal(roomUse("bank", false, "clerk").open, "bank");
  assert.equal(roomUse("bank", false, "books").clerk, "books");
  assert.equal(roomUse("cafe", false, "").open, "");
  assert.equal(roomUse("cafe", false, "seat").sit, true);
  assert.equal(roomUse("cafe", false, "seat").open, "");
  assert.equal(roomUse("cafe", false, "menu").open, "");
  assert.equal(roomUse("cafe", false, "qr").say, "Take a seat first.");
  assert.equal(roomUse("cafe", true, "menu").open, "cafe");
  assert.equal(roomUse("cafe", true, "qr").open, "cafe");
  assert.equal(roomUse("restaurant", true, "counter").open, "restaurant");
  assert.equal(roomUse("groceries", false, "").say, "Click the counter.");
  assert.equal(roomUse("groceries", false, "counter").open, "groceries");
  assert.equal(roomUse("groceries", false, "seat").open, "");
  assert.equal(roomUse("roadster", false, "keeper").open, "roadster");
  assert.equal(roomUse("roadster", false, "sign").open, "roadster");
  assert.equal(roomUse("roadster", false, "").say, "Click Pike or the sign.");
  assert.equal(escapeRoom(true, true), "counter");
  assert.equal(escapeRoom(false, true), "leave");
  assert.equal(escapeRoom(false, false), "close");
});

test("the rooms contain clerks, seats, a menu, and a scan card", () => {
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (key === "canvas") return { width: 64, height: 64 };
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
      return () => {};
    },
    set() {
      return true;
    },
  });
  const previous = globalThis.document;
  globalThis.document = {
    createElement() {
      return { width: 64, height: 64, getContext: () => ctx };
    },
  };
  let rooms;
  try {
    rooms = assembleInteriors();
  } finally {
    globalThis.document = previous;
  }
  assert.ok(rooms.clerkNoseZ > 0.9);
  assert.equal(rooms.clerks, 3);
  assert.ok(rooms.bankClerkPicks >= 3);
  assert.ok(rooms.books >= 1);
  assert.equal(rooms.wallsFaceBothWays, true);
  assert.ok(rooms.cafeSeats >= 4);
  assert.ok(rooms.cafeCards >= 2);
  assert.ok(rooms.cafeMenu >= 1);
  assert.ok(rooms.tableSeats >= 2);
  assert.ok(rooms.marketCounter >= 1);
  assert.ok(rooms.showroomSign >= 1);
  assert.ok(rooms.showroomKeeper >= 1);
});
