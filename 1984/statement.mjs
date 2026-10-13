/** One bank statement per UTC day. The attester key never enters this file. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { blake3Hex } from "./kcc20.mjs";
import { SHOPS } from "./world.mjs";

export const DOMAIN_LABEL = "sixpack-1984-bank-v1";

const kit = path.join(path.dirname(fileURLToPath(import.meta.url)), "statement-kit", "node_modules");
let noblePromise;

function loadNoble() {
  if (!noblePromise) {
    const curves = pathToFileURL(path.join(kit, "@noble", "curves", "esm", "secp256k1.js")).href;
    const blake2 = pathToFileURL(path.join(kit, "@noble", "hashes", "esm", "blake2b.js")).href;
    const blake3 = pathToFileURL(path.join(kit, "@noble", "hashes", "esm", "blake3.js")).href;
    noblePromise = Promise.all([import(curves), import(blake2), import(blake3)]).then(([c, b2, b3]) => ({
      schnorr: c.schnorr,
      blake2b: b2.blake2b,
      blake3: b3.blake3,
    }));
  }
  return noblePromise;
}

export function domainHex() {
  return blake3Hex(new TextEncoder().encode(DOMAIN_LABEL));
}

export function utcDay(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) throw new Error("The day needs a clock.");
  return Math.floor(n / 86_400_000);
}

function whole(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("A statement number has to be a whole number.");
    return BigInt(value);
  }
  const text = String(value ?? "0").trim();
  if (!/^-?\d+$/.test(text)) return null;
  return BigInt(text);
}

function asString(value) {
  const n = whole(value);
  return n == null ? String(value ?? "") : n.toString();
}

function sortValue(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "bigint" || typeof value === "number") return asString(value);
  if (typeof value === "string") return /^-?\d+$/.test(value.trim()) ? value.trim() : value;
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  throw new Error("That value cannot go in a statement.");
}

/** Sorted keys. Whole numbers are JSON strings. No spaces. */
export function canonical(value) {
  return JSON.stringify(sortValue(value));
}

export function outpointOf(lock) {
  const txid = String((lock && lock.txid) || "").toLowerCase();
  if (/^[0-9a-f]{64}$/.test(txid) && lock.index != null && String(lock.index) !== "") {
    const index = Number(lock.index);
    if (Number.isInteger(index) && index >= 0) return txid + ":" + String(index);
  }
  const id = String((lock && lock.id) || "").toLowerCase();
  const match = id.match(/^([0-9a-f]{64}):(\d+)$/);
  return match ? match[1] + ":" + String(Number(match[2])) : "";
}

export function squarepegLocks(state) {
  const rows = [];
  const accounts = (state && state.accounts) || {};
  for (const account of Object.values(accounts)) {
    const locks = Array.isArray(account && account.chainLocks) ? account.chainLocks : [];
    for (const lock of locks) {
      const outpoint = outpointOf(lock);
      const rail = lock && (lock.rail === "kusdt" || lock.rail === "poc") ? lock.rail : "";
      if (!outpoint || !rail) continue;
      rows.push({ outpoint, sompi: asString(lock.sompi || "0"), rail });
    }
  }
  rows.sort((a, b) => (a.outpoint < b.outpoint ? -1 : a.outpoint > b.outpoint ? 1 : a.rail < b.rail ? -1 : a.rail > b.rail ? 1 : 0));
  return rows;
}

function ledgerProjection(state) {
  const accounts = Object.values((state && state.accounts) || {})
    .map((account) => {
      const locks = (Array.isArray(account.chainLocks) ? account.chainLocks : [])
        .map((lock) => ({
          outpoint: outpointOf(lock),
          sompi: asString(lock.sompi || "0"),
          cents: asString(lock.cents || "0"),
          rail: String(lock.rail || ""),
          frozen: lock.frozen ? "1" : "0",
        }))
        .filter((row) => row.outpoint)
        .sort((a, b) => a.outpoint.localeCompare(b.outpoint));
      return {
        address: String(account.address || "").toLowerCase(),
        poc: asString(account.poc || "0"),
        kusdt: asString(account.kusdt || "0"),
        pocBacked: asString(account.pocBacked || "0"),
        kusdtBacked: asString(account.kusdtBacked || "0"),
        pocLiability: asString(account.pocLiability || "0"),
        kusdtLiability: asString(account.kusdtLiability || "0"),
        liability: asString(account.liability || "0"),
        kusdtFrozen: account.kusdtFrozen ? "1" : "0",
        locks,
      };
    })
    .sort((a, b) => a.address.localeCompare(b.address));
  return { accounts };
}

function mintProjection(state) {
  const book = (state && state.mints) || {};
  return Object.keys(book)
    .sort()
    .map((extension) => {
      const row = book[extension] || {};
      return {
        extension,
        name: String(row.name || ""),
        supply: asString(row.supply || "0"),
        cap: asString(row.cap || "0"),
        opener: String(row.opener || "").toLowerCase(),
      };
    });
}

function priceProjection() {
  return SHOPS.map((shop) => ({
    id: shop.id,
    items: (shop.items || [])
      .map((item) => ({ sku: item.sku, cents: asString(item.cents) }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
  })).sort((a, b) => a.id.localeCompare(b.id));
}

async function blake3hex(text) {
  const { blake3 } = await loadNoble();
  return bytesToHex(blake3(new TextEncoder().encode(text), { dkLen: 32 }));
}

export async function statementBody(state, day) {
  let pocLocked = 0n;
  let pocPurse = 0n;
  let kusdtLocked = 0n;
  let kusdtPurse = 0n;
  let frozen = 0n;
  for (const account of Object.values((state && state.accounts) || {})) {
    const poc = whole(account.poc || "0");
    const pocBacked = whole(account.pocBacked || "0");
    const kusdt = whole(account.kusdt || "0");
    const kusdtBacked = whole(account.kusdtBacked || "0");
    let chainPoc = 0n;
    let chainKusdt = 0n;
    let chainFrozen = false;
    for (const lock of Array.isArray(account.chainLocks) ? account.chainLocks : []) {
      if (lock.rail === "poc") chainPoc += whole(lock.cents || "0");
      if (lock.rail === "kusdt") {
        chainKusdt += whole(lock.cents || "0");
        if (lock.frozen) chainFrozen = true;
      }
    }
    pocLocked += pocBacked + chainPoc;
    if (poc > pocBacked) pocPurse += poc - pocBacked;
    kusdtLocked += kusdtBacked + chainKusdt;
    if (kusdt > kusdtBacked) kusdtPurse += kusdt - kusdtBacked;
    if (account.kusdtFrozen || chainFrozen) frozen += 1n;
  }
  const locks = squarepegLocks(state);
  const sompi = locks.reduce((sum, row) => sum + whole(row.sompi), 0n);
  return {
    day: String(day),
    ledger_state_blake3: await blake3hex(canonical(ledgerProjection(state))),
    mint_book_blake3: await blake3hex(canonical(mintProjection(state))),
    price_list_blake3: await blake3hex(canonical(priceProjection())),
    squarepeg_locks: locks,
    squarepeg_locked_sompi_total: sompi.toString(),
    poc_locked_cents: pocLocked.toString(),
    poc_purse_cents: pocPurse.toString(),
    kusdt_locked_cents: kusdtLocked.toString(),
    kusdt_purse_cents: kusdtPurse.toString(),
    kusdt_frozen_count: frozen.toString(),
  };
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const text = String(hex || "").trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(text) || text.length % 2) throw new Error("That hex does not parse.");
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function epochBytes(epoch) {
  const n = BigInt(epoch);
  if (n < 0n) throw new Error("The day is not a UTC day number.");
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, Number(n & 0xffffffffn), true);
  view.setUint32(4, Number((n >> 32n) & 0xffffffffn), true);
  return out;
}

async function digestOf(day, body) {
  const { blake2b } = await loadNoble();
  const msg = new Uint8Array(72);
  msg.set(hexToBytes(domainHex()), 0);
  msg.set(epochBytes(day), 32);
  msg.set(body, 40);
  return blake2b(msg, { dkLen: 32 });
}

export async function signStatementText({ keyHex, text, day }) {
  const { schnorr, blake2b } = await loadNoble();
  const key = hexToBytes(keyHex);
  if (key.length !== 32) throw new Error("The statement key is not 32 bytes.");
  const body = blake2b(new TextEncoder().encode(text), { dkLen: 32 });
  const digest = await digestOf(day, body);
  const signature = schnorr.sign(digest, key);
  return {
    day: String(day),
    domain: domainHex(),
    text,
    body: bytesToHex(body),
    statement: bytesToHex(digest),
    signature: bytesToHex(signature),
    attester: bytesToHex(schnorr.getPublicKey(key)),
  };
}

export async function verifyStatementSig(record) {
  try {
    const { schnorr, blake2b } = await loadNoble();
    if (!record || String(record.domain || "").toLowerCase() !== domainHex()) return false;
    const parsed = JSON.parse(record.text);
    if (String(parsed.day) !== String(record.day)) return false;
    if (canonical(parsed) !== record.text) return false;
    const body = blake2b(new TextEncoder().encode(record.text), { dkLen: 32 });
    if (bytesToHex(body) !== String(record.body || "").toLowerCase()) return false;
    const digest = await digestOf(record.day, body);
    if (bytesToHex(digest) !== String(record.statement || "").toLowerCase()) return false;
    return schnorr.verify(hexToBytes(record.signature), digest, hexToBytes(record.attester));
  } catch {
    return false;
  }
}

export function memoryStore() {
  const rows = new Map();
  return {
    read(day) {
      return rows.has(String(day)) ? rows.get(String(day)) : null;
    },
    write(day, record) {
      rows.set(String(day), record);
    },
  };
}

export function fileStore(dir) {
  return {
    read(day) {
      const file = path.join(dir, "day-" + day + ".json");
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, "utf8"));
    },
    write(day, record) {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "day-" + day + ".json");
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(record));
      fs.renameSync(tmp, file);
    },
  };
}

export function emptyBond() {
  return { id: "", outpoint: "", status: "gone" };
}

export function readBondFile(file) {
  if (!file || !fs.existsSync(file)) return emptyBond();
  const row = JSON.parse(fs.readFileSync(file, "utf8"));
  const status = row.status === "live" || row.status === "unbonding" ? row.status : "gone";
  const id = String(row.id || "").toLowerCase();
  const outpoint = String(row.outpoint || "").toLowerCase();
  if (id && !/^[0-9a-f]{64}$/.test(id)) throw new Error("The bond id is not a covenant id.");
  if (outpoint && !/^[0-9a-f]{64}:\d+$/.test(outpoint)) throw new Error("The bond outpoint is not an outpoint.");
  return { id, outpoint, status };
}

export function readKeyFile(file) {
  if (!file) return "";
  if (!fs.existsSync(file)) return "";
  const text = fs.readFileSync(file, "utf8").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error("The statement key file is not a 32-byte key.");
  return text;
}

function utxoRows(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.utxos)) return body.utxos;
  if (body && Array.isArray(body.entries)) return body.entries;
  return [];
}

function rowOutpoint(row) {
  const point = row && (row.outpoint || row);
  const txid = String(
    (point && (point.transactionId || point.transaction_id || point.txid)) || row.transactionId || row.txid || ""
  ).toLowerCase();
  const index = point && point.index != null ? point.index : row.index;
  return /^[0-9a-f]{64}$/.test(txid) && index != null ? txid + ":" + String(Number(index)) : "";
}

/** An outpoint is unspent when the output's address still lists it. */
export async function outpointLive(outpoint, fetchFn, base) {
  const match = String(outpoint || "").toLowerCase().match(/^([0-9a-f]{64}):(\d+)$/);
  if (!match) return { ok: false, reason: "outpoint" };
  const txRes = await fetchFn(String(base).replace(/\/$/, "") + "/transactions/" + match[1]);
  if (!txRes.ok) return { ok: false, reason: "missing" };
  const tx = await txRes.json();
  const outputs = Array.isArray(tx.outputs) ? tx.outputs : [];
  const output = outputs.find((row) => Number(row.index) === Number(match[2]));
  if (!output) return { ok: false, reason: "no-output" };
  const address = output.script_public_key_address;
  if (!address) return { ok: false, reason: "no-address" };
  const utxoRes = await fetchFn(String(base).replace(/\/$/, "") + "/addresses/" + encodeURIComponent(address) + "/utxos");
  if (!utxoRes.ok) return { ok: false, reason: "utxo-list" };
  const rows = utxoRows(await utxoRes.json());
  const hit = rows.some((row) => rowOutpoint(row) === match[1] + ":" + String(Number(match[2])));
  return {
    ok: hit,
    reason: hit ? "unspent" : "spent",
    covenantId: String(output.covenant_id || "").toLowerCase(),
  };
}

export async function verifyRecord(record, options = {}) {
  const errors = [];
  if (!(await verifyStatementSig(record))) errors.push("signature");
  const bond = record && record.bond ? record.bond : emptyBond();
  if (bond.status === "live" && !/^[0-9a-f]{64}$/.test(String(bond.id || ""))) errors.push("bond");
  const fetchFn = options.fetch;
  const base = options.base || "https://api-tn10.kaspa.org";
  if (fetchFn && record && record.text) {
    let locks = [];
    try {
      locks = JSON.parse(record.text).squarepeg_locks || [];
    } catch {
      errors.push("text");
    }
    for (const lock of locks) {
      const live = await outpointLive(lock.outpoint, fetchFn, base);
      if (!live.ok) errors.push("lock " + lock.outpoint);
    }
    if (bond.status === "live" || bond.status === "unbonding") {
      const live = await outpointLive(bond.outpoint, fetchFn, base);
      if (!live.ok) errors.push("bond-spent");
      else if (bond.id && live.covenantId && live.covenantId !== bond.id) errors.push("bond-id");
    }
    if (bond.status === "gone" && bond.outpoint && options.goneMustBeSpent) {
      const live = await outpointLive(bond.outpoint, fetchFn, base);
      if (live.ok) errors.push("bond-still-there");
    }
  }
  return { ok: errors.length === 0, errors };
}
