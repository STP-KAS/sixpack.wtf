import assert from "node:assert/strict";
import test from "node:test";
import { RAIL_NAMES, RAILS_NOTE, SWAP_PAY, payRail, railBarHtml, shortRail, swapNeed } from "./rails-note.mjs";

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
  assert.equal(RAIL_NAMES.poc, "POCencept stable");
  assert.equal(RAIL_NAMES.kusdt, "KUSDT stable");
});

test("the rails note is short and points at the public note", () => {
  assert.equal(RAILS_NOTE.title, "Three ways to pay");
  assert.equal(RAILS_NOTE.lines.length, 5);
  assert.match(RAILS_NOTE.lines[0], /tKAS/);
  assert.match(RAILS_NOTE.lines[1], /POCencept/);
  assert.match(RAILS_NOTE.lines[1], /KUSDT/);
  assert.match(RAILS_NOTE.lines[2], /ticket/);
  assert.match(RAILS_NOTE.lines[2], /snacks/);
  assert.match(RAILS_NOTE.lines[2], /hop/);
  assert.match(RAILS_NOTE.lines[2], /Hunt Hall/);
  assert.match(RAILS_NOTE.lines[3], /car/);
  assert.match(RAILS_NOTE.lines[3], /AI service/);
  assert.match(RAILS_NOTE.lines[3], /game purchase/);
  assert.match(RAILS_NOTE.lines[3], /rented service/);
  const hrefs = RAILS_NOTE.links.map((pair) => pair[1]);
  assert.ok(hrefs.includes("https://github.com/STP-KAS/1984-why-what-how"));
  assert.ok(hrefs.includes("https://github.com/STP-KAS/1984-rails"));
  assert.ok(hrefs.includes("https://sixpack.wtf/rails.html"));
  assert.match(RAILS_NOTE.lines[4], /swap tKAS for POCencept and KUSDT at the bank/);
  assert.match(RAILS_NOTE.lines[4], /No tKAS, go to the bank/);
  assert.match(RAILS_NOTE.lines[4], /go to the bank and swap/);
});

test("an empty POCencept or KUSDT balance says to swap tKAS at the bank", () => {
  const both = swapNeed({ kas: 100n, poc: 0n, kusdt: 0n });
  assert.match(both, new RegExp(SWAP_PAY));
  assert.match(both, /No POCencept\. Go to the bank and swap\./);
  assert.match(both, /No KUSDT\. Go to the bank and swap\./);
  assert.doesNotMatch(both, /No tKAS/);
  const broke = swapNeed({ kas: 0n, poc: 0n, kusdt: 5n });
  assert.match(broke, /No tKAS\. Go to the bank\./);
  assert.match(broke, /No POCencept\. Go to the bank and swap\./);
  assert.doesNotMatch(broke, /No KUSDT/);
  assert.equal(swapNeed({ kas: 0n, poc: 1n, kusdt: 1n }), "");
  assert.equal(swapNeed({ kas: null, poc: 0n, kusdt: 1n }).includes("No tKAS"), false);
  assert.equal(shortRail("kas", 0n), "No tKAS. Go to the bank.");
  assert.equal(shortRail("kas", 10n), "Not enough tKAS. Go to the bank.");
  assert.equal(shortRail("poc", 0n), "No POCencept. Go to the bank and swap.");
  assert.equal(shortRail("kusdt", 4n), "Not enough KUSDT. Go to the bank and swap.");
});
