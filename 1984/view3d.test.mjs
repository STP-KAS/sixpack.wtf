import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "./vendor/three.module.js";
import { world } from "./world.mjs";
import { APPROACH_MS, CAR_NOSE, CINEMA_EYE, CINEMA_LOOK, CRUISE_END_MS, CRUISE_MS, DRIVE_MS, ENTRY_HINT, FLIGHT_CLIMB, FLIGHT_LIFTOFF, FLIGHT_NOTE, FLIGHT_ORBIT, FLIGHT_PLUME_PITCH, FLIGHT_RELEASE, FLIGHT_SPACE, FLIGHT_STAGE, JOKE_MS, LOOK_PITCH, LOOK_YAW, PITCH_MAX, PITCH_MIN, ROOM_DISTANCE, ROOM_LOOK_Y, ROOM_LOOK_Z, ROOM_PITCH, ROOM_YAW, SCREEN_H, SCREEN_W, THRUST_PITCH, WALK_MS, assembleInteriors, buildFlight, buildingBoxes, clearCamera, cruiseLine, cruiseOfferEnd, cruisePose, cruiseProgress, cruiseWatch, drives, earthCenter, escapeRoom, fitScreen, flightBeat, flightCamera, flightClock, flightOfferEnd, flightPose, flightProgress, flightWatch, groundStep, headingYaw, invite, koniSpot, menuLines, moveIntent, orbitOffset, orbitPeriod, orbitRadius, placeFlight, returnReady, roomUse, screenFit, seat, spaceJoke, thrustCone, thrustLength } from "./view3d.mjs";

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
  assert.equal(menuLines("cinema")[0], "The reel 5.00");
  assert.equal(menuLines("cinema")[1], "Popcorn 1.50");
  assert.equal(menuLines("cinema")[4], "Cocaine, toy 6.00");
  assert.equal(menuLines("cinema")[5], "Xanax, toy 4.00");
});

test("a room opens the card only from the counter, a clerk, or a seat", () => {
  assert.equal(roomUse("bank", false, "").open, "");
  assert.equal(roomUse("bank", false, "").say, "Click a clerk.");
  assert.equal(roomUse("bank", false, "clerk").open, "bank");
  assert.equal(roomUse("bank", false, "books").clerk, "books");
  assert.equal(roomUse("cafe", false, "").open, "");
  assert.equal(roomUse("cafe", false, "").say, "Take a seat, or order at the counter.");
  assert.equal(roomUse("cafe", false, "seat").sit, true);
  assert.equal(roomUse("cafe", false, "seat").open, "");
  assert.equal(roomUse("cafe", false, "seat").say, "You are seated. The menu is blinking.");
  assert.equal(roomUse("cafe", true, "").say, "The menu is blinking.");
  assert.equal(roomUse("cafe", false, "menu").open, "");
  assert.equal(roomUse("cafe", false, "qr").say, "Take a seat for that menu. The counter takes an order too.");
  assert.equal(roomUse("cafe", false, "counter").open, "cafe");
  assert.equal(roomUse("cafe", false, "counter").sit, false);
  assert.equal(roomUse("cafe", true, "menu").open, "cafe");
  assert.equal(roomUse("cafe", true, "qr").open, "cafe");
  assert.equal(roomUse("restaurant", false, "").say, "Take a seat, or order at the counter.");
  assert.equal(roomUse("restaurant", false, "counter").open, "restaurant");
  assert.equal(roomUse("restaurant", true, "counter").open, "restaurant");
  assert.equal(roomUse("groceries", false, "").say, "Click the counter.");
  assert.equal(roomUse("groceries", false, "counter").open, "groceries");
  assert.equal(roomUse("groceries", false, "seat").open, "");
  assert.equal(roomUse("roadster", false, "keeper").open, "roadster");
  assert.equal(roomUse("roadster", false, "sign").open, "roadster");
  assert.equal(roomUse("roadster", false, "").say, "Click Pike or the sign.");
  assert.equal(roomUse("cinema", false, "").say, "Take a seat. The screen starts the reel.");
  assert.equal(roomUse("cinema", false, "seat").sit, true);
  assert.equal(roomUse("cinema", false, "seat").open, "");
  assert.equal(roomUse("cinema", false, "seat").play, undefined);
  assert.equal(roomUse("cinema", false, "screen").play, true);
  assert.equal(roomUse("cinema", false, "screen").sit, true);
  assert.equal(roomUse("cinema", false, "counter").open, "cinema");
  assert.equal(roomUse("cinema", false, "keeper").open, "cinema");
  assert.equal(roomUse("cinema", true, "").say, "The screen starts the reel.");
  assert.equal(escapeRoom(true, true), "counter");
  assert.equal(escapeRoom(false, true), "leave");
  assert.equal(escapeRoom(false, false), "close");
});

test("the room glows only the next step", () => {
  assert.equal(ENTRY_HINT.bank, "Click a clerk.");
  assert.equal(ENTRY_HINT.cafe, "Take a seat, or order at the counter.");
  assert.equal(ENTRY_HINT.restaurant, "Take a seat, or order at the counter.");
  assert.equal(ENTRY_HINT.groceries, "Click the counter.");
  assert.equal(ENTRY_HINT.roadster, "Click Pike or the sign.");
  assert.equal(ENTRY_HINT.cinema, "Take a seat. The screen starts the reel.");
  assert.deepEqual(invite("bank", false), ["clerk"]);
  assert.deepEqual(invite("cafe", false), ["seat", "counter", "keeper"]);
  assert.deepEqual(invite("cafe", true), ["menu", "qr"]);
  assert.deepEqual(invite("restaurant", false), ["seat", "counter", "keeper"]);
  assert.deepEqual(invite("restaurant", true), ["menu", "qr"]);
  assert.deepEqual(invite("groceries", false), ["counter", "keeper"]);
  assert.deepEqual(invite("roadster", false), ["keeper", "sign"]);
  assert.deepEqual(invite("cinema", false), ["seat", "screen", "counter", "keeper"]);
  assert.deepEqual(invite("cinema", true), ["screen", "counter"]);
  assert.deepEqual(invite("", false), []);
  assert.ok(CINEMA_LOOK.z < CINEMA_EYE.z, "the seat looks toward the screen");
  assert.ok(CINEMA_EYE.y > 0.9 && CINEMA_EYE.y < 1.5);
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
  assert.equal(rooms.cinemaSeats, 8);
  assert.equal(rooms.cinemaScreen, 1);
  assert.ok(rooms.cinemaSeatNoseZ < -0.9, "seat nose " + rooms.cinemaSeatNoseZ);
  assert.ok(rooms.cinemaFaceZ > 0.9, "picture faces the seats " + rooms.cinemaFaceZ);
  assert.equal(rooms.cinemaPictureScaleX, 1);
  assert.equal(rooms.cinemaPictureScaleY, 1);
  assert.equal(rooms.invites, 37);
  assert.equal(rooms.inviteMarked, 0);
  assert.equal(rooms.inviteBad, 0);
  assert.ok(rooms.seatRingUp > 0.9, "seat ring " + rooms.seatRingUp);
  assert.ok(rooms.clerkRingForward > 0.9, "clerk ring " + rooms.clerkRingForward);
  assert.ok(rooms.menuRingForward > 0.9, "menu ring " + rooms.menuRingForward);
  assert.deepEqual(rooms.railLabels, { tKAS: 1, POCencept: 1, KUSDT: 1 });
});

test("each film keeps its own shape inside the glass", () => {
  const night = screenFit(576, 1024);
  assert.ok(Math.abs(night.w / night.h - 576 / 1024) < 1e-9);
  assert.ok(night.w < 2.1 && night.w > 1.9);
  assert.ok(Math.abs(night.h - SCREEN_H) < 1e-9);
  assert.ok(night.scaleX < 0.3);
  assert.ok(Math.abs(night.scaleY - 1) < 1e-9);
  const wide = screenFit(1920, 1080);
  assert.ok(Math.abs(wide.w / wide.h - 16 / 9) < 1e-6);
  assert.ok(wide.w < SCREEN_W && wide.w > 6);
  assert.ok(Math.abs(wide.h - SCREEN_H) < 1e-9);
  const strip = screenFit(1280, 578);
  assert.equal(strip.scaleX, 1);
  assert.ok(strip.h < SCREEN_H);
  assert.ok(Math.abs(strip.w / strip.h - 1280 / 578) < 1e-9);
  const idle = screenFit(0, 0);
  assert.equal(idle.scaleX, 1);
  assert.equal(idle.scaleY, 1);
  assert.equal(idle.w, SCREEN_W);
  assert.equal(idle.h, SCREEN_H);
  const mesh = { scale: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } } };
  const fitted = fitScreen(mesh, 576, 1024);
  assert.equal(mesh.scale.x, fitted.scaleX);
  assert.equal(mesh.scale.y, fitted.scaleY);
  assert.equal(mesh.scale.z, 1);
  assert.equal(fitScreen(null, 1920, 1080).scaleX, wide.scaleX);
});

test("the ship climbs, drops the booster, then lets the roadster out toward +X", () => {
  assert.equal(flightBeat(0), "light");
  assert.equal(flightBeat(FLIGHT_LIFTOFF - 1), "light");
  assert.equal(flightBeat(FLIGHT_LIFTOFF), "liftoff");
  assert.equal(flightClock(0), "T- 15");
  assert.equal(flightClock(FLIGHT_LIFTOFF - 1), "T- 0");
  assert.equal(flightClock(FLIGHT_LIFTOFF), "T+ 0:00");
  assert.equal(flightPose(0).stackY, 0);
  assert.ok(flightPose(0).plume < 0.02);
  assert.ok(flightPose(FLIGHT_LIFTOFF - 500).plume > 0.5);
  assert.equal(flightBeat(FLIGHT_CLIMB), "climb");
  assert.equal(flightBeat(FLIGHT_STAGE), "stage");
  assert.equal(flightBeat(FLIGHT_ORBIT), "orbit");
  assert.equal(flightBeat(FLIGHT_RELEASE), "release");
  assert.equal(flightBeat(FLIGHT_SPACE), "space");
  const pad = flightPose(FLIGHT_LIFTOFF);
  const high = flightPose(FLIGHT_ORBIT);
  assert.ok(high.stackY > pad.stackY + 40);
  assert.ok(high.shipY > pad.shipY);
  const at = flightPose(FLIGHT_STAGE);
  const later = flightPose(FLIGHT_STAGE + 4000);
  assert.ok(later.boosterY < at.boosterY);
  assert.ok(later.boosterY < later.shipY - 8);
  const before = flightPose(FLIGHT_RELEASE - 1);
  const space = flightPose(FLIGHT_SPACE);
  assert.ok(before.carX < 0.05);
  assert.ok(space.carX > 6);
  assert.equal(returnReady(1000, 5999), false);
  assert.equal(returnReady(1000, 6000), false);
  assert.equal(returnReady(1000, 100000), false);
  assert.equal(flightProgress(0), 0);
  assert.ok(flightProgress(FLIGHT_SPACE / 2) > 0.49 && flightProgress(FLIGHT_SPACE / 2) < 0.51);
  assert.equal(flightProgress(FLIGHT_SPACE), 1);
  assert.equal(flightOfferEnd(FLIGHT_SPACE - 1), false);
  assert.equal(flightOfferEnd(FLIGHT_SPACE), true);
  assert.equal(cruiseOfferEnd(CRUISE_END_MS - 1), false);
  assert.equal(cruiseOfferEnd(CRUISE_END_MS), true);
  assert.equal(cruiseProgress(0), 0);
  assert.equal(cruiseProgress(CRUISE_MS), 1);
  assert.match(FLIGHT_NOTE, /10 blocks per second/);
  assert.match(cruiseLine(0.1, "Mars"), /Mars/);
  assert.match(cruiseLine(0.1, "Mars"), /On the way/);
  assert.match(cruiseLine(0.3, "Mars"), /Orbiting/);
  const hop = cruisePose(0, "mars", FLIGHT_SPACE);
  assert.equal(hop.carYaw, headingYaw(1, 0));
  assert.equal(hop.carRoll, 0);
  assert.equal(hop.jokes.length, 0);
  const arrived = cruisePose(APPROACH_MS, "mars", FLIGHT_SPACE);
  assert.ok(arrived.carX > hop.carX + 20, "approach " + arrived.carX);
  assert.equal(arrived.carRoll, 0);
  assert.ok(Math.abs(Math.hypot(arrived.carX - arrived.worldX, arrived.carZ - arrived.worldZ) - arrived.orbitRadius) < 0.02);
  assert.ok(Math.abs(cruisePose(APPROACH_MS + 800, "mars", FLIGHT_SPACE).carRoll) > 0.5);
  const back = cruisePose(APPROACH_MS + orbitPeriod("mars"), "mars", FLIGHT_SPACE);
  assert.ok(Math.hypot(back.carX - arrived.carX, back.carZ - arrived.carZ) < 0.05, "lap " + back.carX);
  for (const sku of ["moon", "mars", "jupiter", "saturn"]) {
    for (const ms of [APPROACH_MS, APPROACH_MS + orbitPeriod(sku) / 4, APPROACH_MS + orbitPeriod(sku) / 2]) {
      const pose = cruisePose(ms, sku, FLIGHT_SPACE);
      const radial = Math.hypot(pose.carX - pose.worldX, pose.carZ - pose.worldZ);
      assert.ok(Math.abs(radial - pose.orbitRadius) < 0.02, sku + " r " + radial);
      assert.ok(pose.orbitRadius > orbitRadius(sku) - 0.001);
    }
  }
  const quarter = cruisePose(APPROACH_MS + orbitPeriod("mars") / 4, "mars", FLIGHT_SPACE);
  assert.ok(Math.abs(quarter.carZ - arrived.carZ) > 4, "sideways " + quarter.carZ);
  const outside = cruiseWatch(arrived, 0, Math.PI / 2);
  assert.equal(outside.lx, arrived.carX);
  assert.ok(outside.z > arrived.carZ);
  const camR = Math.hypot(outside.x - arrived.worldX, outside.z - arrived.worldZ);
  const carR = Math.hypot(arrived.carX - arrived.worldX, arrived.carZ - arrived.worldZ);
  assert.ok(camR > carR + 3, "camera " + camR + " car " + carR);
  const beforeJoke = spaceJoke(APPROACH_MS - 1, "moon");
  const first = spaceJoke(APPROACH_MS, "moon");
  const next = spaceJoke(APPROACH_MS + JOKE_MS, "moon");
  assert.equal(beforeJoke.index, -1);
  assert.equal(beforeJoke.text, "");
  assert.equal(first.index, 0);
  assert.equal(next.index, 1);
  assert.match(first.text, /Moon/);
  assert.notEqual(first.text, next.text);
  const heldJoke = cruisePose(APPROACH_MS + 2000, "moon", FLIGHT_SPACE);
  assert.equal(heldJoke.jokes.length, 1);
  assert.equal(heldJoke.jokes[0].fade, 1);
  const jokeNear = Math.hypot(heldJoke.jokes[0].x - heldJoke.carX, heldJoke.jokes[0].z - heldJoke.carZ);
  assert.ok(jokeNear < 2, "joke stays " + jokeNear);
  assert.equal(cruisePose(APPROACH_MS + JOKE_MS, "moon", FLIGHT_SPACE).jokes[0].index, 1);
  const watch = flightWatch(hop, 0, Math.PI / 2, 9);
  assert.equal(watch.lx, hop.carX);
  assert.equal(watch.ly, hop.carY);
  assert.ok(Math.hypot(watch.x - hop.carX, watch.z - hop.carZ) > 4);
  assert.ok(earthCenter(high) < high.shipY);
  const lift = flightCamera(FLIGHT_LIFTOFF);
  assert.ok(Math.hypot(lift.x, lift.z) > 8);
  assert.ok(lift.z > 20);
  assert.ok(lift.ly > lift.y);
  const cam = flightCamera(FLIGHT_SPACE);
  const dist = Math.hypot(cam.x - space.carX, cam.y - space.carY, cam.z - space.carZ);
  assert.ok(dist > 4 && dist < 16);
  assert.equal(cam.lx, space.carX);
  assert.equal(cam.ly, space.carY);
  assert.equal(cam.lz, space.carZ);
  const plume = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), FLIGHT_PLUME_PITCH);
  assert.ok(plume.y < -0.99);
});

test("the roadster leaves the ship nose-first on +X", () => {
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (key === "canvas") return { width: 128, height: 128 };
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
      return { width: 128, height: 128, getContext: () => ctx };
    },
  };
  let flight;
  try {
    flight = buildFlight();
  } finally {
    globalThis.document = previous;
  }
  assert.equal(flight.engines, 33);
  let bells = 0;
  flight.booster.traverse((node) => {
    if (node.name === "raptor") bells += 1;
  });
  assert.equal(bells, 33);
  placeFlight(flight, flightPose(FLIGHT_SPACE));
  assert.equal(flight.ship.position.x, 0);
  assert.ok(flight.car.position.x > 6);
  flight.root.updateMatrixWorld(true);
  const hood = flight.car.getObjectByName("hood");
  const hoodAt = new THREE.Vector3();
  const mid = new THREE.Vector3();
  hood.getWorldPosition(hoodAt);
  flight.car.getWorldPosition(mid);
  const cue = hoodAt.sub(mid).setY(0).normalize();
  assert.ok(cue.dot(new THREE.Vector3(1, 0, 0)) > 0.9, "hood " + cue.x + "," + cue.z);
  placeFlight(flight, cruisePose(0, "mars", FLIGHT_SPACE));
  flight.root.updateMatrixWorld(true);
  const hopHood = new THREE.Vector3();
  const hopMid = new THREE.Vector3();
  hood.getWorldPosition(hopHood);
  flight.car.getWorldPosition(hopMid);
  const hopCue = hopHood.sub(hopMid).setY(0).normalize();
  assert.ok(hopCue.dot(new THREE.Vector3(1, 0, 0)) > 0.9, "cruise hood " + hopCue.x + "," + hopCue.z);
  placeFlight(flight, cruisePose(APPROACH_MS + 800, "mars", FLIGHT_SPACE));
  assert.ok(Math.abs(flight.car.rotation.z) > 0.5);
  assert.equal(flight.worlds.mars.visible, true);
  assert.equal(flight.worlds.moon.visible, false);
  assert.equal(flight.ship.visible, false);
  const around = cruisePose(APPROACH_MS + orbitPeriod("mars") / 4, "mars", FLIGHT_SPACE);
  const ahead = cruisePose(APPROACH_MS + orbitPeriod("mars") / 4 + 200, "mars", FLIGHT_SPACE);
  const travelX = ahead.carX - around.carX;
  const travelZ = ahead.carZ - around.carZ;
  const travelLen = Math.hypot(travelX, travelZ);
  placeFlight(flight, around);
  flight.root.updateMatrixWorld(true);
  const turnHood = new THREE.Vector3();
  const turnMid = new THREE.Vector3();
  hood.getWorldPosition(turnHood);
  flight.car.getWorldPosition(turnMid);
  const turnCue = turnHood.sub(turnMid).setY(0).normalize();
  const along = (turnCue.x * travelX + turnCue.z * travelZ) / travelLen;
  assert.ok(along > 0.9, "orbit hood " + along);
  assert.equal(flight.worlds.mars.position.x, around.worldX);
  assert.equal(flight.worlds.mars.position.y, around.worldY);
  assert.equal(flight.worlds.mars.position.z, around.worldZ);
  assert.ok(flight.worlds.mars.geometry.parameters.radius + 3 < around.orbitRadius);
  const held = flight.worlds.mars.position.x;
  const half = cruisePose(APPROACH_MS + orbitPeriod("mars") / 2, "mars", FLIGHT_SPACE);
  placeFlight(flight, half);
  assert.equal(flight.worlds.mars.position.x, held);
  assert.equal(flight.worlds.mars.position.z, half.worldZ);
  assert.ok(Math.hypot(flight.car.position.x - half.worldX, flight.car.position.z - half.worldZ) > 4);
  placeFlight(flight, cruisePose(APPROACH_MS + 400, "saturn", FLIGHT_SPACE));
  assert.equal(flight.worlds.saturn.visible, true);
  assert.equal(flight.worlds.mars.visible, false);
  const quiet = cruisePose(APPROACH_MS - 1, "mars", FLIGHT_SPACE);
  placeFlight(flight, quiet);
  assert.equal(flight.jokes.filter((sprite) => sprite.visible).length, 0);
  const jokePose = cruisePose(APPROACH_MS + 2000, "mars", FLIGHT_SPACE);
  placeFlight(flight, jokePose);
  const shown = flight.jokes.filter((sprite) => sprite.visible);
  assert.ok(shown.length >= 1);
  const near = Math.hypot(shown[0].position.x - jokePose.carX, shown[0].position.z - jokePose.carZ);
  assert.ok(near < 2, "joke " + near);
  const onOrbit = cruisePose(APPROACH_MS, "mars", FLIGHT_SPACE);
  placeFlight(flight, onOrbit);
  flight.root.updateMatrixWorld(true);
  const screen = flight.koni.getObjectByName("koni-screen");
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
  const outward = new THREE.Vector3(onOrbit.carX - onOrbit.worldX, 0, onOrbit.carZ - onOrbit.worldZ).normalize();
  assert.ok(screenNormal.dot(outward) > 0.9, "koni screen " + screenNormal.dot(outward));
  const bay = koniSpot(flightPose(FLIGHT_RELEASE - 1));
  assert.equal(bay.x, 0.4);
  const beside = koniSpot(onOrbit);
  assert.ok(Math.abs(beside.x - (onOrbit.carX + 0.15)) < 0.001);
  assert.equal(flight.engines, 33);
});
