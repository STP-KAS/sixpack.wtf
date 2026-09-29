import assert from "node:assert/strict";
import test from "node:test";
import { extractPayment, fetchBalance, fetchPrice, fetchTx } from "./chain.mjs";
import { RESERVE } from "./money.mjs";

const COINBASE = "2a915694924fadc2a93f682dd0c8edc3f792e18f2e9b7d440a2d2ae6f972ab4c";

test("Testnet-10 balance and the live price both answer", async () => {
  const [price, balance] = await Promise.all([fetchPrice(fetch), fetchBalance(RESERVE, fetch)]);
  assert.ok(price > 0 && price < 100, String(price));
  assert.ok(balance > 0n, balance.toString());
});

test("a miner coinbase cannot be claimed as a shop payment", async () => {
  const tx = await fetchTx(COINBASE, fetch);
  assert.equal(tx.is_accepted, true);
  assert.throws(() => extractPayment(tx, { from: RESERVE, to: RESERVE, need: 1n }));
});
