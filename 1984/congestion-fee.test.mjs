import assert from "node:assert/strict";
import test from "node:test";
import {
  ABSOLUTE_FEE_SOMPI,
  COVENANT_SIGOPS,
  agreeNodes,
  feeWithinCap,
  mempoolFull,
  replacementRefused,
  scriptUnitsForSigops,
  squarePlan,
} from "./congestion-fee.mjs";

test("three signature operations cover the measured SquarePeg script", () => {
  assert.equal(scriptUnitsForSigops(1), 109_999);
  assert.equal(scriptUnitsForSigops(2), 209_999);
  assert.ok(scriptUnitsForSigops(COVENANT_SIGOPS) >= 206_707);
  assert.equal(COVENANT_SIGOPS, 3);
});

test("two calm nodes keep the 87x ordinary rate", () => {
  const agreed = agreeNodes(
    [
      { normal: 100, priority: 100, mempool: 10 },
      { normal: 100, priority: 120, mempool: 12 },
    ],
    100
  );
  assert.equal(agreed.outlier, false);
  assert.equal(agreed.normal, 100);
  const plan = squarePlan(agreed, 0);
  assert.equal(plan.rate, 8700);
  assert.equal(plan.congested, false);
});

test("a node quoting far above the other is dropped", () => {
  const agreed = agreeNodes(
    [
      { normal: 100, priority: 100, mempool: 4 },
      { normal: 1644, priority: 1644, mempool: 21_800 },
    ],
    100
  );
  assert.equal(agreed.outlier, true);
  assert.equal(agreed.normal, 100);
  assert.equal(squarePlan(agreed, 0).rate, 8700);
});

test("one node cannot lift the rate more than three times the last agreed ordinary rate", () => {
  const held = agreeNodes([{ normal: 1644, priority: 1644, mempool: 21_800 }], 100);
  assert.equal(held.held, true);
  assert.equal(held.normal, 100);
  assert.equal(squarePlan(held, 2).rate, 8700);
  const near = agreeNodes([{ normal: 200, priority: 200, mempool: 30 }], 100);
  assert.equal(near.held, false);
  assert.equal(squarePlan(near, 0).rate, 17_400);
});

test("a waiting spend steps up four times and then stops", () => {
  const agreed = { normal: 100, priority: 100, mempool: 0, held: false };
  assert.equal(squarePlan(agreed, 1).rate, 13_050);
  const top = squarePlan(agreed, 9);
  assert.equal(top.steps, 4);
  assert.equal(top.rate, Math.ceil(8700 * 1.5 ** 4));
});

test("a full mempool is congestion, and the fee stops at 20 tKAS", () => {
  const hot = agreeNodes(
    [
      { normal: 100, priority: 400, mempool: 50_000 },
      { normal: 100, priority: 400, mempool: 50_000 },
    ],
    100
  );
  assert.equal(squarePlan(hot, 0).congested, true);
  assert.equal(squarePlan(hot, 0).rate, 8700);
  assert.equal(feeWithinCap(ABSOLUTE_FEE_SOMPI), true);
  assert.equal(feeWithinCap(ABSOLUTE_FEE_SOMPI + 1n), false);
  assert.equal(mempoolFull(new Error("RejectMempoolIsFull")), true);
  assert.equal(
    mempoolFull(new Error("transaction could not be added to the mempool because it's full with transactions with higher priority")),
    true
  );
  assert.equal(mempoolFull(new Error("script units exceeded")), false);
  assert.equal(replacementRefused(new Error("already spent in the mempool")), true);
  assert.equal(replacementRefused(new Error("transaction was already accepted by the consensus")), true);
  assert.equal(replacementRefused(new Error("script units exceeded")), false);
});
