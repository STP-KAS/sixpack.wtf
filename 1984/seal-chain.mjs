/** Put a short ciphertext in a Testnet-10 payload. The coins stay in the funded wallet.
 * Public resolver. Not the desk node. Not a KNS envelope. No covenant.
 */

import { createRequire } from "node:module";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { SEAL_HEADER, SEAL_PAYLOAD_MAX } from "./seal.mjs";

const WASM =
  process.env.KASPA_WASM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js`;
const WS_FROM =
  process.env.KASPA_WS_FROM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js`;

let kaspaPromise;

function scrub(err, key) {
  let msg = (err && err.message) || "The note did not go on Testnet-10.";
  const secret = String(key || "").trim().toLowerCase();
  if (secret && msg.toLowerCase().includes(secret)) msg = "The note did not go on Testnet-10.";
  if (/private-key|mnemonic|seed phrase|privHex/i.test(msg)) msg = "The note did not go on Testnet-10.";
  return new Error(msg);
}

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

export async function sealOnChain({ privHex, from, payload }) {
  const key = String(privHex || "").trim();
  const bytes = Buffer.from(payload || []);
  if (!bytes.length || bytes.length > SEAL_PAYLOAD_MAX) throw new Error("That note does not fit in a payload.");
  if (!bytes.subarray(0, SEAL_HEADER.length).equals(Buffer.from(SEAL_HEADER))) {
    throw new Error("That note does not fit in a payload.");
  }
  try {
    const kaspa = await sdk();
    const privateKey = new kaspa.PrivateKey(key);
    const derived = String(privateKey.toAddress("testnet-10")).trim();
    if (derived.toLowerCase() !== String(from || "").trim().toLowerCase()) {
      throw new Error("The signing key does not match the address.");
    }
    const network = "testnet-10";
    const rpc = new kaspa.RpcClient({
      resolver: new kaspa.Resolver(),
      encoding: kaspa.Encoding.Borsh,
      networkId: network,
    });
    await rpc.connect();
    try {
      const { entries } = await rpc.getUtxosByAddresses([derived]);
      if (!entries || !entries.length) throw new Error("This wallet has no coins for the payload fee.");
      const sorted = [...entries].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? 1 : -1));
      const { transactions } = await kaspa.createTransactions({
        entries: sorted.slice(0, 20),
        outputs: [{ address: derived, amount: kaspa.kaspaToSompi("0.2") }],
        changeAddress: derived,
        priorityFee: kaspa.kaspaToSompi("0.01"),
        payload: new Uint8Array(bytes),
        networkId: network,
      });
      let txid = "";
      for (const pending of transactions) {
        pending.sign([privateKey]);
        txid = await pending.submit(rpc);
      }
      if (!/^[0-9a-f]{64}$/i.test(String(txid))) throw new Error("The payload did not return a transaction id.");
      return { ok: true, txid: String(txid).toLowerCase() };
    } finally {
      await rpc.disconnect().catch(() => {});
    }
  } catch (err) {
    throw scrub(err, key);
  }
}
