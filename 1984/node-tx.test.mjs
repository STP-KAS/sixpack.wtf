import assert from "node:assert/strict";
import test from "node:test";
import { extractPayment } from "./chain.mjs";
import { acceptedToRest } from "./node-tx.mjs";
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
