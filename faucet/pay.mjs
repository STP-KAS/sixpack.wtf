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
  "C:/Users/Remco/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js";
const WS_FROM =
  process.env.KASPA_WS_FROM ||
  "C:/Users/Remco/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js";
const SECRET =
  process.env.FAUCET_SECRET ||
  "C:/Users/Remco/Documents/kaspa/groks-wallet/secrets/wallet.txt";
const RPC_URL = process.env.FAUCET_RPC || "127.0.0.1:17210";
const MAX_INPUTS = 80;

async function connectRpc(kaspa, net) {
  const tryLocal = async () => {
    const rpc = new kaspa.RpcClient({
      url: RPC_URL,
      encoding: kaspa.Encoding.Borsh,
      networkId: net,
    });
    await rpc.connect();
    const info = await rpc.getServerInfo();
    const id = String(info.networkId || "");
    if (!id.includes("testnet-10") && id !== "testnet-10") {
      await rpc.disconnect().catch(() => undefined);
      throw new Error("local node is not Testnet-10");
    }
    if (!info.isSynced) {
      await rpc.disconnect().catch(() => undefined);
      throw new Error("local TN10 node is not synced");
    }
    return rpc;
  };
  const tryPublic = async () => {
    const rpc = new kaspa.RpcClient({
      resolver: new kaspa.Resolver(),
      encoding: kaspa.Encoding.Borsh,
      networkId: net,
    });
    await rpc.connect();
    const info = await rpc.getServerInfo();
    const id = String(info.networkId || "");
    if (!id.includes("testnet-10") && id !== "testnet-10") {
      await rpc.disconnect().catch(() => undefined);
      throw new Error("public resolver did not return Testnet-10");
    }
    if (!info.isSynced) {
      await rpc.disconnect().catch(() => undefined);
      throw new Error("public TN10 node is not synced");
    }
    return rpc;
  };
  try {
    return await tryLocal();
  } catch (_) {
    return await tryPublic();
  }
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

export async function payTn10(toAddr, sompi) {
  const kaspa = await sdk();
  const { privHex, fromAddr } = loadKey();
  const privateKey = new kaspa.PrivateKey(privHex);
  const net = new kaspa.NetworkId("testnet-10");
  const rpc = await connectRpc(kaspa, net);
  const txids = [];
  let sent = 0n;
  const want = BigInt(sompi);
  try {
    let { entries } = await rpc.getUtxosByAddresses([fromAddr]);
    entries = [...entries].sort((a, b) => {
      const aa = BigInt(a.amount);
      const bb = BigInt(b.amount);
      return aa < bb ? 1 : aa > bb ? -1 : 0;
    });
    let cursor = 0;
    let guard = 0;
    while (sent < want && cursor < entries.length && guard < 40) {
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
      const { transactions } = await kaspa.createTransactions({
        entries: picked,
        outputs: [{ address: toAddr, amount: chunk }],
        priorityFee: 1000n,
        changeAddress: fromAddr,
        networkId: net,
      });
      for (const pending of transactions) {
        await pending.sign([privateKey]);
        const txid = await pending.submit(rpc);
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
