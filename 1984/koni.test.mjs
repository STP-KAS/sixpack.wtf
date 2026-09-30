import assert from "node:assert/strict";
import test from "node:test";
import { parseKoniTip } from "./chain.mjs";

test("KONI keeps the public tip transactions", () => {
  const id = "ab".repeat(32);
  const tip = parseKoniTip(
    { virtualDaaScore: "584512330", sink: "cd".repeat(32) },
    {
      transactions: [
        { verboseData: { transactionId: "not-a-txid" }, outputs: [{ amount: "1" }] },
        {
          verboseData: { transactionId: id },
          outputs: [{ amount: "100000000" }, { amount: "50000000" }],
        },
      ],
    },
  );
  assert.equal(tip.blue, "584512330");
  assert.equal(tip.txs.length, 1);
  assert.equal(tip.txs[0].id, id);
  assert.equal(tip.txs[0].sompi, "150000000");
  const empty = parseKoniTip({}, { transactions: [] });
  assert.equal(empty.blue, "");
  assert.deepEqual(empty.txs, []);
});
