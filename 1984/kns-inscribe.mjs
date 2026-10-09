/** One TN10 KNS inscription. Commit, then reveal. The key stays with the caller.
 * This is the indexer envelope, not a deployed KasName covenant.
 */

import { createRequire } from "node:module";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { knsPlan } from "./kns-plan.mjs";

const WASM =
  process.env.KASPA_WASM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js`;
const WS_FROM =
  process.env.KASPA_WS_FROM ||
  `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js`;

const KNS_API = "https://api.knsdomains.org/tn10/api/v1";

let kaspaPromise;

function scrub(err, key) {
  let msg = (err && err.message) || "The inscription did not broadcast.";
  const secret = String(key || "").trim().toLowerCase();
  if (secret && msg.toLowerCase().includes(secret)) msg = "The inscription did not broadcast.";
  if (/private-key|mnemonic|seed phrase|privHex/i.test(msg)) msg = "The inscription did not broadcast.";
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

async function freeOnIndex(plan, payer, fetchImpl) {
  const res = await fetchImpl(KNS_API + "/domains/check", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ domainNames: [plan.domain], address: payer }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => null);
  const row = body && body.data && body.data.domains && body.data.domains[0];
  if (!row) throw new Error("The KNS testnet index did not say whether this name is free.");
  if (row.isReservedDomain === true) throw new Error("That name is reserved on the KNS testnet index.");
  if (row.available !== true) throw new Error("That name is already on the KNS testnet index.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function inscribeTn10({ privHex, from, label, fetchImpl }) {
  const plan = knsPlan(label);
  const key = String(privHex || "").trim();
  const fetchFn = fetchImpl || fetch;
  try {
    await freeOnIndex(plan, String(from || "").trim(), fetchFn);
    const kaspa = await sdk();
    const privateKey = new kaspa.PrivateKey(key);
    const derived = String(privateKey.toAddress("testnet-10")).trim();
    if (derived.toLowerCase() !== String(from || "").trim().toLowerCase()) {
      throw new Error("The signing key does not match the address.");
    }
    const keypair = privateKey.toKeypair();
    const network = "testnet-10";
    const payload = plan.payload;
    const script = new kaspa.ScriptBuilder()
      .addData(keypair.xOnlyPublicKey)
      .addOp(kaspa.Opcodes.OpCheckSig)
      .addOp(kaspa.Opcodes.OpFalse)
      .addOp(kaspa.Opcodes.OpIf)
      .addData(Buffer.from("kns"))
      .addI64(0n)
      .addData(Buffer.from(payload))
      .addOp(kaspa.Opcodes.OpEndIf);
    const p2shAddress = kaspa.addressFromScriptPublicKey(script.createPayToScriptHashScript(), network).toString();
    const rpc = new kaspa.RpcClient({
      resolver: new kaspa.Resolver(),
      encoding: kaspa.Encoding.Borsh,
      networkId: network,
    });
    await rpc.connect();
    try {
      const { entries: preP2 } = await rpc.getUtxosByAddresses([p2shAddress]);
      const reuse = preP2 && preP2.length ? preP2[0] : null;
      let commitId = "";
      if (!reuse) {
        const { entries } = await rpc.getUtxosByAddresses([derived]);
        if (!entries || !entries.length) throw new Error("This wallet has no coins to inscribe with.");
        const sorted = [...entries].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? 1 : -1));
        const { transactions: commitTxs } = await kaspa.createTransactions({
          priorityEntries: [],
          entries: sorted.slice(0, 20),
          outputs: [{ address: p2shAddress, amount: kaspa.kaspaToSompi("1") }],
          changeAddress: derived,
          priorityFee: kaspa.kaspaToSompi("0.01"),
          networkId: network,
        });
        for (const pending of commitTxs) {
          pending.sign([privateKey]);
          commitId = await pending.submit(rpc);
        }
      }
      let p2shEntry = reuse;
      const deadline = Date.now() + 70_000;
      while (!p2shEntry && Date.now() < deadline) {
        await sleep(2000);
        const { entries: p2 } = await rpc.getUtxosByAddresses([p2shAddress]);
        const hit = p2 && p2.find((entry) => !commitId || entry.outpoint.transactionId === commitId);
        if (hit) p2shEntry = hit;
      }
      if (!p2shEntry) {
        return {
          ok: true,
          pending: true,
          domain: plan.domain,
          feeKas: plan.feeKas,
          commitId,
          note: "The commit is on Testnet-10. Press Inscribe again to finish this one name.",
        };
      }
      const { entries: fresh } = await rpc.getUtxosByAddresses([derived]);
      const spendable = [...(fresh || [])].sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? 1 : -1));
      const { transactions: revealTxs } = await kaspa.createTransactions({
        priorityEntries: [p2shEntry],
        entries: spendable.slice(0, 30),
        outputs: [{ address: plan.feeAddress, amount: kaspa.kaspaToSompi(String(plan.feeKas)) }],
        changeAddress: derived,
        priorityFee: kaspa.kaspaToSompi("0.02"),
        networkId: network,
      });
      let revealId = "";
      for (const pending of revealTxs) {
        pending.sign([privateKey], false);
        const inputs = pending.transaction.inputs;
        const idx = inputs.findIndex((input) => !input.signatureScript || input.signatureScript === "");
        if (idx === -1) throw new Error("The reveal had no place for the KNS envelope.");
        const signature = await pending.createInputSignature(idx, privateKey);
        pending.fillInput(idx, script.encodePayToScriptHashSignatureScript(signature));
        revealId = await pending.submit(rpc);
      }
      if (!/^[0-9a-f]{64}$/i.test(String(revealId))) throw new Error("The reveal did not return a transaction id.");
      return {
        ok: true,
        pending: false,
        domain: plan.domain,
        feeKas: plan.feeKas,
        commitId,
        revealId: String(revealId).toLowerCase(),
        inscriptionId: String(revealId).toLowerCase() + "i0",
        note: "Inscribed " + plan.domain + " on the KNS testnet index. One name. No covenant was deployed.",
      };
    } finally {
      await rpc.disconnect().catch(() => {});
    }
  } catch (err) {
    throw scrub(err, key);
  }
}
