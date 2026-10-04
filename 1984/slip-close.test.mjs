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
  const css = readFileSync(new URL("../1984.css", import.meta.url), "utf8");
  const faucet = readFileSync(new URL("../faucet.html", import.meta.url), "utf8");
  assert.match(html, /id="gate-kasware">Log in with Kasware<\/button>/);
  assert.match(html, /id="gate-kastle">Log in with Kastle<\/button>/);
  assert.match(html, /id="gate-guest">Use a funded test address<\/button>/);
  assert.match(html, /class="kw-gate-row kw-wallets wallet-pc"/);
  assert.match(html, /The same Kasware or Kastle wallet opens its history\./);
  assert.match(html, /Each test address is used once\. Come back later and that history is gone\./);
  assert.match(html, /On a phone, use a funded test address\. Kasware and Kastle open on a computer\./);
  assert.match(client, /class="kw-row wallet-pc"/);
  assert.match(client, /Kasware and Kastle open on a computer/);
  const phoneAt = css.indexOf("@media (max-width: 980px)");
  assert.ok(phoneAt > 0);
  const phone = css.slice(phoneAt);
  assert.match(phone, /p\.only-phone \{ display: block; \}/);
  assert.match(phone, /\.kw-wallets, \.wallet-pc \{ display: none; \}/);
  assert.doesNotMatch(css.slice(0, phoneAt), /\.kw-wallets, \.wallet-pc \{ display: none; \}/);
  const town = html.match(/window\.TOWN_API = "([^"]+)"/);
  const tunnel = client.match(/const TUNNEL = "([^"]+)"/);
  const faucetApi = faucet.match(/window\.FAUCET_API = "([^"]+)"/);
  assert.ok(town && tunnel && faucetApi);
  assert.equal(town[1], faucetApi[1]);
  assert.equal(tunnel[1], faucetApi[1]);
  assert.match(client, /Bypass-Tunnel-Reminder/);
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
  assert.match(html, /1984\.css\?v=52/);
  assert.match(html, /1984\/client\.mjs\?v=92/);
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

test("the lot sells the roadster and launch shows once it is yours", () => {
  const view = readFileSync(new URL("./view3d.mjs", import.meta.url), "utf8");
  const css = readFileSync(new URL("../1984.css", import.meta.url), "utf8");
  assert.match(html, /id="lot-buy" class="kw-lot-buy"/);
  assert.match(html, />Buy a roadster\. See what happens\.<\/button>/);
  assert.match(html, /id="launch" class="kw-launch"/);
  assert.match(client, /lotBuy\.addEventListener\("click", buyRoadster\)/);
  assert.match(sliceFn(client, "buyRoadster"), /spend\(rail, "roadster", "keys"\)/);
  const bought = sliceFn(client, "tookPayment");
  assert.match(bought, /state\.aboard = true/);
  assert.match(bought, /Launch into space is the gold button/);
  assert.match(sliceFn(client, "syncRide"), /showLot = !owns && outside && !gateIsOpen\(\)/);
  assert.match(view, /name = "lot-buy-sign"/);
  assert.match(view, /Buy a roadster\. See what happens\./);
  assert.match(view, /getObjectByName\("lot-buy-sign"\)/);
  assert.match(css, /@keyframes lot-pulse/);
  assert.match(css, /\.kw \.kw-launch \{[\s\S]*animation: lot-pulse/);
});
