import assert from "node:assert/strict";
import test from "node:test";
import { REELS } from "./reels.mjs";

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
});
