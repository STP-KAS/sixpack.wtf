/** LUMBRIDGE in 3D. Original meshes. The camera turns around the player through a full circle. */

import * as THREE from "./vendor/three.module.js";
import { HUNTS, PARKING_BAYS, ROADSTER_PARK, SHOPS, standTile, tripBySku } from "./world.mjs";

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

/** The cinema glass, before a film chooses its own shape inside it. */
export const SCREEN_W = 7.4;
export const SCREEN_H = 3.5;

/**
 * Fit a film inside the glass. The picture keeps width / height.
 * A wider film touches the left and right. A taller film touches the top and bottom.
 */
export function screenFit(videoW, videoH, frameW = SCREEN_W, frameH = SCREEN_H) {
  const vw = Number(videoW);
  const vh = Number(videoH);
  if (!(vw > 0) || !(vh > 0) || !(frameW > 0) || !(frameH > 0)) {
    return { w: frameW, h: frameH, scaleX: 1, scaleY: 1 };
  }
  const aspect = vw / vh;
  let w = frameW;
  let h = w / aspect;
  if (h > frameH) {
    h = frameH;
    w = h * aspect;
  }
  return { w, h, scaleX: w / frameW, scaleY: h / frameH };
}

/**
 * A portrait lens sees less of the square across. Step the camera back.
 * A square or wide picture keeps the distance it already has. The result stays within the town zoom.
 */
export function portraitDistance(distance, aspect) {
  const d = Number(distance);
  const a = Number(aspect);
  if (!(d > 0) || !(a > 0) || a >= 1) return d > 0 ? d : distance;
  return Math.min(40, d * Math.min(1.55, 0.86 / a));
}

/** Screen pixels onto the desk picture. A scaled phone turns as far as the same fraction of the desk. */
export function pointerScale(layout, visual) {
  const frame = Number(layout);
  const box = Number(visual);
  if (!(frame > 0) || !(box > 0)) return 1;
  return frame / box;
}

/** Scale the picture mesh. scale 1 fills the glass, which is only right for that exact shape. */
export function fitScreen(mesh, videoW, videoH) {
  const fit = screenFit(videoW, videoH);
  if (mesh && mesh.scale) mesh.scale.set(fit.scaleX, fit.scaleY, 1);
  return fit;
}

/** Eye in the back-row seat at x −1.15, looking toward the screen on −z. */
export const CINEMA_EYE = Object.freeze({ x: -1.15, y: 1.12, z: 1.62 });
/** Screen center. The seat faces this, local −z, world −z. */
export const CINEMA_LOOK = Object.freeze({ x: 0, y: 1.72, z: -4.05 });

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

/** A ship ride. Times are from the moment Launch is pressed. Up is +Y. The count on the pad runs to zero before the ship leaves. */
export const FLIGHT_LIFTOFF = 15000;
export const FLIGHT_CLIMB = 21000;
/** Most booster engines cut. Flight 14 did this at 2:20. */
export const FLIGHT_STAGE = 28000;
/** The camera leaves the booster and stays with the ship. */
export const FLIGHT_ORBIT = 39000;
/** Ship engine cutoff. Flight 14 did this at 8:11, then coasted. */
export const FLIGHT_SECO = 46000;
/** Unpowered float before the bay opens. */
export const FLIGHT_COAST = 10000;
export const FLIGHT_RELEASE = FLIGHT_SECO + FLIGHT_COAST;
export const FLIGHT_SPACE = FLIGHT_RELEASE + 8000;
/** A paid hop. The end popup waits this long after the hop starts. The bar uses CRUISE_MS. */
export const CRUISE_END_MS = 10000;
export const CRUISE_MS = 40000;
/** The car flies toward the world, then the circle starts. */
export const APPROACH_MS = 10000;
/** How far ahead of the release point the orbit sits. */
export const APPROACH_FAR = 48;
/** Speed and distance on the hop are not miles. Ten blocks a second is the Kaspa rate. */
export const FLIGHT_NOTE = "Space is broad. Speed and distance here are relative. Being among the stars in a vast space is hard, and with an average of 10 blocks per second it is possible. Enjoy the flight.";

/** What Go into the abyss is. The old roadster is already out there. */
export const ABYSS_HANG = "You hang out with the old roadster. It has been cruising for years.";
/** Unit sphere. The mesh scale is this radius, so the car stays a car in front of it. */
export const EARTH_RADIUS = 280;
/** The pad sits just above this. Launch and ejection use this fixed surface. */
export const EARTH_SURFACE = -0.55;
/** Hang altitude above that surface, same scene units. */
export const HANG_ALT = 62;
export const HANG_RADIUS = EARTH_RADIUS + HANG_ALT;
/** Share of the orbit radius that sits above the equator. The rest is the horizontal circle. */
const HANG_LIFT = 0.55;
/** One calm lap. θ = 0 is the release point, tangent +X. */
const HANG_LAP_MS = 80000;
/** Photo yaw so the day side faces the hang camera. Launch uses the same coast. */
const EARTH_FACE = 1.15;
/** Tips the pole so the pad sits on a mid-latitude coast, not the ice. */
const EARTH_PAD_TILT = 1.05;
/** A half turn of local +Y lands on −Y. The exhaust column is built on −Y already. */
export const FLIGHT_PLUME_PITCH = Math.PI;

function flightSmooth(ms, from, to) {
  if (ms <= from) return 0;
  if (ms >= to) return 1;
  const t = (ms - from) / (to - from);
  return t * t * (3 - 2 * t);
}

/** light, liftoff, climb, stage, orbit, release, then space. */
export function flightBeat(ms) {
  const t = Math.max(0, ms);
  if (t < FLIGHT_LIFTOFF) return "light";
  if (t < FLIGHT_CLIMB) return "liftoff";
  if (t < FLIGHT_STAGE) return "climb";
  if (t < FLIGHT_ORBIT) return "stage";
  if (t < FLIGHT_RELEASE) return "orbit";
  if (t < FLIGHT_SPACE) return "release";
  return "space";
}

export function flightLine(beat, ms) {
  if (beat === "light") return "Countdown.";
  if (beat === "liftoff") return "Liftoff.";
  if (beat === "climb") return "Climbing out.";
  if (beat === "stage") {
    const t = Math.max(0, ms || 0);
    const marks = stageMarks();
    if (t <= marks.letGo) return "The booster is on the ship.";
    if (t < marks.flipStart) return "Hot staging. The ship pulls away.";
    return "The booster turns for the boostback.";
  }
  if (beat === "orbit") {
    const t = Math.max(0, ms || 0);
    if (t < FLIGHT_SECO) return "The ship keeps climbing.";
    return "The ship is coasting.";
  }
  return "";
}

/** Wait this long for launch.mp3. The count stays at T- 00:00:15 until the file is playing. */
export const COUNT_HOLD_MS = 4000;

/**
 * Flight milliseconds for the countdown.
 * heardMs is launch.mp3's position. The 15 second count follows that position,
 * so the number, the voice, and the liftoff stay together.
 * Once the recording crosses liftoff, anchor is the wall time minus the heard
 * time. Later frames use the wall clock, so the shortened flight keeps going
 * after the file ends. hold keeps the screen at the start until play begins.
 */
export function countdownMs(wallMs, heardMs, opts) {
  const wall = Math.max(0, Number(wallMs) || 0);
  const heard = Math.max(0, Number(heardMs) || 0);
  const playing = !!(opts && opts.playing);
  const ended = !!(opts && opts.ended);
  const hold = !!(opts && opts.hold);
  const given = opts && opts.anchored != null && Number.isFinite(Number(opts.anchored)) ? Number(opts.anchored) : null;
  if (given != null) return { ms: Math.max(0, wall - given), anchor: given };
  if ((playing || (heard > 0 && !ended)) && heard < FLIGHT_LIFTOFF) return { ms: heard, anchor: null };
  if (heard >= FLIGHT_LIFTOFF) return { ms: heard, anchor: wall - heard };
  if (hold && wall < COUNT_HOLD_MS) return { ms: 0, anchor: null };
  return { ms: wall, anchor: null };
}

/** The pad reads like the launch recording: T- 00:00:15, then T+ 0:00 at liftoff. */
export function flightClock(ms) {
  const t = Math.max(0, Number(ms) || 0);
  if (t < FLIGHT_LIFTOFF) {
    const left = Math.ceil((FLIGHT_LIFTOFF - t) / 1000);
    return "T- 00:00:" + String(left).padStart(2, "0");
  }
  const s = Math.floor((t - FLIGHT_LIFTOFF) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return "T+ " + m + ":" + String(r).padStart(2, "0");
}

/** 0 at ignition, 1 when the roadster has left the ship. */
export function flightProgress(ms) {
  const t = Math.max(0, ms);
  if (t >= FLIGHT_SPACE) return 1;
  return t / FLIGHT_SPACE;
}

/** End flight stays hidden until the car is out. */
export function flightOfferEnd(ms) {
  return flightProgress(ms) >= 1;
}

/** 0 at the start of a hop, 1 when the bar for that hop is full. */
export function cruiseProgress(ms) {
  const t = Math.max(0, ms);
  if (t >= CRUISE_MS) return 1;
  return t / CRUISE_MS;
}

/** The same end popup, ten seconds after a hop starts. */
export function cruiseOfferEnd(ms) {
  return Math.max(0, ms) >= CRUISE_END_MS;
}

export function cruiseLine(progress, name) {
  const world = name || "that world";
  const abyss = /abyss/i.test(world);
  if (progress < APPROACH_MS / CRUISE_MS) {
    if (abyss) return ABYSS_HANG + " The Gulf of America is beautiful.";
    return "On the way to " + world + ". The climb already pitched downrange.";
  }
  if (abyss) {
    if (progress < 0.55) return "The old roadster has been cruising for years. The Gulf of America. Wonderful.";
    if (progress < 1) return ABYSS_HANG + " What a view. The gulf is wonderful.";
    return "The old roadster has been cruising for years. The Gulf of America fills the window. Wonderful.";
  }
  if (progress < 1) return "At " + world + ". You can leave for another world, or go into the abyss.";
  return "At " + world + ". The bar is full. Leave for another world, or go into the abyss.";
}

/** One joke holds the screen for this long, then the next one. */
export const JOKE_MS = 10000;

/** Body radius in scene units. The car stays a car in front of the disk. Jupiter fits the camera far plane. */
export const WORLD_RADIUS = { moon: 100, mars: 150, jupiter: 340, saturn: 270 };
/** Altitude above that surface. Saturn clears the tilted rings. */
export const WORLD_ALT = { moon: 24, mars: 38, jupiter: 62, saturn: 110 };
const WORLD_PERIOD = { moon: 70000, mars: 84000, jupiter: 110000, saturn: 120000 };
/** Sphere u = 0.25 is +Z, the side the hop camera sees. This yaw puts the marked face there. */
const WORLD_FACE = { moon: 0.4, mars: 1.2, jupiter: 0.8, saturn: 0.2 };
const SATURN_TILT = 26.7 * Math.PI / 180;
const SATURN_RING_INNER = 1.11;
const SATURN_RING_OUTER = 2.27;

const SPACE_JOKES = {
  moon: [
    "The Moon. You can leave for another world, or go into the abyss.",
    "The Moon holds this circle. The card is the next hop.",
    "The Moon. Speed here is relative. Ten blocks a second.",
  ],
  mars: [
    "Mars. You can leave for another world, or go into the abyss.",
    "Mars. The hop is done. The card stays open.",
    "Mars. The climb pitched downrange. This circle comes after.",
  ],
  jupiter: [
    "Jupiter. You can leave for another world, or go into the abyss.",
    "Jupiter. The circle is wide. The card is the way on.",
    "Jupiter. The climb pitched downrange. This is the far hop.",
  ],
  saturn: [
    "Saturn. You can leave for another world, or go into the abyss.",
    "Saturn. The ring is the circle you paid for.",
    "Saturn. The card can send you on.",
  ],
  abyss: [
    ABYSS_HANG + " Look down. The Gulf of America is beautiful.",
    "The old roadster has been cruising for years. Wonderful. That gulf fills the window.",
    ABYSS_HANG + " The Gulf of America. Wonderful.",
    "Beautiful. The old roadster has been cruising for years. The Gulf of America.",
  ],
  any: [
    "The card stays open for the next hop.",
    "Another world is on the card.",
    "The abyss is past this circle.",
  ],
};

function worldKey(sku) {
  return WORLD_RADIUS[sku] ? sku : "mars";
}

function worldHang(sku) {
  const key = worldKey(sku);
  return WORLD_RADIUS[key] + WORLD_ALT[key];
}

/** Horizontal radius of the same lifted circle the Earth hang uses. */
function worldRho(sku) {
  const hang = worldHang(sku);
  return hang * Math.sqrt(1 - HANG_LIFT * HANG_LIFT);
}

export function orbitRadius(sku) {
  return worldRho(sku);
}

export function orbitPeriod(sku) {
  return WORLD_PERIOD[worldKey(sku)];
}

/** One joke for this moment of a hop. The first one starts when the orbit does. */
export function spaceJoke(ms, sku) {
  const orbitMs = Math.max(0, ms) - APPROACH_MS;
  if (orbitMs < 0) return { index: -1, text: "" };
  const index = Math.floor(orbitMs / JOKE_MS);
  const own = SPACE_JOKES[sku] || [];
  const list = own.concat(SPACE_JOKES.any);
  return { index, text: list[index % list.length] };
}

/**
 * A circle around the paid world, the same lift as the Earth hang.
 * θ = 0 puts the car where the ship let it go, nose on headingYaw(1, 0), toward +X.
 * The world center sits below that point and on −Z, so the camera on +Z sees the body past the car.
 * Tangent is (cos θ, −sin θ). That is d/dθ of (sin θ, cos θ).
 */
export function orbitPoint(ms, sku, fromMs) {
  const base = flightPose(Math.max(FLIGHT_SPACE, fromMs || FLIGHT_SPACE));
  const hang = worldHang(sku);
  const lift = hang * HANG_LIFT;
  const radius = worldRho(sku);
  const worldX = base.carX + APPROACH_FAR;
  const worldY = base.carY - lift;
  const worldZ = base.carZ - radius;
  const orbitMs = Math.max(0, Math.max(0, ms) - APPROACH_MS);
  const theta = (orbitMs / orbitPeriod(sku)) * Math.PI * 2;
  return {
    worldX,
    worldY,
    worldZ,
    radius,
    theta,
    carX: worldX + radius * Math.sin(theta),
    carY: worldY + lift,
    carZ: worldZ + radius * Math.cos(theta),
    tx: Math.cos(theta),
    tz: -Math.sin(theta),
  };
}

/** The joke stays above the car for ten seconds. It does not race out of the picture. */
function jokeBursts(ms, sku, fromMs) {
  const t = Math.max(0, ms);
  const joke = spaceJoke(t, sku);
  if (joke.index < 0) return [];
  const age = (t - APPROACH_MS - joke.index * JOKE_MS) / 1000;
  if (age >= 10) return [];
  const at = sku === "abyss" ? abyssCar(t, fromMs) : orbitPoint(t, sku, fromMs);
  return [{
    index: joke.index,
    text: joke.text,
    x: at.carX,
    y: at.carY + 1.45,
    z: at.carZ,
    fade: age < 9.2 ? 1 : Math.max(0, 1 - (age - 9.2) / 0.8),
  }];
}

/** Simulation theory is not on a clock. It shows after the rider ends the flight. */
export function returnReady() {
  return false;
}

/**
 * A point on a group whose rotation.z is roll.
 * Local +Y is the stack axis. roll = −lean sends that axis toward +X.
 */
function stackPoint(originX, originY, localX, localY, roll) {
  return {
    x: originX + localX * Math.cos(roll) - localY * Math.sin(roll),
    y: originY + localX * Math.sin(roll) + localY * Math.cos(roll),
  };
}

/** Separation clock. letGo stays 2.5s after MECO so T+ 0:15 is still one stack. */
function stageMarks() {
  const letGo = FLIGHT_STAGE + 2500;
  const flipStart = letGo + 2200;
  const flipEnd = flipStart + 2000;
  return {
    letGo,
    flipStart,
    flipEnd,
    boostStart: flipEnd - 500,
    boostEnd: flipEnd + 4000,
  };
}

/**
 * Stack positions for one moment.
 * Climb pitches the whole stack downrange, nose toward +X.
 * Through T+ 0:15 the ship base sits on the booster top. Same axis, no flip.
 * MECO leaves three center engines. The ship is already lit, pulls away, then the booster flips.
 * Boostback lights 31 bells back toward the pad. The ship burns on, shuts down, and coasts for ten seconds.
 * The roadster stays in the bay until that coast ends. Its nose uses headingYaw(1, 0), the same −z front as the town car.
 */
export function flightPose(ms) {
  const t = Math.max(0, ms);
  const beat = flightBeat(t);
  const marks = stageMarks();
  const burnUp = flightSmooth(t, FLIGHT_LIFTOFF, FLIGHT_SECO);
  const drift = flightSmooth(t, FLIGHT_SECO, FLIGHT_SECO + 4000) * 2.4;
  const coastU = t <= FLIGHT_SECO || t >= FLIGHT_RELEASE ? 0 : (t - FLIGHT_SECO) / FLIGHT_COAST;
  const bob = Math.sin(coastU * Math.PI) * 1.8;
  const stackY = burnUp * 50 + drift + bob;
  const lean = 0.42 * flightSmooth(t, FLIGHT_LIFTOFF + 2000, FLIGHT_STAGE) * (1 - flightSmooth(t, FLIGHT_RELEASE - 2500, FLIGHT_RELEASE));
  const shipRoll = -lean;
  const pull = 14 * flightSmooth(t, marks.letGo, marks.letGo + 1600);
  const slip = flightSmooth(t, marks.letGo, FLIGHT_ORBIT) * 24;
  const aside = flightSmooth(t, marks.flipEnd, marks.flipEnd + 1200) * 1.3;
  const along = 11.2 + pull;
  const shipAt = stackPoint(0, stackY, 0, along, shipRoll);
  const boostAt = stackPoint(0, stackY, -aside, -slip, shipRoll);
  const peel = flightSmooth(t, marks.flipEnd, marks.flipEnd + 900);
  const drop = flightSmooth(t, marks.flipEnd, marks.flipEnd + 1600) * 14 + flightSmooth(t, marks.boostEnd, marks.boostEnd + 2500) * 10;
  const flip = flightSmooth(t, marks.flipStart, marks.flipEnd) * Math.PI;
  const boosterRoll = shipRoll - flip;
  const shipX = shipAt.x;
  const shipY = shipAt.y;
  const boosterX = boostAt.x;
  const boosterY = boostAt.y - drop;
  const boosterZ = peel * 5;
  const boosterYaw = peel * 0.55;
  let carX = 0;
  let bayY = 4.2;
  let carZ = 0;
  if (t >= FLIGHT_RELEASE) {
    const out = flightSmooth(t, FLIGHT_RELEASE, FLIGHT_SPACE);
    carX = out * 8;
    if (t > FLIGHT_SPACE) carX += ((t - FLIGHT_SPACE) / 1000) * 0.35;
    bayY = 4.2 - out * 9;
    carZ = out * 1.4;
  }
  const bay = stackPoint(shipX, shipY, carX, bayY, shipRoll);
  let plume = 0;
  let litJets = 0;
  if (t < FLIGHT_LIFTOFF) {
    plume = flightSmooth(t, FLIGHT_LIFTOFF - 8000, FLIGHT_LIFTOFF);
    litJets = plume > 0.02 ? 33 : 0;
  } else if (t < FLIGHT_STAGE) {
    plume = 1;
    litJets = 33;
  } else if (t < marks.letGo + 200) {
    plume = 0.18;
    litJets = 3;
  } else if (t >= marks.boostStart && t < marks.boostEnd) {
    const ramp = flightSmooth(t, marks.boostStart, marks.boostStart + 450);
    const cut = 1 - flightSmooth(t, marks.boostEnd - 600, marks.boostEnd);
    plume = 0.75 * ramp * cut;
    litJets = plume > 0.02 ? 31 : 0;
  }
  let shipPlume = 0;
  if (t >= FLIGHT_STAGE - 700 && t < FLIGHT_SECO) {
    shipPlume = t >= FLIGHT_STAGE ? 1 : flightSmooth(t, FLIGHT_STAGE - 700, FLIGHT_STAGE);
  } else if (t >= FLIGHT_SECO && t < FLIGHT_SECO + 700) {
    shipPlume = 1 - flightSmooth(t, FLIGHT_SECO, FLIGHT_SECO + 700);
  }
  const hot = flightSmooth(t, FLIGHT_STAGE - 700, FLIGHT_STAGE) * (1 - flightSmooth(t, marks.letGo, marks.letGo + 1600));
  const sky = flightSmooth(t, FLIGHT_CLIMB, FLIGHT_ORBIT);
  return {
    beat,
    stackY,
    boosterY,
    shipY,
    boosterX,
    shipX,
    boosterZ,
    boosterYaw,
    lean,
    shipRoll,
    boosterRoll,
    hot,
    bayY,
    carX,
    carY: bay.y,
    carZ,
    carYaw: headingYaw(1, 0),
    carPitch: t > FLIGHT_SPACE ? Math.sin((t - FLIGHT_SPACE) / 1800) * 0.35 : 0,
    plume,
    litJets,
    shipPlume,
    sky,
    line: flightLine(beat, t),
    separated: t > marks.letGo,
    released: carX > 0.2,
    beatCruise: false,
  };
}

/**
 * Earth orbit for the hang-out.
 * Center sits so θ = 0 is the release point. Circle is x = ρ sin θ, z = ρ cos θ, y = h.
 * Tangent (cos θ, −sin θ) matches headingYaw, the same −z nose as the town car.
 */
function abyssCar(ms, fromMs) {
  const t = Math.max(0, ms);
  const base = flightPose(Math.max(FLIGHT_SPACE, fromMs || FLIGHT_SPACE));
  const h = HANG_RADIUS * HANG_LIFT;
  const rho = HANG_RADIUS * Math.sqrt(1 - HANG_LIFT * HANG_LIFT);
  const earthX = base.carX;
  const earthY = base.carY - h;
  const earthZ = base.carZ - rho;
  const theta = (t / HANG_LAP_MS) * Math.PI * 2;
  return {
    base,
    t,
    theta,
    earthX,
    earthY,
    earthZ,
    rho,
    carX: earthX + rho * Math.sin(theta),
    carY: earthY + h,
    carZ: earthZ + rho * Math.cos(theta),
    tx: Math.cos(theta),
    tz: -Math.sin(theta),
  };
}

/**
 * The old roadster leads on the same circle. The lead breathes, and a smaller
 * radial offset keeps the pass side by side instead of stacked on the look line.
 * At t = 8000 the along-track lead is about 8 scene units.
 */
function guestChase(t, theta, rho) {
  const phase = ((t - 8000) / 22000) * Math.PI * 2;
  const lead = 0.028 + 0.012 * Math.sin(phase);
  const guestTheta = theta + lead;
  const grho = rho + 1.6 * Math.cos(phase);
  return {
    theta: guestTheta,
    rho: grho,
    tx: Math.cos(guestTheta),
    tz: -Math.sin(guestTheta),
  };
}

function abyssPose(ms, fromMs) {
  const at = abyssCar(ms, fromMs);
  const t = at.t;
  const trip = tripBySku("abyss");
  const meet = t >= 2500;
  const guest = guestChase(t, at.theta, at.rho);
  const bank = -0.26 * flightSmooth(t, 600, 2800);
  return {
    ...at.base,
    beat: "cruise",
    beatCruise: true,
    dest: "abyss",
    destName: trip ? trip.name : "Go into the abyss",
    along: cruiseProgress(t),
    theta: at.theta,
    worldX: at.earthX,
    worldY: at.earthY,
    worldZ: at.earthZ,
    orbitRadius: HANG_RADIUS,
    carX: at.carX,
    carY: at.carY,
    carZ: at.carZ,
    carYaw: headingYaw(at.tx, at.tz),
    carRoll: bank,
    nod: 0,
    spin: 0,
    earthSpin: t * 0.000035 + EARTH_FACE,
    plume: 0,
    shipPlume: 0,
    sky: 1,
    released: true,
    separated: true,
    thrust: 1.1 * (1 - flightSmooth(t, 1200, 4500)),
    guestOn: meet,
    raceOpen: flightSmooth(t, 2500, 4800),
    guestX: at.earthX + guest.rho * Math.sin(guest.theta),
    guestY: at.carY,
    guestZ: at.earthZ + guest.rho * Math.cos(guest.theta),
    guestYaw: headingYaw(guest.tx, guest.tz),
    guestRoll: bank,
    jokes: jokeBursts(t, "abyss", fromMs),
  };
}

/**
 * A hop is an orbit of the paid world. The nose follows the tangent from orbitPoint.
 * Roll is a bank into the turn, local Z. It is 0 at the first instant.
 */
export function cruisePose(ms, sku, fromMs) {
  if (sku === "abyss") return abyssPose(ms, fromMs);
  const t = Math.max(0, ms);
  const at = orbitPoint(t, sku, fromMs);
  const base = flightPose(Math.max(FLIGHT_SPACE, fromMs || FLIGHT_SPACE));
  const trip = tripBySku(sku);
  const arriving = t < APPROACH_MS;
  const u = arriving ? flightSmooth(t, 0, APPROACH_MS) : 1;
  const insert = orbitPoint(APPROACH_MS, sku, fromMs);
  const carX = arriving ? base.carX + (insert.carX - base.carX) * u : at.carX;
  const carY = arriving ? base.carY + (insert.carY - base.carY) * u : at.carY;
  const carZ = arriving ? base.carZ + (insert.carZ - base.carZ) * u : at.carZ;
  const yaw = arriving ? headingYaw(1, 0) : headingYaw(at.tx, at.tz);
  const bank = arriving ? 0 : flightSmooth(Math.max(0, t - APPROACH_MS), 600, 2800);
  const fade = arriving ? 0 : flightSmooth(Math.max(0, t - APPROACH_MS), 1200, 4500);
  return {
    ...base,
    beat: "cruise",
    beatCruise: true,
    dest: sku || "",
    destName: trip ? trip.name : "that world",
    along: cruiseProgress(t),
    theta: arriving ? 0 : at.theta,
    worldX: at.worldX,
    worldY: at.worldY,
    worldZ: at.worldZ,
    orbitRadius: at.radius,
    carX,
    carY,
    carZ,
    carYaw: yaw,
    carRoll: bank ? -0.26 * bank : 0,
    nod: 0,
    spin: (WORLD_FACE[sku] || 0) + Math.max(0, t - APPROACH_MS) * 0.000035,
    plume: 0,
    shipPlume: 0,
    sky: 1,
    released: true,
    separated: true,
    thrust: fade ? 1.1 * (1 - fade) : (arriving ? 0 : 1.1),
    jokes: jokeBursts(t, sku, fromMs),
  };
}

/** KONI rides in the bay, then sits beside the roadster once both are out. */
export function koniSpot(pose) {
  if (!pose.released && pose.beat !== "cruise") {
    return { x: 0.4, y: pose.shipY + 3.4, z: 0.5 };
  }
  return { x: pose.carX + 0.15, y: pose.carY + 0.95, z: pose.carZ + 0.35 };
}

/**
 * Outside the orbit, on the radial from the world through the car.
 * yaw 0 and pitch = π/2 sits the camera further out than the car, looking at the car,
 * so the world stays in view past the nose's side. The yaw walks on that same radial's right.
 */
export function cruiseWatch(pose, yaw = 0, pitch = 1.05, dist = 14) {
  const rx = pose.carX - pose.worldX;
  const rz = pose.carZ - pose.worldZ;
  const len = Math.hypot(rx, rz) || 1;
  const ox = rx / len;
  const oz = rz / len;
  const offset = orbitOffset(yaw, pitch);
  return {
    x: pose.carX + (oz * offset.x + ox * offset.z) * dist,
    y: pose.carY + offset.y * dist,
    z: pose.carZ + (-ox * offset.x + oz * offset.z) * dist,
    lx: pose.carX,
    ly: pose.carY,
    lz: pose.carZ,
  };
}

/**
 * Both cars, from outside the circle. Pitch stays level so the pair and the limb stay in the window.
 * yaw walks on the same radial as cruiseWatch.
 */
export function raceWatch(pose, yaw = 0) {
  const mx = (pose.carX + pose.guestX) / 2;
  const my = (pose.carY + pose.guestY) / 2;
  const mz = (pose.carZ + pose.guestZ) / 2;
  const gap = Math.hypot(pose.guestX - pose.carX, pose.guestY - pose.carY, pose.guestZ - pose.carZ);
  const dist = Math.max(14, gap * 1.7);
  return cruiseWatch({
    carX: mx,
    carY: my,
    carZ: mz,
    worldX: pose.worldX,
    worldY: pose.worldY,
    worldZ: pose.worldZ,
  }, yaw, Math.PI / 2, dist);
}

/** Solo Earth shot, then a zoom out onto the race once the old roadster is in the window. */
export function abyssWatch(pose, yaw = 0, pitch = 1.05) {
  if (!pose.guestOn) return cruiseWatch(pose, yaw, pitch, 6);
  const race = raceWatch(pose, yaw);
  const open = pose.raceOpen != null ? pose.raceOpen : 1;
  if (open >= 1) return race;
  const solo = cruiseWatch(pose, yaw, Math.PI / 2, 6);
  return {
    x: solo.x + (race.x - solo.x) * open,
    y: solo.y + (race.y - solo.y) * open,
    z: solo.z + (race.z - solo.z) * open,
    lx: solo.lx + (race.lx - solo.lx) * open,
    ly: solo.ly + (race.ly - solo.ly) * open,
    lz: solo.lz + (race.lz - solo.lz) * open,
  };
}

/** Camera around a pose, same orbitOffset frame as the town camera. Looks at the car. */
export function flightWatch(pose, yaw = 0, pitch = 1.05, dist = 9) {
  const offset = orbitOffset(yaw, pitch);
  return {
    x: pose.carX + offset.x * dist,
    y: pose.carY + offset.y * dist,
    z: pose.carZ + offset.z * dist,
    lx: pose.carX,
    ly: pose.carY,
    lz: pose.carZ,
  };
}

/** Fixed center under the pad. The surface does not chase the ship. */
export function earthCenter(_pose) {
  return EARTH_SURFACE - EARTH_RADIUS;
}

/**
 * Just outside the vehicle, leaned off the Earth radial, so the limb crosses the window
 * the way the cruise does. yaw walks around that radial. dist is scene units from the subject.
 */
export function limbShot(x, y, z, dist, yaw = 0) {
  const ey = earthCenter();
  let ox = x;
  let oy = y - ey;
  let oz = z;
  const olen = Math.hypot(ox, oy, oz) || 1;
  ox /= olen;
  oy /= olen;
  oz /= olen;
  let hx = -oz;
  let hz = ox;
  let hlen = Math.hypot(hx, hz);
  if (hlen < 1e-4) {
    hx = 0;
    hz = 1;
  } else {
    hx /= hlen;
    hz /= hlen;
  }
  const px = -hz;
  const pz = hx;
  const tilt = 0.52;
  const side = Math.sin(tilt);
  const out = Math.cos(tilt);
  const cb = Math.cos(yaw);
  const sb = Math.sin(yaw);
  const sideX = hx * cb + px * sb;
  const sideZ = hz * cb + pz * sb;
  const vx = ox * out + sideX * side;
  const vy = oy * out;
  const vz = oz * out + sideZ * side;
  const vlen = Math.hypot(vx, vy, vz) || 1;
  return {
    x: x + (vx / vlen) * dist,
    y: y + (vy / vlen) * dist,
    z: z + (vz / vlen) * dist,
    lx: x,
    ly: y,
    lz: z,
  };
}

/**
 * In space the window is black and the stars show.
 * The filmed sky stays off there, so looking around does not play clouds across the dark.
 * Stage is already above the blue, so it uses the same dark field.
 */
export function spaceBackdrop(pose) {
  const beat = pose && pose.beat;
  const inSpace = beat === "stage" || beat === "cruise" || beat === "orbit" || beat === "release" || beat === "space";
  const high = pose && Number(pose.sky) >= 0.55;
  return {
    stars: inSpace || !!(pose && Number(pose.sky) >= 0.45),
    film: !!high && !inSpace,
  };
}

/** stars: the dark field. film: the climb picture. off: the pad. */
export function spaceSkyMode(pose) {
  const backdrop = spaceBackdrop(pose);
  if (backdrop.film) return "film";
  if (backdrop.stars) return "stars";
  return "off";
}

/** Clear air once the ship is above the blue. The pad and the climb keep their haze. */
export function flightFog(pose) {
  if (pose && (pose.beat === "cruise" || pose.beat === "orbit" || pose.beat === "release" || pose.beat === "space")) {
    return { near: 400, far: 1400 };
  }
  if (pose && pose.sky > 0.15) return { near: 90, far: 1400 };
  return { near: 40, far: 420 };
}

/**
 * Pad and climb cameras sit on +Z and keep the Earth limb in the window.
 * Until the booster lets go, the camera stays on the stack. Separation then watches the gap.
 * Coast and ejection sit just outside the vehicle, so the Earth fills the window the way the cruise does.
 */
export function flightCamera(ms, yaw = 0, pitch = 1.05) {
  const pose = flightPose(ms);
  if (pose.beat === "light" || pose.beat === "liftoff") {
    const y = 4.6 + pose.stackY * 0.45;
    return {
      x: 0,
      y,
      z: 64,
      lx: 0,
      ly: y + 2.6 + pose.stackY * 0.2,
      lz: 0,
    };
  }
  if (pose.beat === "climb" || (pose.beat === "stage" && ms < stageMarks().letGo)) {
    const lx = pose.shipX || 0;
    return {
      x: lx + 2.2,
      y: pose.shipY + 0.6,
      z: 56,
      lx,
      ly: pose.shipY - 10.5,
      lz: 0,
    };
  }
  if (pose.beat === "stage") {
    const sx = pose.shipX || 0;
    const bx = pose.boosterX || 0;
    const midX = (sx + bx) / 2;
    const midY = (pose.shipY + pose.boosterY) / 2;
    const span = Math.max(Math.abs(pose.shipY - pose.boosterY) + 22, Math.abs(sx - bx) + 10, 20);
    const dist = Math.max(48, span * 1.25);
    return {
      x: midX - dist * 0.1,
      y: midY + 2,
      z: dist,
      lx: midX,
      ly: midY - 6,
      lz: (pose.boosterZ || 0) * 0.2,
    };
  }
  if (pose.beat === "orbit") {
    const hull = stackPoint(pose.shipX || 0, pose.shipY, 0, 4, pose.shipRoll || 0);
    return limbShot(hull.x, hull.y, 0, 22, yaw);
  }
  return limbShot(pose.carX || 0, pose.carY, pose.carZ || 0, 11, yaw);
}

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
  cafe: "Take a seat, or order at the counter.",
  restaurant: "Take a seat, or order at the counter.",
  groceries: "Click the counter.",
  roadster: "Click Pike or the sign.",
  cinema: "Take a seat. The screen starts the reel.",
  hunt: "Click Reed. Then the board.",
};

/** Hits that glow. A seat and the counter, or the menu once you sit. */
export function invite(venue, seated) {
  if (venue === "bank") return ["clerk"];
  if (venue === "cafe" || venue === "restaurant") return seated ? ["menu", "qr"] : ["seat", "counter", "keeper"];
  if (venue === "groceries") return ["counter", "keeper"];
  if (venue === "roadster") return ["keeper", "sign"];
  if (venue === "cinema") return seated ? ["screen", "counter"] : ["seat", "screen", "counter", "keeper"];
  if (venue === "hunt") return seated ? ["board"] : ["keeper"];
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
      return { open: "", sit: true, say: "You are seated. The menu is blinking.", clerk: "" };
    }
    if (hit === "counter" || hit === "keeper") {
      return { open: venue, sit: false, say: "", clerk: "" };
    }
    const table = hit === "menu" || hit === "qr";
    if (table && !seated) return { ...none, say: "Take a seat for that menu. The counter takes an order too." };
    if (table) return { open: venue, sit: true, say: "", clerk: "" };
    return { ...none, say: seated ? "The menu is blinking." : "Take a seat, or order at the counter." };
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
  if (venue === "cinema") {
    if (hit === "seat") return { open: "", sit: true, say: "You are seated. The screen starts the reel.", clerk: "" };
    if (hit === "screen") return { open: "", sit: true, say: "", clerk: "", play: true };
    if (hit === "counter" || hit === "keeper" || hit === "menu") return { open: "cinema", sit: false, say: "", clerk: "" };
    return { ...none, say: seated ? "The screen starts the reel." : "Take a seat. The screen starts the reel." };
  }
  if (venue === "hunt") {
    if (hit === "keeper") {
      return {
        open: "",
        sit: false,
        say: "Promise a month if others do. I will not tell you how many already did.",
        clerk: "",
        spoke: true,
      };
    }
    if (hit === "board" && seated) return { open: "hunt", sit: false, say: "", clerk: "", spoke: true };
    if (hit === "board") return { ...none, say: "Click Reed." };
    return { ...none, say: "Click Reed." };
  }
  return none;
}

/** Esc closes the card first, then leaves the room, then a side panel. */
export function escapeRoom(panelOpen, inside) {
  if (panelOpen) return "counter";
  if (inside) return "leave";
  return "close";
}

/** Wall menu lines. Prices come from the shop list, on this ledger. */
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

/** A dark sky. Stars only, so looking around does not play the cloudy film. */
function starfieldTexture() {
  const w = 2048;
  const h = 1024;
  let canvas;
  try {
    canvas = document.createElement("canvas");
  } catch (err) {
    return null;
  }
  if (!canvas || typeof canvas.getContext !== "function") return null;
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g || typeof g.fillRect !== "function") return null;
  g.fillStyle = "#010204";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4200; i++) {
    const x = hash(i, 1) * w;
    const y = hash(i, 2) * h;
    const bright = hash(i, 3);
    const warm = hash(i, 4);
    const radius = bright > 0.988 ? 1.6 : bright > 0.94 ? 1.05 : 0.5;
    const alpha = (0.4 + bright * 0.6).toFixed(3);
    const red = warm > 0.93 ? 255 : warm < 0.07 ? 186 : 232;
    const green = warm > 0.93 ? 220 : warm < 0.07 ? 210 : 236;
    const blue = warm > 0.93 ? 186 : 255;
    g.fillStyle = "rgba(" + red + "," + green + "," + blue + "," + alpha + ")";
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
    if (bright > 0.988) {
      g.fillRect(x - 2.4, y - 0.35, 4.8, 0.7);
      g.fillRect(x - 0.35, y - 2.4, 0.7, 4.8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Photo replaces the painted fallback once a browser can fetch it. */
function loadWorldPhoto(material, url, ring) {
  try {
    if (typeof document !== "undefined" && typeof document.createElementNS === "function") {
      const loader = new THREE.TextureLoader();
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        if (ring) material.premultipliedAlpha = false;
        material.map = tex;
        material.needsUpdate = true;
      });
    }
  } catch (err) {
    /* Painted fallback stays. */
  }
}

function worldAir(color, opacity) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.018, 48, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  mesh.name = "world-air";
  mesh.renderOrder = 2;
  return mesh;
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

function paintJokeCanvas(g, canvas, text) {
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#07080c";
  g.fillRect(8, 14, canvas.width - 16, 68);
  g.strokeStyle = "#e7c27a";
  g.strokeRect(8.5, 14.5, canvas.width - 17, 67);
  g.fillStyle = "#f2d48a";
  g.font = "700 22px Segoe UI, sans-serif";
  g.textAlign = "center";
  g.fillText(text, canvas.width / 2, 56);
}

function jokeSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 96;
  paintJokeCanvas(canvas.getContext("2d"), canvas, text);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, opacity: 0 });
  material.map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(5.2, 0.72, 1);
  sprite.visible = false;
  sprite.userData.label = text;
  return sprite;
}

function writeJoke(sprite, text) {
  const canvas = sprite.material.map.image;
  paintJokeCanvas(canvas.getContext("2d"), canvas, text);
  sprite.material.map.needsUpdate = true;
  sprite.userData.label = text;
}

/** Wide gold board over the lot. The same sentence is the buy button. */
function lotBoard(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 180;
  const g = canvas.getContext("2d");
  g.fillStyle = "rgba(12,10,8,0.94)";
  g.fillRect(8, 18, 1008, 144);
  g.strokeStyle = "#e7c27a";
  g.lineWidth = 10;
  g.strokeRect(14, 24, 996, 132);
  g.fillStyle = "#ffe7a8";
  g.font = "700 44px Segoe UI, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 512, 92);
  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  material.map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(6.4, 1.12, 1);
  sprite.renderOrder = 12;
  sprite.userData.label = text;
  sprite.name = "lot-buy-sign";
  return sprite;
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

export const BUILDING_SIGN_W = 3.8;
export const BUILDING_SIGN_H = 0.98;
const SIGN_OUT = 1.2;
const SIGN_LIFT = 1.15;

/** Door-face name. The board sits in front of the eave and above the tiles. */
export function buildingSignPose(wallX, wallZ, nx, nz, bodyH) {
  return {
    x: wallX + nx * SIGN_OUT,
    y: bodyH + 0.12 + SIGN_LIFT,
    z: wallZ + nz * SIGN_OUT,
  };
}

function buildingSign(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "rgba(12,10,8,0.94)";
  g.fillRect(10, 14, 492, 100);
  g.strokeStyle = "#e7c27a";
  g.lineWidth = 6;
  g.strokeRect(13, 17, 486, 94);
  g.fillStyle = "#f6ead0";
  g.font = "700 68px Segoe UI, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 66);
  const material = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  material.map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(BUILDING_SIGN_W, BUILDING_SIGN_H, 1);
  sprite.renderOrder = 12;
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
    const signAt = buildingSignPose(wallX, wallZ, face.nx, face.nz, h);
    const sign = buildingSign(b.sign);
    sign.position.set(signAt.x, signAt.y, signAt.z);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(face.nx) ? SIGN_OUT : 0.1, 0.1, Math.abs(face.nz) ? SIGN_OUT : 0.1),
      stone("#e1c27a", 0.42),
    );
    arm.position.set(wallX + face.nx * (SIGN_OUT / 2), signAt.y, wallZ + face.nz * (SIGN_OUT / 2));
    parent.add(arm, sign);
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

function makeRoadster(bodyColor = "#c0392b", hoodColor = "#922b21") {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 2.15), stone(bodyColor, 0.4));
  body.position.set(0, 0.36, 0.05);
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.28, 0.85), stone("#1a1612", 0.45));
  cabin.position.set(0, 0.58, 0.28);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.2, 0.7),
    new THREE.MeshStandardMaterial({ color: "#9fd4ee", roughness: 0.12, metalness: 0.25 }),
  );
  glass.position.set(0, 0.62, 0.22);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.42), stone(hoodColor, 0.32));
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
  car.userData.wheels = wheels;
  car.userData.flames = flames;
  car.userData.thrustLight = thrustLight;
  car.userData.lastPos = new THREE.Vector3();
  return car;
}

/** Center bell, then 10, then 22. Same rings for the bells and the jets. */
function bellSpots() {
  const spots = [[0, 0]];
  const ring = (count, radius) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      spots.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
  };
  ring(10, 0.38);
  ring(22, 0.74);
  return spots;
}

function raptorBells(parent) {
  const geo = new THREE.CylinderGeometry(0.07, 0.11, 0.32, 6);
  const mat = new THREE.MeshStandardMaterial({ color: "#2c3136", metalness: 0.62, roughness: 0.38 });
  let n = 0;
  for (const [x, z] of bellSpots()) {
    const bell = new THREE.Mesh(geo, mat);
    bell.name = "raptor";
    bell.position.set(x, -0.16, z);
    parent.add(bell);
    n += 1;
  }
  return n;
}

/** Tip at the bell (y = 0). Wide base on local −Y. scale.y lengthens the column downward. */
function plumeCone(color, radius, length, opacity = 0.9, additive = false) {
  const geo = new THREE.ConeGeometry(radius, length, 16);
  geo.translate(0, -length * 0.5, 0);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
  mesh.visible = false;
  mesh.scale.y = 0.001;
  return mesh;
}

/** Left film, then the right film. The countdown starts when the right film ends. v=3 is the original picture with the caption line moved to the bottom. */
export const PAD_LEFT = "1984/pad-left.mp4?v=3";
export const PAD_RIGHT = "1984/before.mp4";
/** File lengths, used until the player reports its own duration. */
export const PAD_LEFT_SECONDS = 58.282667;
export const PAD_RIGHT_SECONDS = 34.946032;

/** How far the two pad films are toward the launch. 0 is the start of the left film. 1 is the end of the right film. */
export function filmLaunchFill(phase, leftNow, rightNow, leftDur, rightDur) {
  const left = Number.isFinite(leftDur) && leftDur > 0 ? leftDur : PAD_LEFT_SECONDS;
  const right = Number.isFinite(rightDur) && rightDur > 0 ? rightDur : PAD_RIGHT_SECONDS;
  const total = left + right;
  const onRight = phase === "right";
  const a = onRight ? left : Math.min(Math.max(Number(leftNow) || 0, 0), left);
  const b = onRight ? Math.min(Math.max(Number(rightNow) || 0, 0), right) : 0;
  return Math.max(0, Math.min(1, (a + b) / total));
}
/** First clip for the pair helper. The pad plays PAD_LEFT, then PAD_RIGHT. */
export const PAD_LEAD = PAD_RIGHT;

/**
 * Left is the first clip. Right is one of the rest.
 * roll 0 picks the first of the rest. A roll just under 1 picks the last.
 */
export function padPair(clips, roll) {
  const list = Array.isArray(clips) ? clips.filter((src) => typeof src === "string" && src) : [];
  const left = list[0] || PAD_LEAD;
  const rest = list.slice(1).filter((src) => src !== left);
  if (!rest.length) return { left, right: left };
  const n = rest.length;
  const unit = Number.isFinite(roll) ? roll : 0;
  let i = Math.floor(unit * n);
  if (i < 0) i = 0;
  if (i >= n) i = n - 1;
  return { left, right: rest[i] };
}

/** Stainless booster under a dark ship. The roadster rides in the bay, nose toward +X. */
export function buildFlight() {
  const root = new THREE.Group();
  root.name = "flight";
  root.visible = false;
  const steel = new THREE.MeshStandardMaterial({ color: "#e4e7ec", metalness: 0.72, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1c1f24", metalness: 0.55, roughness: 0.4 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.4, 0.35, 8), stone("#6e6256", 0.9));
  pad.position.y = -0.15;
  // The booster stands in the mount. One tower stands beside it. The chopsticks stay open.
  const mount = new THREE.Group();
  mount.name = "olm";
  const deck = new THREE.Mesh(
    new THREE.RingGeometry(1.35, 2.55, 28),
    new THREE.MeshStandardMaterial({ color: "#8d939c", metalness: 0.64, roughness: 0.38, side: THREE.DoubleSide }),
  );
  deck.name = "olm-deck";
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.16, 8, 24), steel);
  ring.name = "olm-ring";
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.28;
  mount.add(deck, ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.2), steel);
    clamp.name = "hold-down";
    const r = 2.15;
    clamp.position.set(Math.cos(a) * r, 0.34, Math.sin(a) * r);
    clamp.rotation.y = -a;
    clamp.rotation.z = -0.7;
    mount.add(clamp);
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 6), steel);
    leg.position.set(Math.cos(a) * 1.95, 0.02, Math.sin(a) * 1.95);
    mount.add(leg);
  }
  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.08, 8.5),
    new THREE.MeshStandardMaterial({ color: "#2a2724", roughness: 0.95 }),
  );
  trench.name = "flame-trench";
  trench.position.set(0, -0.02, 1.6);
  mount.add(trench);
  const tower = new THREE.Group();
  const column = new THREE.Mesh(new THREE.BoxGeometry(1.15, 26, 1.15), steel);
  column.name = "launch-tower";
  column.position.set(-6.6, 13, -2.4);
  tower.add(column);
  const armGeo = new THREE.BoxGeometry(8.2, 0.32, 0.38);
  for (const [y, z] of [[21.4, -3.15], [19.0, -1.65]]) {
    const arm = new THREE.Mesh(armGeo, steel);
    arm.name = "chopstick";
    arm.position.set(-10.4, y, z);
    arm.rotation.z = 2.35;
    tower.add(arm);
  }
  const qd = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.2, 0.22), steel);
  qd.name = "qd-arm";
  qd.position.set(-5.35, 16.4, -2.4);
  tower.add(qd);
  const padScreens = [];
  const padVideos = [];
  for (const side of [-1, 1]) {
    // Left film is 576 by 738. Right film is 1920 by 1080. Twice the earlier boards, one left of the rocket and one right.
    const wide = side < 0 ? 9.6 : 12.4;
    const tall = side < 0 ? 9.6 * (738 / 576) : 7;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(wide, tall),
      new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
    );
    screen.name = side < 0 ? "pad-left" : "pad-right";
    screen.position.set(side < 0 ? -11.2 : 12.6, 9, 2);
    tower.add(screen);
    // Countdown camera stays at (0, 4.6, 64). PlaneGeometry faces local +Z, and lookAt points that +Z at the camera.
    screen.lookAt(0, 4.6, 64);
    padScreens.push(screen);
    const film = document.createElement("video");
    if (film && typeof film.play === "function") {
      film.playsInline = true;
      film.preload = "auto";
      film.muted = false;
      film.volume = 0.85;
      film.setAttribute("playsinline", "");
      film.setAttribute("webkit-playsinline", "");
      film.src = side < 0 ? PAD_LEFT : PAD_RIGHT;
      film.style.cssText = "position:fixed;left:0;top:0;width:480px;height:360px;transform:translateX(-120vw);pointer-events:none;opacity:1";
      if (document.body) document.body.appendChild(film);
      const map = new THREE.VideoTexture(film);
      map.colorSpace = THREE.SRGBColorSpace;
      screen.material.color.set("#ffffff");
      screen.material.map = map;
      screen.material.toneMapped = false;
      screen.material.needsUpdate = true;
      film._padMap = map;
      padVideos.push(film);
    }
  }
  root.add(pad, mount, tower);

  const booster = new THREE.Group();
  const boosterBody = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.08, 11, 16), steel);
  boosterBody.position.y = 5.5;
  booster.add(boosterBody);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.35, 16), dark);
  band.position.y = 10.5;
  booster.add(band);
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.1, 8, 18), dark);
  skirt.name = "aft-skirt";
  skirt.rotation.x = Math.PI / 2;
  skirt.position.y = 0.32;
  booster.add(skirt);
  const fins = [];
  for (const side of [-1, 1]) {
    for (const z of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.7), dark);
      fin.name = "grid-fin";
      fin.position.set(side * 1.35, 10.2, z * 0.2);
      booster.add(fin);
      fins.push(fin);
    }
  }
  const engines = raptorBells(booster);
  const plume = plumeCone("#ff6a1a", 1.15, 1, 0.78, true);
  plume.position.y = -0.55;
  plume.renderOrder = 2;
  const plumeHot = plumeCone("#fff6ea", 0.42, 1, 0.95, false);
  plumeHot.position.y = -0.55;
  plumeHot.renderOrder = 3;
  const plumeSkirt = plumeCone("#ff9a3a", 2.1, 1, 0.34, true);
  plumeSkirt.position.y = -0.55;
  plumeSkirt.renderOrder = 1;
  const jets = [];
  for (const [x, z] of bellSpots()) {
    const jet = plumeCone("#fff4dc", 0.08, 1, 0.95, true);
    jet.name = "bell-jet";
    jet.position.set(x, -0.34, z);
    jet.renderOrder = 4;
    booster.add(jet);
    jets.push(jet);
  }
  const diamonds = [];
  for (let i = 0; i < 5; i++) {
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16 + (i % 2) * 0.05, 0),
      new THREE.MeshBasicMaterial({ color: "#fffaf0", transparent: true, opacity: 0.9, depthWrite: false }),
    );
    gem.visible = false;
    gem.renderOrder = 5;
    gem.userData.step = i;
    booster.add(gem);
    diamonds.push(gem);
  }
  booster.add(plume, plumeHot, plumeSkirt);
  const burn = new THREE.PointLight("#ff7a2a", 0, 28, 1.6);
  burn.position.y = -0.4;
  booster.add(burn);
  root.add(booster);

  const ship = new THREE.Group();
  const shipBody = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.02, 6.2, 16), steel);
  shipBody.position.y = 3.1;
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.97, 1.04, 2.2, 16), dark);
  belly.position.y = 1.3;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.4, 16), dark);
  nose.position.y = 7.4;
  ship.add(shipBody, belly, nose);
  const flapMat = dark;
  for (const side of [-1, 1]) {
    const fwd = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.85), flapMat);
    fwd.position.set(side * 1.25, 5.6, 0);
    fwd.rotation.z = side * -0.5;
    const aft = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.7), flapMat);
    aft.position.set(side * 1.2, 1.1, 0);
    aft.rotation.z = side * 0.35;
    ship.add(fwd, aft);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 1.1), new THREE.MeshStandardMaterial({ color: "#2a2e33", metalness: 0.4, roughness: 0.45 }));
  door.position.set(1.02, 4.2, 0);
  door.userData.homeY = 4.2;
  ship.add(door);
  const shipPlume = plumeCone("#ffb15a", 0.55, 1, 0.8, true);
  shipPlume.position.y = 0;
  shipPlume.renderOrder = 2;
  const shipSkirt = plumeCone("#ff7a22", 1.65, 1, 0.42, true);
  shipSkirt.position.y = 0.02;
  shipSkirt.renderOrder = 1;
  const shipJets = [];
  for (const [x, z] of [[0, 0.22], [0.22, -0.12], [-0.22, -0.12]]) {
    const jet = plumeCone("#ffe7c2", 0.14, 1, 0.92, true);
    jet.position.set(x, 0, z);
    jet.renderOrder = 4;
    ship.add(jet);
    shipJets.push(jet);
  }
  const hullLine = jokeSprite("");
  hullLine.position.set(0, 4.6, 0);
  hullLine.scale.set(3.4, 0.48, 1);
  ship.add(shipPlume, shipSkirt, hullLine);
  root.add(ship);

  const car = makeRoadster();
  const pilot = figure("#f2d16b");
  pilot.position.set(0, 0.22, 0.28);
  pilot.scale.setScalar(0.5);
  car.add(pilot);
  car.scale.setScalar(0.42);
  root.add(car);
  const starman = makeRoadster("#9b1b2e", "#6e1020");
  const rider = figure("#e4e0d8");
  rider.position.set(0, 0.22, 0.28);
  rider.scale.setScalar(0.5);
  starman.add(rider);
  starman.scale.setScalar(0.42);
  starman.visible = false;
  starman.name = "starman";
  root.add(starman);

  const earthMap = paintTex(128, (g, s) => {
    g.fillStyle = "#1a4f86";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#d7e6ee";
    g.fillRect(0, 0, s, s * 0.08);
    g.fillRect(0, s * 0.92, s, s * 0.08);
    g.fillStyle = "#3d7a3a";
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.ellipse((0.18 + (i % 4) * 0.2) * s, (0.28 + (i % 3) * 0.16) * s, 16 + (i % 3) * 8, 10 + (i % 2) * 6, i * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  });
  // The photo is already a daylight Earth. A second sun would black out half the disk.
  const earthMat = new THREE.MeshBasicMaterial({
    map: earthMap,
    color: "#ffffff",
    fog: false,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), earthMat);
  earth.scale.setScalar(EARTH_RADIUS);
  earth.visible = false;
  earth.name = "earth";
  const earthAir = new THREE.Mesh(
    new THREE.SphereGeometry(1.02, 48, 32),
    new THREE.MeshBasicMaterial({
      color: "#8ec5ff",
      transparent: true,
      opacity: 0.05,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  earthAir.name = "earth-air";
  earthAir.renderOrder = 2;
  const cloudMap = paintTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 36; i++) {
      const x = hash(i, 9) * s;
      const y = s * 0.14 + hash(i, 4) * s * 0.7;
      g.fillStyle = "rgba(255,255,255," + (0.22 + hash(i, 7) * 0.4) + ")";
      g.beginPath();
      g.ellipse(x, y, 16 + hash(i, 2) * 30, 5 + hash(i, 3) * 9, hash(i, 5) * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  });
  const earthClouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.012, 48, 32),
    new THREE.MeshBasicMaterial({
      map: cloudMap,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
    }),
  );
  earthClouds.name = "earth-clouds";
  earthClouds.visible = false;
  earthClouds.renderOrder = 1;
  earth.add(earthClouds, earthAir);
  root.add(earth);
  try {
    if (typeof document !== "undefined" && typeof document.createElementNS === "function") {
      const loader = new THREE.TextureLoader();
      loader.load("1984/earth.jpg?v=1", (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        earthMat.map = tex;
        earthMat.needsUpdate = true;
      });
    }
  } catch (err) {
    /* The painted sphere stays until a browser can fetch the photo. */
  }
  const starCount = 2200;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const y = 1 - (i / starCount) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.399;
    starPos[i * 3] = Math.cos(a) * ring * 900;
    starPos[i * 3 + 1] = y * 900;
    starPos[i * 3 + 2] = Math.sin(a) * ring * 900;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: "#f3f6ff", size: 1.6, sizeAttenuation: false, fog: false }),
  );
  stars.visible = false;
  root.add(stars);
  const splash = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 24),
    new THREE.MeshBasicMaterial({
      color: "#ffd0a0",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  splash.rotation.x = -Math.PI / 2;
  splash.position.y = 0.05;
  splash.visible = false;
  root.add(splash);
  const steam = [];
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.7 + i * 0.15, 8, 6),
      new THREE.MeshBasicMaterial({ color: "#f4f7fb", transparent: true, opacity: 0, depthWrite: false }),
    );
    puff.position.set((i - 2) * 0.8, 0.6, 1.4);
    root.add(puff);
    steam.push(puff);
  }
  const worlds = {};
  const worldBody = (fallback, radius) => {
    const map = paintTex(64, (g, s) => {
      g.fillStyle = fallback;
      g.fillRect(0, 0, s, s);
    });
    const mat = new THREE.MeshBasicMaterial({ map, color: "#ffffff", fog: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat);
    mesh.scale.setScalar(radius);
    mesh.userData.photo = mat;
    return mesh;
  };
  const moon = worldBody("#c8c4bc", WORLD_RADIUS.moon);
  moon.name = "moon";
  const mars = worldBody("#c45a28", WORLD_RADIUS.mars);
  mars.name = "mars";
  mars.add(worldAir("#e7b090", 0.04));
  const jupiter = worldBody("#e0b060", WORLD_RADIUS.jupiter);
  jupiter.name = "jupiter";
  jupiter.add(worldAir("#f0d8b0", 0.04));
  const saturn = new THREE.Group();
  saturn.name = "saturn";
  const saturnBody = worldBody("#e6c98a", 1);
  saturnBody.add(worldAir("#f3e6c8", 0.04));
  const ringMap = paintTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    const c = s / 2;
    const inner = SATURN_RING_INNER / SATURN_RING_OUTER;
    g.strokeStyle = "rgba(230,210,170,0.9)";
    g.lineWidth = (1 - inner) * c;
    g.beginPath();
    g.arc(c, c, ((inner + 1) / 2) * c, 0, Math.PI * 2);
    g.stroke();
  });
  ringMap.wrapS = THREE.ClampToEdgeWrapping;
  ringMap.wrapT = THREE.ClampToEdgeWrapping;
  const saturnRing = new THREE.Mesh(
    new THREE.RingGeometry(SATURN_RING_INNER, SATURN_RING_OUTER, 96),
    new THREE.MeshBasicMaterial({
      map: ringMap,
      color: "#ffffff",
      transparent: true,
      premultipliedAlpha: false,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    }),
  );
  saturnRing.name = "saturn-ring";
  saturnRing.rotation.x = Math.PI / 2;
  saturn.rotation.x = SATURN_TILT;
  saturn.scale.setScalar(WORLD_RADIUS.saturn);
  saturn.add(saturnBody, saturnRing);
  saturn.userData.ground = saturnBody;
  saturn.userData.ring = saturnRing;
  loadWorldPhoto(moon.userData.photo, "1984/moon.jpg?v=2");
  loadWorldPhoto(mars.userData.photo, "1984/mars.jpg?v=2");
  loadWorldPhoto(jupiter.userData.photo, "1984/jupiter.jpg?v=2");
  loadWorldPhoto(saturnBody.userData.photo, "1984/saturn.jpg?v=2");
  loadWorldPhoto(saturnRing.material, "1984/saturn-ring.png?v=2", true);
  worlds.moon = moon;
  worlds.mars = mars;
  worlds.jupiter = jupiter;
  worlds.saturn = saturn;
  for (const body of Object.values(worlds)) {
    body.visible = false;
    root.add(body);
  }
  const jokes = [];
  for (let i = 0; i < 5; i++) {
    const sprite = jokeSprite("");
    root.add(sprite);
    jokes.push(sprite);
  }
  const koni = new THREE.Group();
  koni.name = "koni";
  const koniBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.62, 1.68, 0.42),
    new THREE.MeshStandardMaterial({ color: "#1a1e24", metalness: 0.45, roughness: 0.4 }),
  );
  const panelMat = new THREE.MeshStandardMaterial({ color: "#14181c", metalness: 0.2, roughness: 0.55 });
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.4), panelMat);
  wingL.position.set(-1.62, 0, 0);
  const wingR = wingL.clone();
  wingR.position.x = 1.62;
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: "#e7c27a", metalness: 0.6, roughness: 0.35 }),
  );
  antenna.position.y = 1.16;
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 1280;
  screenCanvas.height = 800;
  paintKoniCanvas(screenCanvas, ["KONI", "TN10", "accepted block", "waiting", "mining reward", "waiting"]);
  const screenMap = new THREE.CanvasTexture(screenCanvas);
  screenMap.colorSpace = THREE.SRGBColorSpace;
  const koniScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.5),
    new THREE.MeshBasicMaterial({ map: screenMap }),
  );
  koniScreen.name = "koni-screen";
  koniScreen.position.z = 0.24;
  koni.add(koniBody, wingL, wingR, antenna, koniScreen);
  root.add(koni);
  let spaceSky = null;
  let spaceVideo = null;
  const skyEl = document.createElement("video");
  if (skyEl && typeof skyEl.play === "function") {
    skyEl.muted = true;
    skyEl.loop = true;
    skyEl.playsInline = true;
    skyEl.preload = "auto";
    skyEl.src = "1984/space.mp4";
    skyEl.setAttribute("playsinline", "");
    skyEl.setAttribute("muted", "");
    skyEl.setAttribute("aria-hidden", "true");
    skyEl.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(skyEl);
    const skyMap = new THREE.VideoTexture(skyEl);
    skyMap.colorSpace = THREE.SRGBColorSpace;
    spaceSky = new THREE.Mesh(
      new THREE.SphereGeometry(560, 32, 20),
      new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    spaceSky.name = "space-sky";
    spaceSky.visible = false;
    spaceSky.userData.filmMap = skyMap;
    const field = starfieldTexture();
    if (field) spaceSky.userData.starfield = field;
    root.add(spaceSky);
    spaceVideo = skyEl;
  }
  return { root, pad, mount, tower, booster, ship, door, car, starman, plume, plumeHot, plumeSkirt, jets, diamonds, shipPlume, shipSkirt, shipJets, hullLine, fins, burn, earth, earthClouds, stars, steam, splash, engines, worlds, jokes, koni, koniScreen, spaceSky, spaceVideo, padScreens, padVideos, padFilmsDone: false };
}

function paintKoniCanvas(canvas, lines) {
  const g = canvas.getContext("2d");
  if (!g || typeof g.fillRect !== "function") return;
  g.fillStyle = "#07080c";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = "#e7c27a";
  g.lineWidth = 8;
  g.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  g.fillStyle = "#f2d48a";
  g.font = "700 64px Consolas, monospace";
  g.textAlign = "left";
  const rows = lines && lines.length ? lines : ["KONI", "TN10", "accepted block", "waiting", "mining reward", "waiting"];
  rows.slice(0, 8).forEach((line, i) => {
    g.fillText(String(line).slice(0, 28), 48, 110 + i * 88);
  });
}

/** KONI's screen. lines name the accepted block and the mining reward. */
export function paintKoni(flight, lines) {
  const screen = flight && flight.koniScreen;
  if (!screen || !screen.material || !screen.material.map) return;
  paintKoniCanvas(screen.material.map.image, lines);
  screen.material.map.needsUpdate = true;
}

/** Both films are done. The last frame leaves the tower. */
export function erasePadFilms(flight) {
  if (!flight) return;
  flight.padFilmsDone = true;
  for (const screen of flight.padScreens || []) {
    screen.visible = false;
    if (screen.material) {
      screen.material.map = null;
      screen.material.needsUpdate = true;
    }
  }
  for (const film of flight.padVideos || []) {
    try { film.pause(); } catch (err) { /* already quiet */ }
    try { film.removeAttribute("src"); } catch (err) { /* already clear */ }
    try { film.load(); } catch (err) { /* no file left */ }
  }
}

/** The next launch may play the two films again. */
export function armPadFilms(flight) {
  if (!flight) return;
  flight.padFilmsDone = false;
}

export function placeFlight(flight, pose) {
  const shipRoll = pose.shipRoll || 0;
  // Pose boosterX/Y is the bell point before the flip. The half-turn is about the middle.
  const mid = 5.5;
  const roll = pose.boosterRoll || 0;
  const axis = shipRoll;
  const cx = (pose.boosterX || 0) - mid * Math.sin(axis);
  const cy = pose.boosterY + mid * Math.cos(axis);
  flight.booster.rotation.set(0, pose.boosterYaw || 0, roll);
  flight.booster.position.set(cx + mid * Math.sin(roll), cy - mid * Math.cos(roll), pose.boosterZ || 0);
  if (flight.fins) {
    const kick = Math.max(0, -(pose.boosterRoll || 0) - Math.abs(pose.shipRoll || 0));
    const bend = Math.min(0.55, kick * 0.15);
    for (const fin of flight.fins) fin.rotation.x = bend * (fin.position.z < 0 ? -1 : 1);
  }
  flight.ship.position.set(pose.shipX || 0, pose.shipY, 0);
  flight.ship.rotation.set(0, 0, shipRoll);
  if (pose.beat === "cruise") {
    flight.car.position.set(pose.carX, pose.carY, pose.carZ);
    flight.car.rotation.set(pose.nod || 0, pose.carYaw, pose.carRoll || 0);
  } else {
    const bay = stackPoint(pose.shipX || 0, pose.shipY, pose.carX || 0, pose.bayY != null ? pose.bayY : 4.2, shipRoll);
    flight.car.position.set(bay.x, bay.y, pose.carZ || 0);
    flight.car.rotation.set(pose.nod || 0, pose.carYaw, shipRoll + (pose.carRoll || 0));
  }
  const column = Math.max(0.001, pose.plume * 20);
  const lit = pose.plume > 0.02;
  const litJets = pose.litJets == null ? (lit && flight.jets ? flight.jets.length : 0) : pose.litJets;
  const narrow = litJets > 0 && litJets <= 3 ? 0.35 : 1;
  flight.plume.visible = lit;
  flight.plume.scale.set(narrow, column, narrow);
  flight.plumeHot.visible = lit;
  flight.plumeHot.scale.set(narrow, column * 0.82, narrow);
  if (flight.plumeSkirt) {
    const wide = lit && litJets > 13;
    flight.plumeSkirt.visible = wide;
    flight.plumeSkirt.scale.set(wide ? 1 : 0.001, wide ? column * 0.92 : 0.001, wide ? 1 : 0.001);
  }
  if (flight.jets) {
    for (let i = 0; i < flight.jets.length; i++) {
      const jet = flight.jets[i];
      const on = lit && i < litJets;
      jet.visible = on;
      jet.scale.y = on ? 0.6 + pose.plume * 2.2 : 0.001;
    }
  }
  if (flight.diamonds) {
    for (const gem of flight.diamonds) {
      gem.visible = pose.plume > 0.4;
      gem.position.y = -(2.2 + gem.userData.step * 3.2) * pose.plume;
    }
  }
  flight.burn.intensity = pose.plume * 18;
  flight.shipPlume.visible = pose.shipPlume > 0;
  const hot = pose.hot || 0;
  flight.shipPlume.scale.y = pose.shipPlume > 0 ? (2.2 + (1 - hot) * 5.8) * pose.shipPlume : 0.001;
  if (flight.shipSkirt) {
    const flare = pose.shipPlume > 0.02;
    const wide = 0.42 + hot * 0.12;
    flight.shipSkirt.visible = flare;
    flight.shipSkirt.scale.set(wide, flare ? 0.8 + hot * 0.7 : 0.001, wide);
  }
  if (flight.shipJets) {
    for (const jet of flight.shipJets) {
      jet.visible = pose.shipPlume > 0.02;
      jet.scale.y = pose.shipPlume > 0.02 ? 1.6 + pose.shipPlume * 1.5 : 0.001;
    }
  }
  if (flight.hullLine) {
    const show = pose.beat === "stage" && !!pose.line;
    flight.hullLine.visible = show;
    if (show && flight.hullLine.userData.label !== pose.line) writeJoke(flight.hullLine, pose.line);
    if (show) flight.hullLine.material.opacity = 1;
  }
  const open = pose.beat === "cruise" ? 1 : (pose.released ? Math.min(1, pose.carX / 6) : 0);
  flight.door.position.y = flight.door.userData.homeY + open * 0.35;
  flight.door.rotation.z = -open * 1.2;
  const length = pose.thrust != null ? pose.thrust : thrustLength(pose.released);
  if (flight.car.userData.flames) {
    for (const flame of flight.car.userData.flames) {
      flame.visible = length > 0;
      flame.scale.y = length > 0 ? length * (flame.userData.hot ? 0.62 : 1) : 0.001;
    }
    flight.car.userData.thrustLight.intensity = length > 0 ? 6 : 0;
  }
  if (flight.starman) {
    const on = !!pose.guestOn;
    flight.starman.visible = on;
    if (on) {
      flight.starman.position.set(pose.guestX, pose.guestY, pose.guestZ);
      flight.starman.rotation.set(0, pose.guestYaw || 0, pose.guestRoll || 0);
      const guestLen = pose.thrust != null ? pose.thrust : 4;
      if (flight.starman.userData.flames) {
        for (const flame of flight.starman.userData.flames) {
          flame.visible = guestLen > 0.02;
          flame.scale.y = guestLen > 0.02 ? guestLen * (flame.userData.hot ? 0.62 : 1) : 0.001;
        }
        if (flight.starman.userData.thrustLight) flight.starman.userData.thrustLight.intensity = guestLen > 0.02 ? 4 : 0;
      }
    }
  }
  const cruising = pose.beat === "cruise";
  flight.ship.visible = !cruising;
  flight.booster.visible = !cruising;
  flight.pad.visible = !cruising && pose.sky < 0.45;
  flight.tower.visible = !cruising && pose.sky < 0.45;
  if (flight.mount) flight.mount.visible = flight.pad.visible;
  if (flight.padScreens) {
    // The countdown is still the light beat. Once both films are done the screens stay down.
    const show = pose.beat === "light" && !flight.padFilmsDone;
    for (const screen of flight.padScreens) screen.visible = show;
  }
  const hang = cruising && pose.dest === "abyss";
  flight.earth.visible = hang || !cruising;
  if (flight.earth.visible) {
    if (hang) {
      flight.earth.position.set(pose.worldX, pose.worldY, pose.worldZ);
    } else {
      flight.earth.position.set(0, earthCenter(pose), 0);
    }
    flight.earth.scale.setScalar(EARTH_RADIUS);
    const spin = pose.earthSpin != null ? pose.earthSpin : (pose.stackY || 0) * 0.004;
    if (hang) flight.earth.rotation.set(0, spin, 0);
    else flight.earth.rotation.set(EARTH_PAD_TILT, EARTH_FACE + (pose.stackY || 0) * 0.004, 0);
    if (flight.earthClouds) flight.earthClouds.rotation.y = spin * 0.4;
  }
  if (flight.worlds) {
    for (const key of Object.keys(flight.worlds)) {
      const body = flight.worlds[key];
      const on = cruising && key === pose.dest;
      body.visible = on;
      if (!on) continue;
      body.position.set(pose.worldX, pose.worldY, pose.worldZ);
      body.scale.setScalar(WORLD_RADIUS[key] || 1);
      const turn = pose.spin || 0;
      if (body.userData.ground) body.userData.ground.rotation.y = turn;
      else body.rotation.y = turn;
    }
  }
  if (flight.jokes) {
    for (const sprite of flight.jokes) sprite.visible = false;
    (pose.jokes || []).forEach((burst, n) => {
      const sprite = flight.jokes[n];
      if (!sprite || burst.fade <= 0.02) return;
      if (sprite.userData.label !== burst.text) writeJoke(sprite, burst.text);
      sprite.visible = true;
      sprite.position.set(burst.x, burst.y, burst.z);
      sprite.material.opacity = burst.fade;
    });
  }
  if (flight.koni) {
    const spot = koniSpot(pose);
    flight.koni.visible = false;
    if (!pose.released && pose.beat !== "cruise") {
      const seat = stackPoint(pose.shipX || 0, pose.shipY, 0.4, 3.4, shipRoll);
      flight.koni.position.set(seat.x, seat.y, spot.z);
      flight.koni.rotation.set(0, 0, shipRoll);
    } else {
    flight.koni.position.set(spot.x, spot.y, spot.z);
    if (pose.worldX != null) {
      const ox = pose.carX - pose.worldX;
      const oz = pose.carZ - pose.worldZ;
      flight.koni.lookAt(spot.x + ox, spot.y, spot.z + oz);
    } else {
      flight.koni.rotation.set(0, 0, 0);
    }
    }
  }
  const above = pose.beat === "orbit" || pose.beat === "release" || pose.beat === "space";
  const skyY = pose.worldY != null ? pose.worldY : (above ? earthCenter(pose) : pose.shipY);
  const mode = spaceSkyMode(pose);
  flight.stars.position.set(pose.worldX || 0, skyY, pose.worldZ || 0);
  if (flight.earthClouds) flight.earthClouds.visible = false;
  const field = flight.spaceSky && flight.spaceSky.userData.starfield;
  const showField = mode === "stars" && !!field;
  flight.stars.visible = mode === "stars" && !showField;
  if (flight.spaceSky) {
    const filmMap = flight.spaceSky.userData.filmMap;
    if (showField) {
      if (flight.spaceSky.material.map !== field) {
        flight.spaceSky.material.map = field;
        flight.spaceSky.material.needsUpdate = true;
      }
      flight.spaceSky.visible = true;
    } else if (mode === "film" && filmMap) {
      if (flight.spaceSky.material.map !== filmMap) {
        flight.spaceSky.material.map = filmMap;
        flight.spaceSky.material.needsUpdate = true;
      }
      flight.spaceSky.visible = true;
    } else {
      flight.spaceSky.visible = false;
    }
    flight.spaceSky.position.copy(flight.stars.position);
  }
  const onPad = pose.stackY < 8 && pose.plume > 0.45 && pose.beat !== "cruise";
  if (flight.splash) {
    flight.splash.visible = onPad;
    flight.splash.material.opacity = onPad ? 0.42 * pose.plume : 0;
  }
  for (const puff of flight.steam) {
    puff.material.opacity = pose.beat === "light" || onPad ? 0.32 : 0;
  }
}

/** Three dark stalls with white lines. The middle bay is where the owned car waits. */
function addParkingLot(parent, map) {
  const asphalt = stone("#2c2a28", 0.94);
  const paint = new THREE.MeshBasicMaterial({ color: "#f4f0e6" });
  const padGeo = new THREE.BoxGeometry(TILE * 0.92, 0.04, TILE * 2.05);
  const endGeo = new THREE.BoxGeometry(TILE * 0.92, 0.02, 0.05);
  const sideGeo = new THREE.BoxGeometry(0.05, 0.02, TILE * 2.05);
  for (const bay of PARKING_BAYS) {
    const at = worldOf(map, bay.x + 0.5, bay.y + 0.5, 0.025);
    const pad = new THREE.Mesh(padGeo, asphalt);
    pad.position.copy(at);
    pad.receiveShadow = true;
    parent.add(pad);
    for (const dz of [-1.0, 1.0]) {
      const line = new THREE.Mesh(endGeo, paint);
      line.position.set(at.x, 0.05, at.z + dz * TILE);
      parent.add(line);
    }
    for (const dx of [-0.44, 0.44]) {
      const line = new THREE.Mesh(sideGeo, paint);
      line.position.set(at.x + dx * TILE, 0.05, at.z);
      parent.add(line);
    }
  }
  const sign = lotBoard("Buy a roadster. See what happens.");
  const signAt = worldOf(map, ROADSTER_PARK.x + 0.5, ROADSTER_PARK.y + 0.15, 0);
  sign.position.set(signAt.x, 2.6, signAt.z);
  parent.add(sign);
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
  addParkingLot(parent, map);
  const carAt = worldOf(map, ROADSTER_PARK.x + 0.5, ROADSTER_PARK.y + 0.5, 0);
  const car = makeRoadster();
  car.position.set(carAt.x, 0, carAt.z);
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
  const plaque = nameTag("LUMBRIDGE");
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
    const many = lines.length > 4;
    g.font = many ? "600 28px Georgia, serif" : "600 34px Georgia, serif";
    const step = many ? 46 : 62;
    const start = many ? 132 : 156;
    lines.forEach((line, i) => {
      const cut = line.lastIndexOf(" ");
      const name = cut > 0 ? line.slice(0, cut) : line;
      const price = cut > 0 ? line.slice(cut + 1) : "";
      const y = start + i * step;
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
  const map = paintTex(256, (g, s) => {
    g.fillStyle = "#f7f4ee";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#1c1916";
    g.lineWidth = 10;
    g.strokeRect(8, 8, s - 16, s - 16);
    g.fillStyle = "#1c1916";
    g.textAlign = "center";
    g.font = "700 36px Georgia, serif";
    g.fillText("Own ledger", s / 2, 58);
    g.font = "600 22px Georgia, serif";
    g.fillText("No covenant tx", s / 2, 108);
    g.fillText("Not Argent", s / 2, 146);
    g.fillText("Not a vProg", s / 2, 184);
    g.font = "600 18px Georgia, serif";
    g.fillText("This square's till", s / 2, 222);
  });
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  const group = new THREE.Group();
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.02, 0.5),
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
  addInvite(counterPad, 1.35, "floor");
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
    cafe: ["Sit, then this menu", "menu"],
    restaurant: ["Sit, then this menu", "menu"],
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

/** A dark room, red seats, and one screen. The camera sits in a seat while the reel runs. */
function buildCinemaRoom(maps) {
  const room = new THREE.Group();
  room.name = "cinema";
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 9), stone("#14110e", 0.92));
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  room.add(floor);
  const wallMat = stone("#1a1614", 0.94);
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
  const carpet = new THREE.Mesh(
    new THREE.BoxGeometry(8.4, 0.03, 5.2),
    new THREE.MeshStandardMaterial({ color: "#3a1420", roughness: 0.9 }),
  );
  carpet.position.set(0, 0.02, 0.7);
  room.add(carpet);
  const poster = paintTex(512, (g, s) => {
    g.fillStyle = "#100e12";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#e7c27a";
    g.lineWidth = 16;
    g.strokeRect(18, 18, s - 36, s - 36);
    g.fillStyle = "#f3e6c8";
    g.textAlign = "center";
    g.font = "700 64px Georgia, serif";
    g.fillText("The reel", s / 2, 210);
    g.font = "600 32px Georgia, serif";
    g.fillText("Take a seat", s / 2, 280);
    g.fillText("Then this screen", s / 2, 330);
  });
  poster.wrapS = THREE.ClampToEdgeWrapping;
  poster.wrapT = THREE.ClampToEdgeWrapping;
  poster.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: poster, toneMapped: false });
  const screen = new THREE.Group();
  const matte = new THREE.Mesh(
    new THREE.BoxGeometry(SCREEN_W, SCREEN_H, 0.04),
    new THREE.MeshBasicMaterial({ color: "#000000", toneMapped: false }),
  );
  matte.position.z = 0.09;
  matte.name = "cinema-matte";
  const glass = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W, SCREEN_H, 0.06), screenMat);
  glass.position.z = 0.15;
  glass.name = "cinema-picture";
  const frame = new THREE.Mesh(new THREE.BoxGeometry(7.8, 3.9, 0.12), stone("#2a241c", 0.7));
  screen.add(frame, matte, glass);
  screen.position.set(0, 1.85, -4.02);
  tagHit(screen, "screen");
  addInvite(screen, 2.4, "wall");
  room.add(screen);
  const reel = {
    video: null,
    videoMap: null,
    reelMaps: [],
    cue: () => Promise.resolve(null),
    pauseReels: () => {},
    clearReels: () => {},
  };
  if (typeof document !== "undefined" && document.createElement) {
    const slots = [0, 1].map(() => {
      const el = document.createElement("video");
      if (!el || typeof el.play !== "function") return null;
      el.playsInline = true;
      el.muted = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.setAttribute("muted", "");
      el.preload = "auto";
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
      if (document.body) document.body.appendChild(el);
      const map = new THREE.VideoTexture(el);
      map.colorSpace = THREE.SRGBColorSpace;
      return { el, map };
    }).filter(Boolean);
    if (slots.length) {
      let active = 0;
      let generation = 0;
      reel.reelMaps = slots.map((slot) => slot.map);
      reel.video = slots[0].el;
      reel.videoMap = slots[0].map;
      const use = (index) => {
        active = index;
        reel.video = slots[index].el;
        reel.videoMap = slots[index].map;
      };
      reel.pauseReels = () => {
        for (const slot of slots) slot.el.pause();
      };
      reel.clearReels = () => {
        generation += 1;
        for (const slot of slots) {
          slot.el.onloadeddata = null;
          slot.el.onerror = null;
          slot.el.pause();
          slot.el.removeAttribute("src");
          try { slot.el.load(); } catch (err) { /* the element is already empty */ }
        }
        use(0);
      };
      reel.cue = (src) => {
        const gen = ++generation;
        if (!src) return Promise.resolve(null);
        const current = slots[active];
        if (current.el.getAttribute("src") === src && current.el.readyState >= 2) {
          return Promise.resolve(current.el);
        }
        const idle = slots.length > 1 ? 1 - active : 0;
        const next = slots[idle];
        const finish = () => {
          if (gen !== generation) return null;
          if (slots[active] !== next) slots[active].el.pause();
          use(idle);
          next.map.needsUpdate = true;
          return next.el;
        };
        if (next.el.getAttribute("src") === src && next.el.readyState >= 2) {
          return Promise.resolve(finish());
        }
        return new Promise((resolve) => {
          const done = (ok) => {
            if (next.el.onloadeddata !== null) next.el.onloadeddata = null;
            next.el.onerror = null;
            resolve(ok ? finish() : null);
          };
          next.el.onloadeddata = () => done(true);
          next.el.onerror = () => done(false);
          next.el.muted = true;
          if (next.el.getAttribute("src") !== src) next.el.src = src;
          const pending = next.el.play();
          if (pending && pending.catch) pending.catch(() => {});
        });
      };
    }
  }
  const picks = [screen];
  for (const z of [0.55, 1.85]) {
    for (const x of [-2.3, -1.15, 1.15, 2.3]) {
      const here = chair(maps, "#6e2430", headingYaw(0, -1));
      here.position.set(x, 0, z);
      room.add(here);
      picks.push(here);
    }
  }
  const counter = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.55), stone("#2a241c", 0.75, maps.wood));
  bar.position.set(0, 0.45, 0);
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.22, 10), stone("#e7c27a", 0.55));
  tub.position.set(-0.28, 0.98, 0);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.16, 8), stone("#f4efe6", 0.4));
  cup.position.set(0.22, 0.98, 0.04);
  counter.add(bar, tub, cup);
  counter.position.set(4.55, 0, 1.2);
  counter.rotation.y = -Math.PI / 2;
  tagHit(counter, "counter");
  addInvite(counter, 0.7, "floor");
  room.add(counter);
  picks.push(counter);
  const keeper = figure("#d7c4f2");
  keeper.position.set(4.35, 0, -0.35);
  keeper.rotation.y = headingYaw(-1, 0);
  keeper.add(nameTag("Lux"));
  tagHit(keeper, "keeper");
  addInvite(keeper, 0.48, "person");
  room.add(keeper);
  picks.push(keeper);
  const board = menuBoard("cinema", "Cinema", "#e7c27a", "Snacks too", "menu");
  board.position.set(-5.55, 1.7, 0.4);
  board.rotation.y = Math.PI / 2;
  room.add(board);
  picks.push(board);
  const lamp = new THREE.PointLight("#ffd2a8", 0, 14, 1.8);
  lamp.position.set(0, 2.8, 1.2);
  room.add(lamp);
  const glow = new THREE.PointLight("#f3e6c8", 0, 10, 1.4);
  glow.position.set(0, 1.9, -3.2);
  room.add(glow);
  for (let i = -1; i <= 1; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.1, 0.14), stone("#2a241c", 0.8));
    beam.position.set(0, 3.32, i * 1.5);
    room.add(beam);
  }
  return {
    room,
    screen,
    picture: glass,
    screenMat,
    poster,
    get video() { return reel.video; },
    get videoMap() { return reel.videoMap; },
    reelMaps: reel.reelMaps,
    cue: (src) => reel.cue(src),
    pauseReels: () => reel.pauseReels(),
    clearReels: () => reel.clearReels(),
    lamp,
    glow,
    keeper,
    picks,
    hintW: 0,
    hintH: 0,
  };
}

/** Timber hall. A board, Reed at a high desk, and a bench. No car. */
function buildHuntRoom(maps) {
  const room = new THREE.Group();
  room.name = "hunt";
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 9), stone("#3a2a1c", 0.9, maps.wood));
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  room.add(floor);
  const wallMat = stone("#4a3a28", 0.92);
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
  const lines = HUNTS.map((row) => row.name + " " + (row.cents / 100).toFixed(2));
  const sheet = paintTex(512, (g, s) => {
    g.fillStyle = "#241910";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#c4a574";
    g.lineWidth = 16;
    g.strokeRect(16, 16, s - 32, s - 32);
    g.fillStyle = "#f3e6c8";
    g.textAlign = "center";
    g.font = "700 42px Georgia, serif";
    g.fillText("Hunt", s / 2, 72);
    g.font = "600 22px Georgia, serif";
    lines.forEach((line, i) => {
      const cut = line.lastIndexOf(" ");
      const name = cut > 0 ? line.slice(0, cut) : line;
      const price = cut > 0 ? line.slice(cut + 1) : "";
      const y = 118 + i * 46;
      g.textAlign = "left";
      g.fillText(name, 36, y);
      g.textAlign = "right";
      g.fillText(price, s - 36, y);
    });
    g.textAlign = "center";
    g.fillStyle = "#e7c27a";
    g.font = "600 22px Georgia, serif";
    g.fillText("Hidden pack", s / 2, s - 36);
  });
  sheet.wrapS = THREE.ClampToEdgeWrapping;
  sheet.wrapT = THREE.ClampToEdgeWrapping;
  const board = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 2.4, 0.08),
    new THREE.MeshStandardMaterial({ map: sheet, roughness: 0.55 }),
  );
  board.add(slab, pickPad(3.6, 2.6, 0.24));
  board.position.set(0, 1.9, -4.05);
  tagHit(board, "board");
  addInvite(board, 1.5, "wall");
  room.add(board);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.15, 0.7), stone("#4a3a28", 0.7, maps.wood));
  desk.position.set(-3.1, 0.58, -0.55);
  room.add(desk);
  const keeper = figure("#c4a574");
  keeper.position.set(-3.1, 0, -1.7);
  keeper.rotation.y = headingYaw(0, 1);
  keeper.add(nameTag("Reed"));
  tagHit(keeper, "keeper");
  addInvite(keeper, 0.48, "person");
  room.add(keeper);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.48), stone("#6b5038", 0.75, maps.wood));
  bench.position.set(1.6, 0.28, 2.4);
  room.add(bench);
  const lamp = new THREE.PointLight("#ffd2a8", 0, 14, 1.8);
  lamp.position.set(0, 2.8, 0.4);
  room.add(lamp);
  for (let i = -1; i <= 1; i += 1) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.1, 0.14), stone("#4a3a28", 0.8));
    beam.position.set(0, 3.32, i * 1.5);
    room.add(beam);
  }
  return { room, keeper, lamp, picks: [board, keeper] };
}

export function mountWorld(canvas, map, api) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (err) {
    console.error(err);
    canvas.dataset.gl = "fail";
    canvas.dataset.err = String(err && err.message ? err.message : err);
    return { render() {}, resize() {}, hold() {}, feel() {}, snap() {} };
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
  const cinema = buildCinemaRoom(maps);
  if (cinema.poster) cinema.poster.anisotropy = aniso;
  for (const map of cinema.reelMaps || []) map.anisotropy = aniso;
  if (cinema.videoMap && !(cinema.reelMaps || []).includes(cinema.videoMap)) cinema.videoMap.anisotropy = aniso;
  scene.add(cinema.room);
  const hunt = buildHuntRoom(maps);
  scene.add(hunt.room);
  bank.room.visible = false;
  stall.room.visible = false;
  cinema.room.visible = false;
  hunt.room.visible = false;
  const flight = buildFlight();
  scene.add(flight.root);
  let flightYaw = 0;
  let flightPitch = 1.05;
  let flightWas = 0;

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

  function paintFlight(now, ms) {
    town.visible = false;
    sky.visible = false;
    bank.room.visible = false;
    stall.room.visible = false;
    cinema.room.visible = false;
    hunt.room.visible = false;
    if (ms < 0) {
      flight.root.visible = false;
      scene.background.set("#07080c");
      scene.fog.color.set("#07080c");
      scene.fog.near = 1;
      scene.fog.far = 4;
      canvas.dataset.mode = "flight";
      return;
    }
    if (flightWas <= 0) {
      flightYaw = 0;
      flightPitch = 1.05;
      held.clear();
    }
    flightWas = ms;
    flight.root.visible = true;
    const cruise = api.cruise ? api.cruise() : null;
    const pose = cruise ? cruisePose(cruise.ms, cruise.sku, cruise.from) : flightPose(ms);
    placeFlight(flight, pose);
    // The corner card shows this line.
    if (flight.jokes) {
      for (const sprite of flight.jokes) sprite.visible = false;
    }
    if ((pose.released || pose.beat === "cruise") && flight.car.userData.wheels) {
      const spin = pose.beat === "cruise" ? 0.55 : 0.35;
      for (const hanger of flight.car.userData.wheels) hanger.rotation.x += spin;
    }
    if (pose.guestOn && flight.starman && flight.starman.userData.wheels) {
      for (const hanger of flight.starman.userData.wheels) hanger.rotation.x += 0.7;
    }
    const flick = 0.86 + 0.14 * Math.abs(Math.sin(now / 36));
    if (pose.plume > 0.02) {
      flight.plume.scale.y *= flick;
      flight.plumeHot.scale.y *= flick;
      if (flight.plumeSkirt) flight.plumeSkirt.scale.y *= flick;
      if (flight.jets) {
        for (const jet of flight.jets) jet.scale.y *= flick;
      }
    }
    const cruisingWatch = pose.beat === "cruise";
    // Level with the car, just outside the circle, so the limb crosses the window.
    const watchPitch = cruisingWatch ? (Math.PI / 2) * (flightPitch / 1.05) : flightPitch;
    const cam = cruisingWatch
      ? (pose.dest === "abyss" ? abyssWatch(pose, flightYaw, watchPitch) : cruiseWatch(pose, flightYaw, watchPitch, 6))
      : flightCamera(ms, flightYaw, flightPitch);
    const kick = pose.plume > 0.4 ? 1 : 0;
    camera.position.set(cam.x + Math.sin(now / 28) * 0.15 * kick, cam.y + Math.cos(now / 24) * 0.1 * kick, cam.z);
    camera.up.copy(UP);
    camera.lookAt(cam.lx, cam.ly, cam.lz);
    const flightFov = pose.sky >= 0.5 ? 58 : 42;
    if (camera.fov !== flightFov || camera.far !== 1400) {
      camera.fov = flightFov;
      camera.far = 1400;
      camera.updateProjectionMatrix();
    }
    const day = new THREE.Color("#9ec4e0");
    const night = new THREE.Color("#020308");
    scene.background.copy(day).lerp(night, pose.sky);
    scene.fog.color.copy(scene.background);
    const fog = flightFog(pose);
    scene.fog.near = fog.near;
    scene.fog.far = fog.far;
    renderer.toneMappingExposure = 0.94 + pose.plume * 0.3;
    canvas.dataset.mode = "flight";
  }

  function snap() {
    const who = api.player();
    const goal = worldOf(map, who.x + 0.5, who.y + 0.5, 1.15);
    shown.copy(goal);
    lastStep.copy(shown);
    camFocus.copy(goal);
    const parked = town.getObjectByName("roadster-car");
    if (parked && api.driving && api.driving()) {
      parked.position.set(goal.x, 0, goal.z);
      const face = api.facing();
      if (face && (face.x || face.y)) parked.rotation.y = headingYaw(face.x, face.y);
    }
  }

  function render(now) {
    resize();
    const padFilms = flight.padVideos || [];
    for (let i = 0; i < padFilms.length; i++) {
      const film = padFilms[i];
      if (!film._padMap || film.readyState < 2 || flight.padFilmsDone) continue;
      film._padMap.needsUpdate = true;
      const screen = flight.padScreens && flight.padScreens[i];
      if (screen && screen.material && screen.material.map !== film._padMap) {
        screen.material.map = film._padMap;
        screen.material.needsUpdate = true;
      }
    }
    const flightMs = api.flight ? api.flight() : 0;
    if (flightMs !== 0) {
      paintFlight(now, flightMs);
      renderer.render(scene, camera);
      return;
    }
    if (flightWas !== 0) {
      lapLeft = 0;
      if (camera.fov !== 42) {
        camera.fov = 42;
        camera.updateProjectionMatrix();
      }
    }
    flightWas = 0;
    if (camera.far !== 240) {
      camera.far = 240;
      camera.updateProjectionMatrix();
    }
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
    if (!indoors) frameDistance = portraitDistance(frameDistance, camera.aspect);
    const spin = moveIntent(held).spin;
    if (spin) yaw += spin * dt * 1.5;
    const watching = !!(api.watching && api.watching());
    const stallId = stall.stalls.some((item) => item.id === venue) ? venue : "";
    town.visible = !indoors;
    sky.visible = !indoors;
    bank.room.visible = indoors && venue === "bank";
    stall.room.visible = indoors && !!stallId;
    cinema.room.visible = indoors && venue === "cinema";
    hunt.room.visible = indoors && venue === "hunt";
    bank.lamp.intensity = bank.room.visible ? 7 : 0;
    stall.lamp.intensity = stall.room.visible ? 7 : 0;
    cinema.lamp.intensity = cinema.room.visible ? 2.2 : 0;
    hunt.lamp.intensity = hunt.room.visible ? 6 : 0;
    cinema.glow.intensity = cinema.room.visible ? (watching ? 8 : 3) : 0;
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
    const wash = bank.room.visible ? "#2a241c" : stall.room.visible ? stall.stalls.find((item) => item.id === stallId).wash : cinema.room.visible ? "#07080c" : hunt.room.visible ? "#2a2018" : "#c47a52";
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
    if (indoors && watching) {
      camera.position.set(CINEMA_EYE.x, CINEMA_EYE.y, CINEMA_EYE.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(CINEMA_LOOK.x, CINEMA_LOOK.y, CINEMA_LOOK.z);
      if (camera.fov !== 50) {
        camera.fov = 50;
        camera.updateProjectionMatrix();
      }
      if (cinema.videoMap && cinema.screenMat.map !== cinema.videoMap) {
        cinema.screenMat.map = cinema.videoMap;
        cinema.screenMat.needsUpdate = true;
      }
      fitScreen(cinema.picture, cinema.hintW, cinema.hintH);
    } else if (indoors) {
      if (camera.fov !== 42) {
        camera.fov = 42;
        camera.updateProjectionMatrix();
      }
      if (cinema.screenMat.map !== cinema.poster) {
        cinema.screenMat.map = cinema.poster;
        cinema.screenMat.needsUpdate = true;
      }
      if (cinema.picture) cinema.picture.scale.set(1, 1, 1);
      const sitting = !!(api.seated && api.seated()) && !!satMesh;
      roomLook.set(0, ROOM_LOOK_Y, ROOM_LOOK_Z);
      if (sitting) roomLook.set(satMesh.position.x * 0.4, 0.9, Math.min(1.1, satMesh.position.z * 0.35));
      placeCamera(roomLook, false);
      if (bank.room.visible) for (const person of bank.clerks) pose(person, now, false);
      if (stallId && stall.keepers[stallId].visible) pose(stall.keepers[stallId], now, false);
      if (cinema.room.visible) pose(cinema.keeper, now, false);
      if (hunt.room.visible) pose(hunt.keeper, now, false);
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
    if (inviteMat) inviteMat.opacity = Math.sin(now / 140) > 0 ? 0.95 : 0.18;
    const spoke = venue === "hunt" ? !!(api.huntSpoke && api.huntSpoke()) : !!(api.seated && api.seated());
    const glow = indoors ? invite(venue, spoke) : [];
    showInvites(bank.room, venue === "bank" ? glow : []);
    showInvites(stall.room, stallId ? glow : []);
    showInvites(cinema.room, venue === "cinema" && !watching ? glow : []);
    showInvites(hunt.room, venue === "hunt" ? glow : []);
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

  function roomPicks(here) {
    if (here === "bank") return bank.picks;
    if (here === "cinema") return cinema.picks;
    if (here === "hunt") return hunt.picks;
    return stall.picks[here] || [];
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
    const list = roomPicks(here);
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
    const rawX = ev.clientX - drag.x;
    const rawY = ev.clientY - drag.y;
    if (Math.abs(rawX) + Math.abs(rawY) > 5) drag.moved = true;
    const box = canvas.getBoundingClientRect();
    const dx = rawX * pointerScale(canvas.clientWidth, box.width);
    const dy = rawY * pointerScale(canvas.clientHeight, box.height);
    const flightMs = api.flight ? api.flight() : 0;
    if (api.watching && api.watching()) {
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      return;
    }
    if (flightMs !== 0) {
      if (drag.moved && drag.button === 0 && flightMs > 0) {
        const beat = flightBeat(flightMs);
        if (beat === "release" || beat === "space") {
          flightYaw -= dx * LOOK_YAW;
          flightPitch = Math.min(1.35, Math.max(0.35, flightPitch + dy * LOOK_PITCH));
        }
      }
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      return;
    }
    if (!drag.moved || drag.button !== 0) return;
    yaw -= dx * LOOK_YAW;
    pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + dy * LOOK_PITCH));
    drag.x = ev.clientX;
    drag.y = ev.clientY;
  });
  canvas.addEventListener("pointerup", (ev) => {
    const was = drag;
    drag = null;
    if (api.flight && api.flight() !== 0) {
      canvas.style.cursor = "grab";
      return;
    }
    hoverCursor(ev);
    if (!was || was.moved || was.button !== 0) return;
    ndc(ev);
    raycaster.setFromCamera(pointer, camera);
    if ((api.room && api.room()) || (api.venue && api.venue())) {
      const here = (api.venue && api.venue()) || "";
      const list = roomPicks(here);
      const marked = markedHit(list);
      if (marked && marked.userData.hit === "seat") satMesh = marked;
      if (api.use) api.use(marked ? marked.userData.hit : "", marked ? marked.userData.rail || "" : "");
      return;
    }
    const lotSign = town.getObjectByName("lot-buy-sign");
    if (lotSign && api.car) {
      const signHits = raycaster.intersectObject(lotSign, true);
      if (signHits.length) {
        marker.visible = false;
        markTile = null;
        api.car();
        return;
      }
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
    if (api.flight && api.flight() !== 0) return;
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
    if (api.flight && api.flight() !== 0) return;
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
  return {
    render,
    resize,
    hold,
    feel,
    snap,
    cinemaVideo() {
      return cinema.video;
    },
    cueCinema(src) {
      return cinema.cue ? cinema.cue(src) : Promise.resolve(null);
    },
    pauseCinema() {
      if (cinema.pauseReels) cinema.pauseReels();
    },
    clearCinema() {
      if (cinema.clearReels) cinema.clearReels();
    },
    fitCinema(w, h) {
      cinema.hintW = Number(w) || 0;
      cinema.hintH = Number(h) || 0;
      fitScreen(cinema.picture, cinema.hintW, cinema.hintH);
    },
    spaceVideo() {
      return flight.spaceVideo || null;
    },
    padVideos() {
      return flight.padVideos || [];
    },
    dropPadFilms() {
      erasePadFilms(flight);
    },
    showPadFilms() {
      armPadFilms(flight);
    },
    showKoni(lines) {
      paintKoni(flight, lines);
    },
  };
}

/** Builds the rooms so a test can see the clerks, seats, menu, and card. */
export function assembleInteriors() {
  const maps = makeMaps();
  const bank = buildBankRoom(maps);
  const stall = buildStallRoom(maps);
  const cinema = buildCinemaRoom(maps);
  const hunt = buildHuntRoom(maps);
  const hits = (list, hit) => list.filter((item) => item.userData && item.userData.hit === hit).length;
  const wall = bank.room.children.find((child) => child.material && child.material.side === THREE.DoubleSide);
  const stallWall = stall.room.children.find((child) => child.material && child.material.side === THREE.DoubleSide);
  const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(bank.clerks[0].quaternion);
  bank.room.updateMatrixWorld(true);
  stall.room.updateMatrixWorld(true);
  cinema.room.updateMatrixWorld(true);
  hunt.room.updateMatrixWorld(true);
  const seatPick = cinema.picks.find((item) => item.userData && item.userData.hit === "seat");
  const seatNose = seatPick
    ? new THREE.Vector3(0, 0, -1).applyQuaternion(seatPick.getWorldQuaternion(new THREE.Quaternion()))
    : new THREE.Vector3();
  const allowed = new Set(["clerk", "seat", "menu", "qr", "counter", "keeper", "sign", "screen", "board"]);
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
  for (const root of [bank.room, stall.room, cinema.room, hunt.room]) {
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
    cinemaSeats: hits(cinema.picks, "seat"),
    cinemaScreen: hits(cinema.picks, "screen"),
    cinemaSeatNoseZ: seatNose.z,
    cinemaFaceZ: new THREE.Vector3(0, 0, 1).applyQuaternion(cinema.picture.getWorldQuaternion(new THREE.Quaternion())).z,
    cinemaPictureScaleX: cinema.picture.scale.x,
    cinemaPictureScaleY: cinema.picture.scale.y,
    invites,
    inviteMarked,
    inviteBad,
    seatRingUp: seatAxis.y,
    clerkRingForward: clerkAxis.z,
    menuRingForward: menuAxis.z,
    railLabels: countRailLabels(bank.room),
    huntKeeper: hits(hunt.picks, "keeper"),
    huntBoard: hits(hunt.picks, "board"),
    huntNoseZ: noseOffset(hunt.keeper).z,
  };
}

function noseOffset(group) {
  group.updateWorldMatrix(true, true);
  const nose = group.getObjectByName("nose");
  const tip = new THREE.Vector3();
  const origin = new THREE.Vector3();
  if (nose) nose.getWorldPosition(tip);
  group.getWorldPosition(origin);
  return tip.sub(origin);
}

function countRailLabels(root) {
  const counts = { tKAS: 0, POCencept: 0, KUSDT: 0 };
  root.traverse((node) => {
    const label = node.userData && node.userData.label;
    if (label && Object.prototype.hasOwnProperty.call(counts, label)) counts[label] += 1;
  });
  return counts;
}
