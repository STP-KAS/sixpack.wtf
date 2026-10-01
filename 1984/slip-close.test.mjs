import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../1984.html", import.meta.url), "utf8");
const client = readFileSync(new URL("./client.mjs", import.meta.url), "utf8");

function sliceFn(source, name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("the buy ask closes without starting a purchase", () => {
  assert.match(html, /id="ask-close">Close<\/button>/);
  assert.match(html, /id="ask-ok">OK<\/button>/);
  assert.match(html, /id="ask-no">Not now<\/button>/);
  assert.match(html, /id="pay-slip-close">Close<\/button>/);
  assert.match(html, /id="pay-slip-again">New purchase<\/button>/);
  const ask = sliceFn(client, "askOk");
  assert.match(ask, /close\.addEventListener\("click", onNo\)/);
  assert.match(ask, /finish\(false\)/);
  assert.doesNotMatch(ask, /newPurchase|openMode/);
});

test("the landing gate keeps wallet history and a one-time funded address", () => {
  assert.match(html, /id="gate-kasware">Log in with Kasware<\/button>/);
  assert.match(html, /id="gate-kastle">Log in with Kastle<\/button>/);
  assert.match(html, /id="gate-guest">Use a funded test address<\/button>/);
  assert.match(html, /The same Kasware or Kastle wallet opens its history\./);
  assert.match(html, /Each test address is used once\. Come back later and that history is gone\./);
  assert.doesNotMatch(html, /Same kaspatest address, same history/);
  assert.doesNotMatch(html, /id="gate-addr"/);
  assert.doesNotMatch(html, /Open this address/);
  assert.match(client, /Each test address is used once\. Come back later and that history is gone\./);
  const guest = sliceFn(client, "startGuest");
  assert.match(guest, /hideGate\(\)/);
  assert.match(client, /function openFundedTest\(/);
  assert.match(client, /getElementById\("gate-guest"\)/);
});

test("exit to the square is on the shop card", () => {
  const css = readFileSync(new URL("../1984.css", import.meta.url), "utf8");
  assert.match(html, /id="show-exit">Exit to the square<\/button>/);
  assert.match(client, /id="place-exit">Exit to the square<\/button>/);
  assert.match(client, /closest\("#show-exit"\)\) openMode\("world"\)/);
  assert.match(client, /Exit to the square is on the shop, the bank, Hunt Hall, and the cinema/);
  const wire = sliceFn(client, "wirePlaceExit");
  assert.match(wire, /openMode\("world"\)/);
  for (const name of ["paintShop", "paintBank", "paintHunt", "paintRules", "paintBench", "paintGuide"]) {
    assert.match(sliceFn(client, name), /placeActs\(/);
    assert.match(sliceFn(client, name), /wirePlaceExit\(\)/);
  }
  const bank = sliceFn(client, "paintBank");
  assert.match(bank, /id="bank-close">Close<\/button>/);
  assert.match(bank, /id="clerk-back"/);
  const busy = sliceFn(client, "setSwapBusy");
  assert.match(busy, /button\.id === "place-exit"/);
  assert.match(css, /#place-exit/);
  assert.match(css, /\.stall-acts/);
});

test("the balances stay in the top right with Bank", () => {
  const css = readFileSync(new URL("../1984.css", import.meta.url), "utf8");
  assert.match(html, /<header class="kw-bar" id="bar"><\/header>/);
  assert.match(html, /1984\.css\?v=50/);
  assert.match(html, /1984\/client\.mjs\?v=88/);
  const chrome = sliceFn(client, "paintChrome");
  assert.match(chrome, /id="bar-bank" class="bar-bank/);
  assert.match(chrome, />Bank<\/button>/);
  assert.match(client, /closest\("#bar-bank"\)/);
  assert.match(client, /openMode\("bank"\)/);
  assert.match(client, /The balances stay in the top right/);
  assert.match(css, /\.kw-bar \{[\s\S]*?right: 8px;/);
  assert.match(css, /\.kw\.flight \.kw-bar,\s*\.kw\.watching \.kw-bar,\s*\.kw\.room \.kw-bar \{ display: block; \}/);
  assert.doesNotMatch(css, /\.kw\.flight \.kw-bar \{ display: none/);
  assert.doesNotMatch(css, /\.kw\.watching \.kw-bar \{ display: none/);
});

test("closing the pay slip leaves new purchase on that card", () => {
  const close = sliceFn(client, "closePaySlip");
  assert.match(close, /box\.hidden = true/);
  assert.doesNotMatch(close, /newPurchase|openMode|payPlace/);
  const again = sliceFn(client, "newPurchase");
  assert.match(again, /openMode\(payPlace\)/);
  assert.match(client, /pay-slip-close"\)/);
  assert.match(client, /addEventListener\("click", closePaySlip\)/);
  assert.match(client, /addEventListener\("click", newPurchase\)/);
  assert.match(client, /Close puts that ask away/);
  assert.match(client, /start a new purchase on the card that stays open/);
});
