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
