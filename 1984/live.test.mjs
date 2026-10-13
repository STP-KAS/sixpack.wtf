import assert from "node:assert/strict";
import test from "node:test";
import { extractPayment, fetchBalance, fetchPrice, fetchTx } from "./chain.mjs";
import { RESERVE } from "./money.mjs";

const TN10 = "https://api-tn10.kaspa.org";
const COINBASE_SUB = "0100000000000000000000000000000000000000";

test("Testnet-10 balance and the live price both answer", async () => {
  const [price, balance] = await Promise.all([fetchPrice(fetch), fetchBalance(RESERVE, fetch)]);
  assert.ok(price > 0 && price < 100, String(price));
  assert.ok(balance > 0n, balance.toString());
});

test("a miner coinbase cannot be claimed as a shop payment", async () => {
  const dagRes = await fetch(TN10 + "/info/blockdag", { headers: { accept: "application/json" } });
  assert.equal(dagRes.ok, true);
  const dag = await dagRes.json();
  let hash = String(dag.sink || "").toLowerCase();
  let tx = null;
  for (let step = 0; step < 24 && /^[0-9a-f]{64}$/.test(hash); step += 1) {
    const blockRes = await fetch(TN10 + "/blocks/" + hash, { headers: { accept: "application/json" } });
    if (!blockRes.ok) break;
    const block = await blockRes.json();
    const list = Array.isArray(block.transactions) ? block.transactions : [];
    const coin = list.find((row) => String(row.subnetworkId || row.subnetwork_id || "").toLowerCase().replace(/^0x/, "") === COINBASE_SUB);
    const id = String(coin && coin.verboseData && coin.verboseData.transactionId || "").toLowerCase();
    if (/^[0-9a-f]{64}$/.test(id)) {
      try {
        const got = await fetchTx(id, fetch);
        const body = got.transaction || got;
        if (body.is_accepted === true) {
          tx = got;
          break;
        }
      } catch { /* the tip can be ahead of the indexer */ }
    }
    hash = String(block.verboseData && block.verboseData.selectedParentHash || "").toLowerCase();
  }
  assert.ok(tx, "no accepted coinbase");
  assert.throws(() => extractPayment(tx, { from: RESERVE, to: RESERVE, need: 1n }), /coinbase/);
});
