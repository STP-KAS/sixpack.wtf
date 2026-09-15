import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = dirname(fileURLToPath(new URL("../README.md", import.meta.url)));

function htmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) htmlFiles(p, acc);
    else if (name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

describe("sixpack wallet safety", () => {
  const pages = htmlFiles(root);

  it("never has a seed, private-key, or password field", () => {
    const bad = [];
    for (const p of pages) {
      const t = readFileSync(p, "utf8");
      if (/type=["']password["']/i.test(t)) bad.push(p + " password input");
      if (/name=["']seed["']/i.test(t) || /id=["']seed["']/i.test(t)) bad.push(p + " seed field");
      if (/placeholder=["'][^"']*seed/i.test(t)) bad.push(p + " seed placeholder");
      if (/private[_ ]?key/i.test(t) && /<input/i.test(t) && /private[_ ]?key/i.test(t.slice(t.search(/<input/i), t.search(/<input/i) + 200))) {
        bad.push(p + " private key input");
      }
    }
    assert.deepEqual(bad, []);
  });

  it("does not call requestAccounts on its own except behind a click path in the kit", () => {
    const ui = readFileSync(join(root, "wallets", "ui.js"), "utf8");
    assert.match(ui, /data-wallet-id/);
    assert.doesNotMatch(ui, /requestAccounts\(\)/);
    const nav = readFileSync(join(root, "nav.js"), "utf8");
    assert.doesNotMatch(nav, /requestAccounts/);
  });

  it("POS default receive is groks-wallet testnet", () => {
    const pos = readFileSync(join(root, "original-pos", "pos.js"), "utf8");
    assert.match(pos, /kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx/);
    assert.match(pos, /SixpackWallet/);
  });

  it("node page points at groks TN10 wallet and bot start files", () => {
    const t = readFileSync(join(root, "node.html"), "utf8");
    assert.match(t, /kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx/);
    assert.match(t, /tn10\.kaspa\.stream\/addresses\/kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx/);
    assert.match(t, /Xai\.Kaspa\.node/);
    assert.match(t, /START-TN10/);
    assert.match(t, /Grok bot is mining here/);
    assert.match(t, /tn10\.kaspa\.stream\/addresses\/kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx/);
    assert.match(t, /How Grok mines that wallet/);
  });

  it("explained page has four doors and no seed field", () => {
    const t = readFileSync(join(root, "explained.html"), "utf8");
    assert.match(t, /data-door="1"/);
    assert.match(t, /data-door="2"/);
    assert.match(t, /data-door="3"/);
    assert.match(t, /data-door="4"/);
    assert.match(t, /data-door="5"/);
    assert.match(t, /Never paste a seed/);
    assert.doesNotMatch(t, /type=["']password["']/);
  });

  it("pins page separates KIP, KCC, kascov, and KaspaZ", () => {
    const t = readFileSync(join(root, "pins.html"), "utf8");
    assert.match(t, /kaspanet\/kccs/);
    assert.match(t, /kascov\.io/);
    assert.match(t, /KaspaZ is not Kaspa/);
    assert.match(t, /Toccata/);
  });

  it("safety page forbids seeds and names inject wallets", () => {
    const t = readFileSync(join(root, "safety.html"), "utf8");
    assert.match(t, /Never paste a seed/);
    assert.match(t, /Kasware/);
    assert.match(t, /Kastle/);
    assert.match(t, /kaspa:/);
  });
});
