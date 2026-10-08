/**
 * Public list of funded Testnet-10 test addresses.
 * Reads the local pool, writes addresses and funding txids, and refreshes balances.
 * Never writes a key.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { assertTestnet } from "./money.mjs";

const ROOT = new URL("..", import.meta.url);
const LIST = new URL("./funded-list.json", import.meta.url);
const POOL = new URL("./guest-pool.json", import.meta.url);
const NOTE = "tKAS is Testnet-10 KAS. With tKAS you can go to the bank.";
const WORKTREE = `${homedir().replace(/\\/g, "/")}/sixpack-funded-worktree`;
const WASM =
  process.env.KASPA_WASM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js`;
const WS_FROM =
  process.env.KASPA_WS_FROM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js`;

export function txidsOf(value) {
  const ids = String(value || "")
    .split(/[^0-9a-fA-F]+/)
    .map((part) => part.toLowerCase())
    .filter((part) => /^[0-9a-f]{64}$/.test(part));
  return [...new Set(ids)];
}

/** Address, funding tx, and amount. A key on the input is dropped. */
export function toPublicRow(row) {
  const address = assertTestnet(row && row.address);
  const txid = txidsOf(row && row.txid);
  if (!txid.length) throw new Error("A funded address needs its transaction.");
  const sompi = BigInt(row && row.sompi);
  if (sompi <= 0n) throw new Error("A funded address needs tKAS.");
  return { address, txid: txid.join(","), sompi: sompi.toString() };
}

/** Refuse a public file that still carries a private key or the funding wallet. */
export function assertNoSecrets(encoded, secrets, home) {
  const text = String(encoded || "");
  if (text.includes('"key"')) throw new Error("The public list kept a key.");
  const treasury = String(home || "");
  if (treasury.length > 20 && text.includes(treasury)) throw new Error("The public list names the funding wallet.");
  for (const secret of secrets || []) {
    const key = String(secret || "");
    if (key.length >= 32 && text.includes(key)) throw new Error("The public list kept a key.");
  }
}

export function toPublicList(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (row && row.ready === false) continue;
    const pub = toPublicRow(row);
    if (seen.has(pub.address)) continue;
    seen.add(pub.address);
    out.push(pub);
  }
  out.sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
  return out;
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function issuedSecrets() {
  const url = new URL("./guest-pool-issued.jsonl", import.meta.url);
  if (!existsSync(url)) return [];
  const out = [];
  for (const line of readFileSync(url, "utf8").split(/\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && row.key) out.push(String(row.key));
    } catch {
      /* A broken issued line is not a public row. */
    }
  }
  return out;
}

function mergeRows(existing, fresh) {
  const byAddress = new Map();
  for (const row of existing || []) {
    const pub = toPublicRow(row);
    byAddress.set(pub.address, pub);
  }
  for (const row of fresh) byAddress.set(row.address, row);
  return [...byAddress.values()].sort((a, b) => (a.address < b.address ? -1 : 1));
}

async function balances(addresses) {
  const require = createRequire(WS_FROM);
  globalThis.WebSocket = require("websocket").w3cwebsocket;
  const kaspa = await import(pathToFileURL(WASM).href);
  const rpc = new kaspa.RpcClient({
    url: process.env.FAUCET_RPC || "127.0.0.1:17210",
    networkId: "testnet-10",
    encoding: kaspa.Encoding.Borsh,
  });
  await rpc.connect();
  const totals = new Map(addresses.map((address) => [address, 0n]));
  try {
    const info = await rpc.getServerInfo();
    if (!String(info.networkId || "").includes("testnet-10") || !info.isSynced) {
      throw new Error("The Testnet-10 node is not ready.");
    }
    for (let i = 0; i < addresses.length; i += 80) {
      const chunk = addresses.slice(i, i + 80);
      const utx = await rpc.getUtxosByAddresses({ addresses: chunk });
      for (const entry of utx.entries || []) {
        const address = String(entry.address && entry.address.toString ? entry.address.toString() : entry.address);
        if (!totals.has(address)) continue;
        totals.set(address, totals.get(address) + BigInt(entry.amount));
      }
    }
  } finally {
    await rpc.disconnect().catch(() => {});
  }
  return totals;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function sameBalances(prev, next) {
  const pack = (body) => (body && body.rows || [])
    .map((row) => [row.address, row.txid, row.sompi, row.balanceSompi == null ? "" : String(row.balanceSompi)].join("\t"))
    .join("\n");
  return pack(prev) === pack(next);
}

function publish(listPath) {
  const repo = filePath(ROOT);
  if (!existsSync(WORKTREE)) {
    mkdirSync(WORKTREE, { recursive: true });
    git(["worktree", "add", "--detach", WORKTREE, "origin/main"], repo);
  }
  git(["fetch", "origin", "main"], WORKTREE);
  git(["reset", "--hard", "origin/main"], WORKTREE);
  const dest = WORKTREE + "/1984/funded-list.json";
  if (existsSync(dest)) {
    const prev = readJson(dest);
    const next = readJson(listPath);
    if (sameBalances(prev, next)) return false;
  }
  copyFileSync(listPath, dest);
  const diff = git(["status", "--porcelain", "--", "1984/funded-list.json"], WORKTREE).trim();
  if (!diff) return false;
  git(["add", "--", "1984/funded-list.json"], WORKTREE);
  git(
    [
      "-c",
      "user.name=STP-KAS",
      "-c",
      "user.email=227352643+STP-KAS@users.noreply.github.com",
      "commit",
      "-m",
      "Update the funded test-address list.",
    ],
    WORKTREE
  );
  git(["pull", "--rebase", "origin", "main"], WORKTREE);
  git(["push", "origin", "HEAD:main"], WORKTREE);
  return true;
}

function filePath(url) {
  return decodeURIComponent(url.pathname.replace(/^\//, "").replace(/\//g, "\\")).replace(/^([A-Za-z])\|/, "$1:");
}

async function main() {
  let existing = [];
  if (existsSync(LIST)) {
    const parsed = readJson(LIST);
    existing = Array.isArray(parsed.rows) ? parsed.rows : [];
  }
  let fresh = [];
  let secrets = issuedSecrets();
  let home = "";
  if (existsSync(POOL)) {
    const pool = readJson(POOL);
    home = String(pool.home || "");
    fresh = toPublicList(pool.wallets || []);
    for (const row of pool.wallets || []) {
      if (row && row.key) secrets.push(String(row.key));
    }
  }
  const rows = mergeRows(existing, fresh);
  if (!rows.length) throw new Error("No funded test addresses to list.");
  let held = null;
  try {
    held = await balances(rows.map((row) => row.address));
  } catch {
    held = null;
  }
  const body = {
    network: "testnet-10",
    updated: new Date().toISOString(),
    count: rows.length,
    note: NOTE,
    rows: rows.map((row) => ({
      address: row.address,
      txid: row.txid,
      sompi: row.sompi,
      balanceSompi: held ? (held.get(row.address) ?? 0n).toString() : null,
    })),
  };
  const encoded = JSON.stringify(body, null, 2) + "\n";
  assertNoSecrets(encoded, secrets, home);
  writeFileSync(LIST, encoded);
  const pushed = process.argv.includes("--publish") ? publish(filePath(LIST)) : false;
  process.stdout.write("listed " + body.count + (pushed ? " pushed" : "") + "\n");
}

if (process.argv[1] && process.argv[1].endsWith("refresh-funded-list.mjs")) {
  main().catch((err) => {
    const msg = String((err && err.message) || "The funded list failed.").replace(/[0-9a-fA-F]{32,}/g, "");
    process.stderr.write(msg.slice(0, 180) + "\n");
    process.exit(1);
  });
}
