/** Read an accepted Testnet-10 payment from a synced node. No keys.
 * The public transaction list at api-tn10 stopped storing new payments on 25 Sep 2026.
 * A synced node still has them. The pay path keeps a short tip and drops an old cursor.
 */

import { createRequire } from "node:module";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const WASM =
  process.env.KASPA_WASM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js`;
const WS_FROM =
  process.env.KASPA_WS_FROM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js`;
const LOCAL_RPC = process.env.FAUCET_RPC || "127.0.0.1:17210";
const PUBLIC_WSS = [
  "wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/borsh",
  "wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/borsh",
  "wss://muon-10.kaspa.blue/kaspa/testnet-10/wrpc/borsh",
];

/** Blocks behind the sink when the cursor is cold. About two seconds at ten blocks a second. */
const TIP = 24;
/** Reuse a tip read that just finished. */
const FRESH_MS = 80;
/** Older than this, the cursor is dropped and the next read starts at the sink. */
const STALE_MS = 1000;
/** Accepting blocks kept in memory. About twenty seconds. */
const KEEP = 240;
/** Background tip follow. A payment then reads the map. */
const FOLLOW_MS = 120;
const NOT_YET = "That transaction is not on Testnet 10 yet.";

let kaspaPromise = null;
let rpc = null;
let localDownUntil = 0;
let tipChain = Promise.resolve();
let byId = new Map();
let blockTxs = new Map();
let blockOrder = [];
let cursor = "";
let refreshedAt = 0;
let followerStarted = false;

/** A fresh cursor is reused. A recent cursor reads the new blocks only. An old cursor starts over at the sink. */
export function tipReadPlan(hasCursor, ageMs, freshMs, staleMs) {
  if (hasCursor && ageMs < freshMs) return "cached";
  if (!hasCursor || ageMs >= staleMs) return "prime";
  return "delta";
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function notYet() {
  return new Error(NOT_YET);
}

function sompiText(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value)).toString();
  if (typeof value === "string" && /^-?\d+$/.test(value)) return value;
  return "0";
}

function subnetworkHex(value) {
  const text = String(value == null ? "" : value).replace(/^0x/i, "").toLowerCase();
  if (/^[0-9a-f]{40}$/.test(text)) return text;
  return "0000000000000000000000000000000000000000";
}

/** Map one full-verbosity accepted transaction into the shape extractPayment already reads. */
export function acceptedToRest(tx) {
  const verbose = tx && tx.verboseData;
  const txid = String((verbose && verbose.transactionId) || "").trim().toLowerCase();
  const inputs = Array.isArray(tx && tx.inputs) ? tx.inputs : [];
  const outputs = Array.isArray(tx && tx.outputs) ? tx.outputs : [];
  return {
    transaction_id: txid,
    subnetwork_id: subnetworkHex(tx && tx.subnetworkId),
    is_accepted: true,
    inputs: inputs.map((inp) => {
      const entry = inp && inp.verboseData && inp.verboseData.utxoEntry;
      const ev = entry && entry.verboseData;
      const address = ev && ev.scriptPublicKeyAddress ? String(ev.scriptPublicKeyAddress) : "";
      return { previous_outpoint_address: address };
    }),
    outputs: outputs.map((out) => {
      const ov = out && out.verboseData;
      const address = ov && ov.scriptPublicKeyAddress ? String(ov.scriptPublicKeyAddress) : "";
      return { script_public_key_address: address, amount: sompiText(out && out.value) };
    }),
  };
}

function parentOf(header) {
  const levels = (header && (header.parentsByLevel || header.parents)) || [];
  const first = levels[0];
  if (Array.isArray(first) && first[0]) return String(first[0]);
  if (first && first.parentHashes && first.parentHashes[0]) return String(first.parentHashes[0]);
  if (header && header.selectedParentHash) return String(header.selectedParentHash);
  return "";
}

function lockTip(fn) {
  const run = tipChain.then(fn, fn);
  tipChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function sdk() {
  if (!kaspaPromise) {
    kaspaPromise = (async () => {
      const require = createRequire(WS_FROM);
      globalThis.WebSocket = require("websocket").w3cwebsocket;
      const kaspa = await import(pathToFileURL(WASM).href);
      kaspa.initConsolePanicHook?.();
      return kaspa;
    })();
  }
  return kaspaPromise;
}

async function openRpc(kaspa, net, url, ms) {
  const client = new kaspa.RpcClient({ url, encoding: kaspa.Encoding.Borsh, networkId: net });
  try {
    await withTimeout(client.connect(), ms, NOT_YET);
    const info = await withTimeout(client.getServerInfo(), 8000, NOT_YET);
    const id = String(info.networkId || "");
    if (!id.includes("testnet-10")) throw notYet();
    if (!info.isSynced) throw notYet();
    return client;
  } catch (err) {
    await client.disconnect().catch(() => undefined);
    throw err;
  }
}

async function connect() {
  if (rpc) return rpc;
  const kaspa = await sdk();
  const net = new kaspa.NetworkId("testnet-10");
  if (Date.now() > localDownUntil) {
    try {
      rpc = await openRpc(kaspa, net, LOCAL_RPC, 800);
      return rpc;
    } catch {
      localDownUntil = Date.now() + 60_000;
    }
  }
  let last = notYet();
  for (const url of PUBLIC_WSS) {
    try {
      rpc = await openRpc(kaspa, net, url, 6000);
      return rpc;
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw last;
}

async function dropClient() {
  const old = rpc;
  rpc = null;
  if (old) await old.disconnect().catch(() => undefined);
}

function blockKey(hash) {
  const key = String(hash || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(key) ? key : "";
}

/** Merge one virtual-chain delta. Removed blocks drop their payments. The cursor moves to the new tip. */
export function applyAcceptedDelta(state, chain) {
  const ids = state.byId;
  const blocks = state.blockTxs;
  for (const hash of (chain && chain.removedChainBlockHashes) || []) {
    const key = blockKey(hash);
    const owned = key && blocks.get(key);
    if (owned) for (const id of owned) ids.delete(id);
    if (key) blocks.delete(key);
  }
  const added = ((chain && chain.addedChainBlockHashes) || []).map((hash) => blockKey(hash)).filter(Boolean);
  const groups = (chain && chain.chainBlockAcceptedTransactions) || [];
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const header = group && group.chainBlockHeader;
    const keys = new Set();
    const fromHeader = blockKey(header && header.hash);
    if (fromHeader) keys.add(fromHeader);
    if (added[i]) keys.add(added[i]);
    const owned = [];
    for (const tx of (group && group.acceptedTransactions) || []) {
      const rest = acceptedToRest(tx);
      if (/^[0-9a-f]{64}$/.test(rest.transaction_id)) {
        ids.set(rest.transaction_id, rest);
        owned.push(rest.transaction_id);
      }
    }
    for (const key of keys) blocks.set(key, owned);
  }
  return added.length ? added[added.length - 1] : state.cursor;
}

function resetWindow() {
  byId = new Map();
  blockTxs = new Map();
  blockOrder = [];
  cursor = "";
}

function noteChain(chain) {
  for (const hash of (chain && chain.removedChainBlockHashes) || []) {
    const key = blockKey(hash);
    if (key) blockOrder = blockOrder.filter((item) => item !== key);
  }
  const added = ((chain && chain.addedChainBlockHashes) || []).map((hash) => blockKey(hash)).filter(Boolean);
  for (const key of added) {
    if (!blockOrder.includes(key)) blockOrder.push(key);
  }
  while (blockOrder.length > KEEP) {
    const key = blockOrder.shift();
    const owned = key && blockTxs.get(key);
    if (owned) for (const id of owned) byId.delete(id);
    if (key) blockTxs.delete(key);
  }
}

async function walkBack(client, sink, steps) {
  let hash = blockKey(sink);
  if (!hash) throw notYet();
  for (let i = 0; i < steps; i += 1) {
    const block = await withTimeout(client.getBlock({ hash, includeTransactions: false }), 400, NOT_YET);
    const header = (block && (block.block || block) && (block.block || block).header) || {};
    const next = blockKey(parentOf(header));
    if (!next) break;
    hash = next;
  }
  return hash;
}

async function pullTip(retried) {
  const client = await connect();
  try {
    const plan = tipReadPlan(!!cursor, Date.now() - refreshedAt, FRESH_MS, STALE_MS);
    if (plan === "prime") {
      resetWindow();
      const dag = await withTimeout(client.getBlockDagInfo(), 800, NOT_YET);
      cursor = await walkBack(client, dag && dag.sink, TIP);
    }
    const start = cursor;
    const chain = await withTimeout(
      client.getVirtualChainFromBlockV2({
        startHash: start,
        dataVerbosityLevel: "Low",
      }),
      1500,
      NOT_YET
    );
    cursor = applyAcceptedDelta({ byId, blockTxs, cursor: start }, chain);
    noteChain(chain);
    refreshedAt = Date.now();
    return byId;
  } catch (err) {
    await dropClient();
    resetWindow();
    refreshedAt = 0;
    if (!retried) return pullTip(true);
    if (err instanceof Error && /not on Testnet 10 yet|not accepted yet/i.test(err.message)) throw err;
    throw notYet();
  }
}

async function refreshTip() {
  if (tipReadPlan(!!cursor, Date.now() - refreshedAt, FRESH_MS, STALE_MS) === "cached") return byId;
  return lockTip(async () => {
    if (tipReadPlan(!!cursor, Date.now() - refreshedAt, FRESH_MS, STALE_MS) === "cached") return byId;
    return pullTip(false);
  });
}

/** A mempool read the public nodes accept. Filtering the pool while excluding orphans is rejected. */
export function mempoolQuery(id) {
  return {
    transactionId: id,
    includeOrphanPool: false,
    filterTransactionPool: false,
  };
}

async function seenInMempool(id) {
  try {
    if (!rpc) await connect();
  } catch {
    return null;
  }
  try {
    const entry = await withTimeout(rpc.getMempoolEntry(mempoolQuery(id)), 350, "mempool");
    return !!(entry && (entry.transaction || entry.mempoolEntry));
  } catch (err) {
    const msg = String((err && err.message) || err || "");
    if (/not found/i.test(msg)) return false;
    return null;
  }
}

/** A cached hit is settled. A mempool hit is not. Anything else needs one chain read. */
export function acceptanceLook({ cachedHit, inMempool }) {
  if (cachedHit) return "settled";
  if (inMempool) return "wait";
  return "scan";
}

/** Accepted transaction in the recent virtual chain, in the REST shape. Throws while it is still unseen. */
export async function lookupAccepted(txid) {
  const id = String(txid || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("Paste the 64-character transaction id.");
  warmNodeWindow();
  const known = byId.get(id);
  if (acceptanceLook({ cachedHit: !!known, inMempool: false }) === "settled" && known) return known;
  return lockTip(async () => {
    const again = byId.get(id);
    if (acceptanceLook({ cachedHit: !!again, inMempool: false }) === "settled" && again) return again;
    const inMempool = await seenInMempool(id);
    if (acceptanceLook({ cachedHit: false, inMempool: inMempool === true }) === "wait") {
      throw new Error("That transaction is not accepted yet. Wait and claim it again.");
    }
    if (tipReadPlan(!!cursor, Date.now() - refreshedAt, FRESH_MS, STALE_MS) !== "cached") await pullTip(false);
    const hit = byId.get(id);
    if (acceptanceLook({ cachedHit: !!hit, inMempool: false }) === "settled" && hit) return hit;
    throw notYet();
  });
}

/** Keep a short tip warm so a tKAS payment is already in the map when the click arrives. */
export function warmNodeWindow() {
  if (followerStarted) return;
  followerStarted = true;
  const tick = () => {
    refreshTip()
      .catch(() => undefined)
      .then(() => {
        setTimeout(tick, FOLLOW_MS);
      });
  };
  tick();
}
