import assert from "node:assert/strict";
import test from "node:test";
import { create1984Service } from "./service.mjs";
import { RESERVE } from "./money.mjs";

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

test("one tKAS locks five cents, and redeeming one toy dollar does not", async () => {
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

test("a failed redeem puts the toy balance back", async () => {
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
