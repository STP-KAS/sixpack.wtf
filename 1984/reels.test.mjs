import assert from "node:assert/strict";
import test from "node:test";
import { REELS, reelShuffle, reelStep } from "./reels.mjs";

test("the reel plays every Random film, then the desk films", () => {
  assert.equal(REELS.length, 48);
  assert.equal(REELS.find((item) => item.id === "r40").src, "random/r40.mp4");
  assert.equal(REELS.find((item) => item.id === "r40").title, "Liftoff");
  assert.equal(REELS.find((item) => item.id === "r40").w, 3840);
  assert.equal(REELS.find((item) => item.id === "r40").h, 2160);
  assert.equal(REELS.find((item) => item.id === "r41").src, "random/r41.mp4");
  assert.equal(REELS.find((item) => item.id === "r41").w, 576);
  assert.equal(REELS.find((item) => item.id === "r41").h, 624);
  assert.equal(REELS.find((item) => item.id === "r42").src, "random/r42.mp4");
  assert.equal(REELS.find((item) => item.id === "r42").title, "Joint address");
  assert.equal(REELS.find((item) => item.id === "r42").w, 576);
  assert.equal(REELS.find((item) => item.id === "r42").h, 1024);
  assert.equal(REELS.find((item) => item.id === "r39").src, "random/r39.mp4");
  assert.equal(REELS.find((item) => item.id === "r39").w, 1280);
  assert.equal(REELS.find((item) => item.id === "r39").h, 720);
  assert.equal(REELS[0].src, "random/r01.mp4");
  assert.equal(REELS.find((item) => item.id === "r08"), undefined);
  assert.equal(REELS.find((item) => item.id === "r38").title, "Don't mention the war");
  assert.equal(REELS.find((item) => item.id === "r37").src, "random/r37.mp4");
  assert.equal(REELS.at(-3).src, "1984/cinema/life.mp4");
  assert.equal(REELS.at(-2).src, "1984/cinema/mine.mp4");
  assert.equal(REELS.at(-1).src, "1984/cinema/harvard.mp4");
  assert.equal(REELS.at(-1).title, "Harvard");
  const night = REELS.find((item) => item.id === "r19");
  assert.equal(night.title, "Night");
  assert.equal(night.w, 576);
  assert.equal(night.h, 1024);
  assert.equal(REELS.find((item) => item.id === "r12").h, 1280);
  assert.equal(REELS.find((item) => item.id === "harvard").w, 854);
  for (const item of REELS) {
    assert.ok(item.w > 0 && item.h > 0, item.id);
  }
  const ids = REELS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(reelStep(0, REELS.length, -1), REELS.length - 1);
  assert.equal(reelStep(REELS.length - 1, REELS.length, 1), 0);
  assert.equal(reelStep(3, REELS.length, 1), 4);
  assert.equal(reelShuffle(0, 1, 0.9), 0);
  assert.notEqual(reelShuffle(2, REELS.length, 2 / REELS.length), 2);
  assert.equal(reelShuffle(0, REELS.length, 0), 1);
  assert.equal(reelShuffle(2, REELS.length, 0), 0);
});
