import assert from "node:assert/strict";
import test from "node:test";
import {
  DELEGATOR_TAG,
  KUSDT_EXTENSION,
  KUSDT_FROZEN_EXTENSION,
  POC_EXTENSION,
  TRANSFER_TAG,
  borrowedReceive,
  effectiveThreshold,
  extensionFor,
  requireIncrease,
  standardTransfer,
} from "./kcc20.mjs";

const GUARD_500 = "f401000000000000" + "00".repeat(24);
const GUARD_ZERO = "00".repeat(32);
const GUARD_NEG_500 = "f401000000000080" + "00".repeat(24);
const GUARD_NEG_ZERO = "0000000000000080" + "00".repeat(24);

function row(amount, guard, owner = "11") {
  return {
    amount,
    owner,
    ownerScheme: 0x01,
    borrowScheme: 0x01,
    borrowGuard: guard,
    extension: POC_EXTENSION,
  };
}

test("the published dispatch tags and the three extensions stay apart", () => {
  assert.equal(TRANSFER_TAG, "79c71c23");
  assert.equal(DELEGATOR_TAG, "fd3ef14a");
  assert.notEqual(POC_EXTENSION, KUSDT_EXTENSION);
  assert.notEqual(KUSDT_EXTENSION, KUSDT_FROZEN_EXTENSION);
  assert.equal(extensionFor("poc", false), POC_EXTENSION);
  assert.equal(extensionFor("kusdt", true), KUSDT_FROZEN_EXTENSION);
});

test("a negative threshold counts as zero and the spec borrow rows hold", () => {
  assert.equal(effectiveThreshold(GUARD_500), 500n);
  assert.equal(effectiveThreshold(GUARD_ZERO), 0n);
  assert.equal(effectiveThreshold(GUARD_NEG_500), 0n);
  assert.equal(effectiveThreshold(GUARD_NEG_ZERO), 0n);
  borrowedReceive(row(1000n, GUARD_500), row(1501n, GUARD_500));
  assert.throws(() => borrowedReceive(row(1000n, GUARD_500), row(1500n, GUARD_500)));
  borrowedReceive(row(1000n, GUARD_ZERO), row(1001n, GUARD_ZERO));
  borrowedReceive(row(1000n, GUARD_NEG_500), row(1001n, GUARD_NEG_500));
  assert.throws(() => borrowedReceive(row(1000n, GUARD_NEG_500), row(1000n, GUARD_NEG_500)));
  assert.throws(() => borrowedReceive(row(1000n, GUARD_NEG_500), row(999n, GUARD_NEG_500)));
  borrowedReceive(row(1000n, GUARD_NEG_ZERO), row(1001n, GUARD_NEG_ZERO));
  assert.throws(() => borrowedReceive(row(1000n, GUARD_NEG_ZERO), row(1000n, GUARD_NEG_ZERO)));
  assert.throws(() => borrowedReceive(row(1000n, GUARD_NEG_500), row(1001n, GUARD_ZERO)));
  assert.throws(() => borrowedReceive({ ...row(1000n, GUARD_500), borrowScheme: 0x00 }, row(1500n, GUARD_500)));
  assert.throws(() => borrowedReceive({ ...row(1000n, GUARD_ZERO), borrowScheme: 0x7f }, row(1500n, GUARD_ZERO)));
  assert.throws(() => borrowedReceive(row(1000n, GUARD_500), row(1501n, GUARD_500, "22")));
});

test("a standard transfer keeps one extension and the total amount", () => {
  standardTransfer(
    [{ amount: 1000n, extension: POC_EXTENSION }],
    [
      { amount: 600n, extension: POC_EXTENSION },
      { amount: 400n, extension: POC_EXTENSION },
    ]
  );
  assert.throws(() =>
    standardTransfer(
      [{ amount: 1000n, extension: POC_EXTENSION }],
      [{ amount: 1000n, extension: KUSDT_EXTENSION }]
    )
  );
  assert.throws(() =>
    standardTransfer(
      [{ amount: 1000n, extension: KUSDT_EXTENSION }],
      [{ amount: 1000n, extension: KUSDT_FROZEN_EXTENSION }]
    )
  );
  assert.throws(() =>
    standardTransfer([{ amount: 1000n, extension: POC_EXTENSION }], [{ amount: 999n, extension: POC_EXTENSION }])
  );
});

test("a square lock has to increase the amount", () => {
  requireIncrease(0n, 1n);
  requireIncrease(2000n, 2100n);
  assert.throws(() => requireIncrease(1000n, 1000n));
  assert.throws(() => requireIncrease(1000n, 999n));
});
