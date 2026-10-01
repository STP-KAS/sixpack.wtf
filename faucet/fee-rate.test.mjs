import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { pageFeeRate, payFeeRate, PAGE_PRIORITY_SOMPI, STANDARD_FEE_RATE, WALLET_PRIORITY_SOMPI } from "./fee-rate.mjs";

test("a quiet Testnet 10 quote is doubled for the faucet, and a busy one is doubled from there", () => {
  assert.equal(STANDARD_FEE_RATE, 100);
  assert.equal(payFeeRate(null), 200);
  assert.equal(payFeeRate({ normalBuckets: [{ feerate: 100 }] }), 200);
  assert.equal(payFeeRate({ estimate: { normalBuckets: [{ feerate: 400 }] } }), 800);
  assert.equal(payFeeRate({ normalBuckets: [{ feerate: 1 }] }), 200);
  assert.equal(payFeeRate({ lowBuckets: [{ feerate: 100 }], priorityBucket: { feerate: 100 } }), 200);
});

test("1984 pays six times the ordinary rate, three times the old double", () => {
  assert.equal(pageFeeRate(null), 600);
  assert.equal(pageFeeRate({ normalBuckets: [{ feerate: 100 }] }), 600);
  assert.equal(pageFeeRate({ estimate: { normalBuckets: [{ feerate: 400 }] } }), 2400);
  assert.equal(pageFeeRate({ normalBuckets: [{ feerate: 1 }] }), 600);
  assert.equal(PAGE_PRIORITY_SOMPI, 6_000_000);
  assert.equal(PAGE_PRIORITY_SOMPI, WALLET_PRIORITY_SOMPI * 3);
});

test("a wallet payment carries the 1984 rate", () => {
  const kit = readFileSync(new URL("../wallets/kaspa-wallets.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../1984/client.mjs", import.meta.url), "utf8");
  assert.match(kit, /feeRate: Math\.max\(Number\(given\.feeRate\) \|\| 0, 600\)/);
  assert.match(kit, /priorityFee: Math\.max\(Number\(given\.priorityFee\) \|\| 0, 6000000\)/);
  assert.equal(WALLET_PRIORITY_SOMPI, 2_000_000);
  assert.match(page, /pageFeeRate/);
  assert.match(page, /PAGE_PRIORITY_SOMPI/);
  assert.match(page, /\/api\/1984\/fee/);
});
