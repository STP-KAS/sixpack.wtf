import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { create1984Service } from "./service.mjs";
import {
  canonical,
  domainHex,
  fileStore,
  memoryStore,
  signStatementText,
  statementBody,
  verifyStatementSig,
} from "./statement.mjs";

const USER = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const KEY = "11".repeat(32);
const BOND = { id: "ab".repeat(32), outpoint: "cd".repeat(32) + ":0", status: "live" };

function desk(extra = {}) {
  let state = null;
  const guests = {
    async sessionKey({ token, address }) {
      if (token !== "good" || address !== USER) throw new Error("This test tab does not match that address.");
      return { key: "22".repeat(32), address };
    },
  };
  const svc = create1984Service({
    squareOpen: true,
    load: () => state || { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0", mints: {}, vaults: {} },
    save: (next) => {
      state = next;
    },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    now: () => Date.UTC(2026, 9, 13),
    pay: async () => {
      throw new Error("no pay");
    },
    statementStore: extra.store || memoryStore(),
    attesterKey: extra.attesterKey === undefined ? KEY : extra.attesterKey,
    bond: extra.bond || BOND,
    guests,
    ...extra.rest,
  });
  return {
    svc,
    read: () => state,
    set(next) {
      state = next;
    },
  };
}

function get(svc, day) {
  const query = new URLSearchParams();
  if (day != null) query.set("day", String(day));
  return svc.handle({ method: "GET", pathname: "/api/1984/statement", query, body: {}, ip: "127.0.0.1" });
}

test("the statement body sorts its keys and writes whole numbers as strings", async () => {
  const body = await statementBody({ accounts: {}, mints: {} }, 20000);
  const text = canonical(body);
  assert.equal(text, canonical(JSON.parse(text)));
  assert.match(text, /"day":"20000"/);
  assert.match(text, /"poc_locked_cents":"0"/);
  assert.doesNotMatch(text, /"day":20000/);
  assert.equal(domainHex().length, 64);
  const swapped = { poc_purse_cents: "0", day: "20000" };
  assert.match(canonical(swapped), /^\{"day":"20000","poc_purse_cents":"0"\}$/);
});

test("a signature fails when the sig, the day, or one cent is wrong", async () => {
  const text = canonical(await statementBody({ accounts: {}, mints: {} }, 20000));
  const signed = await signStatementText({ keyHex: KEY, text, day: 20000 });
  assert.equal(await verifyStatementSig(signed), true);
  const last = signed.signature.slice(-2);
  const flipped = last === "00" ? "01" : "00";
  assert.equal(await verifyStatementSig({ ...signed, signature: signed.signature.slice(0, -2) + flipped }), false);
  assert.equal(await verifyStatementSig({ ...signed, day: "20001" }), false);
  const parsed = JSON.parse(signed.text);
  parsed.poc_locked_cents = "1";
  const tampered = { ...signed, text: canonical(parsed) };
  assert.equal(await verifyStatementSig(tampered), false);
  const again = await signStatementText({ keyHex: KEY, text, day: 20000 });
  assert.equal(again.body, signed.body);
  assert.equal(await verifyStatementSig(again), true);
});

test("the till signs one statement for the day and a restart reads the same one", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stmt-"));
  const store = fileStore(dir);
  const first = desk({ store });
  const opened = await get(first.svc);
  assert.equal(opened.status, 200);
  assert.equal(opened.body.signed, true);
  assert.equal(opened.body.bond.status, "live");
  assert.equal(opened.body.bond.id, BOND.id);
  assert.equal(await verifyStatementSig(opened.body), true);
  const practice = await first.svc.handle({
    method: "POST",
    pathname: "/api/1984/practice",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", token: "good" },
    ip: "127.0.0.1",
  });
  assert.equal(practice.status, 200);
  const moved = await get(first.svc);
  assert.equal(moved.body.statement, opened.body.statement);
  assert.equal(moved.body.booksMoved, true);
  const second = desk({ store });
  const again = await get(second.svc);
  assert.equal(again.body.signature, opened.body.signature);
  assert.equal(again.body.text, opened.body.text);
});

test("a closed square still serves the statement and an unsigned till does not invent a sig", async () => {
  const closed = desk({ rest: { squareOpen: false } });
  const row = await get(closed.svc);
  assert.equal(row.status, 200);
  assert.equal(row.body.signed, true);
  const quiet = desk({ attesterKey: "", bond: { id: "", outpoint: "", status: "gone" } });
  const open = await get(quiet.svc);
  assert.equal(open.body.signed, false);
  assert.equal(open.body.signature, "");
  assert.equal(open.body.bond.status, "gone");
});

test("the books line names the day, the hash, and the bond, and it adds no address", () => {
  const src = fs.readFileSync(new URL("./client.mjs", import.meta.url), "utf8");
  const start = src.indexOf("function bondWord");
  const end = src.indexOf("function paintBank");
  const fn = src.slice(start, end);
  assert.match(fn, /bond live/);
  assert.match(fn, /bond unbonding/);
  assert.match(fn, /bond gone/);
  assert.match(fn, /Books · day /);
  assert.doesNotMatch(fn, /kaspatest:|https?:|\d+\.\d+\.\d+\.\d+/);
  assert.match(src, /id="books-line"/);
});
