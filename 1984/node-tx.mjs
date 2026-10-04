/** Read an accepted Testnet-10 payment from a synced node. No keys.
 * The public transaction list at api-tn10 stopped storing new payments on 25 Sep 2026.
 * A synced node still has them. This is the fallback when that list returns 404.
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

/** About a minute of the selected-parent chain at 10 blocks per second. The live path does not walk this. */
const WINDOW = 500;
/** A couple of seconds of the tip. A just-sent tKAS payment is accepted inside this. */
const TIP = 24;
/** Reuse a tip read that just finished. The next block is still ahead of this. */
const FRESH_MS = 30;
/** Quick misses before one wide read. A live payment is in the tip well before this. */
const DEEP_AFTER = 20;
const NOT_YET = "That transaction is not on Testnet 10 yet.";

let kaspaPromise = null;
let rpc = null;
let localDownUntil = 0;
let spine = [];
let spineChain = Promise.resolve();
let byId = new Map();
let blockTxs = new Map();
let cursor = "";
let refreshedAt = 0;
let deepAt = 0;
const missStreak = new Map();

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

function lockSpine(fn) {
  const run = spineChain.then(fn, fn);
  spineChain = run.then(
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

async function extendSpine(client) {
  const dag = await client.getBlockDagInfo();
  let hash = String((dag && dag.sink) || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw notYet();
  const known = new Set(spine);
  const fresh = [];
  for (let i = 0; i < WINDOW; i += 1) {
    fresh.push(hash);
    if (known.has(hash)) break;
    const block = await client.getBlock({ hash, includeTransactions: false });
    const header = (block && (block.block || block) && (block.block || block).header) || {};
    const next = parentOf(header);
    if (!/^[0-9a-f]{64}$/i.test(next)) break;
    hash = next;
  }
  if (fresh.length && known.has(fresh[fresh.length - 1])) {
    const idx = spine.indexOf(fresh[fresh.length - 1]);
    const older = idx >= 0 ? spine.slice(idx + 1) : [];
    spine = fresh.concat(older).slice(0, WINDOW);
  } else {
    spine = fresh.slice(0, WINDOW);
  }
  return spine[spine.length - 1] || "";
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

async function walkBack(client, sink, steps) {
  let hash = blockKey(sink);
  if (!hash) throw notYet();
  for (let i = 0; i < steps; i += 1) {
    const block = await client.getBlock({ hash, includeTransactions: false });
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
    if (!cursor) {
      const dag = await client.getBlockDagInfo();
      cursor = await walkBack(client, dag && dag.sink, TIP);
    }
    const start = cursor;
    const chain = await client.getVirtualChainFromBlockV2({
      startHash: start,
      dataVerbosityLevel: "Full",
    });
    cursor = applyAcceptedDelta({ byId, blockTxs, cursor: start }, chain);
    refreshedAt = Date.now();
    return byId;
  } catch (err) {
    await dropClient();
    cursor = "";
    if (!retried) return pullTip(true);
    if (err instanceof Error && /not on Testnet 10 yet|not accepted yet/i.test(err.message)) throw err;
    throw notYet();
  }
}

async function refreshTip() {
  if (cursor && Date.now() - refreshedAt < FRESH_MS) return byId;
  return lockSpine(async () => {
    if (cursor && Date.now() - refreshedAt < FRESH_MS) return byId;
    return pullTip(false);
  });
}

async function deepWindow() {
  return lockSpine(async () => {
    if (byId.size && Date.now() - deepAt < 1000) return byId;
    const client = await connect();
    try {
      const start = await extendSpine(client);
      if (!start) throw notYet();
      const chain = await client.getVirtualChainFromBlockV2({
        startHash: start,
        dataVerbosityLevel: "Full",
      });
      cursor = applyAcceptedDelta({ byId, blockTxs, cursor: start }, chain) || blockKey(spine[0]) || start;
      refreshedAt = Date.now();
      deepAt = Date.now();
      return byId;
    } catch (err) {
      await dropClient();
      cursor = "";
      if (err instanceof Error && /not on Testnet 10 yet|not accepted yet/i.test(err.message)) throw err;
      throw notYet();
    }
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
  const known = byId.get(id);
  if (acceptanceLook({ cachedHit: !!known, inMempool: false }) === "settled" && known) {
    missStreak.delete(id);
    return known;
  }
  const map = await refreshTip();
  const hit = map.get(id);
  if (acceptanceLook({ cachedHit: !!hit, inMempool: false }) === "settled" && hit) {
    missStreak.delete(id);
    return hit;
  }
  const inMempool = await seenInMempool(id);
  if (acceptanceLook({ cachedHit: false, inMempool: inMempool === true }) === "wait") {
    missStreak.delete(id);
    throw new Error("That transaction is not accepted yet. Wait and claim it again.");
  }
  if (inMempool === false) {
    const n = (missStreak.get(id) || 0) + 1;
    missStreak.set(id, n);
    if (n >= DEEP_AFTER) {
      missStreak.set(id, 0);
      const wide = await deepWindow();
      const older = wide.get(id);
      if (older) return older;
    }
  }
  throw notYet();
}

/** Prime the tip so the first tKAS payment reads a short delta, not the long window. */
export function warmNodeWindow() {
  refreshTip().catch(() => undefined);
}
