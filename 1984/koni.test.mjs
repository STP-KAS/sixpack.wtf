import assert from "node:assert/strict";
import test from "node:test";
import { parseKoniTip } from "./chain.mjs";

test("KONI keeps the public tip transactions", () => {
  const id = "ab".repeat(32);
  const blockId = "cd".repeat(32);
  const rewardId = "ef".repeat(32);
  const tip = parseKoniTip(
    { virtualDaaScore: "584512330", sink: blockId },
    {
      verboseData: { hash: blockId, isChainBlock: true },
      transactions: [
        { verboseData: { transactionId: "not-a-txid" }, outputs: [{ amount: "1" }] },
        {
          subnetworkId: "0100000000000000000000000000000000000000",
          verboseData: { transactionId: rewardId },
          outputs: [{ amount: "926031192" }],
        },
        {
          subnetworkId: "0000000000000000000000000000000000000000",
          verboseData: { transactionId: id },
          outputs: [{ amount: "100000000" }, { amount: "50000000" }],
        },
      ],
    },
  );
  assert.equal(tip.blue, "584512330");
  assert.equal(tip.accepted.id, blockId);
  assert.equal(tip.accepted.blue, "584512330");
  assert.equal(tip.reward.id, rewardId);
  assert.equal(tip.reward.sompi, "926031192");
  assert.equal(tip.txs.length, 1);
  assert.equal(tip.txs[0].id, id);
  assert.equal(tip.txs[0].sompi, "150000000");
  const fromSink = parseKoniTip({ virtualDaaScore: "5", sink: blockId }, { transactions: [] });
  assert.equal(fromSink.accepted.id, blockId);
  assert.equal(fromSink.reward, null);
  const empty = parseKoniTip({}, { transactions: [] });
  assert.equal(empty.blue, "");
  assert.deepEqual(empty.txs, []);
  assert.equal(empty.accepted, null);
  assert.equal(empty.reward, null);
});
