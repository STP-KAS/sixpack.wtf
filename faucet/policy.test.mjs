import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAP_SOMPI,
  DESK_UNLIMITED_ADDR,
  DRIP_SOMPI,
  FROM,
  HALL_PASS,
  POOL_SOMPI,
  POOL_WINDOW_MS,
  WINDOW_HOURS,
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
  it("is 0.6 tKAS per withdrawal over the published window", () => {
    assert.equal(sompiToTkas(CAP_SOMPI), "0.6");
    assert.equal(sompiToTkas(DRIP_SOMPI), "0.6");
    assert.equal(sompiToTkas(POOL_SOMPI), "150000");
    assert.equal(WINDOW_HOURS, 235784);
  });

  it("rejects mainnet and the faucet address", () => {
    assert.throws(() => requireTestnetAddress("kaspa:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx"), /Testnet-10/);
    assert.throws(() => requireTestnetAddress(FROM), /itself/);
  });

  it("plans a 0.6 drip and then keeps the cap after 24h", () => {
    const now = 1_000_000_000_000;
    const first = planClaim({ address: ADDR, ip: "1.2.3.4", claims: [], now, amountTkas: "10000" });
    assert.equal(first.tkas, "0.6");
    assert.equal(first.capTkas, "0.6");
    assert.equal(first.unlimited, false);
    assert.equal(first.windowHours, WINDOW_HOURS);
    const claims = paid(first, now, "1.2.3.4");
    assert.equal(remainingInWindow(claims, first.addrKey, now + 3), 0n);
    assert.throws(() => planClaim({ address: ADDR, ip: "1.2.3.4", claims, now: now + 3 }), /235784h/);
    assert.throws(
      () => planClaim({ address: ADDR, ip: "9.9.9.9", claims, now: now + 24 * 60 * 60 * 1000 + 1 }),
      /Unable to send funds/
    );
  });

  it("pays 0.6 or nothing", () => {
    assert.equal(dripAmount(5_000n * 100_000_000n), DRIP_SOMPI);
    assert.equal(dripAmount(DRIP_SOMPI), DRIP_SOMPI);
    assert.equal(dripAmount(DRIP_SOMPI - 1n), 0n);
    assert.equal(dripAmount(0n), 0n);
  });

  it("desk address and IP get 0.6 and then stop", () => {
    const now = 1_000_000_000_000;
    const desk = planClaim({
      address: DESK_UNLIMITED_ADDR,
      ip: "<redacted-ip>",
      claims: [],
      now,
      amountTkas: "50000",
    });
    assert.equal(desk.unlimited, false);
    assert.equal(desk.tkas, "0.6");
    const used = paid(desk, now, "<redacted-ip>");
    assert.throws(
      () => planClaim({
        address: DESK_UNLIMITED_ADDR,
        ip: "::ffff:<redacted-ip>",
        claims: used,
        now: now + 3,
        amountTkas: "10000",
      }),
      /Unable to send funds/
    );
    assert.throws(
      () => planClaim({ address: ADDR, ip: "<redacted-ip>", claims: used, now: now + 3 }),
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
    const claims = [{
      key: "addr:" + addrN(0).toLowerCase(),
      address: addrN(0),
      sompi: String(POOL_SOMPI),
      at: now,
      ip: "9.9.9.0",
    }];
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
    }
    assert.throws(
      () => planClaim({
        address: DESK_UNLIMITED_ADDR,
        ip: "127.0.0.1",
        claims,
        now: now + 100,
        amountTkas: "50000",
      }),
      /Faucet reached pay out limit/
    );
    const preview = planClaim({
      address: addrN(16),
      ip: "8.8.8.8",
      claims,
      now: now + 100,
      enforcePool: false,
    });
    assert.equal(preview.tkas, "0.6");
    const opened = planClaim({
      address: addrN(16),
      ip: "8.8.8.8",
      claims,
      now: now + POOL_WINDOW_MS + 1,
    });
    assert.equal(opened.tkas, "0.6");
  });

  it("counts each address payout once, including the desk address", () => {
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
    assert.equal(next.tkas, "0.6");
    const deskOnly = [{
      key: "addr:" + DESK_UNLIMITED_ADDR.toLowerCase(),
      address: DESK_UNLIMITED_ADDR,
      sompi: String(POOL_SOMPI),
      at: now,
      ip: "127.0.0.1",
    }];
    assert.throws(
      () => planClaim({ address: ADDR, ip: "3.3.3.3", claims: deskOnly, now: now + 5 }),
      /Faucet reached pay out limit/
    );
  });

  it("pays 0.6 while the 24h ceiling has room, then stops under 0.6", () => {
    const now = 1_000_000_000_000;
    const claims = [{
      key: "addr:" + addrN(0).toLowerCase(),
      address: addrN(0),
      sompi: String(145_000n * 100_000_000n),
      at: now,
      ip: "1.1.1.1",
    }];
    const slice = planClaim({ address: addrN(1), ip: "1.1.1.2", claims, now: now + 5 });
    assert.equal(slice.tkas, "0.6");
    const almost = [{
      ...claims[0],
      sompi: String(POOL_SOMPI - 30_000_000n),
    }];
    assert.throws(
      () => planClaim({ address: addrN(1), ip: "1.1.1.2", claims: almost, now: now + 90 * 60 * 1000 }),
      /Rest for 23 hours/
    );
  });

  it("does not exempt grok-bot addresses", () => {
    assert.ok(HALL_PASS.size >= 190);
    const bot = [...HALL_PASS][0];
    assert.equal(isHallPass(bot), true);
    assert.equal(isHallPass(ADDR), false);
    const now = 1_000_000_000_000;
    const filled = [{
      key: "addr:" + addrN(0).toLowerCase(),
      address: addrN(0),
      sompi: String(POOL_SOMPI),
      at: now,
      ip: "9.9.8.0",
    }];
    assert.throws(() => planClaim({ address: bot, ip: "8.8.4.4", claims: filled, now: now + 50 }), /Faucet reached pay out limit/);
    const crowdedIp = [{
      key: "ip:203.0.113.8",
      address: ADDR,
      sompi: String(CAP_SOMPI),
      at: now,
      ip: "203.0.113.8",
    }];
    assert.throws(
      () => planClaim({ address: [...HALL_PASS][1], ip: "203.0.113.8", claims: crowdedIp, now: now + 70 }),
      /Unable to send funds/
    );
    const first = planClaim({ address: bot, ip: "9.9.8.1", claims: [], now });
    assert.equal(first.tkas, "0.6");
    assert.equal(first.unlimited, false);
  });
});
