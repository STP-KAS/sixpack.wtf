import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { extractPayment } from "./chain.mjs";
import { acceptanceLook, acceptedToRest, applyAcceptedDelta, mempoolQuery, tipReadPlan } from "./node-tx.mjs";
import { RESERVE } from "./money.mjs";

const USER = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

test("a node payment becomes the transaction shape the bank already checks", () => {
  const id = "ab".repeat(32);
  const rest = acceptedToRest({
    subnetworkId: "0000000000000000000000000000000000000000",
    inputs: [
      {
        verboseData: {
          utxoEntry: { verboseData: { scriptPublicKeyAddress: USER, scriptPublicKeyType: "PubKey" } },
        },
      },
    ],
    outputs: [
      { value: 100_000_000n, verboseData: { scriptPublicKeyAddress: RESERVE } },
      { value: 50n, verboseData: { scriptPublicKeyAddress: USER } },
    ],
    verboseData: { transactionId: id.toUpperCase() },
  });
  const pay = extractPayment(rest, { from: USER, to: RESERVE, need: 100_000_000n });
  assert.equal(pay.txid, id);
  assert.equal(pay.paid, 100_000_000n);
});

test("an accepted payment settles, and a mempool payment still waits", () => {
  assert.equal(acceptanceLook({ cachedHit: true, inMempool: false }), "settled");
  assert.equal(acceptanceLook({ cachedHit: true, inMempool: true }), "settled");
  assert.equal(acceptanceLook({ cachedHit: false, inMempool: true }), "wait");
  assert.equal(acceptanceLook({ cachedHit: false, inMempool: false }), "scan");
  const query = mempoolQuery("ab".repeat(32));
  assert.equal(query.filterTransactionPool, false);
  assert.equal(query.includeOrphanPool, false);
});

test("a tip delta keeps a new payment and drops it when that block leaves", () => {
  const id = "ab".repeat(32);
  const state = { byId: new Map(), blockTxs: new Map(), cursor: "11".repeat(32) };
  const next = applyAcceptedDelta(state, {
    removedChainBlockHashes: [],
    addedChainBlockHashes: ["22".repeat(32)],
    chainBlockAcceptedTransactions: [
      {
        chainBlockHeader: { hash: "22".repeat(32) },
        acceptedTransactions: [
          {
            subnetworkId: "0000000000000000000000000000000000000000",
            inputs: [{ verboseData: { utxoEntry: { verboseData: { scriptPublicKeyAddress: USER } } } }],
            outputs: [{ value: 5n, verboseData: { scriptPublicKeyAddress: RESERVE } }],
            verboseData: { transactionId: id },
          },
        ],
      },
    ],
  });
  assert.equal(next, "22".repeat(32));
  assert.equal(state.byId.get(id).transaction_id, id);
  state.cursor = next;
  const gone = applyAcceptedDelta(state, {
    removedChainBlockHashes: ["22".repeat(32)],
    addedChainBlockHashes: [],
    chainBlockAcceptedTransactions: [],
  });
  assert.equal(gone, "22".repeat(32));
  assert.equal(state.byId.has(id), false);
});

test("an old tip cursor starts over instead of reading the whole gap", () => {
  assert.equal(tipReadPlan(true, 10, 80, 1000), "cached");
  assert.equal(tipReadPlan(true, 500, 80, 1000), "delta");
  assert.equal(tipReadPlan(true, 1000, 80, 1000), "prime");
  assert.equal(tipReadPlan(false, 0, 80, 1000), "prime");
  const source = fs.readFileSync(new URL("./node-tx.mjs", import.meta.url), "utf8");
  assert.match(source, /dataVerbosityLevel: "Low"/);
  assert.doesNotMatch(source, /extendSpine|deepWindow|const WINDOW/);
});

test("a coinbase subnetwork stays visible so the bank can refuse it", () => {
  const rest = acceptedToRest({
    subnetworkId: "0100000000000000000000000000000000000000",
    inputs: [],
    outputs: [{ value: 1n, verboseData: { scriptPublicKeyAddress: RESERVE } }],
    verboseData: { transactionId: "cd".repeat(32) },
  });
  assert.equal(rest.subnetwork_id, "0100000000000000000000000000000000000000");
  assert.throws(
    () => extractPayment(rest, { from: USER, to: RESERVE, need: 1n }),
    /coinbase|sender/
  );
});
