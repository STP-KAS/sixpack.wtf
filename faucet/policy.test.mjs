import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAP_SOMPI,
  DESK_UNLIMITED_ADDR,
  DRIP_SOMPI,
  FROM,
  dripAmount,
  formatWait,
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
    assert.throws(() => planClaim({ address: ADDR, ip: "1.2.3.4", claims, now: now + 3 }), /Unable to send funds/);
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

  it("desk IP + desk address is unlimited; other IP or address stays capped", () => {
    const now = 1_000_000_000_000;
    const desk = planClaim({
      address: DESK_UNLIMITED_ADDR,
      ip: "81.243.19.34",
      claims: [],
      now,
      amountTkas: "50000",
    });
    assert.equal(desk.unlimited, true);
    assert.equal(desk.tkas, "50000");
    const used = [
      { key: desk.addrKey, sompi: String(30_000n * 100_000_000n), at: now },
      { key: desk.ipKey, sompi: String(30_000n * 100_000_000n), at: now },
    ];
    const again = planClaim({
      address: DESK_UNLIMITED_ADDR,
      ip: "::ffff:81.243.19.34",
      claims: used,
      now: now + 3,
      amountTkas: "10000",
    });
    assert.equal(again.unlimited, true);
    assert.throws(
      () => planClaim({ address: DESK_UNLIMITED_ADDR, ip: "8.8.8.8", claims: used, now: now + 3 }),
      /Unable to send funds/
    );
    assert.throws(
      () => planClaim({ address: ADDR, ip: "81.243.19.34", claims: [
        { key: "addr:" + ADDR.toLowerCase(), sompi: String(30_000n * 100_000_000n), at: now },
        { key: "ip:81.243.19.34", sompi: String(30_000n * 100_000_000n), at: now },
      ], now: now + 3 }),
      /Unable to send funds/
    );
  });

  it("formats the official-style wait string", () => {
    assert.equal(formatWait(23 * 3600 * 1000 + 59 * 60 * 1000 + 39 * 1000), "23h 59m 39s");
  });
});
