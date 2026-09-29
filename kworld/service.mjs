/** Kworld HTTP. Testnet-10 only. Toy ledger on disk. tKAS reads and payouts go through the node. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchBalance, fetchPrice, fetchTx, paymentFromTx, resolveName } from "./chain.mjs";
import {
  applyConvert,
  applyFreeze,
  applyPractice,
  applyRedeem,
  applyRules,
  applySpend,
  attachTxid,
  freshState,
  publicAccount,
} from "./ledger.mjs";
import { BENCH, POST, REPOS } from "./links.mjs";
import { RESERVE, assertNotMainnetNetwork, assertTestnet, parseDollars, sompiForCents } from "./money.mjs";
import { SHOPS, itemBySku, shopById } from "./world.mjs";

const DISCLAIMER =
  "Testnet-10 toys. Not dollars. Not Tether. Not a SEPA rail. Mainnet wallets are refused. Miner fee is always tKAS.";

function clone(state) {
  return structuredClone(state);
}

export function createKworldService(deps) {
  let state = deps.load();
  let lock = Promise.resolve();
  let oracle = { price: 0, at: 0 };
  const hits = new Map();

  function queue(fn) {
    const run = lock.then(fn, fn);
    lock = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  async function price() {
    const now = deps.now();
    if (oracle.price > 0 && now - oracle.at < 60_000) return oracle.price;
    const next = await fetchPrice(deps.fetch);
    oracle = { price: next, at: now };
    return next;
  }

  function limit(ip) {
    const now = deps.now();
    const row = hits.get(ip) || { n: 0, t: now };
    if (now - row.t > 60_000) {
      row.n = 0;
      row.t = now;
    }
    row.n += 1;
    hits.set(ip, row);
    if (row.n > 80) throw new Error("Slow down. The square allows 80 actions a minute.");
  }

  function guard(body) {
    assertNotMainnetNetwork(body && body.network);
    return assertTestnet(body && body.address);
  }

  async function payment(address, txid, need) {
    const tx = await fetchTx(txid, deps.fetch);
    return paymentFromTx(tx, address, need);
  }

  async function home() {
    let usd = null;
    let oracleError = "";
    try {
      usd = await price();
    } catch (err) {
      oracleError = err.message || "Oracle down.";
    }
    return {
      status: 200,
      body: {
        ok: true,
        network: "testnet-10",
        reserve: RESERVE,
        shops: SHOPS,
        oracle: usd,
        oracleError,
        bench: BENCH,
        post: POST,
        repos: REPOS,
        disclaimer: DISCLAIMER,
      },
    };
  }

  async function accountOf(address) {
    const clean = assertTestnet(address);
    let kasSompi = null;
    let kasError = "";
    try {
      kasSompi = (await fetchBalance(clean, deps.fetch)).toString();
    } catch (err) {
      kasError = err.message || "Balance unread.";
    }
    let usd = null;
    try {
      usd = await price();
    } catch (_) {}
    return {
      status: 200,
      body: {
        ok: true,
        account: publicAccount(state, clean),
        kasSompi,
        kasError,
        oracle: usd,
        reserve: RESERVE,
        disclaimer: DISCLAIMER,
      },
    };
  }

  return {
    async handle({ method, pathname, query, body, ip }) {
      try {
        if (method === "GET" && pathname === "/api/kworld") return await home();
        if (method === "GET" && pathname === "/api/kworld/account") return await accountOf(query.get("address"));
        if (method === "GET" && pathname === "/api/kworld/resolve") {
          const found = await resolveName(query.get("name") || "", deps.fetch);
          return { status: 200, body: { ok: true, found } };
        }
        if (method === "GET" && pathname === "/api/kworld/quote") {
          const shop = shopById(query.get("shop"));
          const item = shop && itemBySku(shop.id, query.get("sku"));
          if (!item) throw new Error("That item is not on this counter.");
          const usd = await price();
          const sompi = sompiForCents(item.cents, usd);
          return {
            status: 200,
            body: { ok: true, cents: item.cents, sompi: sompi.toString(), usd, name: item.name },
          };
        }
        if (method !== "POST") return { status: 404, body: { ok: false, error: "Not found." } };
        limit(ip || "unknown");
        const address = guard(body || {});
        const now = deps.now();

        if (pathname === "/api/kworld/practice") {
          return await queue(async () => {
            const out = applyPractice(state, { address }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/kworld/rules") {
          return await queue(async () => {
            const out = applyRules(state, { address, rules: body.rules }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/kworld/freeze") {
          return await queue(async () => {
            const out = applyFreeze(state, { address, frozen: body.frozen }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/kworld/spend") {
          const usd = body.rail === "kas" ? await price() : 0;
          let pay = null;
          if (body.rail === "kas") {
            const item = itemBySku(body.shop, body.sku);
            if (!item) throw new Error("That item is not on this counter.");
            pay = await payment(address, body.txid, sompiForCents(item.cents, usd));
          }
          return await queue(async () => {
            const out = applySpend(
              state,
              {
                address,
                shop: body.shop,
                sku: body.sku,
                rail: body.rail,
                confirmed: body.confirmed,
                payment: pay,
                usdPerKas: usd,
              },
              now
            );
            if (out.result && out.result.needsConfirm) return { status: 409, body: out.result };
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/kworld/convert") {
          const usd = await price();
          const tx = await fetchTx(body.txid, deps.fetch);
          const pay = paymentFromTx(tx, address, 1n);
          return await queue(async () => {
            const out = applyConvert(state, { address, rail: body.rail, payment: pay, usdPerKas: usd }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/kworld/redeem") {
          const usd = await price();
          const cents = parseDollars(body.amount);
          return await queue(async () => {
            const before = clone(state);
            const out = applyRedeem(state, { address, rail: body.rail, cents, usdPerKas: usd }, now);
            state = out.state;
            deps.save(state);
            try {
              const paid = await deps.pay(out.to, out.sompi);
              const txid = paid && paid.txids && paid.txids[0];
              if (!txid) throw new Error("Redeem did not broadcast.");
              state = attachTxid(state, out.receiptId, txid);
              deps.save(state);
              return { status: 200, body: { ...out.result, txids: paid.txids } };
            } catch (err) {
              state = before;
              deps.save(state);
              throw new Error((err && err.message) || "Redeem did not broadcast. The toy balance was put back.");
            }
          });
        }
        return { status: 404, body: { ok: false, error: "Not found." } };
      } catch (err) {
        return { status: 400, body: { ok: false, error: err.message || String(err) } };
      }
    },
  };
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const ledgerFile = path.join(dir, "ledger.json");

function loadFile() {
  try {
    return JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
  } catch {
    return freshState();
  }
}

function saveFile(state) {
  const tmp = ledgerFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, ledgerFile);
}

let singleton;

export function kworldService() {
  if (!singleton) {
    singleton = createKworldService({
      load: loadFile,
      save: saveFile,
      fetch: globalThis.fetch,
      now: () => Date.now(),
      pay: async (to, sompi) => {
        const { payTn10 } = await import("../faucet/pay.mjs");
        return payTn10(to, sompi);
      },
    });
  }
  return singleton;
}

export async function handleKworldRequest(req, res, url, tools) {
  if (req.method === "OPTIONS") {
    tools.sendJson(res, 204, {}, req);
    return;
  }
  let body = {};
  if (req.method === "POST") {
    const raw = await tools.readBody(req);
    if (raw.length > 20_000) {
      tools.sendJson(res, 400, { ok: false, error: "Request too large." }, req);
      return;
    }
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      tools.sendJson(res, 400, { ok: false, error: "Send JSON." }, req);
      return;
    }
  }
  const result = await kworldService().handle({
    method: req.method,
    pathname: url.pathname,
    query: url.searchParams,
    body,
    ip: tools.clientIp(req),
  });
  tools.sendJson(res, result.status, result.body, req);
}
