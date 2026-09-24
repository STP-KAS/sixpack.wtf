/**
 * Pay tKAS from groks-wallet on Testnet-10.
 * Keys stay in groks-wallet/secrets (gitignored). Never imported into git here.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { FROM } from "./policy.mjs";

const WASM =
  process.env.KASPA_WASM ||
  "C:/Users/<user>/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js";
const WS_FROM =
  process.env.KASPA_WS_FROM ||
  "C:/Users/<user>/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js";
const SECRET =
  process.env.FAUCET_SECRET ||
  "C:/Users/<user>/Documents/kaspa/groks-wallet/secrets/wallet.txt";
const RPC_URL = process.env.FAUCET_RPC || "127.0.0.1:17210";
const MAX_INPUTS = 80;
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
    await rpc.disconnect().catch(() => undefined);
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
  try {
    return await openRpc(kaspa, net, RPC_URL, 2500);
  } catch (_) {}
  const urls = await publicUrls();
  let last = new Error("No public Testnet-10 node answered.");
  for (const url of urls) {
    try {
      return await openRpc(kaspa, net, url, 8000);
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

export async function payTn10(toAddr, sompi, onStep) {
  const step = (name) => {
    if (onStep) onStep(name);
  };
  const kaspa = await sdk();
  const { privHex, fromAddr } = loadKey();
  const privateKey = new kaspa.PrivateKey(privHex);
  const net = new kaspa.NetworkId("testnet-10");
  const rpc = await connectRpc(kaspa, net, step);
  const txids = [];
  let sent = 0n;
  const want = BigInt(sompi);
  try {
    step("Gathering coins");
    let { entries } = await withTimeout(
      rpc.getUtxosByAddresses([fromAddr]),
      45000,
      "Reading faucet coins took too long."
    );
    entries = [...entries].sort((a, b) => {
      const aa = BigInt(a.amount);
      const bb = BigInt(b.amount);
      return aa < bb ? 1 : aa > bb ? -1 : 0;
    });
    let cursor = 0;
    let guard = 0;
    while (sent < want && cursor < entries.length && guard < 160) {
      guard += 1;
      const need = want - sent + 50_000_000n;
      const picked = [];
      let acc = 0n;
      while (cursor < entries.length && picked.length < MAX_INPUTS && acc < need) {
        picked.push(entries[cursor]);
        acc += BigInt(entries[cursor].amount);
        cursor += 1;
      }
      if (!picked.length || acc < 10n * 100_000_000n + 1_000_000n) break;
      const chunk = acc - 50_000_000n > want - sent ? want - sent : acc - 50_000_000n;
      if (chunk <= 0n) break;
      step("Signing the send");
      const { transactions } = await kaspa.createTransactions({
        entries: picked,
        outputs: [{ address: toAddr, amount: chunk }],
        priorityFee: 1000n,
        changeAddress: fromAddr,
        networkId: net,
      });
      for (const pending of transactions) {
        await pending.sign([privateKey]);
        step("Broadcasting");
        const txid = await withTimeout(pending.submit(rpc), 20000, "The Testnet-10 node did not take the send.");
        txids.push(String(txid));
      }
      sent += chunk;
    }
    if (!txids.length) throw new Error("No mature UTXOs large enough. Miner is still stacking dust.");
    return { ok: true, from: fromAddr, to: toAddr, sompi: sent.toString(), txids };
  } finally {
    await rpc.disconnect().catch(() => undefined);
  }
}
