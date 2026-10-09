import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyHandshake } from "./kachat.mjs";
import { applyClaim, applyOfferBuy, applySite } from "./layer.mjs";
import { applySpend, publicAccount } from "./ledger.mjs";
import { KNOWN_DIGEST, birthDigestHex, birthMessage } from "./peg.mjs";
import { afterMove, chainWouldCover, planTake } from "./peg-book.mjs";

const A = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const B = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

test("the birth message is the known little-endian vector", () => {
  assert.equal(birthMessage(5, 100_000_000, 50_000).toString("hex"), "050000000000000000e1f5050000000050c3000000000000");
  assert.equal(birthDigestHex(5, 100_000_000, 50_000), KNOWN_DIGEST);
});

test("a take spends the purse, then a covenant lock, then an older reserve row", () => {
  const account = {
    poc: "10",
    pocBacked: "4",
    chainLocks: [{ id: "aa:0", rail: "poc", cents: "3", sompi: "300", frozen: false }],
  };
  const spent = planTake(account, "poc", 8n, "spend");
  assert.equal(spent.practice, 6n);
  assert.equal(spent.chain.length, 1);
  assert.equal(spent.chain[0].take, 2n);
  assert.equal(spent.chain[0].pay, 200n);
  assert.equal(spent.old, 0n);
  assert.equal(spent.short, 0n);
  const redeemed = planTake(account, "poc", 8n, "redeem");
  assert.equal(redeemed.practice, 0n);
  assert.equal(redeemed.chain[0].take, 3n);
  assert.equal(redeemed.chain[0].pay, 300n);
  assert.equal(redeemed.old, 4n);
  assert.equal(redeemed.short, 1n);
});

test("a move keeps the remainder and flips only the exchanged part", () => {
  const lock = { id: "aa:0", rail: "poc", cents: "5", sompi: "100", frozen: true, owner: "11" };
  const rest = afterMove(lock, "redeem", 2n, 40n, "bb");
  assert.equal(rest.length, 1);
  assert.equal(rest[0].id, "bb:1");
  assert.equal(rest[0].cents, "3");
  assert.equal(rest[0].sompi, "60");
  assert.equal(rest[0].frozen, true);
  const flipped = afterMove(lock, "exchange", 2n, 40n, "cc");
  assert.equal(flipped[0].rail, "kusdt");
  assert.equal(flipped[0].frozen, false);
  assert.equal(flipped[0].id, "cc:0");
  assert.equal(flipped[1].rail, "poc");
  assert.equal(flipped[1].id, "cc:1");
});

test("the public account adds chain cents and hides the opening", () => {
  const state = {
    accounts: {
      [A.toLowerCase()]: {
        address: A,
        poc: "0",
        kusdt: "0",
        pocBacked: "0",
        kusdtBacked: "0",
        pocLiability: "0",
        kusdtLiability: "0",
        liability: "0",
        kusdtFrozen: false,
        chainLocks: [{
          id: "ab:0",
          rail: "poc",
          cents: "5",
          sompi: "100000000",
          frozen: false,
          openSig: "ab".repeat(64),
          owner: "de".repeat(32),
          issuer: "33".repeat(32),
          reserve: "44".repeat(32),
        }],
      },
    },
    receipts: [],
  };
  const pub = publicAccount(state, A);
  assert.equal(pub.poc, "5");
  assert.equal(pub.pocBacked, "5");
  assert.equal(pub.peg, true);
  const text = JSON.stringify(pub);
  assert.equal(text.includes("openSig"), false);
  assert.equal(text.includes("de".repeat(32)), false);
  assert.equal(text.includes("33".repeat(32)), false);
});

test("a shop burn of a covenant share does not also burn the purse", () => {
  const state = { accounts: {}, receipts: [], seq: "0", txids: {} };
  const paid = applySpend(state, {
    address: A,
    shop: "cafe",
    sku: "water",
    rail: "poc",
    confirmed: true,
    prepaidCents: "10",
    chainSompi: "1000",
    chainTxid: "ab".repeat(32),
  }, 1);
  assert.equal(paid.result.ok, true);
  assert.equal(paid.state.accounts[A.toLowerCase()].poc, "0");
  assert.equal(paid.result.receipt.txid, "ab".repeat(32));
  assert.equal(paid.result.receipt.sompi, "1000");
  assert.throws(
    () => applySpend(state, {
      address: A,
      shop: "cafe",
      sku: "water",
      rail: "poc",
      confirmed: true,
      prepaidCents: "11",
    }, 2),
    /covenant part does not match/
  );
});

test("chat and an offer refuse a SquarePeg lock when the purse is short", () => {
  const lock = { rail: "poc", cents: "200", sompi: "100", frozen: false };
  const chat = {
    accounts: {
      [A.toLowerCase()]: { address: A, poc: "0", kusdt: "0", pocBacked: "0", kusdtBacked: "0", chainLocks: [lock] },
    },
    hands: [],
    notes: [],
  };
  assert.equal(chainWouldCover(chat.accounts[A.toLowerCase()], "poc", 1n), true);
  assert.throws(() => applyHandshake(chat, { address: A, to: B }, 1), /SquarePeg lock is not the chat fee/);
  let sites = { accounts: {}, receipts: [], seq: "0", sites: {} };
  sites.accounts[A.toLowerCase()] = { address: A, poc: "0", kusdt: "0", pocBacked: "0", kusdtBacked: "0" };
  sites = applyClaim(sites, { address: A, name: "lumbridge", kns: "tn10" }, 1).state;
  sites = applySite(sites, {
    address: A,
    name: "lumbridge",
    title: "Loaves",
    offers: [{ name: "Loaf", cents: "150", kind: "product" }],
  }, 2).state;
  sites.accounts[B.toLowerCase()] = {
    address: B,
    poc: "0",
    kusdt: "0",
    pocBacked: "0",
    kusdtBacked: "0",
    chainLocks: [{ rail: "poc", cents: "150", sompi: "100", frozen: false }],
  };
  assert.throws(
    () => applyOfferBuy(sites, { address: B, name: "lumbridge", offer: "1", rail: "poc" }, 3),
    /SquarePeg lock is not this payment/
  );
});

test("the wasm locking script matches the encoder for one opening", async () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const bin = path.join(dir, "..", "peg", "target", "debug", "peg-encode.exe");
  const job = {
    op: "script",
    issuer: "03".repeat(32),
    reserve: "04".repeat(32),
    owner: "07".repeat(32),
    openSig: "ab".repeat(64),
    cents: 5,
    sompi: 100_000_000,
    quoteMicro: 50_000,
    rail: 0,
    frozen: 0,
    bornCents: 5,
    bornSompi: 100_000_000,
  };
  const built = await new Promise((resolve, reject) => {
    const child = spawn(bin, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (buf) => { out += buf; });
    child.stderr.on("data", (buf) => { err += buf; });
    child.on("error", () => reject(new Error("The peg encoder is not built.")));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err.trim() || "The peg encoder stopped."));
      else resolve(JSON.parse(out));
    });
    child.stdin.end(JSON.stringify(job));
  });
  const wasmPath = `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/nodejs/kaspa/kaspa.js`;
  const wsFrom = `${homedir().replace(/\\/g, "/")}/grok-test-cascade-work/wasm-sdk/kaspa-wasm32-sdk/examples/nodejs/javascript/transactions/simple-transaction.js`;
  const require = createRequire(wsFrom);
  globalThis.WebSocket = require("websocket").w3cwebsocket;
  const kaspa = await import(pathToFileURL(wasmPath).href);
  const spk = kaspa.payToScriptHashScript(Buffer.from(built.bytecode, "hex"));
  assert.equal(String(spk.script).toLowerCase(), String(built.script).toLowerCase());
  assert.equal(Number(built.version), 0);
  const address = String(kaspa.addressFromScriptPublicKey(spk, "testnet-10") || "");
  assert.match(address, /^kaspatest:/);
});
