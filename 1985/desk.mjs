/** 1985 desk. Keys stay in gitignored files. The API answers only on this computer. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { devnetRpc, invalidateSnapshot, snapshot } from "./chain.mjs";
import {
  FEE_CUSHION,
  allowDesk,
  formatKas,
  isDevnetAddress,
  matureEntry,
  parseKas,
  parseStpLock,
} from "./script.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const MINE = "C:\\Users\\Remco\\Documents\\kaspa\\stpnet\\target\\release\\stp-mine.exe";
const GRPC = "grpc://127.0.0.1:16610";

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, body) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body));
  fs.renameSync(tmp, file);
}

export function createDesk(opts) {
  const poolFile = opts.poolFile;
  const sessionFile = opts.sessionFile;
  let tail = Promise.resolve();
  function queue(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(() => {}, () => {});
    return run;
  }

  function loadPool() {
    const parsed = readJson(poolFile, null);
    if (!parsed || !Array.isArray(parsed.wallets)) return { miner: "", home: "", eachSompi: "0", txid: "", wallets: [] };
    return parsed;
  }

  function loadSessions() {
    const parsed = readJson(sessionFile, { sessions: {} });
    if (!parsed.sessions || typeof parsed.sessions !== "object") parsed.sessions = {};
    return parsed;
  }

  function publicWallet(session, extra) {
    return {
      ok: true,
      address: session.address,
      token: session.token,
      gift: formatKas(session.sompi || 0),
      ...extra,
    };
  }

  async function open(marker) {
    return queue(async () => {
      if (!/^[0-9a-f]{32}$/.test(marker)) {
        throw fail(400, "This desk cannot tell this browser from a new one.");
      }
      const sessions = loadSessions();
      const existing = Object.entries(sessions.sessions).find(([, row]) => row && row.marker === marker);
      if (existing) {
        const [token, row] = existing;
        return publicWallet({ ...row, token }, { same: true });
      }
      const pool = loadPool();
      const row = pool.wallets.find((item) => item && item.ready === true && item.address && item.key);
      if (!row) throw fail(404, "The prepaid wallets on this desk are all in use.");
      if (!isDevnetAddress(row.address)) throw fail(500, "A prepaid wallet is not a devnet address.");
      const token = crypto.randomBytes(16).toString("hex");
      sessions.sessions[token] = {
        address: row.address,
        key: String(row.key),
        marker,
        sompi: String(row.sompi || "0"),
        at: opts.now(),
      };
      writeJson(sessionFile, sessions);
      row.ready = false;
      row.marker = marker;
      writeJson(poolFile, pool);
      return publicWallet({ address: row.address, token, sompi: row.sompi }, { same: false });
    });
  }

  async function wallet(token) {
    const sessions = loadSessions();
    const row = sessions.sessions[token];
    if (!row) throw fail(404, "This funded wallet is not open on this desk.");
    const picture = await opts.balance(row.address);
    return { ...publicWallet({ ...row, token }, {}), ...picture, ok: true };
  }

  async function send({ token, to, amount }) {
    return queue(async () => {
      const sessions = loadSessions();
      const row = sessions.sessions[token];
      if (!row) throw fail(404, "This funded wallet is not open on this desk.");
      const sompi = parseKas(amount);
      if (sompi == null || sompi <= 0n) throw fail(400, "Type a Kaspa amount above zero.");
      if (!opts.validAddress(to)) throw fail(400, "That is not a kaspadev address.");
      const picture = await opts.balance(row.address);
      if (BigInt(picture.spendable) < sompi + FEE_CUSHION) {
        throw fail(400, "The Kaspa on this wallet does not cover that amount and the miner fee.");
      }
      const txid = await opts.transfer({
        key: row.key,
        from: row.address,
        to,
        sompi,
      });
      const next = await opts.balance(row.address);
      return {
        ...publicWallet({ ...row, token }, {}),
        ...next,
        ok: true,
        txid,
        receipt: `Sent ${formatKas(sompi)} KAS.`,
      };
    });
  }

  return { open, wallet, send, loadPool };
}

function entryAmount(entry) {
  return BigInt(entry.amount ?? entry.entry?.amount ?? 0);
}

export async function balanceOf(rpc, address) {
  const dag = await rpc.getBlockDagInfo();
  const virtualDaa = dag.virtualDaaScore ?? 0;
  const bag = await rpc.getUtxosByAddresses([address]);
  let spendable = 0n;
  let immature = 0n;
  let locked = 0n;
  let face = 0n;
  for (const entry of bag.entries || []) {
    const amount = entryAmount(entry);
    const parsed = parseStpLock(entry.scriptPublicKey);
    if (parsed) {
      locked += amount;
      face += parsed.face;
      continue;
    }
    if (matureEntry(entry, virtualDaa)) spendable += amount;
    else immature += amount;
  }
  return {
    spendable: spendable.toString(),
    immature: immature.toString(),
    locked: locked.toString(),
    face: face.toString(),
    kas: formatKas(spendable),
    immatureKas: formatKas(immature),
    lockedKas: formatKas(locked),
    faceText: face.toString(),
  };
}

async function transferLive({ key, from, to, sompi }) {
  const { kaspa, rpc } = await devnetRpc();
  const dag = await rpc.getBlockDagInfo();
  const listed = await rpc.getUtxosByAddresses([from]);
  const entries = (listed.entries || []).filter((entry) => matureEntry(entry, dag.virtualDaaScore ?? 0) && !parseStpLock(entry.scriptPublicKey));
  let feeRate = 1;
  try {
    const est = await rpc.getFeeEstimate({});
    const quoted = Number(est?.estimate?.priorityBucket?.feerate || 0);
    if (quoted > 0) feeRate = quoted;
  } catch { /* the floor is 1 */ }
  const { transactions } = await kaspa.createTransactions({
    entries,
    outputs: [{ address: to, amount: sompi }],
    priorityFee: 0n,
    feeRate,
    changeAddress: from,
    networkId: "devnet",
  });
  if (!transactions || !transactions.length) throw fail(400, "The desk could not build that send.");
  const ids = [];
  const privateKey = new kaspa.PrivateKey(String(key));
  try {
    for (const pending of transactions) {
      await pending.sign([privateKey]);
      ids.push(String(await pending.submit(rpc)));
    }
  } finally {
    if (typeof privateKey.free === "function") privateKey.free();
  }
  const pool = readJson(path.join(dir, "guest-pool.json"), {});
  if (pool.miner && fs.existsSync(MINE)) {
    for (let step = 0; step < 2; step += 1) {
      const mined = spawnSync(MINE, [pool.miner, "1", GRPC], {
        encoding: "utf8",
        timeout: 180000,
        windowsHide: true,
      });
      if (mined.status !== 0) {
        throw fail(502, "The send was broadcast. The desk miner did not finish a block.");
      }
    }
  }
  invalidateSnapshot();
  return ids[0] || "";
}

let singleton = null;

export function liveDesk() {
  if (singleton) return singleton;
  singleton = createDesk({
    poolFile: path.join(dir, "guest-pool.json"),
    sessionFile: path.join(dir, "sessions.json"),
    now: () => Date.now(),
    validAddress: isDevnetAddress,
    async balance(address) {
      const { rpc } = await devnetRpc();
      const row = await balanceOf(rpc, address);
      let mined = null;
      try {
        const chain = await snapshot();
        mined = (chain.miners || []).find((item) => item.address === address) || null;
      } catch { /* the balance still stands */ }
      return { ...row, mined };
    },
    transfer: transferLive,
  });
  return singleton;
}

function publicChain(chain) {
  if (!chain) return chain;
  const { all, ...rest } = chain;
  return rest;
}

export async function handle1985Request(req, res, url, ctx) {
  if (!allowDesk(req.headers.host, req.headers.origin)) {
    ctx.sendJson(res, 404, { ok: false, error: "This DevNet is on the desk." }, req);
    return;
  }
  const desk = liveDesk();
  try {
    if (req.method === "GET" && url.pathname === "/api/1985/chain") {
      ctx.sendJson(res, 200, publicChain(await snapshot()), req);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/1985/block") {
      const chain = await snapshot();
      const hash = String(url.searchParams.get("hash") || "").trim().toLowerCase();
      const row = (chain.all || chain.blocks || []).find((item) => item.hash === hash);
      if (!row) {
        ctx.sendJson(res, 404, { ok: false, error: "That block is not in the desk read." }, req);
        return;
      }
      ctx.sendJson(res, 200, { ok: true, block: row }, req);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/1985/wallet") {
      const body = await desk.wallet(String(url.searchParams.get("token") || ""));
      ctx.sendJson(res, 200, body, req);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/1985/guest") {
      const raw = await ctx.readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const opened = await desk.open(String(body.browser || ""));
      ctx.sendJson(res, 200, opened, req);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/1985/send") {
      const raw = await ctx.readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const sent = await desk.send({
        token: String(body.token || ""),
        to: String(body.to || "").trim(),
        amount: body.amount,
      });
      ctx.sendJson(res, 200, sent, req);
      return;
    }
    ctx.sendJson(res, 404, { ok: false, error: "This DevNet route is not on the desk." }, req);
  } catch (error) {
    const status = error.status || 500;
    ctx.sendJson(res, status, { ok: false, error: error.message || "The desk could not do that." }, req);
  }
}
