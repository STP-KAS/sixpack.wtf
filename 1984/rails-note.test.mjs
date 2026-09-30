import assert from "node:assert/strict";
import test from "node:test";
import { RAIL_NAMES, RAILS_NOTE, payRail, railBarHtml } from "./rails-note.mjs";

test("every buy can pick tKAS, POCencept, or KUSDT", () => {
  assert.equal(payRail("kas"), "kas");
  assert.equal(payRail("kusdt"), "kusdt");
  assert.equal(payRail("poc"), "poc");
  assert.equal(payRail("nope"), "poc");
  assert.equal(payRail(undefined), "poc");
  const bar = railBarHtml("kas");
  assert.match(bar, /data-rail-pick="poc"/);
  assert.match(bar, /data-rail-pick="kusdt"/);
  assert.match(bar, /data-rail-pick="kas" class="on"/);
  assert.match(bar, /What are the rails\?/);
  assert.equal(RAIL_NAMES.kas, "tKAS");
  assert.equal(RAIL_NAMES.poc, "POCencept");
  assert.equal(RAIL_NAMES.kusdt, "KUSDT");
});

test("the rails note is short and points at the public note", () => {
  assert.equal(RAILS_NOTE.title, "Three ways to pay");
  assert.equal(RAILS_NOTE.lines.length, 3);
  assert.match(RAILS_NOTE.lines[0], /tKAS/);
  assert.match(RAILS_NOTE.lines[1], /POCencept/);
  assert.match(RAILS_NOTE.lines[1], /KUSDT/);
  assert.match(RAILS_NOTE.lines[2], /ticket/);
  assert.match(RAILS_NOTE.lines[2], /snacks/);
  assert.match(RAILS_NOTE.lines[2], /hop/);
  const hrefs = RAILS_NOTE.links.map((pair) => pair[1]);
  assert.ok(hrefs.includes("https://github.com/STP-KAS/1984-why-what-how"));
  assert.ok(hrefs.includes("https://github.com/STP-KAS/1984-rails"));
  assert.ok(hrefs.includes("https://sixpack.wtf/rails.html"));
});
