/** Calm book for the 1984 revisited tab. The lock is this book. Coins stay in the test wallet until a redeem or a tKAS send. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTestnet, formatCents, formatTkas, parseDollars, parseTkas, usdMicro } from "../1984/money.mjs";
import { fetchBalance, fetchPrice } from "../1984/chain.mjs";
import { guestDesk } from "../1984/guest.mjs";

const SCALE = 1_000_000_000_000n;
const CUSHION_SOMPI = 100_000_000n;
const MCR_NUM = 3n;
const MCR_DEN = 2n;
const SEED = [
  { id: "water", name: "Water", priceCents: "10", kind: "counter" },
  { id: "film", name: "A film", priceCents: "15", kind: "service" },
];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function emptyBook() {
  return { seq: 1, accounts: {}, listings: SEED.map((row) => ({ ...row })), receipts: [] };
}

function normalize(raw) {
  const book = raw && typeof raw === "object" ? raw : emptyBook();
  if (!book.accounts || typeof book.accounts !== "object") book.accounts = {};
  if (!Array.isArray(book.listings)) book.listings = [];
  if (!Array.isArray(book.receipts)) book.receipts = [];
  if (!Number.isInteger(book.seq) || book.seq < 1) book.seq = 1;
  for (const seed of SEED) {
    if (!book.listings.some((row) => row && row.id === seed.id)) book.listings.unshift({ ...seed });
  }
  for (const row of Object.values(book.accounts)) {
    if (!row || typeof row !== "object") continue;
    row.calm = String(row.calm || "0");
    row.locked = String(row.locked || "0");
    row.debt = String(row.debt || "0");
    if (!Array.isArray(row.claims)) row.claims = [];
  }
  return book;
}

function sompiForCentsAt(cents, quote) {
  const c = BigInt(cents);
  if (c <= 0n) return 0n;
  return (c * SCALE + quote - 1n) / quote;
}

function valueCentsAt(sompi, quote) {
  return (BigInt(sompi) * quote) / SCALE;
}

function requiredLock(debt, quote) {
  if (debt <= 0n) return 0n;
  const need = (debt * MCR_NUM + MCR_DEN - 1n) / MCR_DEN;
  return sompiForCentsAt(need, quote);
}

function spendableSompi(live, locked) {
  const floor = BigInt(locked) + CUSHION_SOMPI;
  if (live <= floor) return 0n;
  return live - floor;
}

function formatQuote(micros) {
  const n = BigInt(micros);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? whole.toString() + "." + frac : whole.toString();
}

function ratioText(locked, debt, quote) {
  if (!quote || debt <= 0n) return "";
  const col = valueCentsAt(locked, quote);
  const bps = (col * 10_000n) / debt;
  return (bps / 100n).toString() + "." + (bps % 100n).toString().padStart(2, "0") + "%";
}

function cleanName(name) {
  const title = String(name || "").replace(/[\u0000-\u001f<>]/g, "").trim().replace(/\s+/g, " ");
  if (title.length < 1 || title.length > 40) throw fail(400, "Use a name of 1 to 40 characters.");
  return title;
}

function cleanNote(memo) {
  if (memo == null || memo === "") return "";
  const value = String(memo).replace(/[\u0000-\u001f]/g, "").trim();
  if (value.length > 160) throw fail(400, "The note stays under 160 characters.");
  return value;
}

function cleanError(err) {
  let message = (err && err.message) || "The desk could not do that.";
  if (message === "That request is not JSON." || message === "Not found.") return message;
  message = message.replace(/[0-9a-f]{64}/gi, "[hidden]");
  if (/private|secret|mnemonic|seed phrase|privHex/i.test(message)) return "The desk could not do that.";
  return message.slice(0, 240);
}

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/^(key|privateKey|privHex|secret|mnemonic|seed)$/i.test(key)) continue;
      out[key] = scrub(item);
    }
    return out;
  }
  return value;
}

export function createRevisited(deps) {
  let book = normalize(deps.load());
  let chain = Promise.resolve();
  const guests = deps.guests;
  const now = deps.now || (() => Date.now());

  function queue(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {});
    return run;
  }

  function save() {
    deps.save(book);
  }

  function ensure(key) {
    const id = String(key || "").startsWith("listing:") ? String(key) : assertTestnet(key);
    if (id.startsWith("listing:") && !/^listing:[a-z0-9-]{1,40}$/.test(id)) {
      throw fail(400, "That listing is not on this desk.");
    }
    if (!book.accounts[id]) book.accounts[id] = { calm: "0", locked: "0", debt: "0", claims: [] };
    return book.accounts[id];
  }

  function stamp(kind, text) {
    book.receipts.unshift({ at: now(), kind, text: String(text).slice(0, 240) });
    book.receipts = book.receipts.slice(0, 30);
  }

  function checkInvariant() {
    let calm = 0n;
    let debt = 0n;
    let claims = 0n;
    const byMinter = {};
    for (const row of Object.values(book.accounts)) {
      calm += BigInt(row.calm || 0);
      debt += BigInt(row.debt || 0);
      for (const claim of row.claims || []) {
        const n = BigInt(claim.cents || 0);
        claims += n;
        byMinter[claim.minter] = (byMinter[claim.minter] || 0n) + n;
      }
    }
    if (calm !== debt || calm !== claims) throw fail(500, "The calm book is out of balance.");
    for (const [addr, row] of Object.entries(book.accounts)) {
      if ((byMinter[addr] || 0n) !== BigInt(row.debt || 0)) throw fail(500, "The calm book is out of balance.");
    }
  }

  function peel(row, cents) {
    let left = cents;
    const taken = [];
    const keep = [];
    for (const claim of row.claims) {
      const have = BigInt(claim.cents || 0);
      if (left <= 0n) {
        keep.push(claim);
        continue;
      }
      if (have <= left) {
        taken.push({ minter: claim.minter, cents: have });
        left -= have;
      } else {
        taken.push({ minter: claim.minter, cents: left });
        keep.push({ minter: claim.minter, cents: (have - left).toString() });
        left = 0n;
      }
    }
    if (left !== 0n) throw fail(400, "The calm on this address does not cover this.");
    row.claims = keep;
    row.calm = (BigInt(row.calm) - cents).toString();
    return taken;
  }

  function give(row, slices) {
    let add = 0n;
    for (const slice of slices) {
      const cents = BigInt(slice.cents);
      add += cents;
      const last = row.claims[row.claims.length - 1];
      if (last && last.minter === slice.minter) last.cents = (BigInt(last.cents) + cents).toString();
      else row.claims.push({ minter: slice.minter, cents: cents.toString() });
    }
    row.calm = (BigInt(row.calm) + add).toString();
  }

  async function auth(token, address) {
    const clean = assertTestnet(address);
    if (!token || typeof token !== "string" || token.length > 200) {
      throw fail(400, "This test tab has already been dropped. Open a new one.");
    }
    const seen = await guests.view({ token, address: clean });
    if (!seen || seen.address !== clean) throw fail(400, "This test tab does not match that address.");
    return clean;
  }

  async function loadQuote() {
    let micros;
    try {
      micros = BigInt(await deps.priceOf());
    } catch (err) {
      throw fail(400, cleanError(err) || "The price oracle has no KAS quote.");
    }
    if (micros <= 0n) throw fail(400, "The price oracle has no KAS quote.");
    return micros;
  }

  async function loadLive(address) {
    try {
      return BigInt(await deps.balanceOf(address));
    } catch (err) {
      throw fail(400, cleanError(err) || "Testnet-10 did not return a balance.");
    }
  }

  function accountRow(address) {
    return book.accounts[address] || { calm: "0", locked: "0", debt: "0", claims: [] };
  }

  async function paint(address) {
    const row = accountRow(address);
    const debt = BigInt(row.debt || 0);
    const locked = BigInt(row.locked || 0);
    const calm = BigInt(row.calm || 0);
    let quote = null;
    let quoteError = "";
    try {
      quote = BigInt(await deps.priceOf());
      if (quote <= 0n) {
        quote = null;
        quoteError = "The price oracle has no KAS quote.";
      }
    } catch (err) {
      quoteError = cleanError(err);
    }
    let live = null;
    let balanceError = "";
    try {
      live = BigInt(await deps.balanceOf(address));
    } catch (err) {
      balanceError = cleanError(err);
    }
    const under = !!(quote && debt > 0n && valueCentsAt(locked, quote) * MCR_DEN < debt * MCR_NUM);
    const surplus = quote && debt > 0n && !under ? (() => {
      const need = requiredLock(debt, quote);
      return locked > need ? locked - need : 0n;
    })() : 0n;
    const spendable = live == null ? null : spendableSompi(live, locked);
    let line = quoteError || "No calm is open on this address.";
    if (quote && debt > 0n && under) {
      line = "The lock is under 150%. Mint and surplus wait. Repay works when the locked tKAS covers the price.";
    } else if (quote && debt > 0n) {
      line = "The lock covers 150%.";
    }
    return {
      ok: true,
      address,
      quote: quote ? formatQuote(quote) : "",
      quoteMicros: quote ? quote.toString() : "",
      balance: live == null ? "" : formatTkas(live),
      balanceError,
      locked: formatTkas(locked),
      lockedSompi: locked.toString(),
      spendable: spendable == null ? "" : formatTkas(spendable),
      calm: formatCents(calm),
      calmCents: calm.toString(),
      debt: formatCents(debt),
      ratio: ratioText(locked, debt, quote),
      surplus: formatTkas(surplus),
      cushion: "1",
      mintDisabled: !quote || !!balanceError || under,
      line,
      listings: book.listings.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        price: formatCents(item.priceCents || 0),
        priceCents: String(item.priceCents || "0"),
        address: item.address || "",
      })),
      receipts: book.receipts.slice(0, 8).map((item) => ({ kind: item.kind, text: item.text })),
    };
  }

  function txidOf(paid) {
    const txid = paid && (paid.txid || (paid.txids && paid.txids[0]));
    if (!txid) throw fail(400, "The test wallet could not cover that payment.");
    return String(txid);
  }

  async function mint(address, body) {
    const cents = parseDollars(body.amount);
    const quote = await loadQuote();
    const live = await loadLive(address);
    const row = ensure(address);
    const debt = BigInt(row.debt || 0);
    const locked = BigInt(row.locked || 0);
    if (debt > 0n && valueCentsAt(locked, quote) * MCR_DEN < debt * MCR_NUM) {
      throw fail(400, "The lock is under 150%.");
    }
    const nextDebt = debt + cents;
    const need = requiredLock(nextDebt, quote);
    const add = need > locked ? need - locked : 0n;
    const room = spendableSompi(live, locked);
    if (add > room) {
      throw fail(400, "The open tKAS does not cover this mint. One tKAS stays for the miner fee, and the lock stays at or above 150%.");
    }
    give(row, [{ minter: address, cents }]);
    row.debt = nextDebt.toString();
    row.locked = need.toString();
    stamp("mint", "Minted " + formatCents(cents) + " calm. Locked " + formatTkas(add) + " tKAS more.");
    checkInvariant();
    save();
    return "Minted " + formatCents(cents) + " calm.";
  }

  async function moveCalm(from, to, cents, text) {
    if (from === to) throw fail(400, "Choose another address.");
    const row = book.accounts[from];
    if (!row || BigInt(row.calm || 0) < cents) throw fail(400, "The calm on this address does not cover this.");
    const slices = peel(row, cents);
    give(ensure(to), slices);
    stamp("send", text);
    checkInvariant();
    save();
  }

  function peelFrom(row, minter, cents) {
    let left = cents;
    const keep = [];
    for (const claim of row.claims) {
      const have = BigInt(claim.cents || 0);
      if (claim.minter !== minter || left <= 0n) {
        keep.push(claim);
        continue;
      }
      if (have <= left) left -= have;
      else {
        keep.push({ minter, cents: (have - left).toString() });
        left = 0n;
      }
    }
    if (left !== 0n) throw fail(400, "The calm on this address does not cover this.");
    row.claims = keep;
    row.calm = (BigInt(row.calm) - cents).toString();
  }

  async function redeem(address, body) {
    const cents = parseDollars(body.amount);
    const quote = await loadQuote();
    const row = book.accounts[address];
    if (!row || BigInt(row.calm || 0) < cents) throw fail(400, "The calm on this address does not cover this.");
    const ownOnly = body.action === "repay";
    if (ownOnly) {
      let own = 0n;
      for (const claim of row.claims) if (claim.minter === address) own += BigInt(claim.cents || 0);
      if (own < cents) throw fail(400, "Repay uses calm this address minted.");
    }
    let left = cents;
    while (left > 0n) {
      const claim = row.claims.find((item) => BigInt(item.cents || 0) > 0n && (!ownOnly || item.minter === address));
      if (!claim) throw fail(400, ownOnly ? "Repay uses calm this address minted." : "The calm on this address does not cover this.");
      const take = BigInt(claim.cents) < left ? BigInt(claim.cents) : left;
      const peg = sompiForCentsAt(take, quote);
      const minter = ensure(claim.minter);
      if (BigInt(minter.locked || 0) < peg) {
        throw fail(400, "The locked tKAS does not cover this repay at the current price.");
      }
      if (claim.minter !== address) {
        const live = await loadLive(claim.minter);
        if (live < peg) throw fail(400, "The locked tKAS does not cover this repay at the current price.");
        txidOf(await guests.payFromAddress({ address: claim.minter, sompi: peg.toString(), to: address }));
      }
      peelFrom(row, claim.minter, take);
      const nextLocked = BigInt(minter.locked) - peg;
      minter.debt = (BigInt(minter.debt) - take).toString();
      minter.locked = BigInt(minter.debt) === 0n ? "0" : nextLocked.toString();
      left -= take;
      checkInvariant();
      save();
    }
    const text = (ownOnly ? "Repaid " : "Redeemed ") + formatCents(cents) + " calm.";
    stamp(ownOnly ? "repay" : "redeem", text);
    save();
    return text;
  }

  async function surplus(address) {
    const quote = await loadQuote();
    const row = ensure(address);
    const debt = BigInt(row.debt || 0);
    const locked = BigInt(row.locked || 0);
    if (debt <= 0n) throw fail(400, "There is no surplus tKAS to take back.");
    if (valueCentsAt(locked, quote) * MCR_DEN < debt * MCR_NUM) throw fail(400, "The lock is under 150%.");
    const need = requiredLock(debt, quote);
    if (locked <= need) throw fail(400, "There is no surplus tKAS to take back.");
    const free = locked - need;
    row.locked = need.toString();
    const text = "Took back " + formatTkas(free) + " tKAS. The lock stays at or above 150%.";
    stamp("surplus", text);
    checkInvariant();
    save();
    return text;
  }

  async function sendKas(address, body) {
    const amount = parseTkas(body.amount);
    const to = assertTestnet(body.to);
    if (to === address) throw fail(400, "Choose another address.");
    const live = await loadLive(address);
    const locked = BigInt((book.accounts[address] && book.accounts[address].locked) || 0);
    if (amount > spendableSompi(live, locked)) {
      throw fail(400, "That send would use tKAS this desk is holding for calm, or the 1 tKAS miner cushion.");
    }
    const txid = txidOf(await guests.payTo({ token: body.token, address, sompi: amount.toString(), to }));
    const text = "Sent " + formatTkas(amount) + " tKAS. " + txid;
    stamp("kas", text);
    save();
    return text;
  }

  async function act(body) {
    const action = String((body && body.action) || "");
    if (action === "freeze" || action === "reset") throw fail(404, "Not found.");
    const address = await auth(body && body.token, body && body.address);
    let receipt = "";
    if (action === "picture") {
      /* read only */
    } else if (action === "mint") receipt = await mint(address, body);
    else if (action === "repay" || action === "redeem") receipt = await redeem(address, body);
    else if (action === "surplus") receipt = await surplus(address);
    else if (action === "send") {
      const cents = parseDollars(body.amount);
      const to = assertTestnet(body.to);
      const note = cleanNote(body.note);
      const extra = note ? " Note: " + note : "";
      await moveCalm(address, to, cents, "Sent " + formatCents(cents) + " calm." + extra);
      receipt = "Sent " + formatCents(cents) + " calm.";
    } else if (action === "spend") {
      const listing = book.listings.find((item) => item && item.id === body.id);
      if (!listing) throw fail(400, "That listing is not on this desk.");
      const price = BigInt(listing.priceCents || 0);
      if (price <= 0n) throw fail(400, "That listing has no price.");
      const target = listing.kind === "person" ? listing.address : "listing:" + listing.id;
      if (!target) throw fail(400, "That person has no address.");
      await moveCalm(address, target, price, "Paid " + listing.name + " " + formatCents(price) + " calm.");
      receipt = "Paid " + listing.name + " " + formatCents(price) + " calm.";
    } else if (action === "kas") receipt = await sendKas(address, body);
    else if (action === "list") {
      const name = cleanName(body.name);
      const kind = body.kind;
      if (kind !== "counter" && kind !== "service" && kind !== "person") {
        throw fail(400, "Kind is counter, service, or person.");
      }
      const id = "n" + String(book.seq++);
      if (kind === "person") {
        const who = assertTestnet(body.to);
        const price = body.amount ? parseDollars(body.amount) : 0n;
        book.listings.push({ id, name, priceCents: price.toString(), kind, address: who });
      } else {
        const price = parseDollars(body.amount);
        if (price > 100_000_000n) throw fail(400, "Price stays under 1,000,000.00.");
        book.listings.push({ id, name, priceCents: price.toString(), kind });
      }
      receipt = "Listed " + name + ".";
      stamp("list", receipt);
      save();
    } else throw fail(404, "Not found.");
    const picture = await paint(address);
    return { status: 200, body: receipt ? { ...picture, receipt } : picture };
  }

  return {
    picture(input) {
      return queue(async () => paint(await auth(input && input.token, input && input.address)));
    },
    call(body) {
      return queue(() => act(body));
    },
  };
}

function liveFile() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "book.json");
}

let singleton;

export function revisitedDesk() {
  if (!singleton) {
    const file = liveFile();
    singleton = createRevisited({
      load() {
        try {
          if (!fs.existsSync(file)) return emptyBook();
          return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {
          return emptyBook();
        }
      },
      save(book) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(book));
        fs.renameSync(tmp, file);
      },
      guests: guestDesk(),
      balanceOf: (address) => fetchBalance(address, globalThis.fetch),
      priceOf: async () => usdMicro(await fetchPrice(globalThis.fetch)),
      now: () => Date.now(),
    });
  }
  return singleton;
}

export async function dispatch(desk, req, res, url, tools) {
  if (String(url.pathname || "").toLowerCase().includes("freeze")) {
    tools.sendJson(res, 404, { ok: false, error: "Not found." }, req);
    return;
  }
  if (req.method === "OPTIONS" && url.pathname === "/api/revisited") {
    tools.sendJson(res, 204, {}, req);
    return;
  }
  if (url.pathname !== "/api/revisited") {
    tools.sendJson(res, 404, { ok: false, error: "Not found." }, req);
    return;
  }
  try {
    if (req.method === "GET") {
      const picture = await desk.picture({
        address: url.searchParams.get("address") || "",
        token: url.searchParams.get("token") || "",
      });
      tools.sendJson(res, 200, scrub(picture), req);
      return;
    }
    if (req.method !== "POST") {
      tools.sendJson(res, 405, { ok: false, error: "Use GET or POST." }, req);
      return;
    }
    const declared = Number(req.headers && req.headers["content-length"] || 0);
    if (declared > 20_000) {
      tools.sendJson(res, 413, { ok: false, error: "That request is too large." }, req);
      return;
    }
    const raw = await tools.readBody(req);
    if (String(raw || "").length > 20_000) {
      tools.sendJson(res, 413, { ok: false, error: "That request is too large." }, req);
      return;
    }
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      throw fail(400, "That request is not JSON.");
    }
    const result = await desk.call(body);
    tools.sendJson(res, result.status || 200, scrub(result.body), req);
  } catch (err) {
    const message = err instanceof SyntaxError ? "That request is not JSON." : cleanError(err);
    const status = err.status || (message === "Not found." ? 404 : 400);
    tools.sendJson(res, status, { ok: false, error: message }, req);
  }
}

export async function handleRevisitedRequest(req, res, url, tools) {
  return dispatch(revisitedDesk(), req, res, url, tools);
}
