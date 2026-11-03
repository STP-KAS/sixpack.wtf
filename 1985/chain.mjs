/** Read-only view of the private half DevNet. It does not mine and it does not spend. */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  coinbaseRewards,
  hexOf,
  parentHash,
  splitScript,
} from "./script.mjs";

export const RPC_URL = "ws://127.0.0.1:17610";
export const NETWORK = "devnet";
const WASM = "C:\\Users\\Remco\\Documents\\kaspa\\tn10-core-stress\\sdk\\kaspa-wasm32-sdk\\nodejs\\kaspa\\kaspa.js";
const ROOT = "C:\\Users\\Remco\\Documents\\kaspa\\kas-vault-lab";

let kaspaPromise = null;
let rpcPromise = null;
let cache = null;
let cacheAt = 0;
let loading = null;

export function loadKaspa() {
  if (!kaspaPromise) {
    kaspaPromise = (async () => {
      const require = createRequire(`${ROOT}\\package.json`);
      globalThis.WebSocket = require("websocket").w3cwebsocket;
      return import(pathToFileURL(WASM).href);
    })();
  }
  return kaspaPromise;
}

export async function connectDevnet(kaspa) {
  const rpc = new kaspa.RpcClient({
    url: RPC_URL,
    encoding: kaspa.Encoding.Borsh,
    networkId: NETWORK,
  });
  await rpc.connect();
  const info = await rpc.getServerInfo();
  if (String(info.networkId) !== NETWORK) {
    try { await rpc.disconnect(); } catch { /* already closing */ }
    throw new Error(`The node answered ${info.networkId}. This page stays on devnet.`);
  }
  return { rpc, info };
}

function sharedRpc(kaspa) {
  if (!rpcPromise) {
    rpcPromise = connectDevnet(kaspa).catch((error) => {
      rpcPromise = null;
      throw error;
    });
  }
  return rpcPromise;
}

export function dropRpc() {
  const current = rpcPromise;
  rpcPromise = null;
  cache = null;
  cacheAt = 0;
  if (!current) return;
  current.then((row) => row.rpc.disconnect()).catch(() => {});
}

export async function devnetRpc() {
  const kaspa = await loadKaspa();
  const { rpc } = await sharedRpc(kaspa);
  return { kaspa, rpc };
}

function asString(value) {
  if (typeof value === "bigint") return value.toString();
  if (value == null) return "";
  return String(value);
}

function addressOf(kaspa, script) {
  if (!script || !script.length) return "";
  try {
    const spk = new kaspa.ScriptPublicKey(0, Buffer.from(script).toString("hex"));
    return String(kaspa.addressFromScriptPublicKey(spk, NETWORK));
  } catch {
    return "";
  }
}

function summarize(block, kaspa) {
  const header = block.header || {};
  const hash = hexOf(header.hash || block.verboseData?.hash || "");
  const txs = block.transactions || [];
  const coinbase = txs.find((tx) => !(tx.inputs || []).length) || null;
  const reward = coinbaseRewards(coinbase ? coinbase.outputs || [] : []);
  return {
    hash,
    daa: asString(header.daaScore),
    blue: asString(header.blueScore),
    time: asString(header.timestamp),
    txCount: txs.length,
    miner: addressOf(kaspa, reward.minerScript),
    free: reward.free.toString(),
    locked: reward.locked.toString(),
    face: reward.face.toString(),
    fees: reward.fees == null ? "" : reward.fees.toString(),
    parent: parentHash(header),
  };
}

async function pageBlocks(rpc) {
  const dag = await rpc.getBlockDagInfo();
  const seen = new Map();
  let low = dag.pruningPointHash;
  for (let round = 0; round < 40; round += 1) {
    const page = await rpc.getBlocks({
      lowHash: low,
      includeBlocks: true,
      includeTransactions: true,
    });
    const list = page.blocks || [];
    if (!list.length) break;
    let added = 0;
    for (const block of list) {
      const rowHash = hexOf(block.header?.hash || "");
      if (!rowHash || seen.has(rowHash)) continue;
      seen.set(rowHash, block);
      added += 1;
    }
    const next = hexOf(list[list.length - 1].header?.hash || "");
    if (!added || !next || next === hexOf(low)) break;
    low = next;
    if (next === hexOf(dag.sink)) break;
  }
  if (!seen.has(hexOf(dag.sink))) {
    let hash = hexOf(dag.sink);
    for (let step = 0; step < 64 && hash && !seen.has(hash); step += 1) {
      const bag = await rpc.getBlock({ hash, includeTransactions: true });
      const block = bag.block || bag;
      const rowHash = hexOf(block.header?.hash || hash);
      seen.set(rowHash, block);
      hash = parentHash(block.header || {});
    }
  }
  return { dag, blocks: [...seen.values()] };
}

function minerRows(blocks) {
  const rows = new Map();
  for (const block of blocks) {
    if (!block.miner) continue;
    const row = rows.get(block.miner) || {
      address: block.miner,
      blocks: 0,
      free: 0n,
      locked: 0n,
      face: 0n,
      fees: 0n,
    };
    row.blocks += 1;
    row.free += BigInt(block.free || 0);
    row.locked += BigInt(block.locked || 0);
    row.face += BigInt(block.face || 0);
    row.fees += BigInt(block.fees || 0);
    rows.set(block.miner, row);
  }
  return [...rows.values()]
    .sort((a, b) => b.blocks - a.blocks || (a.address < b.address ? -1 : 1))
    .map((row) => ({
      address: row.address,
      blocks: row.blocks,
      free: row.free.toString(),
      locked: row.locked.toString(),
      face: row.face.toString(),
      fees: row.fees.toString(),
    }));
}

export async function readSnapshot(kaspa, rpc) {
  const { dag, blocks } = await pageBlocks(rpc);
  const rows = blocks.map((block) => summarize(block, kaspa)).filter((row) => row.hash);
  const daaOf = (row) => {
    try { return BigInt(row.daa || 0); } catch { return 0n; }
  };
  rows.sort((a, b) => (daaOf(a) < daaOf(b) ? 1 : daaOf(a) > daaOf(b) ? -1 : 0));
  const latest = rows.find((row) => row.free !== "0" || row.locked !== "0") || rows[0] || null;
  let supply = "";
  let mempool = "";
  try {
    const coins = await rpc.getCoinSupply();
    supply = asString(coins.circulatingSompi ?? coins.circulatingSupply ?? "");
  } catch { /* the page still has the blocks */ }
  try {
    const pool = await rpc.getMempoolEntries({});
    const entries = pool.mempoolEntries || pool.entries || [];
    mempool = String(entries.length);
  } catch { /* mempool size is optional */ }
  return {
    ok: true,
    network: NETWORK,
    virtualDaa: asString(dag.virtualDaaScore),
    blockCount: asString(dag.blockCount),
    headerCount: asString(dag.headerCount),
    difficulty: asString(dag.difficulty),
    sink: hexOf(dag.sink),
    medianTime: asString(dag.pastMedianTime),
    supply,
    mempool,
    read: String(rows.length),
    latest,
    miners: minerRows(rows),
    blocks: rows.slice(0, 80),
    all: rows,
  };
}

export async function snapshot() {
  if (cache && Date.now() - cacheAt < 15000) return cache;
  if (loading) return loading;
  loading = (async () => {
    const kaspa = await loadKaspa();
    const { rpc } = await sharedRpc(kaspa);
    const next = await readSnapshot(kaspa, rpc);
    cache = next;
    cacheAt = Date.now();
    return next;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export function invalidateSnapshot() {
  cache = null;
  cacheAt = 0;
}

export function cachedBlocks() {
  return cache;
}
