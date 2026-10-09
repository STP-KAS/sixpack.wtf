import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buyAskLine, kasSpendAction, lockSigner, payKind, settleLine, shopBanner, swapAskLine, tn10TxUrl, txidFromWallet } from "./kas-spend.mjs";

test("a guest shop payment stays on the server, which asks before the key signs", () => {
  assert.equal(kasSpendAction({ kind: "guest", txid: "", needsConfirm: true, ready: false }), "guest");
});

test("a shop buy names this square's ledger, and a tKAS swap names the transaction", () => {
  const shop = payKind("shop");
  const lock = payKind("lock");
  assert.match(shop, /own ledger/);
  assert.match(shop, /no covenant tx/i);
  assert.match(shop, /not Argent or SilverScript/);
  assert.match(shop, /not a vProg/);
  assert.match(lock, /Testnet 10 transaction/);
  assert.match(lock, /txid is the payment/);
  assert.match(lock, /not an Argent or SilverScript covenant/);
  assert.match(lock, /not a vProg/);
  const bank = payKind("bank");
  const covenant = payKind("covenant");
  assert.match(bank, /SquarePeg covenant/);
  assert.match(bank, /cannot sign that covenant/);
  assert.match(bank, /not dollars/);
  assert.match(covenant, /SquarePeg covenant on Testnet 10/);
  assert.match(covenant, /script holds the tKAS/);
  assert.match(covenant, /not dollars/);
  assert.match(shop, /SquarePeg lock spent here/);
  assert.equal(settleLine(true), "Settled. Confirmations are ongoing.");
  assert.equal(settleLine(false), "Settled on this ledger.");
  const client = readFileSync(new URL("./client.mjs", import.meta.url), "utf8");
  assert.match(client, /info\.kind \? settleLine\(!!chain\)/);
  assert.match(client, /Waiting for Testnet 10 to settle/);
  assert.match(client, /confirmations are still ongoing/);
  assert.match(client, /Miner fee is extra KAS/);
  assert.doesNotMatch(client, /Miner fee is extra tKAS/);
  assert.match(client, /settleLine\(false\)/);
});

test("a shop purchase shows a banner, including an ordinary item", () => {
  assert.equal(shopBanner("keys"), "Launch into space.");
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

test("a shop buy and a swap ask on the page", () => {
  assert.equal(buyAskLine("Coffee", "2.50 POCencept"), "You want to buy Coffee for 2.50 POCencept?");
  assert.equal(swapAskLine("1.00", "POCencept", "KUSDT"), "You want to swap 1.00 POCencept for KUSDT?");
  assert.equal(swapAskLine("1.00", "KUSDT", "tKAS"), "You want to swap 1.00 KUSDT for tKAS?");
  assert.equal(buyAskLine("", ""), "You want to buy this for this?");
});

test("open tx points at that Testnet 10 transaction", () => {
  const id = "a7a042501c32cfede58d8672b12a86deaaa2f538606d82002d2e286e689028e7";
  const url = "https://tn10.kaspa.stream/transactions/" + id;
  assert.equal(tn10TxUrl(id), url);
  assert.equal(tn10TxUrl(id.toUpperCase()), url);
  assert.equal(tn10TxUrl({ txid: id }), url);
  assert.equal(tn10TxUrl("Tx " + id), url);
  assert.equal(tn10TxUrl(""), "");
  assert.equal(tn10TxUrl("[object Object]"), "");
  assert.equal(tn10TxUrl(url).includes("/txs/"), false);
});

test("a wallet shop payment asks before it signs, then signs, and a pasted txid is only claimed", () => {
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: true, ready: false }), "ask");
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: false, ready: true }), "sign");
  assert.equal(kasSpendAction({ kind: "kastle", txid: "ab", needsConfirm: false, ready: false }), "credit");
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: false, ready: false }), "stop");
});
