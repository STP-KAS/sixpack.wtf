import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DELEGATOR_TAG,
  KUSDT_EXTENSION,
  KUSDT_FROZEN_EXTENSION,
  MAX_TOKEN_TOTAL,
  POC_EXTENSION,
  TRANSFER_TAG,
  blake3Hex,
  borrowedReceive,
  effectiveThreshold,
  extensionFor,
  familyTotal,
  holderMint,
  normalizeTick,
  olafExtension,
  requireIncrease,
  standardTransfer,
  tokenExtension,
} from "./kcc20.mjs";

const conformance = JSON.parse(
  readFileSync(new URL("./kcc-0020/vectors/conformance.json", import.meta.url))
);
const SCHNORR_WITNESS = "01" + "44".repeat(65);

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

test("a short name hashes with unkeyed BLAKE3", () => {
  assert.equal(blake3Hex(new Uint8Array()), "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262");
  assert.equal(
    blake3Hex(new TextEncoder().encode("abc")),
    "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85"
  );
  const ash = tokenExtension("ash");
  assert.equal(ash, tokenExtension("ASH"));
  assert.equal(ash.length, 64);
  assert.notEqual(ash, POC_EXTENSION);
  assert.equal(normalizeTick(" ash "), "ASH");
  assert.throws(() => normalizeTick("POCencept"), /already a rail/);
  assert.throws(() => normalizeTick("OLAF"), /shielded note/);
  assert.equal(olafExtension(), blake3Hex(new TextEncoder().encode("OLAF")));
  assert.notEqual(olafExtension(), POC_EXTENSION);
  assert.throws(() => holderMint(5n, 5n, ash, "holder"), /increase/);
  holderMint(5n, 8n, ash, "holder");
});

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
  const four = [1, 2, 3, 4].map((amount) => ({ amount: BigInt(amount), extension: POC_EXTENSION }));
  assert.throws(() => standardTransfer([{ amount: 10n, extension: POC_EXTENSION }], four), /3 inputs and 3 outputs/);
});

test("a square lock has to increase the amount", () => {
  requireIncrease(0n, 1n);
  requireIncrease(2000n, 2100n);
  assert.throws(() => requireIncrease(1000n, 1000n));
  assert.throws(() => requireIncrease(1000n, 999n));
  assert.throws(() => requireIncrease(0n, 1n, "ab".repeat(32)));
});

test("a square credit is not a borrowed receive", () => {
  assert.throws(() => familyTotal(
    [{ amount: 1000n, extension: POC_EXTENSION }],
    [{ amount: 1501n, extension: POC_EXTENSION }]
  ));
  familyTotal(
    [
      { amount: 1000n, extension: POC_EXTENSION },
      { amount: 501n, extension: POC_EXTENSION },
    ],
    [{ amount: 1501n, extension: POC_EXTENSION }]
  );
  assert.throws(() => holderMint(1n, 2n, "not-a-commitment", "holder"));
});

test("the copied conformance file matches the Final pin", () => {
  assert.equal(conformance.kcc, 20);
  assert.equal(conformance.dispatch[0].dispatch_tag_hex, TRANSFER_TAG);
  assert.equal(conformance.dispatch[1].dispatch_tag_hex, DELEGATOR_TAG);
  const chain = conformance.hash_chain;
  let previous = chain.x_0_hex;
  for (const link of chain.links) {
    const revealed = Uint8Array.from(Buffer.from(previous, "hex"));
    const pubkey = Uint8Array.from(Buffer.from(link.pubkey_hex, "hex"));
    const body = new Uint8Array(64);
    body.set(revealed);
    body.set(pubkey, 32);
    assert.equal(blake3Hex(body), link.x_hex);
    previous = link.x_hex;
  }
  assert.equal(chain.initial_borrow_guard_hex, chain.links[2].x_hex);
  const mismatch = conformance.borrowed_receive.cases.find((row) => row.id === "hash-chain-link-mismatch");
  const revealed = Uint8Array.from(Buffer.from(chain.links[0].x_hex, "hex"));
  const pubkey = Uint8Array.from(Buffer.from(chain.links[2].pubkey_hex, "hex"));
  const body = new Uint8Array(64);
  body.set(revealed);
  body.set(pubkey, 32);
  assert.equal(blake3Hex(body), mismatch.revealed_link_hash_hex);
});

function borrowedState(common, rowCase, side) {
  const successor = side === "next";
  return {
    amount: BigInt(successor ? rowCase.successor_amount : common.leader_amount),
    owner: successor ? (rowCase.successor_owner_hex || common.owner_hex) : common.owner_hex,
    ownerScheme: Number.parseInt(common.owner_scheme_hex, 16),
    borrowScheme: Number.parseInt(rowCase.borrow_scheme_hex, 16),
    borrowGuard: successor ? rowCase.successor_borrow_guard_hex : rowCase.leader_borrow_guard_hex,
    extension: common.extension_commitment_hex,
    kasSompi: successor
      ? (rowCase.successor_kas_value_sompi == null ? undefined : BigInt(rowCase.successor_kas_value_sompi))
      : (rowCase.leader_kas_value_sompi == null ? undefined : BigInt(rowCase.leader_kas_value_sompi)),
  };
}

test("borrowed-receive vectors from kcc-0020", () => {
  const section = conformance.borrowed_receive;
  for (const rowCase of section.cases) {
    const leader = borrowedState(section.common, rowCase, "leader");
    const next = borrowedState(section.common, rowCase, "next");
    const options = { witness: rowCase.witness_hex, signatureVerified: true };
    if (rowCase.result === "accept") {
      borrowedReceive(leader, next, options);
      if (rowCase.signature_dependent) {
        assert.throws(() => borrowedReceive(leader, next, { ...options, signatureVerified: false }));
      }
    } else {
      assert.throws(() => borrowedReceive(leader, next, options), rowCase.id);
    }
  }
});

test("a schnorr borrow keeps the guard and needs an off-chain verified signature", () => {
  const guard = "11".repeat(32);
  const leader = { ...row(1000n, guard), borrowScheme: 0x02 };
  const next = { ...row(1001n, guard), borrowScheme: 0x02 };
  borrowedReceive(leader, next, { witness: SCHNORR_WITNESS, signatureVerified: true });
  assert.throws(() => borrowedReceive(leader, next, { witness: SCHNORR_WITNESS, signatureVerified: false }));
  assert.throws(() => borrowedReceive(
    leader,
    { ...next, borrowGuard: "22".repeat(32) },
    { witness: SCHNORR_WITNESS, signatureVerified: true }
  ));
  assert.throws(() => borrowedReceive(leader, next, { witness: "01", signatureVerified: true }));
  assert.throws(() => borrowedReceive(leader, next, { leader: false, witness: SCHNORR_WITNESS, signatureVerified: true }));
});

test("standard-transfer vectors from kcc-0020", () => {
  const section = conformance.standard_transfer;
  const common = section.common;
  const acceptOutputs = common.next_state_amounts.map((amount, index) => ({
    amount: BigInt(amount),
    extension: common.next_state_extension_commitments_hex[index],
    ownerScheme: Number.parseInt(common.next_state_owner_schemes_hex[index], 16),
  }));
  const leader = {
    amount: BigInt(common.leader_state.amount),
    extension: common.leader_state.extension_commitment_hex,
    ownerScheme: Number.parseInt(common.leader_state.owner_scheme_hex, 16),
  };
  standardTransfer([leader], acceptOutputs, { witness: common.witness_hex });
  for (const rowCase of section.cases) {
    const amounts = rowCase.next_state_amounts || common.next_state_amounts;
    const schemes = rowCase.next_state_owner_schemes_hex || common.next_state_owner_schemes_hex;
    const extensions = rowCase.next_state_extension_commitments_hex || common.next_state_extension_commitments_hex;
    const delegates = rowCase.delegate_amounts || common.delegate_amounts;
    const outputs = amounts.map((amount, index) => ({
      amount: BigInt(amount),
      extension: extensions[index],
      ownerScheme: Number.parseInt(schemes[index], 16),
    }));
    const inputs = [
      leader,
      ...delegates.map((amount) => ({ amount: BigInt(amount), extension: leader.extension })),
    ];
    assert.throws(
      () => standardTransfer(inputs, outputs, { witness: rowCase.witness_hex || common.witness_hex }),
      rowCase.id
    );
  }
  assert.throws(() => standardTransfer(
    [{ amount: MAX_TOKEN_TOTAL + 1n, extension: POC_EXTENSION }],
    [{ amount: MAX_TOKEN_TOTAL + 1n, extension: POC_EXTENSION }]
  ));
  standardTransfer(
    [{ amount: MAX_TOKEN_TOTAL, extension: POC_EXTENSION }],
    [{ amount: MAX_TOKEN_TOTAL, extension: POC_EXTENSION }]
  );
  assert.throws(() => standardTransfer(
    [{ amount: 1n, extension: POC_EXTENSION }],
    [{ amount: 1n, extension: POC_EXTENSION, ownerScheme: 0x05 }]
  ));
});
