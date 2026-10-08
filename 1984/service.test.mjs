import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { create1984Service } from "./service.mjs";
import { RESERVE, sompiForCents } from "./money.mjs";

const USER = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

function txOf(id, sompi) {
  return {
    subnetwork_id: "0000000000000000000000000000000000000000",
    transaction_id: id,
    is_accepted: true,
    inputs: [{ previous_outpoint_address: USER, previous_outpoint_amount: sompi }],
    outputs: [{ script_public_key_address: RESERVE, amount: sompi }],
  };
}

function harness(pay, extra = {}) {
  let state = null;
  const saved = [];
  const svc = create1984Service({
    load: () =>
      state || {
        accounts: {},
        txids: {},
        receipts: [],
        redeemedSompi: "0",
        seq: "0",
      },
    save: (next) => {
      state = next;
      saved.push(JSON.stringify(next.accounts[USER] || {}));
    },
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("info/price")) {
        return { ok: true, json: async () => ({ price: 0.05 }) };
      }
      const id = (u.match(/transactions\/([0-9a-f]+)/) || [])[1];
      if (id) return { ok: true, status: 200, json: async () => txOf(id, 2_000_000_000) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
    now: () => Date.UTC(2026, 8, 29),
    pay,
    ...extra,
  });
  return { svc, saved, read: () => state };
}

test("a tKAS wait polls the tip instead of pausing a fifth of a second", () => {
  const source = readFileSync(new URL("./service.mjs", import.meta.url), "utf8");
  assert.match(source, /await pause\(20\)/);
  assert.doesNotMatch(source, /await pause\(200\)/);
});

test("one tKAS locks five cents, and redeeming one ledger tag does not", async () => {
  const txid = "ab".repeat(32);
  const sompi = 100_000_000;
  const { svc, read } = harness(async () => ({ txids: ["zz"] }), {
    txTries: 1,
    guests: {
      async pay() {
        return { txid };
      },
    },
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("info/price")) return { ok: true, json: async () => ({ price: 0.05 }) };
      if (u.includes("/transactions/")) return { ok: true, status: 200, json: async () => txOf(txid, sompi) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });
  const locked = await svc.handle({
    method: "POST",
    pathname: "/api/1984/guest/convert",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", token: "tok", rail: "poc", amount: "1" },
    ip: "127.0.0.1",
  });
  assert.equal(locked.body.ok, true);
  assert.equal(locked.body.cents, "5");
  assert.equal(read().accounts[USER].poc, "5");
  assert.equal(read().accounts[USER].pocBacked, "5");
  const tooMuch = await svc.handle({
    method: "POST",
    pathname: "/api/1984/redeem",
    query: new URLSearchParams(),
    body: { address: USER, rail: "poc", amount: "1.00" },
    ip: "127.0.0.1",
  });
  assert.equal(tooMuch.body.ok, false);
  assert.equal(read().accounts[USER].poc, "5");
  assert.equal(read().accounts[USER].pocBacked, "5");
  const exact = await svc.handle({
    method: "POST",
    pathname: "/api/1984/redeem",
    query: new URLSearchParams(),
    body: { address: USER, rail: "poc", amount: "0.05" },
    ip: "127.0.0.1",
  });
  assert.equal(exact.body.ok, true);
  assert.equal(read().accounts[USER].poc, "0");
  assert.equal(read().accounts[USER].pocBacked, "0");
});

test("a purse swap does not create locked tags", async () => {
  const { svc, read } = harness(async () => ({ txids: ["zz"] }));
  const purse = await svc.handle({
    method: "POST",
    pathname: "/api/1984/practice",
    query: new URLSearchParams(),
    body: { address: USER },
    ip: "127.0.0.1",
  });
  assert.equal(purse.body.ok, true);
  const moved = await svc.handle({
    method: "POST",
    pathname: "/api/1984/exchange",
    query: new URLSearchParams(),
    body: { address: USER, from: "poc", to: "kusdt", amount: "1.00" },
    ip: "127.0.0.1",
  });
  assert.equal(moved.body.ok, true);
  assert.equal(read().accounts[USER].poc, "1900");
  assert.equal(read().accounts[USER].pocBacked, "0");
  assert.equal(read().accounts[USER].kusdt, "2100");
  assert.equal(read().accounts[USER].kusdtBacked, "0");
  assert.equal(read().accounts[USER].liability, "0");
});

test("a failed redeem puts the ledger balance back", async () => {
  const { svc, read } = harness(async () => {
    throw new Error("node down");
  });
  const id = "c".repeat(64);
  const minted = await svc.handle({
    method: "POST",
    pathname: "/api/1984/convert",
    query: new URLSearchParams(),
    body: { address: USER, rail: "poc", txid: id },
    ip: "127.0.0.1",
  });
  assert.equal(minted.body.ok, true);
  assert.equal(read().accounts[USER].pocBacked, "100");
  const redeemed = await svc.handle({
    method: "POST",
    pathname: "/api/1984/redeem",
    query: new URLSearchParams(),
    body: { address: USER, rail: "poc", amount: "1.00" },
    ip: "127.0.0.1",
  });
  assert.equal(redeemed.body.ok, false);
  assert.match(redeemed.body.error, /node down/);
  assert.equal(read().accounts[USER].pocBacked, "100");
  assert.equal(read().accounts[USER].poc, "100");
});

test("mainnet is refused before a purse is given", async () => {
  const { svc } = harness(async () => ({ txids: ["ab"] }));
  const out = await svc.handle({
    method: "POST",
    pathname: "/api/1984/practice",
    query: new URLSearchParams(),
    body: { address: "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", network: "mainnet" },
    ip: "127.0.0.1",
  });
  assert.equal(out.body.ok, false);
  assert.match(out.body.error, /Mainnet/);
});

test("a test login answer has no key", async () => {
  const { svc } = harness(async () => ({ txids: ["ab"] }), {
    guests: {
      async open() {
        return {
          ok: true,
          address: USER,
          token: "abc",
          sompi: "1",
          disclaimer: "Close the tab and it is gone.",
        };
      },
    },
  });
  const out = await svc.handle({
    method: "POST",
    pathname: "/api/1984/guest",
    query: new URLSearchParams(),
    body: { network: "testnet-10", life: "page-a" },
    ip: "203.0.113.8",
  });
  assert.equal(out.status, 200);
  assert.equal(out.body.key, undefined);
  assert.equal(JSON.stringify(out.body).includes("private"), false);
  assert.match(out.body.disclaimer, /Close the tab/);
});

test("a progress login returns a job the page can poll", async () => {
  const seen = [];
  const { svc } = harness(async () => ({ txids: ["ab"] }), {
    guests: {
      start({ ip, life }) {
        seen.push(ip + ":" + life);
        return { ok: false, pending: true, job: "abc123", step: "Waiting for the till" };
      },
      job(id) {
        if (id !== "abc123") return null;
        return {
          ok: true,
          pending: false,
          job: id,
          step: "Broadcasting",
          address: USER,
          token: "tab",
          sompi: "5000000000000",
          disclaimer: "Close the tab and it is gone.",
        };
      },
    },
  });
  const started = await svc.handle({
    method: "POST",
    pathname: "/api/1984/guest",
    query: new URLSearchParams(),
    body: { network: "testnet-10", life: "page-a", progress: true },
    ip: "203.0.113.8",
  });
  assert.equal(started.status, 202);
  assert.equal(started.body.pending, true);
  assert.equal(started.body.job, "abc123");
  assert.equal(started.body.token, undefined);
  assert.equal(seen[0], "203.0.113.8:page-a");
  const polled = await svc.handle({
    method: "GET",
    pathname: "/api/1984/guest",
    query: new URLSearchParams("job=abc123"),
    body: {},
    ip: "203.0.113.8",
  });
  assert.equal(polled.status, 200);
  assert.equal(polled.body.ok, true);
  assert.equal(polled.body.token, "tab");
  assert.equal(JSON.stringify(polled.body).includes("private"), false);
  const missing = await svc.handle({
    method: "GET",
    pathname: "/api/1984/guest",
    query: new URLSearchParams("job=nope"),
    body: {},
    ip: "203.0.113.8",
  });
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /Try Test without a wallet again/);
});

test("a guest job that carries a key is not returned", async () => {
  const { svc } = harness(async () => ({ txids: ["ab"] }), {
    guests: {
      start() {
        return { ok: false, pending: true, job: "abc", key: "secret-key" };
      },
      job() {
        return { ok: true, pending: false, job: "x", key: "secret-key", token: "tab" };
      },
    },
  });
  const started = await svc.handle({
    method: "POST",
    pathname: "/api/1984/guest",
    query: new URLSearchParams(),
    body: { progress: true, network: "testnet-10" },
    ip: "203.0.113.8",
  });
  assert.equal(started.body.ok, false);
  assert.equal(JSON.stringify(started.body).includes("secret-key"), false);
  const polled = await svc.handle({
    method: "GET",
    pathname: "/api/1984/guest",
    query: new URLSearchParams("job=x"),
    body: {},
    ip: "203.0.113.8",
  });
  assert.equal(polled.status, 404);
  assert.equal(JSON.stringify(polled.body).includes("secret-key"), false);
});

test("a test login that returns a key is refused", async () => {
  const { svc } = harness(async () => ({ txids: ["ab"] }), {
    guests: {
      async open() {
        return { ok: true, address: USER, token: "abc", key: "secret" };
      },
    },
  });
  const out = await svc.handle({
    method: "POST",
    pathname: "/api/1984/guest",
    query: new URLSearchParams(),
    body: {},
    ip: "203.0.113.8",
  });
  assert.equal(out.body.ok, false);
  assert.equal(JSON.stringify(out.body).includes("secret"), false);
});

test("a test spend asks before it pays, then pays once", async () => {
  const calls = [];
  const { svc, read } = harness(async () => ({ txids: ["ab"] }), {
    txTries: 1,
    sleep: async () => {},
    guests: {
      async pay({ sompi }) {
        calls.push(String(sompi));
        return { ok: true, txid: "ab".repeat(32), sompi: String(sompi) };
      },
    },
  });
  const rules = await svc.handle({
    method: "POST",
    pathname: "/api/1984/rules",
    query: new URLSearchParams(),
    body: { address: USER, rules: { confirmOverCents: 5 } },
    ip: "203.0.113.9",
  });
  assert.equal(rules.body.ok, true);
  const held = await svc.handle({
    method: "POST",
    pathname: "/api/1984/guest/spend",
    query: new URLSearchParams(),
    body: { address: USER, token: "abc", shop: "cafe", sku: "water" },
    ip: "203.0.113.9",
  });
  assert.equal(held.status, 409);
  assert.equal(held.body.needsConfirm, true);
  assert.equal(calls.length, 0);
  const paid = await svc.handle({
    method: "POST",
    pathname: "/api/1984/guest/spend",
    query: new URLSearchParams(),
    body: { address: USER, token: "abc", shop: "cafe", sku: "water", confirmed: true },
    ip: "203.0.113.9",
  });
  assert.equal(paid.body.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(read().txids["ab".repeat(32)].kind, "spend");
});

test("a stuck public list still locks when the node has the payment", async () => {
  const id = "d".repeat(64);
  let lookups = 0;
  const { svc, read } = harness(async () => ({ txids: ["ab"] }), {
    txTries: 1,
    sleep: async () => {},
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("info/price")) return { ok: true, json: async () => ({ price: 0.05 }) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
    lookupTx: async (txid) => {
      lookups += 1;
      return txOf(txid, 2_000_000_000);
    },
  });
  const out = await svc.handle({
    method: "POST",
    pathname: "/api/1984/convert",
    query: new URLSearchParams(),
    body: { address: USER, rail: "poc", txid: id },
    ip: "127.0.0.1",
  });
  assert.equal(out.body.ok, true);
  assert.equal(lookups, 1);
  assert.equal(read().accounts[USER].pocBacked, "100");
});

test("a missing node payment stays unswapped", async () => {
  const { svc, read } = harness(async () => ({ txids: ["ab"] }), {
    txTries: 1,
    sleep: async () => {},
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("info/price")) return { ok: true, json: async () => ({ price: 0.05 }) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
    lookupTx: async () => {
      throw new Error("That transaction is not on Testnet 10 yet.");
    },
  });
  const out = await svc.handle({
    method: "POST",
    pathname: "/api/1984/convert",
    query: new URLSearchParams(),
    body: { address: USER, rail: "poc", txid: "e".repeat(64) },
    ip: "127.0.0.1",
  });
  assert.equal(out.body.ok, false);
  assert.match(out.body.error, /public transaction list is behind/);
  assert.equal(read(), null);
});

test("a wallet shop buy is refused or marked ready before any Testnet 10 lookup", async () => {
  let lookups = 0;
  let fetches = 0;
  const { svc, read } = harness(async () => ({ txids: ["ab"] }), {
    txTries: 1,
    sleep: async () => {},
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("info/price")) return { ok: true, json: async () => ({ price: 0.05 }) };
      fetches += 1;
      return { ok: false, status: 404, json: async () => ({}) };
    },
    lookupTx: async () => {
      lookups += 1;
      throw new Error("That transaction is not on Testnet 10 yet.");
    },
  });
  const ip = "203.0.113.41";
  const rules = await svc.handle({
    method: "POST",
    pathname: "/api/1984/rules",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", rules: { confirmOverCents: 5 } },
    ip,
  });
  assert.equal(rules.body.ok, true);
  const held = await svc.handle({
    method: "POST",
    pathname: "/api/1984/spend",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", shop: "cafe", sku: "water", rail: "kas", txid: "" },
    ip,
  });
  assert.equal(held.status, 409);
  assert.equal(held.body.needsConfirm, true);
  const ready = await svc.handle({
    method: "POST",
    pathname: "/api/1984/spend",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", shop: "cafe", sku: "water", rail: "kas", txid: "", confirmed: true },
    ip,
  });
  assert.equal(ready.status, 200);
  assert.equal(ready.body.ok, false);
  assert.equal(ready.body.ready, true);
  assert.equal(ready.body.sompi, sompiForCents(10, 0.05).toString());
  const blocked = await svc.handle({
    method: "POST",
    pathname: "/api/1984/rules",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", rules: { shops: ["roadster"] } },
    ip,
  });
  assert.equal(blocked.body.ok, true);
  const refused = await svc.handle({
    method: "POST",
    pathname: "/api/1984/spend",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", shop: "cafe", sku: "water", rail: "kas", txid: "ab".repeat(32), confirmed: true },
    ip,
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /blocks this shop/);
  assert.equal(lookups, 0);
  assert.equal(fetches, 0);
  assert.equal(read().txids["ab".repeat(32)], undefined);
});

test("a wallet shop buy credits a pasted txid after the rules pass", async () => {
  const id = "cd".repeat(32);
  const sompi = sompiForCents(10, 0.05);
  const { svc, read } = harness(async () => ({ txids: ["ab"] }), {
    txTries: 1,
    sleep: async () => {},
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("info/price")) return { ok: true, json: async () => ({ price: 0.05 }) };
      if (u.includes("/transactions/")) return { ok: true, status: 200, json: async () => txOf(id, sompi) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });
  const out = await svc.handle({
    method: "POST",
    pathname: "/api/1984/spend",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", shop: "cafe", sku: "water", rail: "kas", txid: id, confirmed: true },
    ip: "203.0.113.42",
  });
  assert.equal(out.body.ok, true);
  assert.equal(out.body.item, "Water");
  assert.equal(read().txids[id].kind, "spend");
});

test("a wallet fee quote uses the page rate, and a dead quote stays at 600", async () => {
  const high = harness(async () => ({ txids: ["ab"] }), { feeRate: async () => 2400 });
  const busy = await high.svc.handle({
    method: "GET",
    pathname: "/api/1984/fee",
    query: new URLSearchParams(),
    body: {},
    ip: "203.0.113.51",
  });
  assert.equal(busy.status, 200);
  assert.equal(busy.body.ok, true);
  assert.equal(busy.body.feerate, 2400);
  const low = harness(async () => ({ txids: ["ab"] }), { feeRate: async () => 200 });
  const old = await low.svc.handle({
    method: "GET",
    pathname: "/api/1984/fee",
    query: new URLSearchParams(),
    body: {},
    ip: "203.0.113.53",
  });
  assert.equal(old.body.feerate, 600);
  const down = harness(async () => ({ txids: ["ab"] }), {
    feeRate: async () => {
      throw new Error("no node");
    },
  });
  const quiet = await down.svc.handle({
    method: "GET",
    pathname: "/api/1984/fee",
    query: new URLSearchParams(),
    body: {},
    ip: "203.0.113.52",
  });
  assert.equal(quiet.body.ok, true);
  assert.equal(quiet.body.feerate, 600);
});

test("the old payment path still answers", async () => {
  const { svc } = harness(async () => ({ txid: "aa" }));
  const result = await svc.handle({
    method: "GET",
    pathname: "/api/kworld",
    query: new URLSearchParams(),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.network, "testnet-10");
  assert.equal(result.body.repos.includes("1984"), true);
  assert.equal(result.body.repos.includes("kworld"), false);
});

const OTHER = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

test("a named token opens, increases, stops at the cap, and a send keeps the total", async () => {
  const { svc } = harness(async () => ({ txids: ["ab"] }));
  const mint = (body) =>
    svc.handle({
      method: "POST",
      pathname: "/api/1984/mint",
      query: new URLSearchParams(),
      body: { address: USER, network: "testnet-10", ...body },
      ip: "203.0.113.80",
    });
  const opened = await mint({ option: "new", name: "ash", amount: "5", cap: "8" });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.ok, true);
  assert.match(opened.body.receipt.note, /Last Call, not Final/);
  assert.match(opened.body.receipt.note, /No covenant/);
  assert.equal(opened.body.account.tokens.length, 1);
  assert.equal(opened.body.account.tokens[0].name, "ASH");
  assert.equal(opened.body.account.tokens[0].amount, "5");
  assert.equal(opened.body.token.supply, "5");
  assert.equal(opened.body.token.cap, "8");
  assert.equal(opened.body.mints[0].name, "ASH");

  const again = await mint({ option: "new", name: "ASH", amount: "1", cap: "0" });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /already open/);

  const zero = await mint({ option: "more", name: "ASH", amount: "0" });
  assert.equal(zero.status, 400);
  assert.match(zero.body.error, /above zero/);

  const reserved = await mint({ option: "new", name: "KUSDT", amount: "1", cap: "0" });
  assert.equal(reserved.status, 400);
  assert.match(reserved.body.error, /already a rail/);

  const over = await mint({ option: "more", name: "ASH", amount: "4" });
  assert.equal(over.status, 400);
  assert.match(over.body.error, /passes the cap/);

  const more = await mint({ option: "more", name: "ASH", amount: "3" });
  assert.equal(more.status, 200);
  assert.equal(more.body.account.tokens[0].amount, "8");
  assert.equal(more.body.mints[0].supply, "8");
  assert.match(more.body.receipt.note, /amount increased/);

  const sent = await mint({ option: "send", name: "ASH", amount: "2", to: OTHER });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.account.tokens[0].amount, "6");
  assert.equal(sent.body.mints[0].supply, "8");
  assert.match(sent.body.receipt.note, /Not a covenant/);

  const openCap = await mint({ option: "new", name: "free", amount: "5", cap: "0" });
  assert.equal(openCap.status, 200);
  assert.equal(openCap.body.token.cap, "0");
  assert.match(openCap.body.receipt.note, /Cap 0 means no cap/);
  const past = await mint({ option: "more", name: "FREE", amount: "100" });
  assert.equal(past.status, 200);
  assert.equal(past.body.token.supply, "105");
  assert.equal(past.body.account.tokens.find((row) => row.name === "FREE").amount, "105");

  const blank = await mint({ option: "new", name: "bare", amount: "1", cap: "" });
  assert.equal(blank.status, 200);
  assert.equal(blank.body.token.cap, "0");
  const blankMore = await mint({ option: "more", name: "BARE", amount: "40" });
  assert.equal(blankMore.status, 200);
  assert.equal(blankMore.body.token.supply, "41");

  const wideCap = await mint({ option: "new", name: "wide", amount: "456345634563456", cap: "1455451454" });
  assert.equal(wideCap.status, 400);
  assert.match(wideCap.body.error, /smaller than this amount/);

  const wide = await mint({ option: "new", name: "wide", amount: "456345634563456", cap: "0" });
  assert.equal(wide.status, 200);
  assert.equal(wide.body.token.supply, "456345634563456");
  assert.equal(wide.body.token.cap, "0");

  const huge = await mint({ option: "new", name: "huge", amount: "1000000000000000001", cap: "0" });
  assert.equal(huge.status, 400);
  assert.match(huge.body.error, /too large/);

  const stranger = await svc.handle({
    method: "POST",
    pathname: "/api/1984/mint",
    query: new URLSearchParams(),
    body: { address: OTHER, network: "testnet-10", option: "more", name: "FREE", amount: "7" },
    ip: "203.0.113.83",
  });
  assert.equal(stranger.status, 200);
  assert.equal(stranger.body.account.tokens.find((row) => row.name === "FREE").amount, "7");
  assert.equal(stranger.body.token.supply, "112");

  const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const crowd = await mint({ option: "new", name: "crowd", amount: "1", cap: "0" });
  assert.equal(crowd.status, 200);
  for (let i = 1; i <= 21; i += 1) {
    const address = "kaspatest:" + alphabet[i] + "q".repeat(60);
    const joined = await svc.handle({
      method: "POST",
      pathname: "/api/1984/mint",
      query: new URLSearchParams(),
      body: { address, network: "testnet-10", option: "more", name: "CROWD", amount: "1" },
      ip: "203.0.113.84",
    });
    assert.equal(joined.status, 200, joined.body && joined.body.error);
  }

  const home = await svc.handle({
    method: "GET",
    pathname: "/api/1984",
    query: new URLSearchParams(),
    body: {},
    ip: "203.0.113.81",
  });
  assert.equal(home.status, 200);
  const ash = home.body.mints.find((row) => row.name === "ASH");
  assert.equal(ash.supply, "8");
  assert.equal(ash.holderCount, 2);
  assert.equal(ash.holders[0].amount, "6");
  assert.equal(ash.holders[1].amount, "2");
  assert.equal(ash.holders[1].address, OTHER);
  assert.equal(ash.done, true);
  assert.equal(ash.txs.length, 3);
  assert.equal(ash.txs[0].op, "new");
  assert.equal(ash.txs[1].op, "more");
  assert.equal(ash.txs[2].op, "send");
  assert.equal(ash.txs[2].amount, "2");
  assert.equal(ash.txs[2].to, OTHER);
  const crowdRow = home.body.mints.find((row) => row.name === "CROWD");
  assert.equal(crowdRow.holderCount, 22);
  assert.equal(crowdRow.holders.length, 22);
  const freeRow = home.body.mints.find((row) => row.name === "FREE");
  assert.equal(freeRow.holders.length, 2);
  assert.equal(freeRow.done, false);
  assert.equal(freeRow.txs.length, 3);

  const other = await svc.handle({
    method: "GET",
    pathname: "/api/1984/account",
    query: new URLSearchParams({ address: OTHER }),
    body: {},
    ip: "203.0.113.82",
  });
  assert.equal(other.status, 200);
  assert.equal(other.body.account.tokens.find((row) => row.name === "ASH").amount, "2");
  assert.equal(other.body.account.tokens.find((row) => row.name === "FREE").amount, "7");
});
