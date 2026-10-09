import { homedir } from "node:os";
/**
 * Pay tKAS from groks-wallet on Testnet-10.
 * Keys stay in groks-wallet/secrets (gitignored). Never imported into git here.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { pageFeeRate, payFeeRate } from "./fee-rate.mjs";
import { FROM, isBuildWallet, sompiToTkas } from "./policy.mjs";

const WASM =
  process.env.KASPA_WASM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js`;
const WS_FROM =
  process.env.KASPA_WS_FROM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js`;
const SECRET =
  process.env.FAUCET_SECRET ||
  `${homedir().replace(/\\/g, "/")}/Documents/kaspa/groks-wallet/secrets/wallet.txt`;
const RPC_URL = process.env.FAUCET_RPC || "127.0.0.1:17210";
/** A refused local port still takes about two seconds. Remember that and do not wait it out on the next send. */
const LOCAL_WAIT_MS = 1500;
const LOCAL_DOWN_MS = 60_000;
/** The page rate is already 87 times the standard. A slow quote must not hold the click. */
const FEE_WAIT_MS = 400;
let localDownUntil = 0;

/** Try the desk node until it misses. After that, go straight to a public Testnet-10 node. */
export function rpcConnectPlan(now, downUntil) {
  return now < downUntil ? "public" : "local";
}
const MAX_INPUTS = 80;
/** One click may join this many batches. More than that stays on the page as a finished error. */
const MAX_BATCHES = 40;
/** Build wallet only. 3,000,000 tKAS needs about 9,000 batches of these small coins. */
const BUILD_BATCHES = 15_000;
const COINBASE_MATURITY = 1000n;

/** Coinbase outputs cannot be spent until 1000 DAA scores have passed. */
export function isMatureEntry(entry, virtualDaa) {
  if (entry?.isCoinbase !== true) return true;
  const born = BigInt(entry.blockDaaScore ?? 0);
  return BigInt(virtualDaa) >= born + COINBASE_MATURITY;
}
const FAST_RESOLVERS = [
  "https://eric.kaspa.stream",
  "https://maxim.kaspa.stream",
  "https://troy.kaspa.stream",
  "https://mike.kaspa.red",
  "https://jack.kaspa.blue",
];
const FALLBACK_WSS = [
  "wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/borsh",
  "wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/borsh",
  "wss://muon-10.kaspa.blue/kaspa/testnet-10/wrpc/borsh",
  "wss://alpha-10.kaspa.stream/kaspa/testnet-10/wrpc/borsh",
];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function closeRpc(rpc) {
  if (!rpc) return;
  await withTimeout(rpc.disconnect(), 2000, "The Testnet-10 node stayed open.").catch(() => undefined);
}

/** The balance is there, but the pieces are too small for this request. */
export function splitSendMessage(have, fit) {
  return (
    "The faucet holds " +
    sompiToTkas(have) +
    " tKAS. The coins are too small to send this amount. One request can gather " +
    sompiToTkas(fit) +
    " tKAS."
  );
}

export function shortSendMessage(have) {
  return "The faucet holds " + sompiToTkas(have) + " tKAS. That is less than this send.";
}

async function openRpc(kaspa, net, url, ms) {
  const rpc = new kaspa.RpcClient({
    url,
    encoding: kaspa.Encoding.Borsh,
    networkId: net,
  });
  try {
    await withTimeout(rpc.connect(), ms, "Testnet-10 node did not answer.");
    const info = await withTimeout(rpc.getServerInfo(), 8000, "Testnet-10 node did not answer.");
    const id = String(info.networkId || "");
    if (!id.includes("testnet-10") && id !== "testnet-10") {
      throw new Error("node is not Testnet-10");
    }
    if (!info.isSynced) throw new Error("Testnet-10 node is not synced.");
    return rpc;
  } catch (err) {
    await closeRpc(rpc);
    throw err;
  }
}

async function publicUrls() {
  const found = [];
  await Promise.all(
    FAST_RESOLVERS.map(async (base) => {
      try {
        const r = await fetch(base + "/v2/kaspa/testnet-10/tls/wrpc/borsh", {
          signal: AbortSignal.timeout(3000),
        });
        if (!r.ok) return;
        const j = await r.json();
        if (typeof j.url === "string" && j.url.startsWith("wss://")) found.push(j.url);
      } catch (_) {}
    })
  );
  const urls = [];
  for (const url of found.concat(FALLBACK_WSS)) {
    if (!urls.includes(url)) urls.push(url);
  }
  return urls.slice(0, 4);
}

async function connectRpc(kaspa, net, onStep) {
  if (onStep) onStep("Connecting to Testnet-10");
  if (rpcConnectPlan(Date.now(), localDownUntil) === "local") {
    try {
      return await openRpc(kaspa, net, RPC_URL, LOCAL_WAIT_MS);
    } catch {
      localDownUntil = Date.now() + LOCAL_DOWN_MS;
    }
  }
  let last = new Error("No public Testnet-10 node answered.");
  for (const url of FALLBACK_WSS) {
    try {
      return await openRpc(kaspa, net, url, 2500);
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
  }
  const urls = await publicUrls();
  for (const url of urls) {
    if (FALLBACK_WSS.includes(url)) continue;
    try {
      return await openRpc(kaspa, net, url, 2500);
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw last;
}

let kaspaPromise;

async function sdk() {
  if (kaspaPromise) return kaspaPromise;
  kaspaPromise = (async () => {
    const require = createRequire(WS_FROM);
    globalThis.WebSocket = require("websocket").w3cwebsocket;
    const kaspa = await import(pathToFileURL(WASM).href);
    kaspa.initConsolePanicHook?.();
    return kaspa;
  })();
  return kaspaPromise;
}

function loadKey() {
  const secret = readFileSync(SECRET, "utf8");
  const pkLine = secret.split(/\r?\n/).find((l) => l.startsWith("receive-0-private-key:"));
  const fromLine = secret.split(/\r?\n/).find((l) => l.startsWith("receive-0:"));
  if (!pkLine || !fromLine) throw new Error("Faucet secret file is incomplete.");
  const fromAddr = fromLine.slice("receive-0:".length).trim();
  if (fromAddr !== FROM) throw new Error("Faucet key is not groks-wallet.");
  return { privHex: pkLine.split(":")[1].trim(), fromAddr };
}

const TESTNET_ADDRESS = /^kaspatest:[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{50,80}$/i;
const FEE_RESERVE = 50_000_000n;

/**
 * How many of the largest coins cover `want` plus one fee reserve per batch.
 * The count can be higher than one transaction. The caller joins those coins.
 */
export function selectCovering(amounts, want, feeReserve, maxInputs, maxBatches = 400) {
  const piles = [...amounts].map((amount) => BigInt(amount)).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const picked = [];
  let sum = 0n;
  const cap = maxInputs * maxBatches;
  const need = BigInt(want);
  const fee = BigInt(feeReserve);
  for (const pile of piles) {
    picked.push(pile);
    sum += pile;
    const batches = BigInt(Math.max(1, Math.ceil(picked.length / maxInputs)));
    if (sum >= need + fee * batches) return { count: picked.length, sum, ok: true };
    if (picked.length >= cap) break;
  }
  return { count: picked.length, sum, ok: false };
}

async function feeRateFor(rpc, rateOf = payFeeRate) {
  try {
    const quoted = await withTimeout(rpc.getFeeEstimate({}), FEE_WAIT_MS, "Reading the Testnet 10 fee took too long.");
    return rateOf(quoted);
  } catch {
    return rateOf(null);
  }
}

/** Doubled ordinary fee from a synced Testnet 10 node. No key and no spend. The faucet uses this. */
export async function quotedPayFeeRate() {
  const kaspa = await sdk();
  const net = new kaspa.NetworkId("testnet-10");
  const rpc = await connectRpc(kaspa, net);
  try {
    return await feeRateFor(rpc);
  } finally {
    await closeRpc(rpc);
  }
}

/** Six times the ordinary fee from a synced Testnet 10 node. No key and no spend. 1984 uses this. */
export async function quotedPageFeeRate() {
  const kaspa = await sdk();
  const net = new kaspa.NetworkId("testnet-10");
  const rpc = await connectRpc(kaspa, net);
  try {
    return await feeRateFor(rpc, pageFeeRate);
  } finally {
    await closeRpc(rpc);
  }
}

function assertPayAddress(value) {
  const address = String(value || "").trim();
  if (/^kaspa:/i.test(address) && !/^kaspatest:/i.test(address)) {
    throw new Error("Mainnet wallets are refused. Use a Testnet-10 address.");
  }
  if (!TESTNET_ADDRESS.test(address)) throw new Error("Use a Testnet-10 kaspatest: address.");
  return address;
}

/** New Testnet-10 key. Caller stores it. Do not log the return value. */
export async function mintTestnetAddress() {
  const kaspa = await sdk();
  const keypair = kaspa.Keypair.random();
  let privHex = String(keypair.privateKey || "").trim().toLowerCase();
  if (privHex.startsWith("0x")) privHex = privHex.slice(2);
  if (!/^[0-9a-f]{64}$/.test(privHex)) throw new Error("Test wallet was not created.");
  let address = "";
  try {
    address = String(new kaspa.PrivateKey(privHex).toAddress("testnet-10")).trim();
  } catch {
    throw new Error("Test wallet was not created.");
  }
  if (!TESTNET_ADDRESS.test(address)) throw new Error("Test wallet was not a Testnet-10 address.");
  return { address, key: privHex };
}

/**
 * Send tKAS from a hex key the caller already holds.
 * drain sends the mature balance back, leaving a small fee remainder.
 */
let spendLock = Promise.resolve();

function withSpendLock(fn) {
  const run = spendLock.then(fn, fn);
  spendLock = run.then(
    () => {},
    () => {}
  );
  return run;
}

export async function payFromKey({ privHex, fromAddr, toAddr, sompi, drain, onStep, rateOf }) {
  return withSpendLock(() => payFromKeyInner({ privHex, fromAddr, toAddr, sompi, drain, onStep, rateOf }));
}

async function payFromKeyInner({ privHex, fromAddr, toAddr, sompi, drain, onStep, rateOf }) {
  const step = (name, extra) => {
    if (onStep) onStep(name, extra);
  };
  const from = assertPayAddress(fromAddr);
  const to = assertPayAddress(toAddr);
  if (from.toLowerCase() === to.toLowerCase()) throw new Error("That address cannot pay itself.");
  const kaspa = await sdk();
  let privateKey;
  try {
    privateKey = new kaspa.PrivateKey(String(privHex || "").trim());
  } catch {
    throw new Error("The signing key could not be read.");
  }
  const derived = String(privateKey.toAddress("testnet-10")).trim();
  if (derived.toLowerCase() !== from.toLowerCase()) throw new Error("The signing key does not match the address.");
  const net = new kaspa.NetworkId("testnet-10");
  const rpc = await connectRpc(kaspa, net, step);
  const txids = [];
  let sent = 0n;
  try {
    step("Gathering coins");
    const dag = await withTimeout(rpc.getBlockDagInfo(), 8000, "Reading Testnet-10 tip took too long.");
    const virtualDaa = dag.virtualDaaScore ?? 0;
    let { entries } = await withTimeout(
      rpc.getUtxosByAddresses([from]),
      isBuildWallet(to) ? 180_000 : 20_000,
      "Reading coins took too long."
    );
    entries = [...entries].filter((entry) => isMatureEntry(entry, virtualDaa)).sort((a, b) => {
      const aa = BigInt(a.amount);
      const bb = BigInt(b.amount);
      return aa < bb ? 1 : aa > bb ? -1 : 0;
    });
    const rate = await feeRateFor(rpc, rateOf || payFeeRate);
    const slack = BigInt(Math.ceil(rate)) * 50_000n;
    if (drain) {
      const changeFloor = slack > 20_000_000n ? slack : 20_000_000n;
      const picked = entries.slice(0, MAX_INPUTS);
      let acc = 0n;
      for (const entry of picked) acc += BigInt(entry.amount);
      if (acc <= 1000n) return { ok: true, from, to, sompi: "0", txids, dust: true };
      let chunk;
      if (acc > changeFloor + 1000n) chunk = acc - changeFloor;
      else if (acc > slack) chunk = acc - slack;
      else chunk = acc / 2n;
      if (chunk <= 0n) return { ok: true, from, to, sompi: "0", txids, dust: true };
      step("Signing the send");
      const { transactions } = await kaspa.createTransactions({
        entries: picked,
        outputs: [{ address: to, amount: chunk }],
        priorityFee: 0n,
        feeRate: rate,
        changeAddress: to,
        networkId: net,
      });
      for (const pending of transactions) {
        await pending.sign([privateKey]);
        step("Broadcasting");
        const txid = await withTimeout(pending.submit(rpc), 20000, "The Testnet-10 node did not take the send.");
        txids.push(String(txid));
        step("Broadcasting", { txids: txids.slice() });
      }
      return { ok: true, from, to, sompi: chunk.toString(), txids };
    }
    const want = BigInt(sompi);
    const scaled = BigInt(Math.ceil(rate)) * 250_000n;
    const feeReserve = scaled > FEE_RESERVE ? scaled : FEE_RESERVE;
    if (want <= 0n) throw new Error("Type a tKAS amount above zero.");
    const batchCap = isBuildWallet(to) ? BUILD_BATCHES : MAX_BATCHES;
    const plan = selectCovering(
      entries.map((entry) => entry.amount),
      want,
      feeReserve,
      MAX_INPUTS,
      batchCap
    );
    const sendLimit = MAX_INPUTS * batchCap;
    if (!plan.ok || plan.count > sendLimit) {
      let have = 0n;
      for (const entry of entries) have += BigInt(entry.amount);
      if (have < want) throw new Error(shortSendMessage(have));
      const picked = entries.slice(0, Math.min(entries.length, sendLimit));
      let fit = 0n;
      for (const entry of picked) fit += BigInt(entry.amount);
      const batches = BigInt(Math.max(1, Math.ceil(picked.length / MAX_INPUTS) || 1));
      fit = fit > feeReserve * batches ? fit - feeReserve * batches : 0n;
      throw new Error(splitSendMessage(have, fit));
    }
    let cursor = 0;
    let guard = 0;
    const guardMax = Math.max(1, Math.ceil(plan.count / MAX_INPUTS));
    while (sent < want && cursor < entries.length && guard < guardMax) {
      guard += 1;
      const need = want - sent + feeReserve;
      const picked = [];
      let acc = 0n;
      while (cursor < entries.length && picked.length < MAX_INPUTS && acc < need) {
        picked.push(entries[cursor]);
        acc += BigInt(entries[cursor].amount);
        cursor += 1;
      }
      if (!picked.length || acc <= feeReserve) break;
      const chunk = acc - feeReserve > want - sent ? want - sent : acc - feeReserve;
      if (chunk <= 0n) break;
      step("Signing the send", { detail: guard + " of " + guardMax });
      const { transactions } = await kaspa.createTransactions({
        entries: picked,
        outputs: [{ address: to, amount: chunk }],
        priorityFee: 0n,
        feeRate: rate,
        changeAddress: from,
        networkId: net,
      });
      for (const pending of transactions) {
        await pending.sign([privateKey]);
        step("Broadcasting", { detail: guard + " of " + guardMax });
        const txid = await withTimeout(pending.submit(rpc), 20000, "The Testnet-10 node did not take the send.");
        txids.push(String(txid));
        step("Broadcasting", { detail: guard + " of " + guardMax, txids: txids.slice() });
      }
      sent += chunk;
    }
    if (!txids.length) throw new Error(splitSendMessage(0n, 0n));
    return { ok: true, from, to, sompi: sent.toString(), txids };
  } finally {
    await closeRpc(rpc);
  }
}

export async function payTn10(toAddr, sompi, onStep, rateOf) {
  const { privHex, fromAddr } = loadKey();
  return payFromKey({ privHex, fromAddr, toAddr, sompi, onStep, rateOf });
}
