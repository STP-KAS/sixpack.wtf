import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAP_SOMPI,
  DRIP_SOMPI,
  FROM,
  dripAmount,
  planClaim,
  remainingInWindow,
  requireTestnetAddress,
  sompiToTkas,
} from "./policy.mjs";

const ADDR = "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0lda";

describe("stp tn10 faucet policy", () => {
  it("is 30,000 tKAS per 48h and 10,000 per drip", () => {
    assert.equal(sompiToTkas(CAP_SOMPI), "30000");
    assert.equal(sompiToTkas(DRIP_SOMPI), "10000");
  });

  it("rejects mainnet and the faucet address", () => {
    assert.throws(() => requireTestnetAddress("kaspa:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx"), /Testnet-10/);
    assert.throws(() => requireTestnetAddress(FROM), /itself/);
  });

  it("plans a 10k drip and then rate-limits at 30k", () => {
    const now = 1_000_000_000_000;
    const first = planClaim({ address: ADDR, ip: "1.2.3.4", claims: [], now });
    assert.equal(first.tkas, "10000");
    const claims = [
      { key: first.addrKey, sompi: String(DRIP_SOMPI), at: now },
      { key: first.ipKey, sompi: String(DRIP_SOMPI), at: now },
      { key: first.addrKey, sompi: String(DRIP_SOMPI), at: now + 1 },
      { key: first.ipKey, sompi: String(DRIP_SOMPI), at: now + 1 },
      { key: first.addrKey, sompi: String(DRIP_SOMPI), at: now + 2 },
      { key: first.ipKey, sompi: String(DRIP_SOMPI), at: now + 2 },
    ];
    assert.equal(remainingInWindow(claims, first.addrKey, now + 3), 0n);
    assert.throws(() => planClaim({ address: ADDR, ip: "1.2.3.4", claims, now: now + 3 }), /30,000/);
    const later = planClaim({
      address: ADDR,
      ip: "1.2.3.4",
      claims,
      now: now + 48 * 60 * 60 * 1000 + 1,
    });
    assert.equal(later.tkas, "10000");
  });

  it("drip shrinks to remaining when under 10k", () => {
    assert.equal(dripAmount(5_000n * 100_000_000n), 5_000n * 100_000_000n);
    assert.equal(dripAmount(0n), 0n);
  });
});
