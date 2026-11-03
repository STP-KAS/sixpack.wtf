// Fund prepaid devnet wallets from coins this desk already mined.
// Keys are written only to gitignored 1985/guest-pool.json. This script prints no key.

import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { devnetRpc } from "./chain.mjs";
import { GIFT_SOMPI, WALLET_COUNT, isDevnetAddress, matureEntry, parseStpLock, splitScript } from "./script.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const KEYS = "C:\\kaspa-stpnet\\wallets\\keys.txt";
const POOL = join(ROOT, "guest-pool.json");
const LIST = join(ROOT, "funded-list.json");
const MINE = "C:\\Users\\Remco\\Documents\\kaspa\\stpnet\\target\\release\\stp-mine.exe";
const GRPC = "grpc://127.0.0.1:16610";
const secrets = [];

function hide(text) {
  let out = String(text);
  for (const secret of secrets) {
    if (secret && secret.length >= 16) out = out.split(secret).join("[redacted]");
  }
  return out;
}

function say(text) {
  process.stdout.write(`${hide(text)}\n`);
}

function writeJson(file, body) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(body, null, 2));
  renameSync(tmp, file);
}

function loadNamed(kaspa) {
  const found = {};
  for (const line of readFileSync(KEYS, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 3) throw new Error("keys file line is not name, secret, address");
    const [name, secret, address] = parts;
    secrets.push(secret.toLowerCase());
    if (!isDevnetAddress(address)) throw new Error(`${name} is not a devnet address`);
    const key = new kaspa.PrivateKey(secret);
    if (key.toAddress("devnet").toString() !== address) throw new Error(`${name} key does not match its address`);
    found[name] = { key, address };
  }
  if (!found.one || !found.three) throw new Error("wallet one or three is missing");
  return found;
}

function freshKey(kaspa) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const secret = crypto.randomBytes(32).toString("hex");
    try {
      const key = new kaspa.PrivateKey(secret);
      const address = key.toAddress("devnet").toString();
      if (typeof key.free === "function") key.free();
      if (!isDevnetAddress(address)) continue;
      secrets.push(secret);
      return { secret, address };
    } catch {
      /* not a valid scalar */
    }
  }
  throw new Error("could not make a devnet key");
}

function outputAddress(kaspa, output) {
  const parts = splitScript(output.scriptPublicKey);
  const spk = new kaspa.ScriptPublicKey(parts.version, Buffer.from(parts.script).toString("hex"));
  return String(kaspa.addressFromScriptPublicKey(spk, "devnet"));
}

async function balances(rpc, addresses) {
  const dag = await rpc.getBlockDagInfo();
  const rows = [];
  for (const address of addresses) {
    const bag = await rpc.getUtxosByAddresses([address]);
    let spendable = 0n;
    for (const entry of bag.entries || []) {
      if (parseStpLock(entry.scriptPublicKey)) continue;
      if (!matureEntry(entry, dag.virtualDaaScore ?? 0)) continue;
      spendable += BigInt(entry.amount ?? 0);
    }
    rows.push(spendable);
  }
  return { virtualDaa: String(dag.virtualDaaScore), rows };
}

function mine(address) {
  const result = spawnSync(MINE, [address, "1", GRPC], {
    encoding: "utf8",
    timeout: 180000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`miner exited ${result.status}`);
}

function publish(pool) {
  writeJson(LIST, {
    network: "devnet",
    giftSompi: String(pool.eachSompi),
    note: "Prepaid Kaspa on a private DevNet. This file has no keys. STP is not included.",
    wallets: pool.wallets.map((row) => ({ address: row.address, sompi: String(row.sompi) })),
  });
}

async function confirm(rpc, pool) {
  let seen = await balances(rpc, pool.wallets.map((row) => row.address));
  const short = () => seen.rows.some((amount) => amount < BigInt(pool.eachSompi));
  if (short()) {
    say(`mining one block to settle ${pool.txid || "the prepaid send"}`);
    mine(pool.miner);
    seen = await balances(rpc, pool.wallets.map((row) => row.address));
  }
  if (short()) {
    say(`not ready virtual=${seen.virtualDaa} txid=${pool.txid || ""}`);
    return false;
  }
  for (const row of pool.wallets) row.ready = true;
  writeJson(POOL, pool);
  publish(pool);
  say(`ready ${pool.wallets.length} gift=${pool.eachSompi} virtual=${seen.virtualDaa} txid=${pool.txid || ""}`);
  return true;
}

async function main() {
  const { kaspa, rpc } = await devnetRpc();
  if (existsSync(POOL)) {
    const existing = JSON.parse(readFileSync(POOL, "utf8"));
    if (existing && Array.isArray(existing.wallets) && existing.wallets.length) {
      for (const row of existing.wallets) if (row && row.key) secrets.push(String(row.key).toLowerCase());
      await confirm(rpc, existing);
      return;
    }
  }
  const wallets = loadNamed(kaspa);
  const dag = await rpc.getBlockDagInfo();
  const listed = await rpc.getUtxosByAddresses([wallets.one.address]);
  const coins = (listed.entries || []).filter((entry) => {
    if (parseStpLock(entry.scriptPublicKey)) return false;
    if (!matureEntry(entry, dag.virtualDaaScore ?? 0)) return false;
    return BigInt(entry.amount ?? 0) === GIFT_SOMPI;
  });
  const need = WALLET_COUNT + 1;
  if (coins.length < need) throw new Error(`mature 22 KAS coins are ${coins.length}, need ${need}`);
  const picked = coins.slice(0, need);
  const made = [];
  for (let i = 0; i < WALLET_COUNT; i += 1) made.push(freshKey(kaspa));
  let feeRate = 1;
  try {
    const est = await rpc.getFeeEstimate({});
    const quoted = Number(est?.estimate?.priorityBucket?.feerate || 0);
    if (quoted > 0) feeRate = quoted;
  } catch { /* floor stays 1 */ }
  const { transactions } = await kaspa.createTransactions({
    entries: picked,
    outputs: made.map((row) => ({ address: row.address, amount: GIFT_SOMPI })),
    priorityFee: 0n,
    feeRate,
    changeAddress: wallets.one.address,
    networkId: "devnet",
  });
  const paid = new Map();
  for (const pending of transactions) {
    for (const output of pending.transaction.outputs || []) {
      const address = outputAddress(kaspa, output);
      const value = BigInt(output.value ?? output.amount ?? 0);
      paid.set(address, (paid.get(address) || 0n) + value);
    }
  }
  for (const row of made) {
    if (paid.get(row.address) !== GIFT_SOMPI) throw new Error("a prepaid output is not 22 KAS");
  }
  const ids = [];
  try {
    for (const pending of transactions) {
      await pending.sign([wallets.one.key]);
      ids.push(String(await pending.submit(rpc)));
    }
  } finally {
    if (typeof wallets.one.key.free === "function") wallets.one.key.free();
    if (typeof wallets.three.key.free === "function") wallets.three.key.free();
  }
  const pool = {
    miner: wallets.three.address,
    home: wallets.one.address,
    eachSompi: GIFT_SOMPI.toString(),
    txid: ids[0] || "",
    wallets: made.map((row) => ({
      address: row.address,
      key: row.secret,
      sompi: GIFT_SOMPI.toString(),
      txid: ids[0] || "",
      ready: false,
    })),
  };
  writeJson(POOL, pool);
  say(`broadcast wallets=${made.length} txid=${pool.txid} inputs=${picked.length}`);
  await confirm(rpc, pool);
}

main()
  .catch((error) => {
    process.stderr.write(`${hide(error && error.stack ? error.stack : error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { dropRpc } = await import("./chain.mjs");
      dropRpc();
    } catch { /* the node may already be closed */ }
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  });
