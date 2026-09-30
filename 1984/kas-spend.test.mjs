import assert from "node:assert/strict";
import test from "node:test";
import { buyAskLine, kasSpendAction, lockSigner, shopBanner, swapAskLine, txidFromWallet } from "./kas-spend.mjs";

test("a guest shop payment stays on the server, which asks before the key signs", () => {
  assert.equal(kasSpendAction({ kind: "guest", txid: "", needsConfirm: true, ready: false }), "guest");
});

test("a shop purchase shows a banner, including an ordinary item", () => {
  assert.equal(shopBanner("keys"), "You drive.");
  assert.equal(shopBanner("lap"), "One lap.");
  assert.equal(shopBanner("coffee"), "Paid.");
  assert.equal(shopBanner("water"), "Paid.");
});

const PAGE = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const OTHER = "kaspatest:qzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

test("a bank lock signs with Kasware when that wallet is the page address", () => {
  assert.equal(lockSigner({ kind: "kasware", pageAddress: PAGE, kit: true }), "kit");
  assert.equal(lockSigner({ kind: "kasware", pageAddress: PAGE, kit: false, kaswareReady: true }), "kasware");
  assert.equal(lockSigner({
    kind: "address",
    pageAddress: PAGE,
    kit: false,
    kaswareReady: true,
    kaswareAddress: PAGE.toUpperCase(),
  }), "kasware");
  assert.equal(lockSigner({ kind: "address", pageAddress: PAGE, kit: true, kaswareReady: false }), "stop");
  assert.equal(lockSigner({ kind: "kasware", pageAddress: PAGE, kit: false, kaswareReady: false }), "absent");
  assert.equal(lockSigner({
    kind: "kasware",
    pageAddress: PAGE,
    kit: true,
    kaswareReady: true,
    kaswareAddress: OTHER,
  }), "mismatch");
  assert.equal(lockSigner({
    kind: "address",
    pageAddress: PAGE,
    kaswareReady: true,
    kaswareAddress: "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  }), "mainnet");
  assert.equal(txidFromWallet('{"txid":"ab"}'), "ab");
  assert.equal(txidFromWallet({ id: "cd" }), "cd");
});

test("a shop buy and a toy swap ask on the page", () => {
  assert.equal(buyAskLine("Coffee", "2.50 POCencept"), "You want to buy Coffee for 2.50 POCencept?");
  assert.equal(swapAskLine("1.00", "POCencept", "KUSDT"), "You want to swap 1.00 POCencept for KUSDT?");
  assert.equal(swapAskLine("1.00", "KUSDT", "tKAS"), "You want to swap 1.00 KUSDT for tKAS?");
  assert.equal(buyAskLine("", ""), "You want to buy this for this?");
});

test("a wallet shop payment asks before it signs, then signs, and a pasted txid is only claimed", () => {
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: true, ready: false }), "ask");
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: false, ready: true }), "sign");
  assert.equal(kasSpendAction({ kind: "kastle", txid: "ab", needsConfirm: false, ready: false }), "credit");
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: false, ready: false }), "stop");
});
