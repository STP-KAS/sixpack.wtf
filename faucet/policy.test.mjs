import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAP_SOMPI,
  DESK_UNLIMITED_ADDR,
  DRIP_SOMPI,
  FROM,
  HALL_PASS,
  POOL_SOMPI,
  dripAmount,
  formatWait,
  isHallPass,
  planClaim,
  remainingInWindow,
  remainingPool,
  requireTestnetAddress,
  restHours,
  sompiToTkas,
} from "./policy.mjs";

const ADDR = "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0lda";

const ABC = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function addrN(i) {
  const addr = ADDR.slice(0, -2) + "q" + ABC[i % ABC.length];
  if (addr.toLowerCase() === FROM.toLowerCase()) return ADDR.slice(0, -2) + "qp";
  return addr;
}

function paid(plan, at, ip) {
  return [
    { key: plan.addrKey, address: plan.address, sompi: String(plan.sompi), at, ip },
    { key: plan.ipKey, address: plan.address, sompi: String(plan.sompi), at, ip },
  ];
}

describe("stp tn10 faucet policy", () => {
  it("is 10,000 tKAS per 24h and 10,000 per drip", () => {
    assert.equal(sompiToTkas(CAP_SOMPI), "10000");
    assert.equal(sompiToTkas(DRIP_SOMPI), "10000");
    assert.equal(sompiToTkas(POOL_SOMPI), "150000");
  });

  it("rejects mainnet and the faucet address", () => {
    assert.throws(() => requireTestnetAddress("kaspa:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx"), /Testnet-10/);
    assert.throws(() => requireTestnetAddress(FROM), /itself/);
  });

  it("plans a 10k drip and then rate-limits", () => {
    const now = 1_000_000_000_000;
    const first = planClaim({ address: ADDR, ip: "1.2.3.4", claims: [], now });
    assert.equal(first.tkas, "10000");
    assert.equal(first.capTkas, "10000");
    assert.equal(first.poolTkas, undefined);
    const claims = [
      { key: first.addrKey, address: first.address, sompi: String(DRIP_SOMPI), at: now, ip: "1.2.3.4" },
      { key: first.ipKey, address: first.address, sompi: String(DRIP_SOMPI), at: now, ip: "1.2.3.4" },
    ];
    assert.equal(remainingInWindow(claims, first.addrKey, now + 3), 0n);
    assert.throws(() => planClaim({ address: ADDR, ip: "1.2.3.4", claims, now: now + 3 }), /Unable to send funds/);
    const later = planClaim({
      address: ADDR,
      ip: "1.2.3.4",
      claims,
      now: now + 24 * 60 * 60 * 1000 + 1,
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
      ip: "<redacted-ip>",
      claims: [],
      now,
      amountTkas: "50000",
    });
    assert.equal(desk.unlimited, true);
    assert.equal(desk.tkas, "50000");
    const used = [
      { key: desk.addrKey, address: DESK_UNLIMITED_ADDR, sompi: String(10_000n * 100_000_000n), at: now, ip: "<redacted-ip>" },
      { key: desk.ipKey, address: DESK_UNLIMITED_ADDR, sompi: String(10_000n * 100_000_000n), at: now, ip: "<redacted-ip>" },
    ];
    const again = planClaim({
      address: DESK_UNLIMITED_ADDR,
      ip: "::ffff:<redacted-ip>",
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
      () => planClaim({ address: ADDR, ip: "<redacted-ip>", claims: [
        { key: "addr:" + ADDR.toLowerCase(), address: ADDR, sompi: String(10_000n * 100_000_000n), at: now, ip: "<redacted-ip>" },
        { key: "ip:<redacted-ip>", address: ADDR, sompi: String(10_000n * 100_000_000n), at: now, ip: "<redacted-ip>" },
      ], now: now + 3 }),
      /Unable to send funds/
    );
  });

  it("formats the official-style wait string", () => {
    assert.equal(formatWait(23 * 3600 * 1000 + 59 * 60 * 1000 + 39 * 1000), "23h 59m 39s");
    assert.equal(restHours(23 * 3600 * 1000 + 59 * 60 * 1000), 24);
    assert.equal(restHours(60 * 1000), 1);
  });

  it("stops a new address after 150,000 tKAS has been paid in 24h", () => {
    const now = 1_000_000_000_000;
    let claims = [];
    for (let i = 0; i < 15; i++) {
      const ip = "9.9.9." + i;
      const plan = planClaim({ address: addrN(i), ip, claims, now: now + i });
      assert.equal(plan.tkas, "10000");
      claims = claims.concat(paid(plan, now + i, ip));
    }
    const blocked = () => planClaim({ address: addrN(16), ip: "8.8.8.8", claims, now: now + 100 });
    assert.throws(blocked, /Bot detected \(not you\)/);
    assert.throws(blocked, /Faucet reached pay out limit/);
    assert.throws(blocked, /Rest for 24 hours/);
    try {
      blocked();
    } catch (err) {
      assert.equal(err.code, "POOL");
      assert.equal(err.restHours, 24);
      assert.equal(/150/.test(err.message), false);
      assert.equal(/15 people/.test(err.message), false);
    }
    const desk = planClaim({
      address: DESK_UNLIMITED_ADDR,
      ip: "127.0.0.1",
      claims,
      now: now + 100,
      amountTkas: "50000",
    });
    assert.equal(desk.unlimited, true);
    assert.equal(desk.tkas, "50000");
    assert.throws(
      () => planClaim({ address: addrN(0), ip: "9.9.9.0", claims, now: now + 100 }),
      /Unable to send funds/
    );
    const preview = planClaim({
      address: addrN(16),
      ip: "8.8.8.8",
      claims,
      now: now + 100,
      enforcePool: false,
    });
    assert.equal(preview.tkas, "10000");
    const opened = planClaim({
      address: addrN(16),
      ip: "8.8.8.8",
      claims,
      now: now + 24 * 60 * 60 * 1000 + 1,
    });
    assert.equal(opened.tkas, "10000");
  });

  it("counts each payout once and ignores desk withdrawals", () => {
    const now = 1_000_000_000_000;
    const doubled = {
      key: "addr:" + addrN(0).toLowerCase(),
      address: addrN(0),
      sompi: String(140_000n * 100_000_000n),
      at: now,
      ip: "1.1.1.1",
    };
    const ipTwin = { ...doubled, key: "ip:1.1.1.1" };
    const next = planClaim({ address: addrN(1), ip: "1.1.1.2", claims: [doubled, ipTwin], now: now + 5 });
    assert.equal(next.tkas, "10000");
    const deskOnly = [{
      key: "addr:" + DESK_UNLIMITED_ADDR.toLowerCase(),
      address: DESK_UNLIMITED_ADDR,
      sompi: String(POOL_SOMPI),
      at: now,
      ip: "127.0.0.1",
    }];
    const afterDesk = planClaim({ address: ADDR, ip: "3.3.3.3", claims: deskOnly, now: now + 5 });
    assert.equal(afterDesk.tkas, "10000");
  });

  it("pays the last slice under 10,000 and then stops", () => {
    const now = 1_000_000_000_000;
    const claims = [{
      key: "addr:" + addrN(0).toLowerCase(),
      address: addrN(0),
      sompi: String(145_000n * 100_000_000n),
      at: now,
      ip: "1.1.1.1",
    }];
    const slice = planClaim({ address: addrN(1), ip: "1.1.1.2", claims, now: now + 5 });
    assert.equal(slice.tkas, "5000");
    const almost = [{
      ...claims[0],
      sompi: String(149_991n * 100_000_000n),
    }];
    assert.throws(
      () => planClaim({ address: addrN(1), ip: "1.1.1.2", claims: almost, now: now + 90 * 60 * 1000 }),
      /Rest for 23 hours/
    );
  });

  it("lets grok-bot addresses skip the ip cap and stay out of the faucet ceiling", () => {
    assert.ok(HALL_PASS.size >= 190);
    const bot = [...HALL_PASS][0];
    assert.equal(isHallPass(bot), true);
    assert.equal(isHallPass(ADDR), false);
    const now = 1_000_000_000_000;
    const filled = [];
    for (let i = 0; i < 15; i++) {
      const ip = "9.9.8." + i;
      const plan = planClaim({ address: addrN(i), ip, claims: filled, now: now + i });
      filled.push({ key: plan.addrKey, address: plan.address, sompi: String(plan.sompi), at: now + i, ip });
    }
    assert.throws(() => planClaim({ address: ADDR, ip: "8.8.4.4", claims: filled, now: now + 50 }), /Faucet reached pay out limit/);
    const pass = planClaim({ address: bot, ip: "9.9.8.0", claims: filled, now: now + 50 });
    assert.equal(pass.tkas, "10000");
    assert.equal(pass.unlimited, false);
    const withBot = filled.concat([{
      key: pass.addrKey,
      address: pass.address,
      sompi: String(pass.sompi),
      at: now + 50,
      ip: "9.9.8.0",
    }, {
      key: pass.ipKey,
      address: pass.address,
      sompi: String(pass.sompi),
      at: now + 50,
      ip: "9.9.8.0",
    }]);
    assert.equal(sompiToTkas(remainingPool(withBot, now + 60)), "0");
    const crowdedIp = withBot.concat([{
      key: "ip:203.0.113.8",
      address: ADDR,
      sompi: String(CAP_SOMPI),
      at: now,
      ip: "203.0.113.8",
    }]);
    const again = planClaim({ address: [...HALL_PASS][1], ip: "203.0.113.8", claims: crowdedIp, now: now + 70 });
    assert.equal(again.tkas, "10000");
    const stranger = planClaim({ address: addrN(20), ip: "9.9.8.0", claims: withBot, now: now + 24 * 60 * 60 * 1000 + 2 });
    assert.equal(stranger.tkas, "10000");
  });
});
