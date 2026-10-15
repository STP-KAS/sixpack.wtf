/** SquarePeg on Testnet 10. The key stays in this process. Nothing here is a dollar. */

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PAGE_PRIORITY_SOMPI, pageFeeRate } from "../faucet/fee-rate.mjs";
import {
  COVENANT_SIGOPS,
  FULL_BACKOFF_MS,
  MAX_BUMPS,
  agreeNodes,
  feeWithinCap,
  mempoolFull,
  quoteFromEstimate,
  replacementRefused,
  squarePlan,
} from "./congestion-fee.mjs";
import { RESERVE } from "./money.mjs";
import { asNum, openingNumbers, railByte } from "./peg.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(dir, "..", "peg", "target", "debug", "peg-encode.exe");
const WASM =
  process.env.KASPA_WASM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js`;
const WS_FROM =
  process.env.KASPA_WS_FROM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js`;
const SECRET =
  process.env.FAUCET_SECRET ||
  `${homedir().replace(/\\/g, "/")}/Documents/kaspa/groks-wallet/secrets/wallet.txt`;

const SHAPE = "The covenant transaction was not shaped for this lock. Nothing was sent.";
const FEE = "This wallet needs a coin for the miner fee. The lock was not spent.";

let kaspaPromise;
const PEG_POLL_MS = 100;
const PEG_KEEP_MS = 20_000;
const PEG_FEE_MS = 400;
const PEG_UTXO_MS = 1_200;
const PEG_SUBMIT_MS = 4_000;
const PEG_LOCAL_MS = 800;
const PEG_LOCAL_DOWN_MS = 60_000;
const PEG_PUBLIC_MS = 2_000;
const PEG_LOCAL = process.env.FAUCET_RPC || "127.0.0.1:17210";
const PEG_PUBLIC = [
  "wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/borsh",
  "wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/borsh",
  "wss://muon-10.kaspa.blue/kaspa/testnet-10/wrpc/borsh",
];
const INCLUSION_MS = 10_000;
const INCLUSION_POLL_MS = 1_000;
const CAP_STOP = "The fee cap stopped this. Nothing was sent.";
let feeCache = { at: 0, rate: 0, normal: 100 };
let pegRpc = null;
let pegOpen = null;
let pegKeep = null;
let localDownUntil = 0;

/** A desk node that just missed stays skipped, so the next POCencept click does not wait on it. */
export function pegNodePlan(now, downUntil) {
  return now < downUntil ? "public" : "local";
}

/** A stalled socket is a transport miss. A covenant refusal is not. */
export function pegCallFailed(err) {
  const msg = String((err && err.message) || err || "").toLowerCase();
  return /stalled|took too long|disconnect|websocket|socket|econn|not connected|network error|timed out/.test(msg);
}

const COVENANT_FAULT = "The covenant did not broadcast.";

function dropSecret(raw, secret) {
  const folded = secret.toLowerCase();
  const lower = raw.toLowerCase();
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const at = lower.indexOf(folded, i);
    if (at < 0) return out + raw.slice(i);
    out += raw.slice(i, at) + " ";
    i = at + folded.length;
  }
  return out;
}

function faultRaw(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  const parts = [err.message, err.reason, err.error];
  const text = parts.filter((part) => part != null && String(part).trim()).map(String).join(" ");
  return text || String(err.name || "");
}

/** Words from a node rejection. Hex, addresses, and keys are left out. */
export function covenantWords(err, keys) {
  let raw = faultRaw(err);
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const secret = String(key || "").trim();
    if (secret.length > 8) raw = dropSecret(raw, secret);
  }
  const words = raw
    .replace(/kaspatest:[a-z0-9]+/gi, " ")
    .replace(/kaspa:[a-z0-9]+/gi, " ")
    .replace(/[0-9a-f]{8,}/gi, " ")
    .split(/[^A-Za-z]+/)
    .filter((word) => word.length >= 3 && !/^[0-9a-f]+$/i.test(word));
  const kept = [];
  for (const word of words) {
    if (!kept.includes(word) && kept.length < 12) kept.push(word);
  }
  return kept.join(" ");
}

/** A reason the chat can show. Keys, long hex, and addresses are removed. */
export function covenantFault(err, keys) {
  const raw = faultRaw(err);
  if (/private-key|mnemonic|seed phrase|privHex|receive-0-private-key/i.test(raw)) return COVENANT_FAULT;
  let msg = raw
    .replace(/kaspatest:[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+/gi, "kaspatest:…")
    .replace(/kaspa:[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+/gi, "kaspa:…")
    .replace(/[0-9a-f]{16,}/gi, "…");
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const secret = String(key || "").trim();
    if (secret.length > 8 && msg.toLowerCase().includes(secret.toLowerCase())) return COVENANT_FAULT;
  }
  msg = msg.replace(/\s+/g, " ").trim();
  const words = covenantWords(err, keys);
  if ((!msg || msg.length < 12 || msg === COVENANT_FAULT) && words && !/covenant did not broadcast/i.test(words)) {
    return (COVENANT_FAULT + " " + words).slice(0, 180);
  }
  if (!msg || msg.length < 12) return COVENANT_FAULT;
  if (msg.length > 180) msg = msg.slice(0, 180);
  return msg;
}

function scrub(err, keys) {
  const msg = covenantFault(err, keys);
  const words = covenantWords(err, keys) || "no-words";
  console.error("covenant-fault " + msg + " words=" + words);
  return new Error(msg);
}

function issuerKey() {
  const secret = readFileSync(SECRET, "utf8");
  const pkLine = secret.split(/\r?\n/).find((line) => line.startsWith("receive-0-private-key:"));
  const fromLine = secret.split(/\r?\n/).find((line) => line.startsWith("receive-0:"));
  if (!pkLine || !fromLine) throw new Error("The peg issuer is not ready.");
  const fromAddr = fromLine.slice("receive-0:".length).trim();
  if (fromAddr !== RESERVE) throw new Error("Faucet key is not groks-wallet.");
  return { privHex: pkLine.split(":")[1].trim(), fromAddr };
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

function askEncoder(job) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(BIN, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch {
      reject(new Error("The peg encoder is not built."));
      return;
    }
    let out = "";
    let err = "";
    child.stdout.on("data", (buf) => {
      out += buf;
    });
    child.stderr.on("data", (buf) => {
      err += buf;
    });
    child.on("error", () => reject(new Error("The peg encoder is not built.")));
    child.on("close", (code) => {
      if (code !== 0) {
        const text = err.toLowerCase();
        if (text.includes("secret") || text.includes("private")) reject(new Error("The peg encoder stopped."));
        else reject(new Error(err.trim() || "The peg encoder stopped."));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error("The peg encoder stopped."));
      }
    });
    child.stdin.write(JSON.stringify(job));
    child.stdin.end();
  });
}

function hexKey(value) {
  const text = String(value || "").trim().replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error("This address is not a schnorr lock.");
  return text;
}

/** The covenant argument is the 65-byte sig. The wallet prefixes that with OP_DATA_65. */
export function covenantSignature(raw) {
  let signature = String(raw || "").trim().replace(/^0x/i, "").toLowerCase();
  if (/^41[0-9a-f]{128}01$/.test(signature)) signature = signature.slice(2);
  if (!/^[0-9a-f]{128}01$/.test(signature)) throw new Error("The covenant signature was short. Nothing was sent.");
  return signature;
}

async function ownerPub(kaspa, ownerKey, address) {
  const priv = new kaspa.PrivateKey(String(ownerKey || "").trim());
  const derived = String(priv.toAddress("testnet-10")).trim();
  if (derived.toLowerCase() !== String(address || "").trim().toLowerCase()) {
    throw new Error("The signing key does not match the address.");
  }
  // Address.payload is the bech32 body, not the 32-byte x-only key.
  const fromKey = String(priv.toKeypair().xOnlyPublicKey || "").trim().toLowerCase();
  const fromAddress = String(kaspa.XOnlyPublicKey.fromAddress(new kaspa.Address(derived)) || "").trim().toLowerCase();
  if (fromKey !== fromAddress) throw new Error("This address is not a schnorr lock.");
  return hexKey(fromKey);
}

async function pegAddress(kaspa, built) {
  const spk = kaspa.payToScriptHashScript(Buffer.from(built.bytecode, "hex"));
  const wasmScript = String(spk.script || "").toLowerCase();
  if (!wasmScript || wasmScript !== String(built.script || "").toLowerCase()) {
    throw new Error("The covenant address does not match the script. Nothing was sent.");
  }
  const address = kaspa.addressFromScriptPublicKey(spk, "testnet-10");
  if (!address) throw new Error("The covenant address does not match the script. Nothing was sent.");
  return { address: String(address), script: wasmScript };
}

function openingJob(row) {
  return {
    issuer: row.issuer,
    reserve: row.reserve,
    owner: row.owner,
    openSig: row.openSig,
    cents: asNum(row.cents),
    rail: railByte(row.rail),
    frozen: row.frozen ? 1 : 0,
    quoteMicro: asNum(row.quoteMicro),
    bornCents: asNum(row.bornCents),
    bornSompi: asNum(row.bornSompi),
  };
}

async function compileRow(row) {
  return askEncoder({ op: "script", ...openingJob(row) });
}

async function readQuote(rpc) {
  const quoted = await withTimeout(rpc.getFeeEstimate({}), PEG_FEE_MS, "The Testnet-10 node stalled.");
  let mempool = 0;
  try {
    const info = await withTimeout(rpc.getInfo({}), PEG_FEE_MS, "The Testnet-10 node stalled.");
    mempool = Number(info && info.mempoolSize);
  } catch {
    mempool = 0;
  }
  return quoteFromEstimate(quoted, mempool);
}

async function secondQuote(kaspa) {
  const urls = pegNodePlan(Date.now(), localDownUntil) === "local" ? PEG_PUBLIC : PEG_PUBLIC.slice(1);
  for (const url of urls) {
    let rpc = null;
    try {
      rpc = await openOne(kaspa, url, PEG_PUBLIC_MS);
      return await readQuote(rpc);
    } catch {
      /* The next public node is the second opinion. */
    } finally {
      if (rpc) await rpc.disconnect().catch(() => {});
    }
  }
  return null;
}

async function feeRate(rpc) {
  const now = Date.now();
  if (feeCache.rate > 0 && now - feeCache.at < 5_000) return feeCache.rate;
  try {
    const first = await readQuote(rpc);
    const kaspa = await sdk();
    const second = await secondQuote(kaspa);
    const agreed = agreeNodes(second ? [first, second] : [first], feeCache.normal);
    const plan = squarePlan(agreed, 0);
    feeCache = { at: now, rate: plan.rate, normal: agreed.normal, agreed };
    if (plan.congested || agreed.outlier) {
      console.error("square-fee rate=" + plan.rate + " normal=" + agreed.normal + " mempool=" + agreed.mempool + " outlier=" + (agreed.outlier ? 1 : 0));
    }
    return plan.rate;
  } catch (err) {
    if (pegCallFailed(err)) await dropPegRpc(rpc);
  }
  const floor = pageFeeRate(null);
  feeCache = { at: now, rate: floor, normal: feeCache.normal || 100, agreed: feeCache.agreed };
  return floor;
}

/** The rate the square and the browser pay. Two nodes when a second one answers. No spend. */
export async function squareFeeRate() {
  try {
    const rpc = await pegClient();
    return await feeRate(rpc);
  } catch {
    return pageFeeRate(null);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function dropPegRpc(current) {
  if (current && pegRpc && current !== pegRpc) return;
  const old = pegRpc;
  pegRpc = null;
  if (old) await old.disconnect().catch(() => {});
}

async function openOne(kaspa, url, ms) {
  const rpc = new kaspa.RpcClient({
    url,
    encoding: kaspa.Encoding.Borsh,
    networkId: "testnet-10",
  });
  try {
    await withTimeout(rpc.connect(), ms, "The Testnet-10 node stalled.");
    const info = await withTimeout(rpc.getServerInfo(), 800, "The Testnet-10 node stalled.");
    const id = String((info && info.networkId) || "");
    if (!id.includes("testnet-10")) throw new Error("The node is not Testnet 10.");
    if (!info.isSynced) throw new Error("The Testnet-10 node is not synced.");
    return rpc;
  } catch (err) {
    await rpc.disconnect().catch(() => {});
    throw err;
  }
}

async function openPublic(kaspa) {
  const jobs = PEG_PUBLIC.map((url) => openOne(kaspa, url, PEG_PUBLIC_MS));
  try {
    const rpc = await Promise.any(jobs);
    pegRpc = rpc;
    for (const job of jobs) {
      job.then((extra) => {
        if (extra !== rpc) extra.disconnect().catch(() => {});
      }).catch(() => {});
    }
    return rpc;
  } catch {
    throw new Error("The Testnet-10 node stalled.");
  }
}

async function openPegRpc() {
  const kaspa = await sdk();
  if (pegNodePlan(Date.now(), localDownUntil) === "local") {
    try {
      const rpc = await openOne(kaspa, PEG_LOCAL, PEG_LOCAL_MS);
      pegRpc = rpc;
      console.error("peg-rpc up local");
      return rpc;
    } catch {
      localDownUntil = Date.now() + PEG_LOCAL_DOWN_MS;
    }
  }
  const rpc = await openPublic(kaspa);
  console.error("peg-rpc up public");
  return rpc;
}

function armKeep() {
  if (pegKeep) return;
  pegKeep = setInterval(() => {
    const rpc = pegRpc;
    if (!rpc) {
      pegClient().catch(() => {});
      return;
    }
    withTimeout(rpc.getServerInfo(), 800, "The Testnet-10 node stalled.").catch((err) => {
      if (!pegCallFailed(err)) return;
      dropPegRpc(rpc).then(() => pegClient().catch(() => {}));
    });
  }, PEG_KEEP_MS);
  if (typeof pegKeep.unref === "function") pegKeep.unref();
}

async function pegClient() {
  if (pegRpc) return pegRpc;
  if (!pegOpen) pegOpen = openPegRpc();
  try {
    const rpc = await pegOpen;
    armKeep();
    return rpc;
  } finally {
    pegOpen = null;
  }
}

async function callRpc(rpc, run, ms, label) {
  try {
    return await withTimeout(run(), ms, label);
  } catch (err) {
    if (pegCallFailed(err)) await dropPegRpc(rpc);
    throw err;
  }
}

function sameOut(entry, txid, index) {
  const out = entry && entry.outpoint;
  return !!out && String(out.transactionId) === String(txid) && Number(out.index) === Number(index);
}

async function findOutput(rpc, address, txid, sompi) {
  const { entries } = await callRpc(rpc, () => rpc.getUtxosByAddresses([address]), PEG_UTXO_MS, "The Testnet-10 node stalled.");
  return (entries || []).find((entry) => {
    const out = entry.outpoint;
    return out && String(out.transactionId) === String(txid) && BigInt(entry.amount) === BigInt(sompi);
  });
}

function scriptHex(spk) {
  if (!spk) return "";
  if (typeof spk === "string") return spk.toLowerCase();
  return String(spk.script || "").toLowerCase();
}

function minerPriority(bytecode, rate) {
  const guess = BigInt(bytecode.length / 2 + 800) * BigInt(rate);
  const floor = BigInt(PAGE_PRIORITY_SOMPI);
  return guess > floor ? guess : floor;
}

function spentFee(peg, picked, pending) {
  const tx = pending.transaction;
  let inputs = 0n;
  for (let i = 0; i < tx.inputs.length; i += 1) {
    const prev = tx.inputs[i].previousOutpoint;
    if (sameOut(peg, prev.transactionId, prev.index)) {
      inputs += BigInt(peg.amount);
      continue;
    }
    const coin = picked.find((row) => sameOut(row, prev.transactionId, prev.index));
    if (!coin) throw new Error(SHAPE);
    inputs += BigInt(coin.amount);
  }
  let outputs = 0n;
  for (let i = 0; i < tx.outputs.length; i += 1) outputs += BigInt(tx.outputs[i].value);
  if (outputs > inputs) throw new Error(SHAPE);
  return inputs - outputs;
}

function txidOf(submitted) {
  const txid = String((submitted && submitted.transactionId) || submitted || "")
    .trim()
    .toLowerCase()
    .replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(txid)) {
    const kind = submitted == null ? "empty" : typeof submitted;
    throw new Error("The covenant submit came back as " + kind + ".");
  }
  return txid;
}

async function submitSigned(pending) {
  let last;
  const tries = FULL_BACKOFF_MS.length + 1;
  for (let i = 0; i < tries; i += 1) {
    try {
      const live = await pegClient();
      const submitted = await callRpc(live, () => pending.submit(live), PEG_SUBMIT_MS, "The Testnet-10 node stalled.");
      return txidOf(submitted);
    } catch (err) {
      last = err;
      if (replacementRefused(err) || !retryableSubmit(err) || i === tries - 1) throw err;
      await sleep(FULL_BACKOFF_MS[i]);
      if (mempoolFull(err) && pegNodePlan(Date.now(), localDownUntil) === "local") {
        localDownUntil = Date.now() + PEG_LOCAL_DOWN_MS;
      }
      await dropPegRpc(pegRpc);
    }
  }
  throw last;
}

function retryableSubmit(err) {
  return mempoolFull(err) || pegCallFailed(err);
}

async function mempoolHas(rpc, txid) {
  try {
    const row = await withTimeout(
      rpc.getMempoolEntry({
        transactionId: txid,
        filterTransactionPool: true,
        includeOrphanPool: false,
      }),
      INCLUSION_POLL_MS,
      "The Testnet-10 node stalled."
    );
    return !!(row && (row.mempoolEntry || row.transaction));
  } catch (err) {
    if (pegCallFailed(err)) throw err;
    return false;
  }
}

/** "out" when the spend has left the pool. "in" when it is still there after 10 seconds. "kept" when the node already has it. */
async function watchInclusion(pending, txid) {
  const started = Date.now();
  let replayed = false;
  let seen = false;
  while (Date.now() - started < INCLUSION_MS) {
    await sleep(INCLUSION_POLL_MS);
    try {
      const rpc = await pegClient();
      const present = await mempoolHas(rpc, txid);
      if (!present) return "out";
      seen = true;
    } catch (err) {
      if (!pegCallFailed(err)) return "out";
      if (replayed) continue;
      replayed = true;
      try {
        await dropPegRpc(pegRpc);
        await submitSigned(pending);
      } catch (submitErr) {
        const text = String((submitErr && submitErr.message) || submitErr || "");
        if (/already accepted/i.test(text)) return "kept";
        if (replacementRefused(submitErr)) seen = true;
        else if (!(mempoolFull(submitErr) || pegCallFailed(submitErr))) throw submitErr;
      }
    }
  }
  return seen ? "in" : "out";
}

async function buildTx(kaspa, rpc, { peg, feeAddress, outputs, priority, feeRate: rate, coins }) {
  let picked = Array.isArray(coins) && coins.length ? coins : null;
  if (!picked) {
    const { entries } = await callRpc(rpc, () => rpc.getUtxosByAddresses([feeAddress]), PEG_UTXO_MS, "The Testnet-10 node stalled.");
    const available = (entries || [])
      .filter((row) => !sameOut(row, peg.outpoint.transactionId, peg.outpoint.index))
      .sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? 1 : -1));
    if (!available.length) throw new Error(FEE);
    picked = [];
    let sum = 0n;
    for (const coin of available) {
      if (picked.length === 2) break;
      picked.push(coin);
      sum += BigInt(coin.amount);
      if (sum > priority) break;
    }
    if (sum <= priority) throw new Error(FEE);
  }
  const { transactions } = await kaspa.createTransactions({
    priorityEntries: [peg],
    entries: picked,
    outputs,
    changeAddress: feeAddress,
    priorityFee: priority,
    feeRate: rate,
    sigOpCount: COVENANT_SIGOPS,
    networkId: "testnet-10",
  });
  if (!transactions || transactions.length !== 1) throw new Error(SHAPE);
  const pending = transactions[0];
  const tx = pending.transaction;
  if (tx.inputs.length < 1 || tx.inputs.length > 3 || tx.outputs.length < 1 || tx.outputs.length > 3) throw new Error(SHAPE);
  const first = tx.inputs[0].previousOutpoint;
  if (String(first.transactionId) !== String(peg.outpoint.transactionId) || Number(first.index) !== Number(peg.outpoint.index)) {
    throw new Error(SHAPE);
  }
  outputs.forEach((want, i) => {
    const out = tx.outputs[i];
    if (!out || BigInt(out.value) !== BigInt(want.amount) || scriptHex(out.scriptPublicKey) !== want.script) {
      throw new Error(SHAPE);
    }
  });
  const fee = spentFee(peg, picked, pending);
  if (!feeWithinCap(fee)) throw new Error(CAP_STOP);
  return { pending, picked };
}

async function submitEntry({ lock, entry, take, covenantKey, feeKey, feeAddress, outputs }) {
  const key = String(covenantKey || "");
  const feeSecret = String(feeKey || "");
  try {
    const kaspa = await sdk();
    let rpc = await pegClient();
    let peg = await readPeg(rpc, lock);
    await feeRate(rpc);
    const again = await pegClient();
    if (again !== rpc) {
      rpc = again;
      peg = await readPeg(rpc, lock);
    }
    const agreed = feeCache.agreed || { normal: feeCache.normal || 100, mempool: 0, held: false };
    let picked = null;
    let txid = "";
    for (let bump = 0; bump <= MAX_BUMPS; bump += 1) {
      const plan = squarePlan(agreed, bump);
      if (bump > 0 && plan.rate === squarePlan(agreed, bump - 1).rate) return txid;
      const current = await compileRow(lock);
      const priority = minerPriority(current.bytecode, plan.rate);
      let built;
      try {
        built = await buildTx(kaspa, rpc, {
          peg,
          feeAddress,
          outputs,
          priority,
          feeRate: plan.rate,
          coins: picked,
        });
      } catch (err) {
        if (txid) return txid;
        throw err;
      }
      picked = built.picked;
      const pending = built.pending;
      const feePriv = new kaspa.PrivateKey(feeSecret);
      pending.sign([feePriv], false);
      const signer = new kaspa.PrivateKey(key);
      const signature = covenantSignature(await pending.createInputSignature(0, signer));
      const job = { op: "encode", entry, sig: signature, ...openingJob(lock) };
      if (take != null) job.take = asNum(take);
      const encoded = await askEncoder(job);
      pending.fillInput(0, encoded.sigscript);
      try {
        txid = await submitSigned(pending);
      } catch (err) {
        if (txid && (replacementRefused(err) || mempoolFull(err))) return txid;
        throw err;
      }
      const stay = await watchInclusion(pending, txid);
      if (stay !== "in") return txid;
    }
    return txid;
  } catch (err) {
    throw scrub(err, [key, feeSecret]);
  }
}

async function readPeg(rpc, lock) {
  const { entries } = await callRpc(
    rpc,
    () => rpc.getUtxosByAddresses([lock.pegAddress]),
    PEG_UTXO_MS,
    "The Testnet-10 node stalled."
  );
  const peg = (entries || []).find((row) => sameOut(row, lock.txid, lock.index));
  if (!peg) throw new Error("That covenant output is already spent.");
  if (BigInt(peg.amount) !== BigInt(lock.sompi)) throw new Error("That covenant output does not match the lock.");
  return peg;
}

async function p2pk(kaspa, address, amount) {
  const spk = kaspa.payToAddressScript(address);
  return { address, amount, script: scriptHex(spk) };
}

async function continuation(kaspa, row, amount) {
  const built = await compileRow(row);
  const peg = await pegAddress(kaspa, built);
  return { address: peg.address, amount, script: peg.script, pegAddress: peg.address };
}

function nextRow(lock, patch) {
  return { ...lock, ...patch };
}

export function createPegLock() {
  armKeep();
  pegClient().catch(() => {});
  return {
    async plan({ address, rail, sompi, usdPerKas, ownerKey }) {
      const numbers = openingNumbers(sompi, usdPerKas);
      let issuer;
      try {
        issuer = issuerKey();
      } catch (err) {
        throw scrub(err, "");
      }
      const secret = issuer.privHex;
      try {
        const kaspa = await sdk();
        const owner = await ownerPub(kaspa, ownerKey, address);
        const born = await askEncoder({
          op: "birth",
          secret,
          cents: asNum(numbers.cents),
          sompi: asNum(numbers.sompi),
          quoteMicro: asNum(numbers.quoteMicro),
        });
        const row = {
          issuer: String(born.pubkey).toLowerCase(),
          reserve: String(born.pubkey).toLowerCase(),
          owner,
          openSig: String(born.sig).toLowerCase(),
          cents: String(numbers.cents),
          rail,
          frozen: false,
          quoteMicro: String(numbers.quoteMicro),
          bornCents: String(numbers.bornCents),
          bornSompi: String(numbers.bornSompi),
        };
        const built = await compileRow(row);
        const peg = await pegAddress(kaspa, built);
        return {
          id: randomBytes(8).toString("hex"),
          pegAddress: peg.address,
          address,
          rail,
          sompi: String(numbers.sompi),
          cents: String(numbers.cents),
          quoteMicro: row.quoteMicro,
          bornCents: row.bornCents,
          bornSompi: row.bornSompi,
          openSig: row.openSig,
          issuer: row.issuer,
          reserve: row.reserve,
          owner,
        };
      } catch (err) {
        throw scrub(err, secret);
      } finally {
        issuer.privHex = "";
      }
    },

    async waitOutput(address, txid, sompi) {
      const deadline = Date.now() + 70_000;
      while (Date.now() < deadline) {
        try {
          const rpc = await pegClient();
          const hit = await findOutput(rpc, address, txid, sompi);
          if (hit) {
            return { txid: String(txid), index: Number(hit.outpoint.index), amount: String(hit.amount) };
          }
        } catch (err) {
          if (!pegCallFailed(err)) throw err;
        }
        await sleep(PEG_POLL_MS);
      }
      throw new Error("The covenant output is not on Testnet 10 yet. Press Swap again. That does not send a second time.");
    },

    async redeem({ lock, ownerKey, take, ownerAddress }) {
      const kaspa = await sdk();
      const owner = await ownerPub(kaspa, ownerKey, ownerAddress);
      if (owner !== String(lock.owner).toLowerCase()) throw new Error("The signing key does not match this lock.");
      const pay = BigInt(lockShareOf(lock, take));
      const out = [await p2pk(kaspa, ownerAddress, pay)];
      if (BigInt(take) !== BigInt(lock.cents)) {
        const rest = await continuation(kaspa, nextRow(lock, restPatch(lock, take, pay)), BigInt(lock.sompi) - pay);
        out.push(rest);
      }
      const txid = await submitEntry({
        lock,
        entry: "redeem",
        take,
        covenantKey: ownerKey,
        feeKey: ownerKey,
        feeAddress: ownerAddress,
        outputs: out,
      });
      return { txid };
    },

    async exchange({ lock, ownerKey, take, ownerAddress }) {
      const kaspa = await sdk();
      const owner = await ownerPub(kaspa, ownerKey, ownerAddress);
      if (owner !== String(lock.owner).toLowerCase()) throw new Error("The signing key does not match this lock.");
      const pay = BigInt(lockShareOf(lock, take));
      const flipped = nextRow(lock, {
        rail: lock.rail === "poc" ? "kusdt" : "poc",
        cents: String(take),
        sompi: String(pay),
        frozen: false,
      });
      const moved = await continuation(kaspa, flipped, pay);
      const out = [moved];
      if (BigInt(take) !== BigInt(lock.cents)) {
        out.push(await continuation(kaspa, nextRow(lock, restPatch(lock, take, pay)), BigInt(lock.sompi) - pay));
      }
      const txid = await submitEntry({
        lock,
        entry: "exchange",
        take,
        covenantKey: ownerKey,
        feeKey: ownerKey,
        feeAddress: ownerAddress,
        outputs: out,
      });
      return { txid };
    },

    async spend({ lock, ownerKey, take, ownerAddress }) {
      const kaspa = await sdk();
      const owner = await ownerPub(kaspa, ownerKey, ownerAddress);
      if (owner !== String(lock.owner).toLowerCase()) throw new Error("The signing key does not match this lock.");
      const pay = BigInt(lockShareOf(lock, take));
      let reserveAddress = "";
      try {
        reserveAddress = issuerKey().fromAddr;
      } catch (err) {
        throw scrub(err, "");
      }
      const out = [await p2pk(kaspa, reserveAddress, pay)];
      if (BigInt(take) !== BigInt(lock.cents)) {
        out.push(await continuation(kaspa, nextRow(lock, restPatch(lock, take, pay)), BigInt(lock.sompi) - pay));
      }
      const txid = await submitEntry({
        lock,
        entry: "spend",
        take,
        covenantKey: ownerKey,
        feeKey: ownerKey,
        feeAddress: ownerAddress,
        outputs: out,
      });
      return { txid };
    },

    async freeze({ lock, feeKey, feeAddress }) {
      const kaspa = await sdk();
      let issuer;
      try {
        issuer = issuerKey();
      } catch (err) {
        throw scrub(err, "");
      }
      const payer = feeKey || issuer.privHex;
      const payerAddress = feeAddress || issuer.fromAddr;
      try {
        const flipped = nextRow(lock, { frozen: !lock.frozen });
        const moved = await continuation(kaspa, flipped, BigInt(lock.sompi));
        const txid = await submitEntry({
          lock,
          entry: "freeze",
          take: null,
          covenantKey: issuer.privHex,
          feeKey: payer,
          feeAddress: payerAddress,
          outputs: [moved],
        });
        return { txid };
      } finally {
        issuer.privHex = "";
      }
    },

    async recover({ lock, ownerKey, ownerAddress }) {
      const kaspa = await sdk();
      const owner = await ownerPub(kaspa, ownerKey, ownerAddress);
      if (owner !== String(lock.owner).toLowerCase()) throw new Error("The signing key does not match this lock.");
      const out = [await p2pk(kaspa, ownerAddress, BigInt(lock.sompi))];
      const txid = await submitEntry({
        lock,
        entry: "recover",
        take: null,
        covenantKey: ownerKey,
        feeKey: ownerKey,
        feeAddress: ownerAddress,
        outputs: out,
      });
      return { txid };
    },
  };
}

function lockShareOf(lock, take) {
  const have = BigInt(lock.cents);
  const want = BigInt(take);
  if (want === have) return BigInt(lock.sompi);
  return (BigInt(lock.sompi) * want) / have;
}

function restPatch(lock, take, pay) {
  return {
    cents: String(BigInt(lock.cents) - BigInt(take)),
    sompi: String(BigInt(lock.sompi) - BigInt(pay)),
  };
}
