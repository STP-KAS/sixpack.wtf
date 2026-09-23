import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyRelease, ensureMasterFeed, loadNowSection, masterHead, releasePin, renderNow } from "./sync-master.mjs";
import { systemPrompt, grokHealth } from "./chat.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the live row is the rusty-kaspa release on the master board", () => {
  const pin = releasePin(loadNowSection().section);
  assert.equal(pin.version, "2.1.0");
  assert.match(pin.commit, /^01b532e8/);
});

test("the rendered board carries the demo tip and outranks the catalog", () => {
  const text = renderNow({ head: masterHead(), pack: loadNowSection() });
  assert.match(text, /93b75901/);
  assert.match(text, /01b532e8/);
  assert.match(text, /This block wins/);
  assert.match(text, /DAGKnight/);
  assert.match(text, /Final/);
});

test("public pin lines take the release from the master board", () => {
  const pin = { version: "2.1.0", commit: "01b532e8" };
  const spec = {
    re: /Node: rusty-kaspa <strong>v\d+\.\d+\.\d+<\/strong>/,
    to: (row) => "Node: rusty-kaspa <strong>v" + row.version + "</strong>",
  };
  const html = "<li>Node: rusty-kaspa <strong>v2.0.1</strong> · door</li>";
  assert.match(applyRelease(html, pin, spec), /v2\.1\.0/);
});

test("the desk prompt ends on the master board", () => {
  const prompt = systemPrompt();
  const at = prompt.lastIndexOf("# Now — kaspa-master-file");
  assert.ok(at > prompt.indexOf("# Pin catalog"));
  const board = prompt.slice(at);
  assert.match(board, /01b532e8/);
  assert.match(board, /93b75901/);
  assert.match(board, /v2\.1\.0/);
  assert.doesNotMatch(board.slice(0, 400), /Latest release pin \*\*v2\.0\.1\*\*/);
  const health = grokHealth();
  assert.equal(health.master, masterHead().sha);
  assert.equal(health.name, "Grok.SPCXAI.KAS");
});

test("sixpack pin pages name the same release", () => {
  ensureMasterFeed();
  const pin = releasePin(loadNowSection().section);
  for (const file of ["pins.html", "explained.html", "node.html"]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, new RegExp("v" + pin.version.replace(/\./g, "\\.")));
    assert.doesNotMatch(html, /v2\.0\.1/);
  }
});
