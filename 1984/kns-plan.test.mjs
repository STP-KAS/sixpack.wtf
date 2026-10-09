import assert from "node:assert/strict";
import test from "node:test";
import { KNS_FEE_ADDRESS, knsFeeKas, knsPlan } from "./kns-plan.mjs";

test("a layer name plans one TN10 KNS inscription and not a covenant", () => {
  const plan = knsPlan("Lumbridge.kas");
  assert.equal(plan.name, "lumbridge");
  assert.equal(plan.domain, "lumbridge.kas");
  assert.equal(plan.payload, "{\"op\":\"create\",\"p\":\"domain\",\"v\":\"lumbridge\"}");
  assert.equal(plan.feeKas, 35);
  assert.equal(plan.feeAddress, KNS_FEE_ADDRESS);
  assert.equal(plan.holdSompi, 35n * 100_000_000n + (35n * 100_000_000n * 5n) / 100n + 100_000_000n + 3_000_000n);
  assert.equal(knsFeeKas("abcd"), 525);
  assert.equal(knsFeeKas("abc"), 2100);
  assert.equal(knsFeeKas("ab"), 4200);
  assert.throws(() => knsPlan("kas"), /reserved/);
});
