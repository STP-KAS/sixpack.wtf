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

test("the landing gate takes a funded test address", () => {
  const css = readFileSync(new URL("../1984.css", import.meta.url), "utf8");
  const faucet = readFileSync(new URL("../faucet.html", import.meta.url), "utf8");
  const rails = readFileSync(new URL("../rails.html", import.meta.url), "utf8");
  assert.match(html, /id="gate-guest">Use a funded test address<\/button>/);
  assert.match(html, /This money is tKAS\. tKAS is Testnet-10 KAS/);
  assert.match(html, /With tKAS you can go to the bank and swap\./);
  assert.doesNotMatch(html, /id="gate-kasware"/);
  assert.doesNotMatch(html, /id="gate-kastle"/);
  assert.match(html, /The same browser gets the same funded wallet/);
  assert.match(html, /cannot tell it is the same browser/);
  assert.match(html, /1984\/client\.mjs\?v=104/);
  assert.match(client, /Use a funded test address/);
  assert.match(client, /With tKAS you can go to the bank/);
  assert.doesNotMatch(sliceFn(client, "paintChrome"), /id="use-kasware"/);
  assert.match(rails, /the funded list/);
  assert.match(rails, /funded-list\.json/);
  const phoneAt = css.indexOf("@media (max-width: 980px)");
  assert.ok(phoneAt > 0);
  const phone = css.slice(phoneAt);
  assert.match(html, /class="phone-fit"/);
  assert.match(phone, /\.phone-fit \{[\s\S]*width: 1280px;[\s\S]*height: 720px;[\s\S]*scale\(min\([\s\S]*100vw[\s\S]*\/ 1280px,[\s\S]*100dvh[\s\S]*\/ 720px/);
  assert.match(phone, /\.phone-fit \.flight-card \{[\s\S]*max-height: calc\(100% - 8px\)/);
  assert.doesNotMatch(phone, /\.kw \.kw-launch/);
  assert.doesNotMatch(phone, /p\.only-phone \{ display: block; \}/);
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
  assert.match(client, /Same funded wallet\. This browser already had this address/);
  assert.match(client, /cannot tell this browser from a new one/);
  assert.doesNotMatch(html, /Come back later and that history is gone/);
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
  for (const name of ["paintShop", "paintBank", "paintHunt", "paintRules", "paintBench", "paintGuide", "paintMint"]) {
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
  assert.match(html, /1984\.css\?v=56/);
  assert.match(html, /1984\/client\.mjs\?v=104/);
  const chrome = sliceFn(client, "paintChrome");
  assert.match(chrome, /id="bar-bank" class="bar-bank/);
  assert.match(chrome, />Bank<\/button>/);
  assert.match(client, /closest\("#bar-bank"\)/);
  assert.match(client, /openMode\("bank"\)/);
  assert.match(client, /The balances stay in the top right/);
  assert.match(client, /\["mint", "Mint"\]/);
  const mintCard = sliceFn(client, "paintMint");
  assert.match(mintCard, /<strong>What\.<\/strong>/);
  assert.match(mintCard, /KCC-20 Last Call/);
  assert.match(mintCard, /No covenant is deployed/);
  assert.match(mintCard, /<strong>How\.<\/strong>/);
  assert.match(mintCard, /<strong>Why\.<\/strong>/);
  assert.match(mintCard, /value="new"/);
  assert.match(mintCard, /value="more"/);
  assert.match(mintCard, /value="send"/);
  assert.match(mintCard, /A cap of 0 means no cap/);
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
  assert.match(sliceFn(client, "buyRoadster"), /showRoadsterChoice\(\)/);
  assert.match(sliceFn(client, "showRoadsterChoice"), /roadsterBalanceLine\(\)/);
  assert.match(sliceFn(client, "showRoadsterChoice"), /Buy it with POCencept, KUSDT, or tKAS/);
  assert.match(sliceFn(client, "showRoadsterChoice"), /To convert tKAS, POCencept, or KUSDT, go to the bank/);
  assert.match(sliceFn(client, "buyRoadsterOn"), /spend\(rail, "roadster", "keys"\)/);
  assert.match(sliceFn(client, "buyRoadsterOn"), /walkInto\("bank"\)/);
  assert.match(html, /id="need-swap-poc"/);
  assert.match(html, /id="need-swap-kusdt"/);
  assert.match(html, /id="need-swap-kas"/);
  assert.match(html, />Buy with POCencept</);
  assert.match(html, />Buy with KUSDT</);
  assert.match(html, />Buy with tKAS</);
  assert.match(client, /\["need-swap-poc", "poc"\], \["need-swap-kusdt", "kusdt"\], \["need-swap-kas", "kas"\]/);
  assert.match(sliceFn(client, "maybeSwapNotice"), /Pay with a swap/);
  const bought = sliceFn(client, "tookPayment");
  assert.match(bought, /state\.aboard = true/);
  assert.match(bought, /Launch into space is the gold button/);
  assert.match(sliceFn(client, "syncRide"), /showLot = !owns && outside && !gateIsOpen\(\)/);
  assert.match(view, /name = "lot-buy-sign"/);
  assert.match(view, /Buy a roadster\. See what happens\./);
  assert.match(view, /getObjectByName\("lot-buy-sign"\)/);
  assert.match(css, /@keyframes lot-pulse/);
  assert.match(css, /\.kw \.kw-launch \{[\s\S]*animation: lot-pulse/);
  const arm = sliceFn(client, "armMedia");
  assert.match(arm, /el\.muted = false/);
  assert.doesNotMatch(arm, /muted = true/);
  assert.match(arm, /webkit-playsinline/);
  assert.match(arm, /opacity:1/);
  assert.match(arm, /translateX\(-120vw\)/);
  const playFilm = sliceFn(client, "playFlightFilm");
  assert.match(playFilm, /opacity:1/);
  assert.doesNotMatch(playFilm, /opacity:0/);
  assert.match(playFilm, /translateX\(-120vw\)/);
  const left = sliceFn(client, "startLeftFilm");
  assert.match(left, /cuePad\(slots\[0\], PAD_LEFT\)/);
  assert.match(left, /cuePad\(slots\[1\], PAD_RIGHT\)/);
  assert.match(left, /armMedia\(slots\[1\]\)/);
  assert.match(left, /slots\[0\]\.muted = false/);
  assert.match(view, /webkit-playsinline/);
  assert.match(view, /film\.src = side < 0 \? PAD_LEFT : PAD_RIGHT/);
  assert.match(css, /\.flight-film \{[\s\S]*opacity: 1;/);
});
