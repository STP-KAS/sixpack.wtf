import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAP_SOMPI,
  DESK_UNLIMITED_ADDR,
  DRIP_SOMPI,
  FROM,
  HALL_PASS,
  POOL_SOMPI,
  WINDOW_HOURS,
  dripAmount,
  formatWait,
  isHallPass,
  planClaim,
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

  it("pays again after a full window of use", () => {
    const now = 1_000_000_000_000;
    const first = planClaim({ address: ADDR, ip: "1.2.3.4", claims: [], now });
    assert.equal(first.tkas, "0.6");
    assert.equal(first.capTkas, "0.6");
    assert.equal(first.windowHours, WINDOW_HOURS);
    const claims = paid(first, now, "1.2.3.4");
    const again = planClaim({ address: ADDR, ip: "1.2.3.4", claims, now: now + 3 });
    assert.equal(again.tkas, "0.6");
    const later = planClaim({
      address: ADDR,
      ip: "9.9.9.9",
      claims,
      now: now + 24 * 60 * 60 * 1000 + 1,
      amountTkas: "10000",
    });
    assert.equal(later.tkas, "10000");
  });

  it("pays 0.6 or nothing", () => {
    assert.equal(dripAmount(5_000n * 100_000_000n), DRIP_SOMPI);
    assert.equal(dripAmount(DRIP_SOMPI), DRIP_SOMPI);
    assert.equal(dripAmount(DRIP_SOMPI - 1n), 0n);
    assert.equal(dripAmount(0n), 0n);
  });

  it("desk address and a used IP still get paid", () => {
    const now = 1_000_000_000_000;
    const desk = planClaim({
      address: DESK_UNLIMITED_ADDR,
      ip: "127.0.0.1",
      claims: [],
      now,
      amountTkas: "50000",
    });
    assert.equal(desk.tkas, "50000");
    const used = paid(desk, now, "127.0.0.1");
    const again = planClaim({
      address: DESK_UNLIMITED_ADDR,
      ip: "::ffff:127.0.0.1",
      claims: used,
      now: now + 3,
    });
    assert.equal(again.tkas, "0.6");
    const other = planClaim({ address: ADDR, ip: "127.0.0.1", claims: used, now: now + 3 });
    assert.equal(other.tkas, "0.6");
  });

  it("formats the official-style wait string", () => {
    assert.equal(formatWait(23 * 3600 * 1000 + 59 * 60 * 1000 + 39 * 1000), "23h 59m 39s");
    assert.equal(restHours(23 * 3600 * 1000 + 59 * 60 * 1000), 24);
    assert.equal(restHours(60 * 1000), 1);
  });

  it("still pays when the 24h ceiling is already full", () => {
    const now = 1_000_000_000_000;
    const claims = [{
      key: "addr:" + addrN(0).toLowerCase(),
      address: addrN(0),
      sompi: String(POOL_SOMPI),
      at: now,
      ip: "9.9.9.0",
    }];
    const next = planClaim({ address: addrN(16), ip: "8.8.8.8", claims, now: now + 100 });
    assert.equal(next.tkas, "0.6");
    const desk = planClaim({
      address: DESK_UNLIMITED_ADDR,
      ip: "127.0.0.1",
      claims,
      now: now + 100,
      amountTkas: "50000",
    });
    assert.equal(desk.tkas, "50000");
  });

  it("still pays after a large address payout", () => {
    const now = 1_000_000_000_000;
    const doubled = {
      key: "addr:" + addrN(0).toLowerCase(),
      address: addrN(0),
      sompi: String(140_000n * 100_000_000n),
      at: now,
      ip: "1.1.1.1",
    };
    const next = planClaim({ address: addrN(1), ip: "1.1.1.1", claims: [doubled], now: now + 5 });
    assert.equal(next.tkas, "0.6");
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
    const pass = planClaim({ address: bot, ip: "8.8.4.4", claims: filled, now: now + 50 });
    assert.equal(pass.tkas, "0.6");
    const crowdedIp = [{
      key: "ip:203.0.113.8",
      address: ADDR,
      sompi: String(CAP_SOMPI),
      at: now,
      ip: "203.0.113.8",
    }];
    const again = planClaim({ address: [...HALL_PASS][1], ip: "203.0.113.8", claims: crowdedIp, now: now + 70 });
    assert.equal(again.tkas, "0.6");
    const first = planClaim({ address: bot, ip: "9.9.8.1", claims: [], now });
    assert.equal(first.tkas, "0.6");
    assert.equal(first.unlimited, false);
  });
});
