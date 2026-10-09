/** SquarePeg on Testnet 10. The key stays in this process. Nothing here is a dollar. */

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PAGE_PRIORITY_SOMPI, pageFeeRate } from "../faucet/fee-rate.mjs";
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

function scrub(err, keys) {
  let msg = (err && err.message) || "The covenant did not broadcast.";
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const secret = String(key || "").trim().toLowerCase();
    if (secret.length > 8 && msg.toLowerCase().includes(secret)) msg = "The covenant did not broadcast.";
  }
  if (/private-key|mnemonic|seed phrase|privHex|receive-0-private-key/i.test(msg)) msg = "The covenant did not broadcast.";
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

async function ownerPub(kaspa, ownerKey, address) {
  const priv = new kaspa.PrivateKey(String(ownerKey || "").trim());
  const derived = String(priv.toAddress("testnet-10")).trim();
  if (derived.toLowerCase() !== String(address || "").trim().toLowerCase()) {
    throw new Error("The signing key does not match the address.");
  }
  return hexKey(new kaspa.Address(derived).payload);
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

async function feeRate() {
  try {
    const { quotedPageFeeRate } = await import("../faucet/pay.mjs");
    const n = Number(await quotedPageFeeRate());
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* The floor below is the page rate. */
  }
  return pageFeeRate(null);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRpc(fn) {
  const kaspa = await sdk();
  const rpc = new kaspa.RpcClient({
    resolver: new kaspa.Resolver(),
    encoding: kaspa.Encoding.Borsh,
    networkId: "testnet-10",
  });
  await rpc.connect();
  try {
    return await fn(kaspa, rpc);
  } finally {
    await rpc.disconnect().catch(() => {});
  }
}

function sameOut(entry, txid, index) {
  const out = entry && entry.outpoint;
  return !!out && String(out.transactionId) === String(txid) && Number(out.index) === Number(index);
}

async function findOutput(rpc, address, txid, sompi) {
  const { entries } = await rpc.getUtxosByAddresses([address]);
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

async function buildTx(kaspa, rpc, { peg, feeAddress, outputs, priority, feeRate: rate }) {
  const { entries } = await rpc.getUtxosByAddresses([feeAddress]);
  const coins = (entries || [])
    .filter((entry) => !sameOut(entry, peg.outpoint.transactionId, peg.outpoint.index))
    .sort((a, b) => (BigInt(a.amount) < BigInt(b.amount) ? 1 : -1));
  if (!coins.length) throw new Error(FEE);
  const picked = [];
  let sum = 0n;
  for (const coin of coins) {
    if (picked.length === 2) break;
    picked.push(coin);
    sum += BigInt(coin.amount);
    if (sum > priority) break;
  }
  if (sum <= priority) throw new Error(FEE);
  const { transactions } = await kaspa.createTransactions({
    priorityEntries: [peg],
    entries: picked,
    outputs,
    changeAddress: feeAddress,
    priorityFee: priority,
    feeRate: rate,
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
  return pending;
}

async function submitEntry({ lock, entry, take, covenantKey, feeKey, feeAddress, outputs }) {
  const key = String(covenantKey || "");
  const fee = String(feeKey || "");
  try {
    return await withRpc(async (kaspa, rpc) => {
      const { entries } = await rpc.getUtxosByAddresses([lock.pegAddress]);
      const peg = (entries || []).find((row) => sameOut(row, lock.txid, lock.index));
      if (!peg) throw new Error("That covenant output is already spent.");
      if (BigInt(peg.amount) !== BigInt(lock.sompi)) throw new Error("That covenant output does not match the lock.");
      const rate = await feeRate();
      const current = await compileRow(lock);
      const priorityGuess = BigInt(current.bytecode.length / 2 + 800) * BigInt(rate);
      const floor = BigInt(PAGE_PRIORITY_SOMPI);
      const priority = priorityGuess > floor ? priorityGuess : floor;
      const pending = await buildTx(kaspa, rpc, { peg, feeAddress, outputs, priority, feeRate: rate });
      const feePriv = new kaspa.PrivateKey(fee);
      pending.sign([feePriv], false);
      const signer = new kaspa.PrivateKey(key);
      const signature = String(await pending.createInputSignature(0, signer)).trim().replace(/^0x/, "");
      if (!/^[0-9a-fA-F]{130}$/.test(signature)) throw new Error("The covenant signature was short. Nothing was sent.");
      const job = { op: "encode", entry, sig: signature, ...openingJob(lock) };
      if (take != null) job.take = asNum(take);
      const encoded = await askEncoder(job);
      pending.fillInput(0, encoded.sigscript);
      const txid = String(await pending.submit(rpc)).trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error("The covenant did not broadcast.");
      return txid;
    });
  } catch (err) {
    throw scrub(err, [key, fee]);
  }
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
      return withRpc(async (_kaspa, rpc) => {
        const deadline = Date.now() + 70_000;
        while (Date.now() < deadline) {
          const hit = await findOutput(rpc, address, txid, sompi);
          if (hit) {
            return { txid: String(txid), index: Number(hit.outpoint.index), amount: String(hit.amount) };
          }
          await sleep(2000);
        }
        throw new Error("The covenant output is not on Testnet 10 yet. Press Swap again. That does not send a second time.");
      });
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
