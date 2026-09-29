import assert from "node:assert/strict";
import test from "node:test";
import { createKworldService } from "./service.mjs";
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

function harness(pay) {
  let state = null;
  const saved = [];
  const svc = createKworldService({
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
  });
  return { svc, saved, read: () => state };
}

test("a failed redeem puts the toy balance back", async () => {
  const { svc, read } = harness(async () => {
    throw new Error("node down");
  });
  const id = "c".repeat(64);
  const minted = await svc.handle({
    method: "POST",
    pathname: "/api/kworld/convert",
    query: new URLSearchParams(),
    body: { address: USER, rail: "poc", txid: id },
    ip: "127.0.0.1",
  });
  assert.equal(minted.body.ok, true);
  assert.equal(read().accounts[USER].pocBacked, "100");
  const redeemed = await svc.handle({
    method: "POST",
    pathname: "/api/kworld/redeem",
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
    pathname: "/api/kworld/practice",
    query: new URLSearchParams(),
    body: { address: "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", network: "mainnet" },
    ip: "127.0.0.1",
  });
  assert.equal(out.body.ok, false);
  assert.match(out.body.error, /Mainnet/);
});
