import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "./vendor/three.module.js";
import { headingYaw, orbitOffset } from "./view3d.mjs";

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
