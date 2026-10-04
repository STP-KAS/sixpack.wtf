/** The cinema reel. Random-tab films first, then the desk films that were not already on that tab. */
export const REEL_CAPTION = "this desk agrees";

const RANDOM = [
  ["r01", "Clock"],
  ["r02", "No Kings"],
  ["r03", "No Kings rally"],
  ["r04", "2024"],
  ["r05", "Epstein files"],
  ["r06", "Wedding"],
  ["r07", "Fire"],
  ["r09", "I didn't vote for this"],
  ["r10", "Never bet against Elon"],
  ["r11", "I used to be an old man"],
  ["r12", "Iranian regime"],
  ["r13", "Embarrassment to humanity"],
  ["r14", "Streets"],
  ["r15", "I wanna be a billionaire"],
  ["r16", "White House"],
  ["r17", "Senate"],
  ["r18", "Rally"],
  ["r19", "Night"],
  ["r20", "I don't even think I have a six pack"],
  ["r21", "Better place"],
  ["r22", "I voted for this"],
  ["r23", "Eternity"],
  ["r24", "Gym"],
  ["r25", "I voted for this too"],
  ["r26", "Alley"],
  ["r27", "Synagogue"],
  ["r28", "We are so back"],
  ["r29", "MAGA hats"],
  ["r30", "Crowd"],
  ["r31", "I voted for this again"],
  ["r32", "Car"],
  ["r33", "Trump"],
  ["r34", "I didn't vote for this either"],
  ["r35", "Still didn't vote for this"],
  ["r36", "I voted for this four"],
  ["r37", "Silly Walks"],
  ["r38", "Don't mention the war"],
  ["r39", "Clip"],
  ["r40", "Liftoff"],
  ["r41", "What do you think about AI"],
  ["r42", "Joint address"],
  ["r43", "Orbital data centers"],
];

const EXTRA = [
  ["desk", "The desk", "1984/cinema/desk.mp4"],
  ["clip", "A short reel", "1984/cinema/clip.mp4"],
  ["phone-a", "Phone, one", "1984/cinema/phone-a.mp4"],
  ["phone-b", "Phone, two", "1984/cinema/phone-b.mp4"],
  ["life", "Our way of life", "1984/cinema/life.mp4"],
  ["mine", "Mining the internet", "1984/cinema/mine.mp4"],
  ["harvard", "Harvard", "1984/cinema/harvard.mp4"],
];

/** Coded pixels of the file sixpack already serves. The glass uses this until the film reports its own size. */
const SHAPE = {
  r01: [848, 480],
  r02: [1440, 1080],
  r03: [576, 768],
  r04: [576, 566],
  r05: [1280, 720],
  r06: [1080, 1080],
  r07: [1276, 720],
  r09: [1080, 1080],
  r10: [720, 638],
  r11: [1280, 578],
  r12: [720, 1280],
  r13: [1920, 1080],
  r14: [1276, 720],
  r15: [1280, 720],
  r16: [1280, 720],
  r17: [720, 1280],
  r18: [1280, 720],
  r19: [576, 1024],
  r20: [720, 1280],
  r21: [1280, 720],
  r22: [848, 768],
  r23: [480, 360],
  r24: [786, 1288],
  r25: [720, 720],
  r26: [1280, 852],
  r27: [1080, 1920],
  r28: [1920, 1080],
  r29: [720, 1280],
  r30: [494, 786],
  r31: [720, 962],
  r32: [1280, 1706],
  r33: [1558, 720],
  r34: [720, 1280],
  r35: [720, 1280],
  r36: [720, 720],
  r37: [1920, 1080],
  r38: [1350, 1080],
  r39: [1280, 720],
  r40: [3840, 2160],
  r41: [576, 624],
  r42: [576, 1024],
  r43: [1920, 1080],
  desk: [1920, 1080],
  clip: [1920, 886],
  "phone-a": [1024, 576],
  "phone-b": [1024, 576],
  life: [854, 480],
  mine: [854, 480],
  harvard: [854, 480],
};

function reel(id, title, src) {
  const shape = SHAPE[id];
  return { id, title, src, w: shape[0], h: shape[1] };
}

export const REELS = RANDOM.map(([id, title]) => reel(id, title, "random/" + id + ".mp4"))
  .concat(EXTRA.map(([id, title, src]) => reel(id, title, src)));

/** Previous is −1. Next is +1. The ends wrap. */
export function reelStep(index, length, dir) {
  const n = length > 0 ? length : 1;
  const at = Number.isFinite(index) ? index : 0;
  const by = dir < 0 ? -1 : 1;
  return ((at + by) % n + n) % n;
}

/** A different film. roll is from 0 up to, but not including, 1. */
export function reelShuffle(index, length, roll) {
  const n = length > 0 ? length : 1;
  if (n === 1) return 0;
  const unit = Number.isFinite(roll) ? roll : 0;
  let next = Math.floor(unit * n);
  if (next < 0) next = 0;
  if (next >= n) next = n - 1;
  if (next === index) next = (next + 1) % n;
  return next;
}
