/** 1984 HTTP. Testnet-10 only. Village ledger on disk. tKAS reads and payouts go through the node. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchBalance, fetchKoni, fetchPrice, fetchTx, paymentFromTx, resolveName } from "./chain.mjs";
import { lookupSquareName, publicKnsIndex, recordSquareName } from "./kns-index.mjs";
import { applyAccept, applyHandshake, applyMessage, publicChat } from "./kachat.mjs";
import { applyVaultSave, applyVaultSeal, publicVaults } from "./vault.mjs";
import { accountNames, applyClaim, applyDefault, applyDisplay, applyInscribed, applyOfferBuy, applySite, normalizeLabel, publicSites } from "./layer.mjs";
import { applySeal, decryptNote, encryptNote } from "./seal.mjs";
import { lookupAccepted, warmNodeWindow } from "./node-tx.mjs";
import { guestDesk, GUEST_FUND_SOMPI } from "./guest.mjs";
import { pageFeeRate } from "../faucet/fee-rate.mjs";
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
  applyStreamBuy,
  applyToken,
  applyWithdrawPromise,
  attachTxid,
  checkRules,
  freshState,
  planSnap,
  publicAccount,
  publicHunts,
  streamOwns,
  publicMints,
  publicOffers,
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
import { createPegLock } from "./peg-chain.mjs";
import { openGuestLock, settleExchange, settleFreeze, settleRedeem, settleSpend } from "./peg-flow.mjs";
import { addTitle, mediaName, normalizeShare, publicStream, removeTitle, titleById } from "./stream-book.mjs";
import { HUNTS, SHOPS, itemBySku, shopById } from "./world.mjs";

const DISCLAIMER =
  "Testnet-10 tags. Not dollars. Not Tether. Not a SEPA rail. Mainnet wallets are refused. Miner fee is always KAS.";

function clone(state) {
  return structuredClone(state);
}

export function create1984Service(deps) {
  let state = deps.load();
  let lock = Promise.resolve();
  let oracle = { price: 0, at: 0 };
  const hits = new Map();
  const streamTickets = new Map();
  const mediaDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "stream-media");
  const inscribing = new Set();
  const sealing = new Set();
  const pegging = new Set();
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

  async function squareResolve(name) {
    let official = null;
    let quiet = false;
    try {
      official = await resolveName(String(name || ""), deps.fetch);
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (/mainnet|Type a \.kas name/i.test(msg)) throw err;
      quiet = true;
    }
    if (official && official.address) {
      return {
        found: { domain: official.domain, address: official.address, index: "kns" },
        quiet: false,
      };
    }
    const row = lookupSquareName(state, name);
    if (row) {
      return {
        found: { domain: row.name + ".kas", address: row.owner, index: "square", inscriptionId: row.inscriptionId },
        quiet,
      };
    }
    return { found: null, quiet };
  }

  async function layerGate(name, address) {
    const hit = await squareResolve(name);
    const who = String(address || "").toLowerCase();
    if (hit.found && hit.found.index === "kns") {
      if (hit.found.address.toLowerCase() !== who) {
        throw new Error("That name is already on the KNS testnet index for another address.");
      }
      return hit;
    }
    if (hit.found && hit.found.index === "square") {
      if (hit.found.address.toLowerCase() === who) return hit;
      throw new Error("That name is already on this square's index for another address.");
    }
    if (hit.quiet) {
      throw new Error("The KNS testnet index did not confirm this address owns that name.");
    }
    throw new Error("Own this name on the KNS testnet index before you customize it. The KNS app registers it. This desk does not.");
  }

  function withVerified(base, hit, name, address, now) {
    if (!hit || !hit.found || hit.found.index !== "kns") return base;
    if (String(hit.found.address || "").toLowerCase() !== String(address || "").toLowerCase()) return base;
    const noted = recordSquareName(base, { name, owner: address, source: "kns" }, now);
    return noted.conflict ? base : noted.state;
  }

  async function payment(address, txid, need, opts) {
    const lastTry = !!(opts && opts.publicList);
    if (deps.lookupTx) {
      try {
        return paymentFromTx(await deps.lookupTx(txid), address, need);
      } catch (err) {
        const msg = String((err && err.message) || "");
        if (/not accepted yet/i.test(msg) || (!lastTry && /not on Testnet 10 yet/i.test(msg))) throw err;
        if (!/not on Testnet 10 yet/i.test(msg)) throw err;
      }
    }
    const tx = await fetchTx(txid, deps.fetch);
    return paymentFromTx(tx, address, need);
  }

  async function waitPayment(address, txid, need) {
    let last = new Error("That transaction is not on Testnet 10 yet.");
    const tries = deps.txTries || 80;
    for (let i = 0; i < tries; i += 1) {
      try {
        return await payment(address, txid, need, { publicList: i === tries - 1 });
      } catch (err) {
        last = err;
        const msg = String((err && err.message) || "");
        if (!/not on Testnet 10 yet|not accepted yet/i.test(msg)) throw err;
        if (i === tries - 1) break;
        await pause(20);
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
        const started = guests.start({ ip, life: body.life, browser: body.browser });
        if (!started || started.key || started.privateKey) throw new Error("Test login refused to start.");
        return { status: 202, body: started };
      }
      const opened = await guests.open({ ip, life: body.life, browser: body.browser });
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
      if (deps.pegLock) {
        const key = address.toLowerCase();
        if (pegging.has(key)) throw new Error("This lock is already being written.");
        pegging.add(key);
        try {
          return await openGuestLock({
            pegLock: deps.pegLock,
            guests,
            address,
            token: body.token,
            rail: body.rail,
            sompi,
            usdPerKas: usd,
            now: deps.now(),
            getState: () => state,
            setState: (next) =>
              queue(async () => {
                state = typeof next === "function" ? next(state) : next;
                deps.save(state);
              }),
          });
        } finally {
          pegging.delete(key);
        }
      }
      const paid = await guests.pay({ token: body.token, address, sompi });
      const seen = await waitPayment(address, paid.txid, sompi);
      return queue(async () => {
        const out = applyConvert(state, { address, rail: body.rail, payment: seen, usdPerKas: usd }, deps.now());
        state = out.state;
        deps.save(state);
        return { status: 200, body: out.result };
      });
    }
    if (pathname === "/api/1984/guest/stream/buy") {
      return await buyStream(address, body, true);
    }
    return { status: 404, body: { ok: false, error: "Not found." } };
  }

  function ownedStreamIds(address) {
    if (!address) return [];
    try {
      const clean = assertTestnet(address);
      const account = state.accounts[clean.toLowerCase()];
      return account && Array.isArray(account.stream) ? account.stream : [];
    } catch {
      return [];
    }
  }

  function issueStreamTicket(file) {
    const name = mediaName(file);
    if (!name) throw new Error("That film is not on this desk.");
    const full = path.join(mediaDir, name);
    if (!full.startsWith(mediaDir) || !fs.existsSync(full)) {
      throw new Error("That film is not on this desk yet.");
    }
    const now = deps.now();
    for (const [key, row] of streamTickets) {
      if (!row || row.exp < now) streamTickets.delete(key);
    }
    const ticket = crypto.randomBytes(18).toString("base64url");
    streamTickets.set(ticket, { file: name, exp: now + 2 * 60 * 60 * 1000 });
    return "/api/1984/stream/file/" + ticket;
  }

  function playLink(row, address) {
    const free = !!row.free || Number(row.cents) <= 0;
    const owned = !!(address && streamOwns(state, address, row.id));
    if (!free && !owned) return { locked: true, cents: Number(row.cents) || 0 };
    if (row.file) return { locked: false, src: issueStreamTicket(row.file) };
    if (row.src) return { locked: false, src: row.src };
    throw new Error("That title has no video.");
  }

  async function buyStream(address, body, guest) {
    const row = titleById(state, body && body.id);
    if (!row) throw new Error("That title is not on SI stream.");
    if (row.file) {
      const name = mediaName(row.file);
      const full = name ? path.join(mediaDir, name) : "";
      if (!name || !full.startsWith(mediaDir) || !fs.existsSync(full)) {
        throw new Error("That film is not on this desk yet.");
      }
    }
    if (row.free || Number(row.cents) <= 0) throw new Error("This title is free. Play it.");
    const rail = body && body.rail;
    const already = streamOwns(state, address, row.id);
    if (already) {
      return {
        status: 200,
        body: {
          ok: true,
          already: true,
          account: publicAccount(state, address),
          ...playLink(row, address),
        },
      };
    }
    const usd = rail === "kas" ? await price() : 0;
    let pay = null;
    if (rail === "kas") {
      const gate = checkRules(
        state.accounts[address.toLowerCase()] || { rules: {}, spentDay: "", spentCents: "0" },
        { shop: "sistream", rail: "kas", cents: row.cents, confirmed: !!(body && body.confirmed) },
        dayKey(deps.now())
      );
      if (gate.needsConfirm) {
        return {
          status: 409,
          body: { ok: false, needsConfirm: true, cents: row.cents, error: "This is over your confirm line. Confirm it to pay." },
        };
      }
      if (guest) {
        const need = sompiForCents(row.cents, usd);
        const paid = await guestApi().pay({ token: body.token, address, sompi: need });
        pay = await waitPayment(address, paid.txid, need);
      } else {
        const pasted = String((body && body.txid) || "").trim();
        if (!pasted) {
          return {
            status: 200,
            body: { ok: false, ready: true, cents: row.cents, sompi: sompiForCents(row.cents, usd).toString() },
          };
        }
        pay = await waitPayment(address, pasted, sompiForCents(row.cents, usd));
      }
    }
    return await queue(async () => {
      let prepaid = null;
      if (rail === "poc" || rail === "kusdt") {
        const account = state.accounts[address.toLowerCase()] || { rules: {}, spentDay: "", spentCents: "0" };
        const gate = checkRules(
          account,
          { shop: "sistream", rail, cents: row.cents, confirmed: !!(body && body.confirmed) },
          dayKey(deps.now())
        );
        if (gate.needsConfirm) {
          return {
            status: 409,
            body: { ok: false, needsConfirm: true, cents: row.cents, error: "This is over your confirm line. Confirm it to pay." },
          };
        }
        prepaid = await settleSpend({
          pegLock: deps.pegLock,
          guests: deps.guests,
          address,
          token: body.token,
          rail,
          cents: BigInt(row.cents),
          now: deps.now(),
          getState: () => state,
          setState: (next) => {
            state = typeof next === "function" ? next(state) : next;
            deps.save(state);
          },
        });
      }
      const out = applyStreamBuy(
        state,
        {
          address,
          id: row.id,
          title: row.title,
          cents: row.cents,
          rail,
          confirmed: !!(body && body.confirmed),
          payment: pay,
          usdPerKas: usd,
          prepaidCents: prepaid && prepaid.prepaidCents,
          chainSompi: prepaid && prepaid.chainSompi,
          chainTxid: prepaid && prepaid.chainTxid,
        },
        deps.now()
      );
      if (out.result && out.result.needsConfirm) return { status: 409, body: out.result };
      state = out.state;
      deps.save(state);
      const link = out.result.ok ? playLink(row, address) : {};
      return {
        status: 200,
        body: { ...out.result, ...link, txids: prepaid && prepaid.txids, peg: !!(prepaid && prepaid.peg) },
      };
    });
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
        mints: publicMints(state),
        offers: publicOffers(state),
        sites: publicSites(state),
        kns: publicKnsIndex(state),
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

  async function inscribeForGuest({ address, name, token }) {
    const guests = guestApi();
    const session = await guests.sessionKey({ token, address });
    const { knsPlan } = await import("./kns-plan.mjs");
    const plan = knsPlan(name);
    const bal = await fetchBalance(address, deps.fetch);
    if (bal < plan.holdSompi) {
      throw new Error(
        "This name costs " + plan.feeKas + " tKAS on the KNS testnet index, plus a small commit. This wallet does not hold that much. No covenant was deployed."
      );
    }
    const { inscribeTn10 } = await import("./kns-inscribe.mjs");
    try {
      return await inscribeTn10({ privHex: session.key, from: session.address, label: name, fetchImpl: deps.fetch });
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (session.key && msg.toLowerCase().includes(String(session.key).toLowerCase())) {
        throw new Error("The inscription did not broadcast.");
      }
      throw err;
    }
  }

  async function sessionFor(address, token) {
    if (!token) return null;
    const guests = guestApi();
    return guests.sessionKey({ token, address });
  }

  async function sealForGuest({ address, token, payload }) {
    const session = await sessionFor(address, token);
    if (!session) throw new Error("The funded test wallet is the click on this tab. A pasted address uses a passphrase, and this desk does not sign it.");
    const { sealOnChain } = await import("./seal-chain.mjs");
    try {
      return await sealOnChain({ privHex: session.key, from: session.address, payload });
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (session.key && msg.toLowerCase().includes(String(session.key).toLowerCase())) {
        throw new Error("The note did not go on Testnet-10.");
      }
      throw err;
    }
  }

  async function sealLayer(address, body) {
    const place = String((body && body.place) || "");
    let dest = address;
    if (place === "funded" || place === "this") dest = address;
    else if (place === "choice") dest = assertTestnet(body.to);
    else throw new Error("Choose the funded test wallet, this address, or an address.");
    let session = null;
    if (body && body.token) {
      try {
        session = await sessionFor(address, body.token);
      } catch (err) {
        if (place === "funded") throw err;
        session = null;
      }
    }
    const same = !!(session && session.address.toLowerCase() === address.toLowerCase());
    const funded = !!(same && (place === "funded" || place === "this" || (place === "choice" && dest.toLowerCase() === address.toLowerCase())));
    if (place === "funded" && !funded) {
      throw new Error("The funded test wallet is the click on this tab. Open one from the welcome gate.");
    }
    const key = address.toLowerCase();
    if (sealing.has(key)) throw new Error("This note is already being sealed.");
    sealing.add(key);
    try {
      if (funded) {
        const sealed = encryptNote(body.plain, session.key);
        let where = "desk";
        let txid = "";
        if (sealed.onChain) {
          const run = deps.sealOnChain || sealForGuest;
          const out = await run({ address, token: body.token, payload: sealed.payload });
          txid = out && out.txid;
          if (!txid) throw new Error("The payload did not return a transaction id.");
          where = "chain";
        }
        return await queue(async () => {
          const marked = applySeal(state, {
            address,
            dest: address,
            cipher: sealed.cipher,
            bytes: sealed.bytes,
            where,
            txid,
            deskHoldsKey: true,
          }, deps.now());
          state = marked.state;
          deps.save(state);
          return { status: 200, body: { ...marked.result, account: publicAccount(state, address) } };
        });
      }
      if (body && body.plain) {
        throw new Error("A chosen address is sealed in the browser. Send the ciphertext. This desk does not keep the note.");
      }
      return await queue(async () => {
        const marked = applySeal(state, {
          address,
          dest,
          cipher: body.cipher,
          bytes: Number(body.bytes) || 0,
          where: "desk",
          deskHoldsKey: false,
        }, deps.now());
        state = marked.state;
        deps.save(state);
        return { status: 200, body: { ...marked.result, account: publicAccount(state, address) } };
      });
    } finally {
      sealing.delete(key);
    }
  }

  async function openSeal(address, body) {
    const session = await sessionFor(address, body && body.token);
    if (!session || session.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error("This desk opens a funded note for the test tab that sealed it.");
    }
    const account = state.accounts[address.toLowerCase()];
    const seal = account && account.seal;
    if (!seal || !seal.cipher) throw new Error("This address has no sealed note.");
    if (!seal.deskHoldsKey) {
      throw new Error("This note was sealed in the browser. Open it there with the passphrase. This desk did not keep one.");
    }
    let plain = "";
    try {
      plain = decryptNote(seal.cipher, session.key);
    } catch (err) {
      const msg = String((err && err.message) || "");
      if (session.key && msg.toLowerCase().includes(String(session.key).toLowerCase())) {
        throw new Error("The sealed note did not open.");
      }
      throw err;
    }
    return { status: 200, body: { ok: true, plain, where: seal.where || "desk", txid: seal.txid || "" } };
  }

  return {
    streamFile(ticket) {
      const key = String(ticket || "");
      const row = streamTickets.get(key);
      const now = deps.now();
      if (!row || row.exp < now) {
        if (row) streamTickets.delete(key);
        return "";
      }
      const name = mediaName(row.file);
      if (!name) return "";
      const full = path.join(mediaDir, name);
      if (!full.startsWith(mediaDir) || !fs.existsSync(full)) return "";
      return full;
    },
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
        if (method === "GET" && pathname === "/api/1984/chat") {
          const who = assertTestnet(query.get("address"));
          return { status: 200, body: { ok: true, ...publicChat(state, who) } };
        }
        if (method === "GET" && pathname === "/api/1984/vault") {
          const who = assertTestnet(query.get("address"));
          return { status: 200, body: { ok: true, ...publicVaults(state, who, deps.now()) } };
        }
        if (method === "GET" && pathname === "/api/1984/hunts") {
          const raw = query.get("address") || "";
          const who = raw ? assertTestnet(raw) : "";
          return { status: 200, body: publicHunts(state, who) };
        }
        if (method === "GET" && pathname === "/api/1984/kns") {
          return {
            status: 200,
            body: {
              ok: true,
              index: "square",
              note: "This list is this square's index. The KNS testnet index is still the network record. No covenant is deployed.",
              names: publicKnsIndex(state),
            },
          };
        }
        if (method === "GET" && pathname === "/api/1984/resolve") {
          const hit = await squareResolve(query.get("name") || "");
          if (!hit.found && hit.quiet) throw new Error("The KNS testnet index did not answer.");
          return { status: 200, body: { ok: true, found: hit.found } };
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
          const floor = pageFeeRate(null);
          let rate = floor;
          try {
            const quoted = deps.feeRate ? await deps.feeRate() : await (await import("../faucet/pay.mjs")).quotedPageFeeRate();
            const n = Number(quoted);
            if (Number.isFinite(n) && n >= floor) rate = n;
          } catch {
            rate = floor;
          }
          return { status: 200, body: { ok: true, network: "testnet-10", feerate: rate } };
        }
        if (method === "GET" && pathname === "/api/1984/stream") {
          const raw = query.get("address") || "";
          const who = raw ? assertTestnet(raw) : "";
          return { status: 200, body: publicStream(state, ownedStreamIds(who)) };
        }
        if (method === "GET" && pathname === "/api/1984/stream/open") {
          const row = titleById(state, query.get("id"));
          if (!row) throw new Error("That title is not on SI stream.");
          const raw = query.get("address") || "";
          const who = raw ? assertTestnet(raw) : "";
          const link = playLink(row, who);
          if (link.locked) {
            return { status: 402, body: { ok: false, locked: true, cents: link.cents, error: "Pay for this title to play it." } };
          }
          return { status: 200, body: { ok: true, ...link } };
        }
        if (method === "GET" && pathname === "/api/1984/stream/quote") {
          const row = titleById(state, query.get("id"));
          if (!row) throw new Error("That title is not on SI stream.");
          const usd = await price();
          return {
            status: 200,
            body: { ok: true, cents: row.cents, sompi: sompiForCents(row.cents, usd).toString(), usd, name: row.title },
          };
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
        if (pathname === "/api/1984/mint") {
          return await queue(async () => {
            const out = applyToken(state, {
              address,
              option: body.option,
              name: body.name,
              amount: body.amount,
              cap: body.cap,
              to: body.to,
              recvName: body.recvName,
              recvAmount: body.recvAmount,
              offer: body.offer,
            }, now);
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
            const settled = await settleFreeze({
              pegLock: deps.pegLock,
              guests: deps.guests,
              address,
              token: body.token,
              frozen: body.frozen,
              now,
              getState: () => state,
              setState: (next) => {
                state = typeof next === "function" ? next(state) : next;
                deps.save(state);
              },
            });
            return settled;
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
            let prepaid = null;
            if (body.rail === "poc" || body.rail === "kusdt") {
              const item = itemBySku(body.shop, body.sku);
              if (!item) throw new Error("That item is not on this counter.");
              const account = state.accounts[address.toLowerCase()] || { rules: {}, spentDay: "", spentCents: "0" };
              const gate = checkRules(
                account,
                { shop: body.shop, rail: body.rail, cents: item.cents, confirmed: !!body.confirmed },
                dayKey(now)
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
              prepaid = await settleSpend({
                pegLock: deps.pegLock,
                guests: deps.guests,
                address,
                token: body.token,
                rail: body.rail,
                cents: BigInt(item.cents),
                now,
                getState: () => state,
                setState: (next) => {
                  state = typeof next === "function" ? next(state) : next;
                  deps.save(state);
                },
              });
            }
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
                prepaidCents: prepaid && prepaid.prepaidCents,
                chainSompi: prepaid && prepaid.chainSompi,
                chainTxid: prepaid && prepaid.chainTxid,
              },
              now
            );
            if (out.result && out.result.needsConfirm) return { status: 409, body: out.result };
            state = out.state;
            deps.save(state);
            return {
              status: 200,
              body: { ...out.result, txids: prepaid && prepaid.txids, peg: !!(prepaid && prepaid.peg) },
            };
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
            const settled = await settleExchange({
              pegLock: deps.pegLock,
              guests: deps.guests,
              address,
              token: body.token,
              from: body.from,
              to: body.to,
              cents,
              now,
              getState: () => state,
              setState: (next) => {
                state = typeof next === "function" ? next(state) : next;
                deps.save(state);
              },
            });
            if (settled) return settled;
            const out = applyExchange(state, { address, from: body.from, to: body.to, cents }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/redeem") {
          const cents = parseDollars(body.amount);
          return await queue(async () => {
            const settled = await settleRedeem({
              pegLock: deps.pegLock,
              guests: deps.guests,
              pay: deps.pay,
              address,
              token: body.token,
              rail: body.rail,
              cents,
              now,
              getState: () => state,
              setState: (next) => {
                state = typeof next === "function" ? next(state) : next;
                deps.save(state);
              },
            });
            if (settled) return settled;
            const before = clone(state);
            const out = applyRedeem(state, { address, rail: body.rail, cents }, now);
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
              throw new Error((err && err.message) || "Redeem did not broadcast. The ledger balance was put back.");
            }
          });
        }
        if (pathname === "/api/1984/layer/inscribe") {
          const name = normalizeLabel(body.name);
          const key = address.toLowerCase();
          const held = state.accounts && state.accounts[key];
          const names = accountNames(held);
          if (names.includes(name)) {
            const def = (held && (held.displayName || held.knsName)) || "";
            const tail = def ? " The default is " + def + ".kas." : " The bar shows the address until you choose a default.";
            return {
              status: 200,
              body: {
                ok: true,
                already: true,
                name,
                names,
                note: "This address already inscribed " + name + ".kas." + tail + " No covenant was deployed.",
              },
            };
          }
          const row = lookupSquareName(state, name);
          if (row && row.owner.toLowerCase() !== key) {
            throw new Error("That name is already on this square's index for another address.");
          }
          if (row && row.owner.toLowerCase() === key) {
            return {
              status: 200,
              body: {
                ok: true,
                already: true,
                name,
                names: accountNames(held),
                kns: publicKnsIndex(state),
                note: "This square's index already lists " + name + ".kas for this address. The KNS testnet index has not listed it. No covenant was deployed.",
              },
            };
          }
          if (!body.token) {
            throw new Error("This desk inscribes the funded test wallet it handed you. A pasted address uses the KNS app.");
          }
          const nameKey = "n:" + name;
          if (inscribing.has(key) || inscribing.has(nameKey)) throw new Error("This name is already being inscribed.");
          inscribing.add(key);
          inscribing.add(nameKey);
          try {
            const run = deps.inscribe || inscribeForGuest;
            const out = await run({ address, name, token: body.token });
            if (!out || out.pending || !out.inscriptionId) {
              return {
                status: 200,
                body: {
                  ok: true,
                  pending: true,
                  name,
                  note: (out && out.note) || "The commit is on Testnet-10. Press Inscribe again to finish this name.",
                },
              };
            }
            return await queue(async () => {
              const marked = applyInscribed(state, { address, name, inscriptionId: out.inscriptionId }, deps.now());
              const noted = recordSquareName(marked.state, {
                name,
                owner: address,
                inscriptionId: out.inscriptionId,
                source: "square",
              }, deps.now());
              state = noted.state;
              deps.save(state);
              return {
                status: 200,
                body: {
                  ...marked.result,
                  account: publicAccount(state, address),
                  feeKas: out.feeKas,
                  kns: publicKnsIndex(state),
                },
              };
            });
          } finally {
            inscribing.delete(key);
            inscribing.delete(nameKey);
          }
        }
        if (pathname === "/api/1984/layer/display") {
          const hit = await layerGate(body.name, address);
          return await queue(async () => {
            const show = body.show === true;
            const verified = withVerified(state, hit, body.name, address, now);
            const current = verified.sites && verified.sites[normalizeLabel(body.name)];
            let base = verified;
            if (show || current) {
              base = applyClaim(verified, { address, name: body.name, kns: "tn10" }, now).state;
            }
            if (!show && !(base.sites && base.sites[normalizeLabel(body.name)])) {
              if (base !== state) {
                state = base;
                deps.save(state);
              }
              return {
                status: 200,
                body: { ok: true, displayName: "", note: "This square shows the tKAS address.", account: publicAccount(state, address) },
              };
            }
            const out = applyDisplay(base, { address, name: body.name, show }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: { ...out.result, account: publicAccount(state, address) } };
          });
        }
        if (pathname === "/api/1984/layer/claim") {
          const hit = await layerGate(body.name, address);
          return await queue(async () => {
            const base = withVerified(state, hit, body.name, address, now);
            const out = applyClaim(base, { address, name: body.name, kns: "tn10" }, now);
            state = out.state;
            deps.save(state);
            if (hit.found && hit.found.index === "square") {
              out.result.note = "This address owns " + normalizeLabel(body.name) + ".kas on this square's index. The KNS testnet index is still the network record. This desk did not register it. No covenant was deployed.";
            }
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/layer/save") {
          const hit = await layerGate(body.name, address);
          return await queue(async () => {
            const base = withVerified(state, hit, body.name, address, now);
            const claimed = applyClaim(base, { address, name: body.name, kns: "tn10" }, now);
            const out = applySite(claimed.state, {
              address,
              name: body.name,
              title: body.title,
              tagline: body.tagline,
              about: body.about,
              welcome: body.welcome,
              accent: body.accent,
              linkLabel: body.linkLabel,
              linkUrl: body.linkUrl,
              offers: body.offers,
            }, now);
            state = out.state;
            deps.save(state);
            const bodyOut = { ...out.result };
            if (hit.found && hit.found.index === "square") {
              bodyOut.note = "Published " + normalizeLabel(body.name) + ".kas on this square's index. The KNS testnet index is still the network record. Visitors can open the page. No covenant was deployed.";
            }
            return { status: 200, body: bodyOut };
          });
        }
        if (pathname === "/api/1984/layer/buy") {
          return await queue(async () => {
            const out = applyOfferBuy(state, { address, name: body.name, offer: body.offer, rail: body.rail }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: { ...out.result, account: publicAccount(state, address) } };
          });
        }
        if (pathname === "/api/1984/layer/default") {
          return await queue(async () => {
            const out = applyDefault(state, { address, name: body.name || "" }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: { ...out.result, account: publicAccount(state, address) } };
          });
        }
        if (pathname === "/api/1984/layer/seal") {
          return await sealLayer(address, body);
        }
        if (pathname === "/api/1984/layer/seal/open") {
          return await openSeal(address, body);
        }
        if (pathname === "/api/1984/chat/handshake") {
          return await queue(async () => {
            const out = applyHandshake(state, { address, to: body.to }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: { ...out.result, account: publicAccount(state, address) } };
          });
        }
        if (pathname === "/api/1984/chat/accept") {
          return await queue(async () => {
            const out = applyAccept(state, { address, from: body.from }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: { ...out.result, account: publicAccount(state, address) } };
          });
        }
        if (pathname === "/api/1984/chat/send") {
          return await queue(async () => {
            const out = applyMessage(state, { address, to: body.to, text: body.text }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: { ...out.result, account: publicAccount(state, address) } };
          });
        }
        if (pathname === "/api/1984/vault/save") {
          return await queue(async () => {
            const out = applyVaultSave(state, {
              address,
              id: body.id,
              title: body.title,
              body: body.body,
              readers: body.readers,
              openAt: body.openAt,
              purpose: body.purpose,
              basis: body.basis,
            }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/vault/seal") {
          return await queue(async () => {
            const out = applyVaultSeal(state, { address, id: body.id }, now);
            state = out.state;
            deps.save(state);
            return { status: 200, body: out.result };
          });
        }
        if (pathname === "/api/1984/stream/buy") return await buyStream(address, body, false);
        if (pathname === "/api/1984/stream/open") {
          const row = titleById(state, body.id);
          if (!row) throw new Error("That title is not on SI stream.");
          const link = playLink(row, address);
          if (link.locked) {
            return { status: 402, body: { ok: false, locked: true, cents: link.cents, error: "Pay for this title to play it." } };
          }
          return { status: 200, body: { ok: true, ...link } };
        }
        if (pathname === "/api/1984/stream/share") {
          return await queue(async () => {
            const row = normalizeShare(body, address);
            row.at = now;
            state = addTitle(state, row);
            deps.save(state);
            return { status: 200, body: { ok: true, id: row.id, ...publicStream(state, ownedStreamIds(address)) } };
          });
        }
        if (pathname === "/api/1984/stream/remove") {
          return await queue(async () => {
            state = removeTitle(state, body.id, address);
            deps.save(state);
            return { status: 200, body: { ok: true, ...publicStream(state, ownedStreamIds(address)) } };
          });
        }
        return { status: 404, body: { ok: false, error: "Not found." } };
      } catch (err) {
        return { status: 400, body: { ok: false, error: err.message || String(err), moved: !!err.moved } };
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
      pegLock: createPegLock(),
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
