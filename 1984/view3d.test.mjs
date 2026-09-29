import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "./vendor/three.module.js";
import { world } from "./world.mjs";
import { LOOK_PITCH, LOOK_YAW, PITCH_MAX, PITCH_MIN, buildingBoxes, clearCamera, groundStep, headingYaw, orbitOffset } from "./view3d.mjs";

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
