import assert from "node:assert/strict";
import test from "node:test";
import { assertNoSecrets, sameBalances, toPublicList, toPublicRow, txidsOf } from "./refresh-funded-list.mjs";

const ADDRESS = "kaspatest:qrjdk8mep433svmn4wmwe7sqxwfpsmr7xnhzhqw9sq29a3h4zzwdqt5vv07we";
const TX = "bd8352399d982f6d22e41e6e062a00019f45778d294a402a2eedc2b9e7c7b6b6";

test("a public row keeps the address and the tx and drops the key", () => {
  const key = "ab".repeat(32);
  const row = toPublicRow({ address: ADDRESS, key, sompi: "200000000000", txid: TX, ready: true });
  assert.equal(row.address, ADDRESS);
  assert.equal(row.txid, TX);
  assert.equal(row.sompi, "200000000000");
  assert.equal(JSON.stringify(row).includes(key), false);
  assert.equal(Object.hasOwn(row, "key"), false);
});

test("the list skips an unfunded row and stays sorted", () => {
  const other = "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";
  const rows = toPublicList([
    { address: other, sompi: "100", txid: "11".repeat(32), ready: true, key: "cd".repeat(32) },
    { address: ADDRESS, sompi: "200000000000", txid: TX + ",junk", ready: true },
    { address: ADDRESS, sompi: "1", txid: "22".repeat(32), ready: false, key: "ef".repeat(32) },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].address < rows[1].address, true);
  assert.equal(rows.find((row) => row.address === ADDRESS).txid, TX);
  assert.equal(JSON.stringify(rows).includes("cd".repeat(32)), false);
  assert.equal(JSON.stringify(rows).includes("ef".repeat(32)), false);
  assert.deepEqual(txidsOf("zz," + TX), [TX]);
});

test("a public file is refused when a key or the funding wallet is in it", () => {
  const key = "ab".repeat(32);
  const home = "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";
  const clean = JSON.stringify({ address: ADDRESS, txid: TX, sompi: "1" });
  assert.doesNotThrow(() => assertNoSecrets(clean, [key], home));
  assert.throws(() => assertNoSecrets(clean + key, [key], home), /kept a key/);
  assert.throws(() => assertNoSecrets('{"key":"1"}', [], home), /kept a key/);
  assert.throws(() => assertNoSecrets(clean + home, [], home), /funding wallet/);
});

test("a balance check with the same coins is not a new publish", () => {
  const row = { address: ADDRESS, txid: TX, sompi: "1", balanceSompi: "1" };
  assert.equal(sameBalances({ rows: [row], updated: "a" }, { rows: [{ ...row }], updated: "b" }), true);
  assert.equal(sameBalances({ rows: [row] }, { rows: [{ ...row, balanceSompi: "0" }] }), false);
});
