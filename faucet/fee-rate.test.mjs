import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { payFeeRate, STANDARD_FEE_RATE, WALLET_PRIORITY_SOMPI } from "./fee-rate.mjs";

test("a quiet Testnet 10 quote is doubled, and a busy one is doubled from there", () => {
  assert.equal(STANDARD_FEE_RATE, 100);
  assert.equal(payFeeRate(null), 200);
  assert.equal(payFeeRate({ normalBuckets: [{ feerate: 100 }] }), 200);
  assert.equal(payFeeRate({ estimate: { normalBuckets: [{ feerate: 400 }] } }), 800);
  assert.equal(payFeeRate({ normalBuckets: [{ feerate: 1 }] }), 200);
  assert.equal(payFeeRate({ lowBuckets: [{ feerate: 100 }], priorityBucket: { feerate: 100 } }), 200);
});

test("a wallet payment carries the same double rate", () => {
  const kit = readFileSync(new URL("../wallets/kaspa-wallets.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../1984/client.mjs", import.meta.url), "utf8");
  assert.match(kit, /feeRate: Math\.max\(Number\(given\.feeRate\) \|\| 0, 200\)/);
  assert.match(kit, /priorityFee: Math\.max\(Number\(given\.priorityFee\) \|\| 0, 2000000\)/);
  assert.equal(WALLET_PRIORITY_SOMPI, 2_000_000);
  assert.match(page, /payFeeRate/);
  assert.match(page, /WALLET_PRIORITY_SOMPI/);
  assert.match(page, /\/api\/1984\/fee/);
});
