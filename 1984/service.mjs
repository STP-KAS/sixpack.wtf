/** 1984 HTTP. Testnet-10 only. Toy ledger on disk. tKAS reads and payouts go through the node. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchBalance, fetchKoni, fetchPrice, fetchTx, paymentFromTx, resolveName } from "./chain.mjs";
import { lookupAccepted, warmNodeWindow } from "./node-tx.mjs";
import { guestDesk, GUEST_FUND_SOMPI } from "./guest.mjs";
import {
  applyConvert,
  applyExchange,
  applyFreeze,
  applyPractice,
  applyPromise,
  applyRedeem,
  applyRules,
  applySnap,
  applySpend,
  applyWithdrawPromise,
  attachTxid,
  checkRules,
  freshState,
  planSnap,
  publicAccount,
  publicHunts,
} from "./ledger.mjs";
import { BENCH, POST, REPOS } from "./links.mjs";
import {
  GUEST_DISCLAIMER,
  RESERVE,
  assertNotMainnetNetwork,
  assertTestnet,
  dayKey,
  parseDollars,
  parseTkas,
  sompiForCents,
} from "./money.mjs";
import { HUNTS, SHOPS, itemBySku, shopById } from "./world.mjs";

const DISCLAIMER =
  "Testnet-10 toys. Not dollars. Not Tether. Not a SEPA rail. Mainnet wallets are refused. Miner fee is always tKAS.";

function clone(state) {
  return structuredClone(state);
}

export function create1984Service(deps) {
  let state = deps.load();
  let lock = Promise.resolve();
  let oracle = { price: 0, at: 0 };
  const hits = new Map();
  const pause = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

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
    let tx;
    try {
      tx = await fetchTx(txid, deps.fetch);
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (!deps.lookupTx || !/not on Testnet 10 yet/i.test(msg)) throw err;
      tx = await deps.lookupTx(txid);
    }
    return paymentFromTx(tx, address, need);
  }

  async function waitPayment(address, txid, need) {
    let last = new Error("That transaction is not on Testnet 10 yet.");
    const tries = deps.txTries || 30;
    for (let i = 0; i < tries; i += 1) {
      try {
        return await payment(address, txid, need);
      } catch (err) {
        last = err;
        const msg = String((err && err.message) || "");
        if (!/not on Testnet 10 yet|not accepted yet/i.test(msg)) throw err;
        if (i === tries - 1) break;
        await pause(200);
      }
    }
    if (/not on Testnet 10 yet/i.test(String((last && last.message) || ""))) {
      throw new Error(
        "That payment is not in the recent Testnet 10 blocks. The public transaction list is behind. Wait and lock again."
      );
    }
    throw last;
  }

  function guestApi() {
    if (!deps.guests) throw new Error("Test login is not available on this server.");
    return deps.guests;
  }

  async function guestCall(pathname, body, ip) {
    assertNotMainnetNetwork(body && body.network);
    const guests = guestApi();
    if (pathname === "/api/1984/guest") {
      if (body && body.progress === true && typeof guests.start === "function") {
        const started = guests.start({ ip, life: body.life });
        if (!started || started.key || started.privateKey) throw new Error("Test login refused to start.");
        return { status: 202, body: started };
      }
      const opened = await guests.open({ ip, life: body.life });
      if (!opened || opened.key || opened.privateKey) throw new Error("Test login refused to start.");
      return { status: 200, body: opened };
    }
    const address = assertTestnet(body && body.address);
    if (pathname === "/api/1984/guest/keep") {
      return { status: 200, body: await guests.keep({ token: body.token, address, life: body.life }) };
    }
    if (pathname === "/api/1984/guest/close") {
      return { status: 200, body: await guests.close({ token: body.token, address, life: body.life }) };
    }
    if (pathname === "/api/1984/guest/spend") {
      const usd = await price();
      const shop = shopById(body.shop);
      const item = shop && itemBySku(shop.id, body.sku);
      if (!item) throw new Error("That item is not on this counter.");
      const account = state.accounts[address] || { rules: {}, spentDay: "", spentCents: "0" };
      const gate = checkRules(
        account,
        { shop: shop.id, rail: "kas", cents: item.cents, confirmed: !!body.confirmed },
        dayKey(deps.now())
      );
      if (gate.needsConfirm) {
        return {
          status: 409,
          body: {
            ok: false,
            needsConfirm: true,
            cents: item.cents,
            error: "This is over your confirm line. Confirm it to pay.",
          },
        };
      }
      const need = sompiForCents(item.cents, usd);
      const paid = await guests.pay({ token: body.token, address, sompi: need });
      const seen = await waitPayment(address, paid.txid, need);
      return queue(async () => {
        const out = applySpend(
          state,
          {
            address,
            shop: shop.id,
            sku: item.sku,
            rail: "kas",
            confirmed: true,
            payment: seen,
            usdPerKas: usd,
          },
          deps.now()
        );
        state = out.state;
        deps.save(state);
        return { status: 200, body: out.result };
      });
    }
    if (pathname === "/api/1984/guest/hunt/promise") {
      await guests.keep({ token: body.token, address, life: body.life });
      return queue(async () => {
        const out = applyPromise(
          state,
          { address, hunt: body.hunt, rail: body.rail, need: body.need, confirmed: !!body.confirmed },
          deps.now()
        );
        if (out.result && out.result.needsConfirm) return { status: 409, body: out.result };
        state = out.state;
        deps.save(state);
        return { status: 200, body: out.result };
      });
    }
    if (pathname === "/api/1984/guest/hunt/snap") {
      await guests.keep({ token: body.token, address, life: body.life });
      const now = deps.now();
      const plan = await queue(async () => planSnap(state, { address, hunt: body.hunt }, now));
      let payment = null;
      let usd = 0;
      if (plan.ready) {
        usd = await price();
        const need = sompiForCents(plan.cents, usd);
        const paid = await guests.pay({ token: body.token, address, sompi: need });
        payment = await waitPayment(address, paid.txid, need);
      }
      return queue(async () => {
        const out = applySnap(state, { address, hunt: body.hunt, payment, usdPerKas: usd }, now);
        if (out.result && out.result.needsConfirm) return { status: 409, body: out.result };
        state = out.state;
        deps.save(state);
        return { status: 200, body: out.result };
      });
    }
    if (pathname === "/api/1984/guest/convert") {
      const usd = await price();
      const sompi = parseTkas(body.amount);
      const paid = await guests.pay({ token: body.token, address, sompi });
      const seen = await waitPayment(address, paid.txid, sompi);
      return queue(async () => {
        const out = applyConvert(state, { address, rail: body.rail, payment: seen, usdPerKas: usd }, deps.now());
        state = out.state;
        deps.save(state);
        return { status: 200, body: out.result };
      });
    }
    return { status: 404, body: { ok: false, error: "Not found." } };
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
        hunts: HUNTS.map((row) => ({ id: row.id, name: row.name, cents: row.cents, need: row.need, rails: row.rails })),
        oracle: usd,
        oracleError,
        bench: BENCH,
        post: POST,
        repos: REPOS,
        disclaimer: DISCLAIMER,
        guestDisclaimer: GUEST_DISCLAIMER,
        guestFundSompi: GUEST_FUND_SOMPI.toString(),
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
    forget(address) {
      return queue(async () => {
        let clean = "";
        try {
          clean = assertTestnet(address);
        } catch {
          return;
        }
        if (!state.accounts[clean]) return;
        delete state.accounts[clean];
        deps.save(state);
      });
    },
    async handle({ method, pathname, query, body, ip }) {
      try {
        if (pathname === "/api/kworld" || (typeof pathname === "string" && pathname.startsWith("/api/kworld/"))) {
          pathname = "/api/1984" + pathname.slice("/api/kworld".length);
        }
        if (method === "GET" && pathname === "/api/1984") return await home();
        if (method === "GET" && pathname === "/api/1984/koni") {
          try {
            return { status: 200, body: await fetchKoni(deps.fetch) };
          } catch {
            return { status: 200, body: { ok: false, network: "testnet-10", blue: "", txs: [], accepted: null, reward: null } };
          }
        }
        if (method === "GET" && pathname === "/api/1984/account") return await accountOf(query.get("address"));
        if (method === "GET" && pathname === "/api/1984/hunts") {
          const raw = query.get("address") || "";
          const who = raw ? assertTestnet(raw) : "";
          return { status: 200, body: publicHunts(state, who) };
        }
        if (method === "GET" && pathname === "/api/1984/resolve") {
          const found = await resolveName(query.get("name") || "", deps.fetch);
          return { status: 200, body: { ok: true, found } };
        }
        if (method === "GET" && pathname === "/api/1984/guest") {
          const guests = guestApi();
          const found = typeof guests.job === "function" ? guests.job(query.get("job") || "") : null;
          if (!found || found.key || found.privateKey) {
            return {
              status: 404,
              body: { ok: false, pending: false, error: "That opening expired. Try Test without a wallet again." },
            };
          }
          return { status: 200, body: found };
        }
        if (method === "GET" && pathname === "/api/1984/fee") {
          let rate = 600;
          try {
            const quoted = deps.feeRate ? await deps.feeRate() : await (await import("../faucet/pay.mjs")).quotedPageFeeRate();
            const n = Number(quoted);
            if (Number.isFinite(n) && n >= 600) rate = n;
          } catch {
            rate = 600;
          }
          return { status: 200, body: { ok: true, network: "testnet-10", feerate: rate } };
        }
        if (method === "GET" && pathname === "/api/1984/quote") {
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
        if (pathname === "/api/1984/guest" || pathname.startsWith("/api/1984/guest/")) {
          return await guestCall(pathname, body || {}, ip || "unknown");
        }
        const address = guard(body || {});
        const now = deps.now();

        if (pathname === "/api/1984/practice") {
          return await queue(async () => {
            const out = applyPractice(state, { address }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/rules") {
          return await queue(async () => {
            const out = applyRules(state, { address, rules: body.rules }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/freeze") {
          return await queue(async () => {
            const out = applyFreeze(state, { address, frozen: body.frozen }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/hunt/promise") {
          return await queue(async () => {
            const out = applyPromise(
              state,
              { address, hunt: body.hunt, rail: body.rail, need: body.need, confirmed: !!body.confirmed },
              now
            );
            if (out.result && out.result.needsConfirm) return { status: 409, body: out.result };
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/hunt/withdraw") {
          return await queue(async () => {
            const out = applyWithdrawPromise(state, { address, hunt: body.hunt }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/hunt/snap") {
          const plan = await queue(async () => planSnap(state, { address, hunt: body.hunt }, now));
          let payment = null;
          let usd = 0;
          const pasted = String((body && body.txid) || "").trim();
          if (plan.rail === "kas" && plan.cents > 0 && (plan.ready || pasted)) {
            usd = await price();
            if (plan.ready && !pasted) {
              return {
                status: 200,
                body: {
                  ok: false,
                  ready: true,
                  paid: false,
                  cents: plan.cents,
                  sompi: sompiForCents(plan.cents, usd).toString(),
                },
              };
            }
            if (pasted) payment = await waitPayment(address, pasted, sompiForCents(plan.cents, usd));
          }
          return await queue(async () => {
            const out = applySnap(state, { address, hunt: body.hunt, payment, usdPerKas: usd }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/spend") {
          const usd = body.rail === "kas" ? await price() : 0;
          let pay = null;
          if (body.rail === "kas") {
            const item = itemBySku(body.shop, body.sku);
            if (!item) throw new Error("That item is not on this counter.");
            const gate = await queue(async () => {
              const account = state.accounts[address] || { rules: {}, spentDay: "", spentCents: "0" };
              return checkRules(
                account,
                { shop: body.shop, rail: "kas", cents: item.cents, confirmed: !!body.confirmed },
                dayKey(now)
              );
            });
            if (gate.needsConfirm) {
              return {
                status: 409,
                body: {
                  ok: false,
                  needsConfirm: true,
                  cents: item.cents,
                  error: "This is over your confirm line. Confirm it to pay.",
                },
              };
            }
            const pasted = String(body.txid || "").trim();
            if (!pasted) {
              return {
                status: 200,
                body: {
                  ok: false,
                  ready: true,
                  cents: item.cents,
                  sompi: sompiForCents(item.cents, usd).toString(),
                },
              };
            }
            pay = await waitPayment(address, pasted, sompiForCents(item.cents, usd));
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
        if (pathname === "/api/1984/convert") {
          const usd = await price();
          const pay = await waitPayment(address, body.txid, 1n);
          return await queue(async () => {
            const out = applyConvert(state, { address, rail: body.rail, payment: pay, usdPerKas: usd }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/exchange") {
          const cents = parseDollars(body.amount);
          return await queue(async () => {
            const out = applyExchange(state, { address, from: body.from, to: body.to, cents }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/redeem") {
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
    const parsed = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
    if (!parsed || typeof parsed !== "object") return freshState();
    if (!parsed.hunts || typeof parsed.hunts !== "object" || Array.isArray(parsed.hunts)) parsed.hunts = {};
    return parsed;
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

export function service1984() {
  if (!singleton) {
    warmNodeWindow();
    const guests = guestDesk();
    singleton = create1984Service({
      load: loadFile,
      save: saveFile,
      fetch: globalThis.fetch,
      now: () => Date.now(),
      lookupTx: lookupAccepted,
      guests,
      pay: async (to, sompi) => {
        const { payTn10 } = await import("../faucet/pay.mjs");
        const { pageFeeRate } = await import("../faucet/fee-rate.mjs");
        return payTn10(to, sompi, undefined, pageFeeRate);
      },
    });
    guests.onGone = (address) => singleton.forget(address);
  }
  return singleton;
}

export async function handle1984Request(req, res, url, tools) {
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
  const result = await service1984().handle({
    method: req.method,
    pathname: url.pathname,
    query: url.searchParams,
    body,
    ip: tools.clientIp(req),
  });
  tools.sendJson(res, result.status, result.body, req);
}
