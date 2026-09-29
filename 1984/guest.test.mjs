import assert from "node:assert/strict";
import test from "node:test";
import { payFromKey } from "../faucet/pay.mjs";
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

function harness(seed) {
  let now = Date.UTC(2026, 8, 29, 12, 0, 0);
  let book = seed || emptyBook();
  let n = 0;
  let lastKey = "";
  let failFund = null;
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
    async fund(address, sompi) {
      if (failFund) throw failFund();
      funded.push(sompi.toString());
      return { txids: ["11".repeat(32)], sompi: sompi.toString() };
    },
    async pay(input) {
      paid.push({ from: input.from, sompi: input.sompi.toString() });
      if (!input.key || input.to) throw new Error("pay shape");
      return { txid: "22".repeat(32), sompi: input.sompi.toString() };
    },
    async sweep(input) {
      swept.push(input.from);
      return { sompi: "1", ok: true };
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
  };
}

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
    /10000 tKAS/
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
  assert.match(blocked.message, /keep their history/);
  const other = await h.desk.open({ ip: "203.0.113.5", life: "other" }).then(
    (row) => row,
    (error) => error
  );
  if (GUEST_PER_IP < GUEST_PER_DAY) assert.equal(other.ok, true);
  else assert.match(other.message, /keeps its history/);
});

test("the day's global cap stops new test wallets", async () => {
  const book = emptyBook();
  book.days["2026-09-29"] = { n: GUEST_PER_DAY, ips: {} };
  const h = harness(book);
  const blocked = await h.desk.open({ ip: "203.0.113.6", life: "a" }).then(
    () => null,
    (error) => error
  );
  assert.match(blocked.message, /keeps its history/);
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
