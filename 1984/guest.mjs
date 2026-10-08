/** Tab-only Testnet-10 wallets. The key stays in this file. The browser gets an address and a token. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUEST_DISCLAIMER, RESERVE, assertTestnet, dayKey } from "./money.mjs";

export { GUEST_DISCLAIMER };
export const GUEST_FUND_SOMPI = 50000n * 100_000_000n;
export const GUEST_PER_IP = 2000;
export const GUEST_PER_DAY = 2000;
export const GUEST_BYE_MS = 25_000;
export const GUEST_STALE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const REAP_BATCH = 3;

export function emptyBook() {
  return { sessions: {}, days: {} };
}

function scrub(err, key) {
  let msg = String((err && (err.message || err)) || "The test wallet failed.");
  if (key) msg = msg.split(String(key)).join("");
  msg = msg.replace(/[0-9a-fA-F]{32,}/g, "").replace(/\s+/g, " ").trim();
  if (!msg || /private-key|mnemonic|seed phrase|privHex/i.test(msg)) msg = "The test wallet failed.";
  return new Error(msg.slice(0, 180));
}

export function createGuestDesk(deps) {
  let book = deps.load();
  if (!book || typeof book !== "object") book = emptyBook();
  if (!book.sessions || typeof book.sessions !== "object") book.sessions = {};
  if (!book.days || typeof book.days !== "object") book.days = {};
  let lock = Promise.resolve();
  const pendingBye = new Map();
  const jobs = new Map();
  const desk = { onGone: null };

  function publicJob(job) {
    if (!job) return null;
    const out = {
      ok: job.ok === true,
      pending: job.pending === true,
      job: job.id,
      step: job.step || "",
    };
    if (job.detail) out.detail = job.detail;
    if (job.error) out.error = job.error;
    if (job.ok && job.result) {
      out.address = job.result.address;
      out.token = job.result.token;
      out.sompi = job.result.sompi;
      out.txid = job.result.txid;
      out.same = job.result.same === true;
      out.remembered = job.result.remembered === true;
      out.replaced = job.result.replaced === true;
      out.disclaimer = job.result.disclaimer;
    }
    return out;
  }

  function pruneJobs() {
    const cutoff = deps.now() - 30 * 60 * 1000;
    for (const [key, value] of jobs) {
      if (!value.pending && value.at < cutoff) jobs.delete(key);
    }
  }

  function queue(fn) {
    const run = lock.then(fn, fn);
    lock = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  function persist() {
    deps.save(book);
  }

  function disarm(token) {
    const timer = pendingBye.get(token);
    if (timer) clearTimeout(timer);
    pendingBye.delete(token);
  }

  function arm(token) {
    disarm(token);
    const timer = setTimeout(() => {
      pendingBye.delete(token);
      queue(async () => {
        const row = book.sessions[token];
        if (!row || !row.byeAt) return;
        if (deps.now() - Number(row.byeAt) < GUEST_BYE_MS) return;
        await drop(token);
      }).catch(() => {});
    }, GUEST_BYE_MS);
    if (timer.unref) timer.unref();
    pendingBye.set(token, timer);
  }

  async function drop(token) {
    const row = book.sessions[token];
    if (!row) return;
    disarm(token);
    try {
      await deps.sweep({ key: row.key, from: row.address, home: row.home || "" });
    } catch (err) {
      row.sweepAfter = deps.now() + RETRY_MS;
      persist();
      if (!deps.quiet) console.error("guest sweep will retry:", row.address, scrub(err, row.key).message);
      return;
    }
    const address = row.address;
    if (row.browser) {
      if (!book.lost || typeof book.lost !== "object") book.lost = {};
      book.lost[row.browser] = { address, at: deps.now() };
    }
    delete book.sessions[token];
    persist();
    if (desk.onGone) {
      try {
        desk.onGone(address);
      } catch {
        /* The coins are already swept. The toy row can wait. */
      }
    }
  }

  async function reap(now) {
    const due = [];
    for (const [token, row] of Object.entries(book.sessions)) {
      if (row.sweepAfter && now < Number(row.sweepAfter)) continue;
      if (row.browser && !row.sweepAfter) continue;
      const bye = Number(row.byeAt || 0);
      const touched = Number(row.touched || row.created || 0);
      const byeDue = bye && now - bye >= GUEST_BYE_MS && (!row.life || !row.byeLife || row.life === row.byeLife);
      if (byeDue || now - touched >= GUEST_STALE_MS) due.push(token);
    }
    for (const token of due.slice(0, REAP_BATCH)) await drop(token);
  }

  function browserKey(value) {
    const id = String(value || "").trim().toLowerCase();
    return /^[0-9a-f]{32}$/.test(id) ? id : "";
  }

  function findBrowser(id) {
    if (!id) return null;
    for (const [token, row] of Object.entries(book.sessions)) {
      if (row && row.browser === id) return { token, row };
    }
    return null;
  }

  function resume(found, pageLife, now) {
    found.row.life = pageLife;
    found.row.byeAt = 0;
    found.row.byeLife = "";
    found.row.touched = now;
    disarm(found.token);
    persist();
    return {
      ok: true,
      same: true,
      remembered: true,
      replaced: false,
      address: found.row.address,
      token: found.token,
      sompi: found.row.funded,
      txid: found.row.fundTxid || "",
      disclaimer: GUEST_DISCLAIMER,
    };
  }

  async function openInside({ ip, life, browser, onStep }) {
    const step = (name, extra) => {
      if (onStep) onStep(name, extra);
    };
    const pageLife = String(life || "");
    const marker = browserKey(browser);
    const now = deps.now();
    step("Checking today's test wallets");
    await reap(now);
    const returning = findBrowser(marker);
    if (returning) return resume(returning, pageLife, now);
    const dayName = dayKey(now);
    if (!book.days[dayName]) book.days[dayName] = { n: 0, ips: {} };
    const day = book.days[dayName];
    const who = String(ip || "unknown");
    const used = Number(day.ips[who] || 0);
    if (used >= GUEST_PER_IP) {
      throw new Error(
        "This network has used today's funded test addresses. This money is tKAS. With tKAS you can go to the bank."
      );
    }
    if (Number(day.n) >= GUEST_PER_DAY) {
      throw new Error("Today's funded test addresses are used up. This money is tKAS. With tKAS you can go to the bank.");
    }
    const ready = deps.takeReady ? await deps.takeReady() : null;
    if (!ready && deps.poolOnly) {
      throw new Error("The funded test addresses are used up. This money is tKAS. With tKAS you can go to the bank.");
    }
    let address = "";
    let key = "";
    let fundedSompi = GUEST_FUND_SOMPI;
    let knownTxid = "";
    let home = "";
    if (ready) {
      step("Handing out a funded test address");
      try {
        address = assertTestnet(ready.address);
      } catch (err) {
        throw scrub(err, ready && ready.key);
      }
      if (address.toLowerCase() === RESERVE.toLowerCase()) throw new Error("Test wallet collided with the reserve.");
      key = String(ready.key || "").trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("Test wallet was not created.");
      fundedSompi = BigInt(ready.sompi || ready.funded || 0);
      if (fundedSompi <= 0n) throw new Error("The test wallet was not funded.");
      knownTxid = String(ready.txid || ready.fundTxid || "");
      if (ready.home) home = assertTestnet(ready.home);
    } else {
      step("Making a Testnet-10 address");
      let minted;
      try {
        minted = await deps.mint();
      } catch (err) {
        throw scrub(err, minted && minted.key);
      }
      address = assertTestnet(minted.address);
      if (address.toLowerCase() === RESERVE.toLowerCase()) throw new Error("Test wallet collided with the reserve.");
      key = String(minted.key || "").trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("Test wallet was not created.");
    }
    const token = crypto.randomBytes(24).toString("hex");
    const replaced = !!(marker && book.lost && book.lost[marker]);
    day.n += 1;
    day.ips[who] = used + 1;
    book.sessions[token] = {
      address,
      key,
      ip: who,
      life: pageLife,
      created: now,
      touched: now,
      funded: fundedSompi.toString(),
      fundTxid: knownTxid,
      home,
      browser: marker,
      byeAt: 0,
      byeLife: "",
    };
    persist();
    if (!ready) {
      try {
        const paid = await deps.fund(address, GUEST_FUND_SOMPI, step);
        const txid = paid && paid.txids && paid.txids[0];
        const got = BigInt(paid && paid.sompi != null ? paid.sompi : 0);
        if (!txid || got < GUEST_FUND_SOMPI) throw new Error("The test wallet was not funded.");
        book.sessions[token].fundTxid = String(txid);
        persist();
      } catch (err) {
        let swept = false;
        try {
          await deps.sweep({ key, from: address, home });
          swept = true;
        } catch {
          if (book.sessions[token]) book.sessions[token].sweepAfter = deps.now() + RETRY_MS;
          persist();
        }
        if (swept) {
          delete book.sessions[token];
          day.n -= 1;
          day.ips[who] = used;
          persist();
        }
        throw scrub(err, key);
      }
    }
    const row = book.sessions[token];
    if (replaced && book.lost) delete book.lost[marker];
    persist();
    return {
      ok: true,
      same: false,
      remembered: !!marker,
      replaced,
      address: row.address,
      token,
      sompi: row.funded,
      txid: row.fundTxid,
      disclaimer: GUEST_DISCLAIMER,
    };
  }

  desk.open = ({ ip, life, browser }) => queue(() => openInside({ ip, life, browser }));

  desk.job = (id) => {
    pruneJobs();
    const job = jobs.get(String(id || ""));
    if (!job) return null;
    return publicJob(job);
  };

  desk.start = ({ ip, life, browser }) => {
    pruneJobs();
    const id = crypto.randomBytes(8).toString("hex");
    const job = {
      id,
      at: deps.now(),
      ok: false,
      pending: true,
      step: "Waiting for the till",
      error: "",
      result: null,
    };
    jobs.set(id, job);
    queue(async () => {
      try {
        const opened = await openInside({
          ip,
          life,
          browser,
          onStep: (name, extra) => {
            job.step = String(name || job.step);
            job.detail = extra && extra.detail ? String(extra.detail).slice(0, 80) : "";
          },
        });
        job.ok = true;
        job.pending = false;
        job.step = "Broadcasting";
        job.error = "";
        job.result = opened;
      } catch (err) {
        job.ok = false;
        job.pending = false;
        job.step = "Stopped";
        job.error = (err && err.message) || "The test wallet failed.";
        job.result = null;
      }
    }).catch((err) => {
      job.ok = false;
      job.pending = false;
      job.step = "Stopped";
      job.error = (err && err.message) || "The test wallet failed.";
      job.result = null;
    });
    return publicJob(job);
  };

  desk.pay = ({ token, address, sompi }) =>
    queue(async () => {
      const now = deps.now();
      const row = book.sessions[String(token || "")];
      if (!row) throw new Error("This test tab has already been dropped. Open a new one, or use your Testnet-10 wallet.");
      const clean = assertTestnet(address);
      if (row.address !== clean) throw new Error("This test tab does not match that address.");
      if (row.byeAt && row.byeLife && row.life === row.byeLife) {
        throw new Error("This test tab is closing. Open a new one, or use your Testnet-10 wallet.");
      }
      const amount = BigInt(sompi);
      const cap = BigInt(row.funded || 0);
      if (cap <= 0n || amount <= 0n || amount > cap) {
        throw new Error(
          "This test wallet holds " +
            (cap / 100_000_000n).toString() +
            " tKAS. That payment is outside it. This money is tKAS. With tKAS you can go to the bank."
        );
      }
      row.touched = now;
      persist();
      let paid;
      try {
        paid = await deps.pay({ key: row.key, from: row.address, sompi: amount });
      } catch (err) {
        throw scrub(err, row.key);
      }
      const txid = paid && (paid.txid || (paid.txids && paid.txids[0]));
      const sent = BigInt(paid && paid.sompi != null ? paid.sompi : 0);
      if (!txid || sent < amount) throw new Error("The test wallet could not cover that payment.");
      if (book.sessions[String(token || "")]) book.sessions[String(token || "")].touched = deps.now();
      persist();
      return { ok: true, txid: String(txid), sompi: sent.toString() };
    });

  desk.keep = ({ token, address, life }) =>
    queue(async () => {
      const now = deps.now();
      const key = String(token || "");
      const row = book.sessions[key];
      if (!row) throw new Error("This test tab has already been dropped. Open a new one, or use your Testnet-10 wallet.");
      if (row.address !== assertTestnet(address)) throw new Error("This test tab does not match that address.");
      row.life = String(life || row.life || "");
      row.byeAt = 0;
      row.byeLife = "";
      row.touched = now;
      disarm(key);
      persist();
      await reap(now);
      return { ok: true, address: row.address };
    });

  desk.close = ({ token, address, life }) =>
    queue(async () => {
      const key = String(token || "");
      const row = book.sessions[key];
      if (!row) return { ok: true, closing: false, gone: true, disclaimer: GUEST_DISCLAIMER };
      if (address && row.address !== assertTestnet(address)) throw new Error("This test tab does not match that address.");
      if (row.browser) {
        row.byeAt = 0;
        row.byeLife = "";
        row.touched = deps.now();
        disarm(key);
        persist();
        return { ok: true, closing: false, kept: true, disclaimer: GUEST_DISCLAIMER };
      }
      const stamp = String(life || "");
      if (row.life && stamp && stamp !== row.life) {
        return { ok: true, closing: false, stale: true, disclaimer: GUEST_DISCLAIMER };
      }
      row.byeAt = deps.now();
      row.byeLife = stamp || row.life || "";
      persist();
      arm(key);
      return { ok: true, closing: true, disclaimer: GUEST_DISCLAIMER };
    });

  desk.reapNow = () => queue(async () => {
    await reap(deps.now());
    return { ok: true };
  });

  const interval = setInterval(() => {
    queue(() => reap(deps.now())).catch(() => {});
  }, RETRY_MS);
  if (interval.unref) interval.unref();

  return desk;
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const guestFile = path.join(dir, "guests.json");
const poolFile = path.join(dir, "guest-pool.json");
const issuedFile = path.join(dir, "guest-pool-issued.jsonl");
let singleton;

function claimPrepared() {
  if (!fs.existsSync(poolFile)) return null;
  const parsed = JSON.parse(fs.readFileSync(poolFile, "utf8"));
  const wallets = parsed && Array.isArray(parsed.wallets) ? parsed.wallets : null;
  if (!wallets) throw new Error("Funded test wallets could not be read.");
  const home = parsed.home ? assertTestnet(parsed.home) : "";
  let changed = false;
  while (wallets.length) {
    const row = wallets[0];
    const key = String((row && row.key) || "").trim().toLowerCase();
    let address = "";
    try {
      address = assertTestnet(row && row.address);
    } catch {
      address = "";
    }
    let sompi = 0n;
    try {
      sompi = BigInt((row && row.sompi) || 0);
    } catch {
      sompi = 0n;
    }
    if (!row || row.ready !== true || !address || !/^[0-9a-f]{64}$/.test(key) || sompi <= 0n) {
      wallets.shift();
      changed = true;
      continue;
    }
    wallets.shift();
    const tmp = poolFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(parsed));
    fs.renameSync(tmp, poolFile);
    const claimed = {
      address,
      key,
      sompi: sompi.toString(),
      txid: String(row.txid || ""),
      home: row.home ? assertTestnet(row.home) : home,
    };
    try {
      fs.appendFileSync(issuedFile, JSON.stringify(claimed) + "\n");
    } catch {
      /* The session still holds the key. */
    }
    return claimed;
  }
  if (changed) {
    const tmp = poolFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(parsed));
    fs.renameSync(tmp, poolFile);
  }
  return null;
}

export function guestDesk() {
  if (singleton) return singleton;
  singleton = createGuestDesk({
    now: () => Date.now(),
    load() {
      if (!fs.existsSync(guestFile)) return emptyBook();
      const parsed = JSON.parse(fs.readFileSync(guestFile, "utf8"));
      if (!parsed || typeof parsed.sessions !== "object") throw new Error("Test wallet book is unreadable.");
      return parsed;
    },
    save(book) {
      const tmp = guestFile + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(book));
      fs.renameSync(tmp, guestFile);
    },
    async mint() {
      const { mintTestnetAddress } = await import("../faucet/pay.mjs");
      return mintTestnetAddress();
    },
    async fund(address, sompi, onStep) {
      const { payTn10 } = await import("../faucet/pay.mjs");
      const { pageFeeRate } = await import("../faucet/fee-rate.mjs");
      return payTn10(address, sompi, onStep, pageFeeRate);
    },
    async pay({ key, from, sompi }) {
      const { payFromKey } = await import("../faucet/pay.mjs");
      const { pageFeeRate } = await import("../faucet/fee-rate.mjs");
      const out = await payFromKey({ privHex: key, fromAddr: from, toAddr: RESERVE, sompi, rateOf: pageFeeRate });
      return { txid: out.txids && out.txids[0], sompi: out.sompi, txids: out.txids };
    },
    poolOnly: true,
    takeReady() {
      return claimPrepared();
    },
    async sweep({ key, from, home }) {
      const { payFromKey } = await import("../faucet/pay.mjs");
      const { pageFeeRate } = await import("../faucet/fee-rate.mjs");
      const toAddr = home ? assertTestnet(home) : RESERVE;
      return payFromKey({ privHex: key, fromAddr: from, toAddr, sompi: 0n, drain: true, rateOf: pageFeeRate });
    },
  });
  return singleton;
}
