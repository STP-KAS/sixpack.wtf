import assert from "node:assert/strict";
import test from "node:test";
import { payFromKey, selectCovering, shortSendMessage, splitSendMessage } from "../faucet/pay.mjs";
import {
  GUEST_BYE_MS,
  GUEST_DISCLAIMER,
  GUEST_FUND_SOMPI,
  GUEST_PER_DAY,
  GUEST_PER_IP,
  GUEST_STALE_MS,
  createGuestDesk,
  emptyBook,
} from "./guest.mjs";
import { RESERVE } from "./money.mjs";

function addr(i) {
  return "kaspatest:" + "p".repeat(i + 1) + "q".repeat(60 - i);
}

function harness(seed, extra = {}) {
  let now = Date.UTC(2026, 8, 29, 12, 0, 0);
  let book = seed || emptyBook();
  let n = 0;
  let lastKey = "";
  let failFund = null;
  let holdFund = null;
  let failSweep = null;
  const funded = [];
  const swept = [];
  const paid = [];
  const gone = [];
  const desk = createGuestDesk({
    now: () => now,
    quiet: true,
    load: () => book,
    save: (next) => {
      book = next;
    },
    async mint() {
      n += 1;
      lastKey = (n % 2 === 0 ? "ab" : "cd").repeat(32);
      return { address: addr(n), key: lastKey };
    },
    async fund(address, sompi, onStep) {
      if (onStep) onStep("Gathering coins");
      if (holdFund) await holdFund;
      if (failFund) throw failFund();
      funded.push(sompi.toString());
      return { txids: ["11".repeat(32)], sompi: sompi.toString() };
    },
    async pay(input) {
      paid.push({ from: input.from, sompi: input.sompi.toString() });
      if (!input.key || input.to) throw new Error("pay shape");
      return { txid: "22".repeat(32), sompi: input.sompi.toString() };
    },
    poolOnly: extra.poolOnly === true,
    async takeReady() {
      if (!extra.usePool) return null;
      return (extra.ready || []).shift() || null;
    },
    async sweep(input) {
      if (failSweep) throw failSweep();
      swept.push(input.from);
      return { sompi: "1", ok: true, home: input.home || "" };
    },
  });
  desk.onGone = (address) => gone.push(address);
  return {
    desk,
    book: () => book,
    funded,
    swept,
    paid,
    gone,
    key: () => lastKey,
    setNow: (value) => {
      now = value;
    },
    now: () => now,
    fail(fn) {
      failFund = fn;
    },
    hold(promise) {
      holdFund = promise;
    },
    failSweep(fn) {
      failSweep = fn;
    },
  };
}

test("fifty thousand tKAS needs more than one batch when the coins are small", () => {
  const one = selectCovering([60000n * 100_000_000n], 50000n * 100_000_000n, 50_000_000n, 80);
  assert.equal(one.ok, true);
  assert.equal(one.count, 1);
  const small = Array.from({ length: 200 }, () => 300n * 100_000_000n);
  const many = selectCovering(small, 50000n * 100_000_000n, 50_000_000n, 80);
  assert.equal(many.ok, true);
  assert.equal(many.count > 80, true);
  const dust = Array.from({ length: 10 }, () => 1n);
  const short = selectCovering(dust, 50000n * 100_000_000n, 50_000_000n, 80);
  assert.equal(short.ok, false);
  const piles = Array.from({ length: 1000 }, () => 10n * 100_000_000n);
  const stopped = selectCovering(piles, 5000n * 100_000_000n, 50_000_000n, 80, 2);
  assert.equal(stopped.ok, false);
  assert.equal(stopped.count, 160);
  const open = selectCovering(piles, 5000n * 100_000_000n, 50_000_000n, 80, 20);
  assert.equal(open.ok, true);
  assert.match(splitSendMessage(983929122383296n, 16119100000000n), /9839291\.22383296 tKAS/);
  assert.match(splitSendMessage(983929122383296n, 16119100000000n), /161191 tKAS/);
  assert.match(splitSendMessage(1n, 1n), /too small to send this amount/);
  assert.match(shortSendMessage(100000000n), /holds 1 tKAS/);
  assert.match(shortSendMessage(100000000n), /less than this send/);
});

test("payFromKey refuses mainnet and a self payment before it talks to a node", async () => {
  await assert.rejects(
    () => payFromKey({ privHex: "ab".repeat(32), fromAddr: "kaspa:" + "q".repeat(61), toAddr: RESERVE, sompi: 1n }),
    /Mainnet|Testnet-10/
  );
  await assert.rejects(
    () => payFromKey({ privHex: "ab".repeat(32), fromAddr: RESERVE, toAddr: RESERVE, sompi: 1n }),
    /cannot pay itself/
  );
});

test("a new test wallet is funded and the answer has no key", async () => {
  const h = harness();
  const opened = await h.desk.open({ ip: "203.0.113.4", life: "page-a" });
  assert.equal(opened.ok, true);
  assert.equal(opened.sompi, GUEST_FUND_SOMPI.toString());
  assert.equal(opened.disclaimer, GUEST_DISCLAIMER);
  assert.equal(h.funded[0], GUEST_FUND_SOMPI.toString());
  assert.equal(JSON.stringify(opened).includes(h.key()), false);
  assert.equal(typeof opened.token, "string");
  assert.equal(h.book().sessions[opened.token].key, h.key());
  const paid = await h.desk.pay({ token: opened.token, address: opened.address, sompi: 100_000_000n });
  assert.equal(paid.txid.length, 64);
  assert.equal(h.paid[0].from, opened.address);
  assert.equal(JSON.stringify(paid).includes(h.key()), false);
  await assert.rejects(
    () => h.desk.pay({ token: opened.token, address: opened.address, sompi: GUEST_FUND_SOMPI + 1n }),
    /50000 tKAS/
  );
});

test("funding failure does not keep the test wallet or the key", async () => {
  const h = harness();
  h.fail(() => new Error("node down " + h.key()));
  await assert.rejects(() => h.desk.open({ ip: "203.0.113.4", life: "page-a" }), /node down/);
  const err = await h.desk.open({ ip: "203.0.113.4", life: "page-a" }).then(
    () => {
      throw new Error("should have failed");
    },
    (error) => error
  );
  assert.equal(err.message.includes(h.key()), false);
  assert.equal(Object.keys(h.book().sessions).length, 0);
  assert.equal(h.book().days["2026-09-29"].n, 0);
});

test("one network can open only today's allowance", async () => {
  const book = emptyBook();
  book.days["2026-09-29"] = { n: GUEST_PER_IP - 1, ips: { "203.0.113.4": GUEST_PER_IP - 1 } };
  const h = harness(book);
  const opened = await h.desk.open({ ip: "203.0.113.4", life: "last" });
  assert.equal(opened.ok, true);
  assert.equal(opened.sompi, GUEST_FUND_SOMPI.toString());
  const blocked = await h.desk.open({ ip: "203.0.113.4", life: "more" }).then(
    () => null,
    (error) => error
  );
  assert.match(blocked.message, /funded test addresses/);
  const other = await h.desk.open({ ip: "203.0.113.5", life: "other" }).then(
    (row) => row,
    (error) => error
  );
  if (GUEST_PER_IP < GUEST_PER_DAY) assert.equal(other.ok, true);
  else assert.match(other.message, /funded test addresses/);
});

test("the day's global cap stops new test wallets", async () => {
  const book = emptyBook();
  book.days["2026-09-29"] = { n: GUEST_PER_DAY, ips: {} };
  const h = harness(book);
  const blocked = await h.desk.open({ ip: "203.0.113.6", life: "a" }).then(
    () => null,
    (error) => error
  );
  assert.match(blocked.message, /funded test addresses/);
  assert.equal(h.funded.length, 0);
});

test("closing the tab sweeps the test wallet after the grace, and a refresh cancels that", async () => {
  const h = harness();
  const opened = await h.desk.open({ ip: "203.0.113.4", life: "page-a" });
  const early = await h.desk.close({ token: opened.token, address: opened.address, life: "page-a" });
  assert.equal(early.closing, true);
  await h.desk.reapNow();
  assert.equal(h.swept.length, 0);
  h.setNow(h.now() + GUEST_BYE_MS);
  await h.desk.reapNow();
  assert.deepEqual(h.swept, [opened.address]);
  assert.equal(h.gone[0], opened.address);
  assert.equal(h.book().sessions[opened.token], undefined);

  const again = await h.desk.open({ ip: "203.0.113.7", life: "page-b" });
  await h.desk.close({ token: again.token, address: again.address, life: "page-b" });
  const kept = await h.desk.keep({ token: again.token, address: again.address, life: "page-c" });
  assert.equal(kept.ok, true);
  h.setNow(h.now() + GUEST_BYE_MS + 1000);
  await h.desk.reapNow();
  assert.equal(h.swept.length, 1);

  const third = await h.desk.open({ ip: "203.0.113.8", life: "page-d" });
  await h.desk.keep({ token: third.token, address: third.address, life: "page-e" });
  const stale = await h.desk.close({ token: third.token, address: third.address, life: "page-d" });
  assert.equal(stale.stale, true);
  h.setNow(h.now() + GUEST_STALE_MS);
  await h.desk.reapNow();
  assert.equal(h.swept.at(-1), third.address);
});

test("a slow opening shows each step, then the wallet, and the answer has no key", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const h = harness();
  h.hold(gate);
  const started = h.desk.start({ ip: "203.0.113.4", life: "page-a" });
  assert.equal(started.pending, true);
  assert.equal(started.ok, false);
  assert.equal(started.step, "Waiting for the till");
  assert.equal(started.token, undefined);
  assert.equal(h.desk.job("missing"), null);
  let mid;
  for (let i = 0; i < 50; i++) {
    mid = h.desk.job(started.job);
    if (mid && mid.step === "Gathering coins") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(mid.step, "Gathering coins");
  assert.equal(mid.pending, true);
  assert.equal(mid.token, undefined);
  release();
  let done;
  for (let i = 0; i < 50; i++) {
    done = h.desk.job(started.job);
    if (done && !done.pending) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(done.ok, true);
  assert.equal(done.pending, false);
  assert.equal(done.step, "Broadcasting");
  assert.equal(done.sompi, GUEST_FUND_SOMPI.toString());
  assert.equal(JSON.stringify(done).includes(h.key()), false);
  assert.equal(done.key, undefined);
  assert.equal(h.book().sessions[done.token].key, h.key());
});

test("a failed opening ends the wait and keeps no key", async () => {
  const h = harness();
  h.fail(() => new Error("node down " + h.key()));
  const started = h.desk.start({ ip: "203.0.113.4", life: "page-a" });
  let done;
  for (let i = 0; i < 50; i++) {
    done = h.desk.job(started.job);
    if (done && !done.pending) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(done.ok, false);
  assert.equal(done.pending, false);
  assert.equal(done.step, "Stopped");
  assert.match(done.error, /node down/);
  assert.equal(String(done.error).includes(h.key()), false);
  assert.equal(done.token, undefined);
  assert.equal(Object.keys(h.book().sessions).length, 0);
  assert.equal(h.book().days["2026-09-29"].n, 0);
});

test("a failed opening keeps the test wallet when the coins cannot be swept back", async () => {
  const h = harness();
  h.fail(() => new Error("node down"));
  h.failSweep(() => new Error("sweep " + h.key()));
  const started = h.desk.start({ ip: "203.0.113.4", life: "page-a" });
  let done;
  for (let i = 0; i < 50; i++) {
    done = h.desk.job(started.job);
    if (done && !done.pending) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(done.ok, false);
  assert.equal(done.step, "Stopped");
  assert.match(done.error, /node down/);
  assert.equal(String(done.error).includes(h.key()), false);
  assert.equal(Object.keys(h.book().sessions).length, 1);
  assert.equal(h.book().days["2026-09-29"].n, 1);
  const row = Object.values(h.book().sessions)[0];
  assert.equal(row.key, h.key());
  assert.equal(row.sweepAfter > 0, true);
});

test("a prepared wallet is handed out with its own tKAS and no new send", async () => {
  const key = "ef".repeat(32);
  const home = addr(9);
  const ready = [{ address: addr(8), key, sompi: (2000n * 100_000_000n).toString(), txid: "44".repeat(32), home }];
  const h = harness(emptyBook(), { usePool: true, poolOnly: true, ready });
  const opened = await h.desk.open({ ip: "203.0.113.9", life: "pool" });
  assert.equal(opened.ok, true);
  assert.equal(opened.sompi, (2000n * 100_000_000n).toString());
  assert.equal(opened.disclaimer, GUEST_DISCLAIMER);
  assert.equal(JSON.stringify(opened).includes(key), false);
  assert.equal(h.funded.length, 0);
  assert.equal(h.book().sessions[opened.token].home, home);
  assert.equal(h.book().sessions[opened.token].key, key);
  const empty = harness(emptyBook(), { usePool: true, poolOnly: true, ready: [] });
  const blocked = await empty.desk.open({ ip: "203.0.113.10", life: "none" }).then(
    () => null,
    (error) => error
  );
  assert.match(blocked.message, /funded test addresses are used up/);
  assert.equal(empty.funded.length, 0);
});

test("the same browser gets the same funded wallet and a stranger does not", async () => {
  const ready = [
    { address: addr(8), key: "ab".repeat(32), sompi: (2000n * 100_000_000n).toString(), txid: "44".repeat(32), home: addr(9) },
    { address: addr(7), key: "cd".repeat(32), sompi: (2000n * 100_000_000n).toString(), txid: "55".repeat(32), home: addr(9) },
    { address: addr(6), key: "ef".repeat(32), sompi: (2000n * 100_000_000n).toString(), txid: "66".repeat(32), home: addr(9) },
  ];
  const h = harness(emptyBook(), { usePool: true, poolOnly: true, ready });
  const marker = "a1".repeat(16);
  const opened = await h.desk.open({ ip: "203.0.113.9", life: "pool", browser: marker });
  assert.equal(opened.same, false);
  assert.equal(opened.remembered, true);
  assert.equal(opened.replaced, false);
  assert.equal(JSON.stringify(opened).includes("ab".repeat(32)), false);
  const closed = await h.desk.close({ token: opened.token, address: opened.address, life: "pool" });
  assert.equal(closed.kept, true);
  assert.equal(closed.closing, false);
  h.setNow(h.now() + GUEST_STALE_MS + GUEST_BYE_MS);
  await h.desk.reapNow();
  assert.equal(h.swept.length, 0);
  const again = await h.desk.open({ ip: "198.51.100.9", life: "later", browser: marker });
  assert.equal(again.same, true);
  assert.equal(again.address, opened.address);
  assert.equal(again.token, opened.token);
  const stranger = await h.desk.open({ ip: "203.0.113.9", life: "other", browser: "b2".repeat(16) });
  assert.equal(stranger.same, false);
  assert.equal(stranger.remembered, true);
  assert.notEqual(stranger.address, opened.address);
  const notAUser = "99".repeat(32);
  const unknown = await h.desk.open({ ip: "203.0.113.9", life: "plain", browser: notAUser });
  assert.equal(unknown.remembered, false);
  assert.equal(unknown.same, false);
  assert.equal(JSON.stringify(h.book()).includes(notAUser), false);
  assert.equal(ready.length, 0);
});

test("a swept wallet is not handed back, and the desk says it was replaced", async () => {
  const marker = "d4".repeat(16);
  const book = emptyBook();
  book.lost = { [marker]: { address: addr(4), at: 1 } };
  const ready = [{ address: addr(5), key: "12".repeat(32), sompi: (2000n * 100_000_000n).toString(), txid: "77".repeat(32), home: addr(9) }];
  const h = harness(book, { usePool: true, poolOnly: true, ready });
  const opened = await h.desk.open({ ip: "203.0.113.12", life: "new", browser: marker });
  assert.equal(opened.replaced, true);
  assert.equal(opened.same, false);
  assert.equal(opened.remembered, true);
  assert.notEqual(opened.address, addr(4));
  assert.equal(h.book().lost[marker], undefined);
});

test("a wrong token cannot spend the test wallet", async () => {
  const h = harness();
  const opened = await h.desk.open({ ip: "203.0.113.4", life: "page-a" });
  const err = await h.desk.pay({ token: "nope", address: opened.address, sompi: 1n }).then(
    () => null,
    (error) => error
  );
  assert.match(err.message, /dropped/);
  assert.equal(h.paid.length, 0);
});
