import assert from "node:assert/strict";
import test from "node:test";
import { REELS, reelShuffle, reelStep } from "./reels.mjs";

test("the reel plays every Random film, then the desk films", () => {
  assert.equal(REELS.length, 44);
  assert.equal(REELS[0].src, "random/r01.mp4");
  assert.equal(REELS.find((item) => item.id === "r08"), undefined);
  assert.equal(REELS.find((item) => item.id === "r38").title, "Don't mention the war");
  assert.equal(REELS.find((item) => item.id === "r37").src, "random/r37.mp4");
  assert.equal(REELS.at(-3).src, "1984/cinema/life.mp4");
  assert.equal(REELS.at(-2).src, "1984/cinema/mine.mp4");
  assert.equal(REELS.at(-1).src, "1984/cinema/harvard.mp4");
  assert.equal(REELS.at(-1).title, "Harvard");
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
