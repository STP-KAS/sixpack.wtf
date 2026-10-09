/** Village ledger. Tag balances. The chain check happens before these functions run. */

import {
  GLOBAL_REDEEM_CAP,
  MAX_REDEEM_SOMPI,
  MIN_REDEEM_SOMPI,
  PRACTICE_CENTS,
  RAILS,
  RESERVE,
  assertTestnet,
  centsForSompi,
  dayKey,
  lockShare,
  railName,
  sompiForCents,
} from "./money.mjs";
import { extensionFor, holderMint, normalizeTick, requireIncrease, standardTransfer, tokenExtension } from "./kcc20.mjs";
import { SHOPS, huntById, itemBySku, shopById } from "./world.mjs";

export function freshState() {
  return { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0", hunts: {}, mints: {}, offers: [] };
}

export function defaultRules() {
  return { dailyCapCents: 0, shops: [], rails: [], confirmOverCents: 0 };
}

const SHOP_IDS = new Set(SHOPS.map((s) => s.id));

export function normalizeRules(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const daily = Number(src.dailyCapCents ?? 0);
  const confirm = Number(src.confirmOverCents ?? 0);
  if (!Number.isInteger(daily) || daily < 0 || daily > 10_000_000) {
    throw new Error("Daily cap must be a whole number of cents, from 0 to 100000.00.");
  }
  if (!Number.isInteger(confirm) || confirm < 0 || confirm > 10_000_000) {
    throw new Error("Confirm line must be a whole number of cents.");
  }
  const shops = Array.isArray(src.shops) ? src.shops.map(String) : [];
  const rails = Array.isArray(src.rails) ? src.rails.map(String) : [];
  if (shops.some((id) => !SHOP_IDS.has(id))) throw new Error("Unknown shop in the spending rule.");
  if (rails.some((id) => !RAILS.includes(id))) throw new Error("Unknown rail in the spending rule.");
  return {
    dailyCapCents: daily,
    confirmOverCents: confirm,
    shops: [...new Set(shops)],
    rails: [...new Set(rails)],
  };
}

function clone(state) {
  return structuredClone(state);
}

function ensure(state, address) {
  const key = address.toLowerCase();
  if (!state.accounts[key]) {
    state.accounts[key] = {
      address,
      poc: "0",
      kusdt: "0",
      pocBacked: "0",
      kusdtBacked: "0",
      pocLiability: "0",
      kusdtLiability: "0",
      liability: "0",
      kusdtFrozen: false,
      practice: false,
      roadster: false,
      rules: defaultRules(),
      spentDay: "",
      spentCents: "0",
      seq: "0",
    };
  }
  settleRails(state.accounts[key]);
  return state.accounts[key];
}

/** Older rows stored one sompi pool. Split it by the locked tags. A later quote is not a price. */
function splitLock(account) {
  if (account.pocLiability != null && account.kusdtLiability != null) {
    return { poc: bi(account.pocLiability), kusdt: bi(account.kusdtLiability) };
  }
  const legacy = bi(account.liability);
  const pocBacked = bi(account.pocBacked);
  const kusdtBacked = bi(account.kusdtBacked);
  const backed = pocBacked + kusdtBacked;
  if (legacy <= 0n || backed <= 0n) return { poc: 0n, kusdt: 0n };
  const poc = (legacy * pocBacked) / backed;
  return { poc, kusdt: legacy - poc };
}

function settleRails(account) {
  const split = splitLock(account);
  account.pocLiability = String(split.poc);
  account.kusdtLiability = String(split.kusdt);
  account.liability = String(split.poc + split.kusdt);
}

function syncLiability(account) {
  account.liability = String(bi(account.pocLiability) + bi(account.kusdtLiability));
}

function liabilityField(rail) {
  return rail === "poc" ? "pocLiability" : "kusdtLiability";
}

function bi(value) {
  return BigInt(value || 0);
}

export function checkRules(account, { shop, rail, cents, confirmed }, today) {
  const rules = normalizeRules(account.rules);
  const cost = BigInt(cents);
  if (rules.rails.length && !rules.rails.includes(rail)) {
    throw new Error("Your spending rule blocks the " + railName(rail) + " rail.");
  }
  if (shop && rules.shops.length && !rules.shops.includes(shop)) {
    throw new Error("Your spending rule blocks this shop.");
  }
  if (rules.dailyCapCents > 0) {
    const spent = account.spentDay === today ? bi(account.spentCents) : 0n;
    if (spent + cost > BigInt(rules.dailyCapCents)) throw new Error("Daily spending cap reached.");
  }
  if (rules.confirmOverCents > 0 && cost > BigInt(rules.confirmOverCents) && !confirmed) {
    return { needsConfirm: true };
  }
  return { needsConfirm: false };
}

function bumpSpent(account, today, cents) {
  const spent = account.spentDay === today ? bi(account.spentCents) : 0n;
  account.spentDay = today;
  account.spentCents = String(spent + cents);
}

function pushReceipt(state, account, row) {
  state.seq = String(bi(state.seq) + 1n);
  if (row.rail === "kusdt") account.seq = String(bi(account.seq) + 1n);
  const receipt = {
    id: state.seq,
    at: row.at,
    address: account.address,
    kind: row.kind,
    shop: row.shop || "",
    sku: row.sku || "",
    rail: row.rail,
    cents: String(row.cents),
    sompi: row.sompi ? String(row.sompi) : "0",
    txid: row.txid || "",
    seq: state.seq,
    kusdtSeq: account.seq,
    note: row.note || "",
  };
  state.receipts.push(receipt);
  if (state.receipts.length > 400) state.receipts.splice(0, state.receipts.length - 400);
  return receipt;
}

function fields(rail) {
  return rail === "poc" ? ["poc", "pocBacked"] : ["kusdt", "kusdtBacked"];
}

/** Shops burn practice coins first. Burning locked units extinguishes that share of the lock. */
function takeToken(account, rail, cents) {
  const [field, backedField] = fields(rail);
  const have = bi(account[field]);
  if (have < cents) throw new Error("Not enough " + railName(rail) + ".");
  const backed = bi(account[backedField]);
  const practice = have - backed;
  const fromPractice = practice >= cents ? cents : practice;
  const fromBacked = cents - fromPractice;
  if (fromBacked > 0n) {
    const box = liabilityField(rail);
    const share = lockShare(account[box], backed, fromBacked);
    account[box] = String(bi(account[box]) - share);
    syncLiability(account);
  }
  account[field] = String(have - cents);
  account[backedField] = String(backed - fromBacked);
}

/** Redeems burn the locked cents themselves. Practice coins cannot be cashed out. */
function takeBacked(account, rail, cents) {
  const [field, backedField] = fields(rail);
  const have = bi(account[field]);
  const backed = bi(account[backedField]);
  if (backed < cents) throw new Error("Practice coins spend in the shops. Only locked tKAS can be redeemed.");
  if (have < cents) throw new Error("Not enough " + railName(rail) + ".");
  account[field] = String(have - cents);
  account[backedField] = String(backed - cents);
}

export function publicAccount(state, address) {
  const clean = assertTestnet(address);
  const account = state.accounts[clean.toLowerCase()];
  const base = account || {
    address: clean,
    poc: "0",
    kusdt: "0",
    pocBacked: "0",
    kusdtBacked: "0",
    pocLiability: "0",
    kusdtLiability: "0",
    liability: "0",
    kusdtFrozen: false,
    practice: false,
    rules: defaultRules(),
    spentDay: "",
    spentCents: "0",
    seq: "0",
  };
  const receipts = state.receipts.filter((row) => row.address.toLowerCase() === clean.toLowerCase()).slice(-12);
  const locks = splitLock(base);
  return {
    address: clean,
    poc: base.poc,
    kusdt: base.kusdt,
    pocBacked: base.pocBacked,
    kusdtBacked: base.kusdtBacked,
    pocLiability: String(locks.poc),
    kusdtLiability: String(locks.kusdt),
    liability: String(locks.poc + locks.kusdt),
    kusdtFrozen: !!base.kusdtFrozen,
    practice: !!base.practice,
    roadster: !!base.roadster,
    displayName: typeof base.displayName === "string" ? base.displayName : "",
    knsName: typeof base.knsName === "string" ? base.knsName : "",
    rules: base.rules,
    spentDay: base.spentDay,
    spentCents: base.spentCents,
    seq: base.seq,
    tokens: tokenHoldings(state, base),
    receipts,
  };
}

export function publicMints(state) {
  const book = (state && state.mints) || {};
  const accounts = (state && state.accounts) || {};
  return Object.keys(book)
    .map((extension) => {
      const row = book[extension];
      const holders = Object.keys(accounts)
        .map((address) => {
          const bag = accounts[address] && accounts[address].tokens;
          return { address, amount: String((bag && bag[extension]) || "0") };
        })
        .filter((item) => item.amount !== "0")
        .sort((a, b) => {
          const left = bi(a.amount);
          const right = bi(b.amount);
          if (left === right) return a.address.localeCompare(b.address);
          return left > right ? -1 : 1;
        });
      const cap = bi(row.cap);
      const supply = bi(row.supply);
      return {
        name: row.name,
        extension,
        supply: String(row.supply || "0"),
        cap: String(row.cap || "0"),
        done: cap > 0n && supply >= cap,
        holderCount: holders.length,
        holders,
        txs: mintTxs(state, row),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function publicOffers(state) {
  const rows = (state && state.offers) || [];
  return rows.map((row) => ({
    id: String(row.id || ""),
    address: row.address || "",
    payName: row.payName || "",
    payAmount: String(row.payAmount || "0"),
    recvName: row.recvName || "",
    recvAmount: String(row.recvAmount || "0"),
    at: row.at || 0,
  }));
}

function mintTxs(state, row) {
  const logged = Array.isArray(row.moves) ? row.moves : [];
  const source = logged.length
    ? logged
    : ((state && state.receipts) || []).filter((item) => item.kind === "mint" && item.sku === row.name);
  return source.slice(-40).map((item) => ({
    id: String(item.id || ""),
    at: item.at || 0,
    address: item.address || "",
    to: item.to || "",
    amount: item.amount != null && item.amount !== "" ? String(item.amount) : "",
    op: item.op || "",
    note: item.note || "",
  }));
}

function rememberMint(state, book, receipt, move) {
  if (!Array.isArray(book.moves)) book.moves = [];
  if (!book.moves.length) {
    book.moves = ((state && state.receipts) || [])
      .filter((item) => item.kind === "mint" && item.sku === book.name && item.id !== receipt.id)
      .slice(-39)
      .map((item) => ({
        id: item.id,
        at: item.at,
        address: item.address,
        to: "",
        amount: "",
        op: "",
        note: item.note || "",
      }));
  }
  book.moves.push({
    id: receipt.id,
    at: receipt.at,
    address: move.address,
    to: move.to || "",
    amount: move.amount,
    op: move.op,
    note: receipt.note || "",
  });
  if (book.moves.length > 40) book.moves.splice(0, book.moves.length - 40);
}

function tokenHoldings(state, account) {
  const bag = (account && account.tokens) || {};
  const book = (state && state.mints) || {};
  return Object.keys(bag)
    .map((extension) => ({
      name: book[extension] ? book[extension].name : "",
      extension,
      amount: String(bag[extension] || "0"),
    }))
    .filter((row) => row.name && row.amount !== "0")
    .sort((a, b) => a.name.localeCompare(b.name));
}

const MAX_MINT = 1_000_000_000_000_000_000n;

function wholeAmount(value) {
  const text = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(text)) throw new Error("Type a whole amount above zero.");
  const amount = BigInt(text);
  if (amount <= 0n) throw new Error("Type a whole amount above zero.");
  if (amount > MAX_MINT) throw new Error("That amount is too large. One mint can be at most " + MAX_MINT.toString() + ".");
  return amount;
}

function wholeCap(value) {
  const text = String(value ?? "").trim();
  if (text === "" || text === "0") return 0n;
  if (!/^[0-9]+$/.test(text)) throw new Error("Type a whole number. 0 means no cap.");
  const cap = BigInt(text);
  if (cap > MAX_MINT) throw new Error("That cap is too large.");
  return cap;
}

function bagOf(account) {
  if (!account.tokens) account.tokens = {};
  return account.tokens;
}

function heldOf(account, extension) {
  return bi(bagOf(account)[extension]);
}

function setHeld(account, extension, amount) {
  bagOf(account)[extension] = String(amount);
}

function openBook(state, name) {
  const extension = tokenExtension(name);
  const book = state.mints && state.mints[extension];
  if (!book || book.name !== name) throw new Error("That token is not open yet. Open it first.");
  return { extension, book };
}

function tradeResult(next, address, receipt) {
  return {
    state: next,
    result: {
      ok: true,
      receipt,
      account: publicAccount(next, address),
      mints: publicMints(next),
      offers: publicOffers(next),
    },
  };
}

/**
 * One name for another, on this square. The pay side waits here until someone takes it.
 * Two standard transfers, one extension each. Not Zealous Swap and not Kaspa.com.
 */
function applyOffer(state, input, now, address, option) {
  const next = clone(state);
  if (!Array.isArray(next.offers)) next.offers = [];
  if (option === "take" || option === "pull") {
    const found = next.offers.findIndex((row) => String(row.id) === String(input.offer || ""));
    if (found < 0) throw new Error("That offer is gone.");
    const offer = next.offers[found];
    const maker = ensure(next, offer.address);
    const pay = bi(offer.payAmount);
    const recv = bi(offer.recvAmount);
    if (option === "pull") {
      if (maker.address.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Only the address that offered can pull it back.");
      }
      const before = heldOf(maker, offer.payExtension);
      standardTransfer([{ amount: pay, extension: offer.payExtension }], [{ amount: pay, extension: offer.payExtension }]);
      holderMint(before, before + pay, offer.payExtension, maker.address);
      setHeld(maker, offer.payExtension, before + pay);
      next.offers.splice(found, 1);
      const book = next.mints[offer.payExtension];
      const receipt = pushReceipt(next, maker, {
        at: now,
        kind: "mint",
        sku: offer.payName,
        rail: "poc",
        cents: 0n,
        note: "Pulled back " + offer.payAmount + " " + offer.payName + ". The offer is off this square. Not a covenant.",
      });
      if (book) rememberMint(next, book, receipt, { address, to: "", amount: offer.payAmount, op: "pull" });
      return tradeResult(next, address, receipt);
    }
    if (maker.address.toLowerCase() === address.toLowerCase()) {
      throw new Error("Pull your own offer back.");
    }
    const taker = ensure(next, address);
    const takerRecv = heldOf(taker, offer.recvExtension);
    if (takerRecv < recv) throw new Error("Not enough " + offer.recvName + ".");
    const makerRecv = heldOf(maker, offer.recvExtension);
    const takerPay = heldOf(taker, offer.payExtension);
    standardTransfer([{ amount: pay, extension: offer.payExtension }], [{ amount: pay, extension: offer.payExtension }]);
    standardTransfer([{ amount: recv, extension: offer.recvExtension }], [{ amount: recv, extension: offer.recvExtension }]);
    holderMint(takerPay, takerPay + pay, offer.payExtension, taker.address);
    holderMint(makerRecv, makerRecv + recv, offer.recvExtension, maker.address);
    setHeld(taker, offer.recvExtension, takerRecv - recv);
    setHeld(maker, offer.recvExtension, makerRecv + recv);
    setHeld(taker, offer.payExtension, takerPay + pay);
    next.offers.splice(found, 1);
    const receipt = pushReceipt(next, taker, {
      at: now,
      kind: "mint",
      sku: offer.payName,
      rail: "poc",
      cents: 0n,
      note: "Traded " + offer.recvAmount + " " + offer.recvName + " for " + offer.payAmount + " " + offer.payName + " on this square. Not Zealous Swap. Not Kaspa.com. No covenant.",
    });
    const payBook = next.mints[offer.payExtension];
    const recvBook = next.mints[offer.recvExtension];
    if (payBook) rememberMint(next, payBook, receipt, { address, to: maker.address, amount: offer.payAmount, op: "trade" });
    if (recvBook) rememberMint(next, recvBook, receipt, { address: maker.address, to: address, amount: offer.recvAmount, op: "trade" });
    return tradeResult(next, address, receipt);
  }
  const payName = normalizeTick(input.name);
  const recvName = normalizeTick(input.recvName);
  if (payName === recvName) throw new Error("Trade two different names.");
  const payAmount = wholeAmount(input.amount);
  const recvAmount = wholeAmount(input.recvAmount);
  const paySide = openBook(next, payName);
  const recvSide = openBook(next, recvName);
  const maker = ensure(next, address);
  const held = heldOf(maker, paySide.extension);
  if (held < payAmount) throw new Error("Not enough " + payName + ".");
  standardTransfer(
    [{ amount: payAmount, extension: paySide.extension }],
    [{ amount: payAmount, extension: paySide.extension }]
  );
  setHeld(maker, paySide.extension, held - payAmount);
  const receipt = pushReceipt(next, maker, {
    at: now,
    kind: "mint",
    sku: payName,
    rail: "poc",
    cents: 0n,
    note: "Offered " + payAmount.toString() + " " + payName + " for " + recvAmount.toString() + " " + recvName + ". The pay side waits on this square. Not Zealous Swap. Not Kaspa.com. No covenant.",
  });
  next.offers.push({
    id: receipt.id,
    address: maker.address,
    payName,
    payExtension: paySide.extension,
    payAmount: payAmount.toString(),
    recvName,
    recvExtension: recvSide.extension,
    recvAmount: recvAmount.toString(),
    at: now,
  });
  rememberMint(next, paySide.book, receipt, { address, to: "", amount: payAmount.toString(), op: "offer" });
  return tradeResult(next, address, receipt);
}

/** Open a token, mint more of it, send it, or trade two names. The desk checks the Last Call increase. No covenant. */
export function applyToken(state, input, now) {
  const address = assertTestnet(input.address);
  const option = String(input.option || "");
  if (option === "offer" || option === "take" || option === "pull") {
    return applyOffer(state, input, now, address, option);
  }
  if (option !== "new" && option !== "more" && option !== "send") {
    throw new Error("Pick open a new token, mint more, send, or trade.");
  }
  const name = normalizeTick(input.name);
  const extension = tokenExtension(name);
  const amount = wholeAmount(input.amount);
  const next = clone(state);
  if (!next.mints) next.mints = {};
  const existing = next.mints[extension];
  if (option === "new") {
    if (existing) throw new Error("That token is already open. Mint more of it.");
    const cap = wholeCap(input.cap);
    if (cap > 0n && cap < amount) {
      throw new Error("The cap is smaller than this amount. Type 0 for no cap, or raise the cap to at least " + amount.toString() + ".");
    }
    next.mints[extension] = { name, extension, supply: "0", cap: String(cap) };
  } else if (!existing || existing.name !== name) {
    throw new Error("That token is not open yet. Open it first.");
  }
  const book = next.mints[extension];
  const account = ensure(next, address);
  if (!account.tokens) account.tokens = {};
  const held = bi(account.tokens[extension]);
  if (option === "send") {
    const to = assertTestnet(input.to);
    if (to.toLowerCase() === address.toLowerCase()) throw new Error("Send it to another address.");
    if (held < amount) throw new Error("Not enough " + name + ".");
    const dest = ensure(next, to);
    if (!dest.tokens) dest.tokens = {};
    const destHeld = bi(dest.tokens[extension]);
    standardTransfer(
      [{ amount, extension }],
      [{ amount, extension }]
    );
    holderMint(destHeld, destHeld + amount, extension, to);
    account.tokens[extension] = String(held - amount);
    dest.tokens[extension] = String(destHeld + amount);
    const receipt = pushReceipt(next, account, {
      at: now,
      kind: "mint",
      sku: name,
      rail: "poc",
      cents: 0n,
      note: "Sent " + amount.toString() + " " + name + " on this ledger. Not a covenant.",
    });
    rememberMint(next, book, receipt, { address, to, amount: amount.toString(), op: "send" });
    return {
      state: next,
      result: { ok: true, receipt, account: publicAccount(next, address), mints: publicMints(next) },
    };
  }
  const supply = bi(book.supply);
  const cap = bi(book.cap);
  if (cap > 0n && supply + amount > cap) throw new Error("That mint passes the cap.");
  holderMint(held, held + amount, extension, address);
  account.tokens[extension] = String(held + amount);
  book.supply = String(supply + amount);
  const opened = option === "new";
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "mint",
    sku: name,
    rail: "poc",
    cents: 0n,
    note: opened
      ? "Opened " + name + " on this ledger." + (cap === 0n ? " Cap 0 means no cap." : "") + " KCC-20 is Last Call, not Final. No covenant."
      : "Minted " + amount.toString() + " more " + name + ". The amount increased.",
  });
  rememberMint(next, book, receipt, { address, to: "", amount: amount.toString(), op: opened ? "new" : "more" });
  return {
    state: next,
    result: { ok: true, receipt, account: publicAccount(next, address), mints: publicMints(next), token: book },
  };
}

export function applyPractice(state, input, now) {
  const address = assertTestnet(input.address);
  if (address.toLowerCase() === RESERVE.toLowerCase()) {
    throw new Error("The reserve does not take a practice purse.");
  }
  const next = clone(state);
  const account = ensure(next, address);
  if (account.practice) throw new Error("The practice purse was already taken for this address.");
  account.poc = String(bi(account.poc) + PRACTICE_CENTS);
  account.kusdt = String(bi(account.kusdt) + PRACTICE_CENTS);
  account.practice = true;
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "practice",
    rail: "poc",
    cents: PRACTICE_CENTS,
    note: "Practice purse. Not backed. Cannot be redeemed for tKAS.",
  });
  return { state: next, result: { ok: true, receipt, account: publicAccount(next, address) } };
}

export function applyRules(state, input, now) {
  const address = assertTestnet(input.address);
  const rules = normalizeRules(input.rules);
  const next = clone(state);
  const account = ensure(next, address);
  account.rules = rules;
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "rules",
    rail: "poc",
    cents: 0n,
    note: "Spending rules saved on this address.",
  });
  return { state: next, result: { ok: true, receipt, rules, account: publicAccount(next, address) } };
}

export function applyFreeze(state, input, now) {
  const address = assertTestnet(input.address);
  const next = clone(state);
  const account = ensure(next, address);
  account.kusdtFrozen = !!input.frozen;
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "freeze",
    rail: "kusdt",
    cents: 0n,
    note: account.kusdtFrozen
      ? "KUSDT frozen. This is the tether-style switch. POCencept has no such switch."
      : "KUSDT unfrozen.",
  });
  return { state: next, result: { ok: true, receipt, account: publicAccount(next, address) } };
}

export function applySpend(state, input, now) {
  const address = assertTestnet(input.address);
  const shop = shopById(input.shop);
  if (!shop) throw new Error("That shop is not on the square.");
  const item = itemBySku(shop.id, input.sku);
  if (!item) throw new Error("That item is not on this counter.");
  if (!RAILS.includes(input.rail)) throw new Error("Pick tKAS, POCencept, or KUSDT.");
  const cents = BigInt(item.cents);
  const today = dayKey(now);
  if (input.rail === "kas" && input.payment && state.txids && state.txids[input.payment.txid]) {
    const need = sompiForCents(cents, input.usdPerKas);
    if (bi(input.payment.paid) < need) throw new Error("The payment is smaller than the quote.");
    const txid = input.payment.txid;
    const seen = state.txids[txid];
    if (!sameKasSpend(state, seen, address, shop, item, txid)) {
      throw new Error("That transaction was already used.");
    }
    const found = spendReceipt(state, txid, shop.id, item.sku);
    const receipt = found || {
      id: seen.receiptId,
      at: now,
      address,
      kind: "spend",
      shop: shop.id,
      sku: item.sku,
      rail: "kas",
      cents: String(cents),
      sompi: "0",
      txid,
      seq: seen.receiptId || "",
      kusdtSeq: "",
      note: shop.name + " · " + item.name,
    };
    return {
      state,
      result: { ok: true, receipt, account: publicAccount(state, address), item: item.name, shop: shop.name },
    };
  }
  const peek = ensure(clone(state), address);
  const gate = checkRules(peek, { shop: shop.id, rail: input.rail, cents, confirmed: !!input.confirmed }, today);
  if (gate.needsConfirm) {
    return {
      state,
      result: {
        ok: false,
        needsConfirm: true,
        cents: item.cents,
        error: "This is over your confirm line. Confirm it to pay.",
      },
    };
  }
  const next = clone(state);
  const account = ensure(next, address);
  if (input.rail === "kusdt" && account.kusdtFrozen) {
    throw new Error("KUSDT is frozen on this address. POCencept and tKAS are not.");
  }
  let sompi = 0n;
  let txid = "";
  if (input.rail === "kas") {
    const need = sompiForCents(cents, input.usdPerKas);
    if (!input.payment || bi(input.payment.paid) < need) {
      throw new Error("The payment is smaller than the quote.");
    }
    sompi = bi(input.payment.paid);
    txid = input.payment.txid;
    if (next.txids[txid]) throw new Error("That transaction was already used.");
  } else {
    takeToken(account, input.rail, cents);
  }
  bumpSpent(account, today, cents);
  if (item.sku === "keys") account.roadster = true;
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "spend",
    shop: shop.id,
    sku: item.sku,
    rail: input.rail,
    cents,
    sompi,
    txid,
    note: shop.name + " · " + item.name,
  });
  if (input.rail === "kas") {
    next.txids[txid] = { address, kind: "spend", shop: shop.id, sku: item.sku, rail: "kas", receiptId: receipt.id };
  }
  return {
    state: next,
    result: { ok: true, receipt, account: publicAccount(next, address), item: item.name, shop: shop.name },
  };
}

export function applyConvert(state, input, now) {
  const address = assertTestnet(input.address);
  if (input.rail !== "poc" && input.rail !== "kusdt") {
    throw new Error("Convert locks tKAS into POCencept or KUSDT.");
  }
  if (!input.payment) throw new Error("Locking tKAS needs an accepted Testnet-10 transaction.");
  const cents = centsForSompi(input.payment.paid, input.usdPerKas);
  if (cents <= 0n) throw new Error("That payment is too small at the live price to mint 0.01.");
  const txid = input.payment.txid;
  const seen = state.txids && state.txids[txid];
  if (seen) {
    if (!sameConvert(state, seen, address, input.rail, txid)) {
      throw new Error("That transaction was already used.");
    }
    const found = convertReceipt(state, txid, input.rail);
    const receipt = found || {
      id: seen.receiptId,
      at: now,
      address,
      kind: "convert",
      shop: "",
      sku: "",
      rail: input.rail,
      cents: String(cents),
      sompi: String(bi(input.payment.paid)),
      txid,
      seq: seen.receiptId || "",
      kusdtSeq: "",
      note: "Locked tKAS. The tag is the keypad amount at that quote. Redeem returns this lock. Not a dollar.",
    };
    return {
      state,
      result: { ok: true, receipt, account: publicAccount(state, address), cents: String(found ? found.cents : cents) },
    };
  }
  const today = dayKey(now);
  const peek = ensure(clone(state), address);
  checkRules(peek, { shop: "", rail: input.rail, cents: 0n, confirmed: true }, today);
  const next = clone(state);
  const account = ensure(next, address);
  if (input.rail === "kusdt" && account.kusdtFrozen) {
    throw new Error("KUSDT is frozen. Unfreeze it before minting more.");
  }
  const field = input.rail === "poc" ? "poc" : "kusdt";
  const backedField = input.rail === "poc" ? "pocBacked" : "kusdtBacked";
  const before = bi(account[field]);
  requireIncrease(before, before + cents, extensionFor(input.rail, false));
  account[field] = String(before + cents);
  account[backedField] = String(bi(account[backedField]) + cents);
  const box = liabilityField(input.rail);
  account[box] = String(bi(account[box]) + bi(input.payment.paid));
  syncLiability(account);
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "convert",
    rail: input.rail,
    cents,
    sompi: input.payment.paid,
    txid,
    note: "Locked tKAS. The tag is the keypad amount at that quote. Redeem returns this lock. Not a dollar.",
  });
  next.txids[txid] = { address, kind: "convert", rail: input.rail, receiptId: receipt.id };
  return { state: next, result: { ok: true, receipt, account: publicAccount(next, address), cents: String(cents) } };
}

export function applyRedeem(state, input, now) {
  const address = assertTestnet(input.address);
  if (address.toLowerCase() === RESERVE.toLowerCase()) {
    throw new Error("The reserve cannot redeem to itself.");
  }
  if (input.rail !== "poc" && input.rail !== "kusdt") throw new Error("Redeem POCencept or KUSDT.");
  const cents = BigInt(input.cents);
  if (cents <= 0n) throw new Error("Type an amount above zero.");
  const next = clone(state);
  const account = ensure(next, address);
  const [haveField, backedField] = fields(input.rail);
  const backed = bi(account[backedField]);
  if (backed < cents) throw new Error("Practice coins spend in the shops. Only locked tKAS can be redeemed.");
  if (bi(account[haveField]) < cents) throw new Error("Not enough " + railName(input.rail) + ".");
  const box = liabilityField(input.rail);
  const sompi = lockShare(account[box], backed, cents);
  if (sompi <= 0n) throw new Error("Practice coins spend in the shops. Only locked tKAS can be redeemed.");
  if (sompi < MIN_REDEEM_SOMPI) throw new Error("That redeem is too small to broadcast on Testnet-10.");
  if (sompi > MAX_REDEEM_SOMPI) throw new Error("One redeem is capped at 10000 tKAS so the broadcast stays a normal transaction. Split it.");
  const redeemed = bi(next.redeemedSompi);
  if (redeemed + sompi > GLOBAL_REDEEM_CAP) {
    throw new Error("The village redeem pool for this process is full. The rest of the lock stays put.");
  }
  takeBacked(account, input.rail, cents);
  account[box] = String(bi(account[box]) - sompi);
  syncLiability(account);
  next.redeemedSompi = String(redeemed + sompi);
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "redeem",
    rail: input.rail,
    cents,
    sompi,
    note: "Redeemed the locked tKAS. The miner fee is extra KAS and is not taken from the lock.",
  });
  return {
    state: next,
    result: { ok: true, receipt, account: publicAccount(next, address) },
    sompi,
    to: address,
    receiptId: receipt.id,
  };
}

/** POCencept and KUSDT trade 1:1. Locked stays locked. The purse stays a purse. No tKAS moves. */
export function applyExchange(state, input, now) {
  const address = assertTestnet(input.address);
  const from = input.from;
  const to = input.to;
  if ((from !== "poc" && from !== "kusdt") || (to !== "poc" && to !== "kusdt") || from === to) {
    throw new Error("Swap POCencept and KUSDT with each other.");
  }
  const cents = BigInt(input.cents);
  if (cents <= 0n) throw new Error("Type an amount above zero.");
  const next = clone(state);
  const account = ensure(next, address);
  if ((from === "kusdt" || to === "kusdt") && account.kusdtFrozen) {
    throw new Error("KUSDT is frozen. A frozen tether-style balance does not move.");
  }
  const [fromField, fromBacked] = fields(from);
  const [toField, toBacked] = fields(to);
  if (extensionFor(from, false) === extensionFor(to, false)) {
    throw new Error("POCencept and KUSDT stay different tokens.");
  }
  const have = bi(account[fromField]);
  if (have < cents) throw new Error("Not enough " + railName(from) + ".");
  const backed = bi(account[fromBacked]);
  const practice = have - backed;
  const fromPractice = practice >= cents ? cents : practice;
  const fromLocked = cents - fromPractice;
  const toHave = bi(account[toField]);
  requireIncrease(toHave, toHave + cents, extensionFor(to, false));
  if (fromLocked > 0n) {
    const fromBox = liabilityField(from);
    const toBox = liabilityField(to);
    const moved = lockShare(account[fromBox], backed, fromLocked);
    account[fromBox] = String(bi(account[fromBox]) - moved);
    account[toBox] = String(bi(account[toBox]) + moved);
    syncLiability(account);
  }
  account[fromField] = String(have - cents);
  account[fromBacked] = String(backed - fromLocked);
  account[toField] = String(toHave + cents);
  account[toBacked] = String(bi(account[toBacked]) + fromLocked);
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "exchange",
    rail: to,
    cents,
    note: "Swapped ledger tags. Locked stayed locked. The purse stayed a purse. No tKAS moved.",
  });
  return { state: next, result: { ok: true, receipt, account: publicAccount(next, address) } };
}

export function attachTxid(state, receiptId, txid) {
  const next = clone(state);
  const row = next.receipts.find((item) => item.id === String(receiptId));
  if (row) row.txid = String(txid || "");
  return next;
}

const PACK_BANNER = "Pack paid on this square.";
const PILE_NOTE = "First snap took the pile.";
const NO_SUBSET = "No subset clears.";

function cloneHunts(state) {
  const next = clone(state);
  if (!next.hunts || typeof next.hunts !== "object" || Array.isArray(next.hunts)) next.hunts = {};
  return next;
}

function huntHold(state, id) {
  if (!state.hunts[id] || typeof state.hunts[id] !== "object") state.hunts[id] = { intendos: [], snaps: [] };
  if (!Array.isArray(state.hunts[id].intendos)) state.hunts[id].intendos = [];
  if (!Array.isArray(state.hunts[id].snaps)) state.hunts[id].snaps = [];
  return state.hunts[id];
}

function readHold(state, id) {
  const hunts = state && state.hunts && typeof state.hunts === "object" ? state.hunts : {};
  const bag = hunts[id];
  return {
    intendos: bag && Array.isArray(bag.intendos) ? bag.intendos : [],
    snaps: bag && Array.isArray(bag.snaps) ? bag.snaps : [],
  };
}

function sameAddress(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function findReceipt(state, match) {
  const rows = state.receipts || [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (match(rows[i])) return rows[i];
  }
  return null;
}

function spendReceipt(state, txid, shopId, sku) {
  return findReceipt(
    state,
    (row) => row.txid === txid && row.kind === "spend" && row.shop === shopId && row.sku === sku && (!row.rail || row.rail === "kas")
  );
}

function convertReceipt(state, txid, rail) {
  return findReceipt(
    state,
    (row) => row.txid === txid && row.kind === "convert" && row.rail === rail
  );
}

/** A stored txid matches this shop purchase, including a record written before shop and sku were saved. */
function sameKasSpend(state, seen, address, shop, item, txid) {
  if (!seen || seen.kind !== "spend" || !sameAddress(seen.address, address)) return false;
  if (seen.rail && seen.rail !== "kas") return false;
  if (seen.shop || seen.sku) return seen.shop === shop.id && seen.sku === item.sku;
  const found = spendReceipt(state, txid, shop.id, item.sku);
  return !!(found && sameAddress(found.address, address));
}

function sameConvert(state, seen, address, rail, txid) {
  if (!seen || seen.kind !== "convert" || !sameAddress(seen.address, address)) return false;
  if (seen.rail) return seen.rail === rail;
  const found = convertReceipt(state, txid, rail);
  return !!(found && sameAddress(found.address, address));
}

function wholeNeed(value) {
  const need = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number(value);
  if (!Number.isInteger(need) || need < 2 || need > 20) return null;
  return need;
}

/** Largest k whose k-th smallest threshold still fits inside those k promises. */
function largestSubset(list) {
  const sorted = [...list].sort((a, b) => a.need - b.need || a.at - b.at || String(a.address).localeCompare(String(b.address)));
  for (let k = sorted.length; k >= 1; k -= 1) {
    if (Number(sorted[k - 1].need) <= k) return sorted.slice(0, k);
  }
  return [];
}

function canCover(state, item, now, assumeAddress) {
  const hunt = huntById(item.hunt);
  if (hunt && hunt.id === "liquidity") return true;
  if (item.rail === "kas") {
    if (item.kas && item.kas.txid) return true;
    return !!(assumeAddress && sameAddress(item.address, assumeAddress));
  }
  const account = state.accounts[String(item.address || "").toLowerCase()];
  if (!account) return false;
  if (item.rail === "kusdt" && account.kusdtFrozen) return false;
  const rules = normalizeRules(account.rules);
  if (rules.rails.length && !rules.rails.includes(item.rail)) return false;
  const have = bi(item.rail === "kusdt" ? account.kusdt : account.poc);
  if (have < BigInt(item.cents)) return false;
  if (rules.dailyCapCents > 0) {
    const today = dayKey(now);
    const spent = account.spentDay === today ? bi(account.spentCents) : 0n;
    if (spent + BigInt(item.cents) > BigInt(rules.dailyCapCents)) return false;
  }
  return true;
}

function choosePack(state, hunt, rail, now, assumeAddress) {
  let pool = readHold(state, hunt.id).intendos.filter((item) => item.rail === rail);
  for (let n = 0; n < 24 && pool.length; n += 1) {
    const picked = largestSubset(pool);
    if (!picked.length) return [];
    const broke = picked.filter((item) => !canCover(state, item, now, assumeAddress));
    if (!broke.length) return picked;
    const drop = new Set(broke.map((item) => String(item.address).toLowerCase()));
    pool = pool.filter((item) => !drop.has(String(item.address).toLowerCase()));
  }
  return [];
}

function latestSnap(snaps, address) {
  for (let i = snaps.length - 1; i >= 0; i -= 1) {
    const row = snaps[i];
    if (row && Array.isArray(row.members) && row.members.some((item) => sameAddress(item.address, address))) return row;
  }
  return null;
}

/** Catalog plus this address only. Open promises are not counted. */
export function publicHunts(state, address) {
  const clean = address ? assertTestnet(address) : "";
  const ids = ["model", "cars", "dish", "stream", "music", "basket", "liquidity"];
  return {
    ok: true,
    hunts: ids.map((id) => {
      const row = huntById(id);
      const bag = readHold(state, id);
      const out = { id: row.id, name: row.name, cents: row.cents, need: row.need, rails: row.rails.slice() };
      if (!clean) return out;
      const mine = bag.intendos.find((item) => sameAddress(item.address, clean));
      if (mine) out.promise = { rail: mine.rail, cents: mine.cents, need: mine.need, at: mine.at };
      const snap = latestSnap(bag.snaps, clean);
      if (snap) {
        out.paid = {
          count: snap.members.length,
          who: snap.members.map((item) => item.address),
          banner: PACK_BANNER,
        };
      }
      return out;
    }),
  };
}

function promiseGate(account, rail, cents, confirmed) {
  const rules = normalizeRules(account.rules);
  if (rules.rails.length && !rules.rails.includes(rail)) {
    throw new Error("Your spending rule blocks the " + railName(rail) + " rail.");
  }
  if (rules.confirmOverCents > 0 && BigInt(cents) > BigInt(rules.confirmOverCents) && !confirmed) {
    return { needsConfirm: true };
  }
  return { needsConfirm: false };
}

export function applyPromise(state, input, now) {
  const address = assertTestnet(input.address);
  const hunt = huntById(input.hunt);
  if (!hunt) throw new Error("That hunt is not on the board.");
  if (!hunt.rails.includes(input.rail)) throw new Error("That rail is not on this row.");
  const need = wholeNeed(input.need);
  if (need == null) throw new Error("Threshold is from 2 to 20.");
  const peek = ensure(clone(state), address);
  if (input.rail === "kusdt" && peek.kusdtFrozen) {
    throw new Error("KUSDT is frozen on this address. POCencept and tKAS are not.");
  }
  const gate = promiseGate(peek, input.rail, hunt.cents, !!input.confirmed);
  if (gate.needsConfirm) {
    return {
      state,
      result: {
        ok: false,
        needsConfirm: true,
        cents: hunt.cents,
        error: "This is over your confirm line. Confirm it to pay.",
      },
    };
  }
  const next = cloneHunts(state);
  const account = ensure(next, address);
  const bag = huntHold(next, hunt.id);
  bag.intendos = bag.intendos.filter((item) => !sameAddress(item.address, address));
  bag.intendos.push({
    hunt: hunt.id,
    address: account.address,
    rail: input.rail,
    cents: hunt.cents,
    need,
    at: now,
  });
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "promise",
    shop: "hunt",
    sku: hunt.id,
    rail: input.rail,
    cents: BigInt(hunt.cents),
    note: hunt.name,
  });
  return {
    state: next,
    result: { ok: true, receipt, hunts: publicHunts(next, address), account: publicAccount(next, address) },
  };
}

export function applyWithdrawPromise(state, input, now) {
  const address = assertTestnet(input.address);
  const hunt = huntById(input.hunt);
  if (!hunt) throw new Error("That hunt is not on the board.");
  const next = cloneHunts(state);
  const bag = huntHold(next, hunt.id);
  const mine = bag.intendos.find((item) => sameAddress(item.address, address));
  if (!mine) throw new Error("There is no promise on that row.");
  bag.intendos = bag.intendos.filter((item) => !sameAddress(item.address, address));
  const account = ensure(next, address);
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "withdraw",
    shop: "hunt",
    sku: hunt.id,
    rail: mine.rail,
    cents: BigInt(mine.cents),
    note: hunt.name,
  });
  return {
    state: next,
    result: { ok: true, receipt, hunts: publicHunts(next, address), account: publicAccount(next, address) },
  };
}

/** A kas promise can join a pack only if this caller is the one who still has to pay. */
export function planSnap(state, input, now) {
  const address = assertTestnet(input.address);
  const hunt = huntById(input.hunt);
  if (!hunt) throw new Error("That hunt is not on the board.");
  const mine = readHold(state, hunt.id).intendos.find((item) => sameAddress(item.address, address));
  if (!mine) return { ready: false, rail: "", cents: 0 };
  if (mine.rail !== "kas" || (mine.kas && mine.kas.txid)) return { ready: false, rail: mine.rail, cents: mine.cents };
  const real = choosePack(state, hunt, mine.rail, now, "");
  if (real.length) return { ready: false, rail: "kas", cents: mine.cents };
  const assumed = choosePack(state, hunt, mine.rail, now, address);
  const ready = assumed.some((item) => sameAddress(item.address, address));
  return { ready, rail: "kas", cents: mine.cents };
}

function unwindPile(next, payer, rail, huntId, now) {
  if (rail === "kas") return;
  const account = next.accounts[String(payer).toLowerCase()];
  if (!account) return;
  const have = bi(rail === "kusdt" ? account.kusdt : account.poc);
  for (const [otherId, bag] of Object.entries(next.hunts)) {
    if (otherId === huntId || !bag || !Array.isArray(bag.intendos)) continue;
    const kept = [];
    for (const row of bag.intendos) {
      if (!sameAddress(row.address, payer) || row.rail !== rail || have >= BigInt(row.cents)) {
        kept.push(row);
        continue;
      }
      pushReceipt(next, account, {
        at: now,
        kind: "unwound",
        shop: "hunt",
        sku: otherId,
        rail: row.rail,
        cents: BigInt(row.cents),
        note: PILE_NOTE,
      });
    }
    bag.intendos = kept;
  }
}

export function applySnap(state, input, now) {
  const address = assertTestnet(input.address);
  const hunt = huntById(input.hunt);
  if (!hunt) throw new Error("That hunt is not on the board.");
  const prior = readHold(state, hunt.id);
  const mine = prior.intendos.find((item) => sameAddress(item.address, address));
  if (!mine) {
    const snap = latestSnap(prior.snaps, address);
    if (snap) {
      return {
        state,
        result: {
          ok: true,
          paid: true,
          banner: PACK_BANNER,
          count: snap.members.length,
          who: snap.members.map((item) => item.address),
          hunts: publicHunts(state, address),
          account: publicAccount(state, address),
        },
      };
    }
    return { state, result: { ok: true, paid: false, error: NO_SUBSET } };
  }
  const next = cloneHunts(state);
  const bag = huntHold(next, hunt.id);
  const live = bag.intendos.find((item) => sameAddress(item.address, address));
  if (input.payment && live.rail === "kas") {
    const need = sompiForCents(BigInt(live.cents), input.usdPerKas);
    if (!input.payment.txid || bi(input.payment.paid) < need) throw new Error("The payment is smaller than the quote.");
    const seen = next.txids[input.payment.txid];
    if (seen && !(seen.kind === "snap-hold" && sameAddress(seen.address, address))) {
      throw new Error("That transaction was already used.");
    }
    next.txids[input.payment.txid] = { address, kind: "snap-hold" };
    live.kas = { txid: input.payment.txid, sompi: String(input.payment.paid) };
  }
  const chosen = choosePack(next, hunt, live.rail, now, "");
  if (!chosen.length) {
    if (live.rail === "kas" && !(live.kas && live.kas.txid)) {
      const assumed = choosePack(state, hunt, live.rail, now, address);
      if (assumed.some((item) => sameAddress(item.address, address))) {
        return { state, result: { ok: false, ready: true, paid: false, cents: live.cents } };
      }
    }
    const held = !!(live.kas && live.kas.txid && input.payment);
    return {
      state: held ? next : state,
      result: { ok: true, paid: false, error: NO_SUBSET, hunts: publicHunts(held ? next : state, address) },
    };
  }
  const today = dayKey(now);
  const members = [];
  for (const item of chosen) {
    const account = ensure(next, item.address);
    let sompi = 0n;
    let txid = "";
    if (hunt.id !== "liquidity") {
      if (item.rail === "kas") {
        sompi = bi(item.kas.sompi);
        txid = item.kas.txid;
        const seen = next.txids[txid];
        if (seen && !(seen.kind === "snap-hold" && sameAddress(seen.address, item.address))) {
          throw new Error("That transaction was already used.");
        }
        next.txids[txid] = { address: item.address, kind: "snap" };
      } else {
        takeToken(account, item.rail, BigInt(item.cents));
      }
      bumpSpent(account, today, BigInt(item.cents));
    }
    if (hunt.id === "cars") account.roadster = true;
    pushReceipt(next, account, {
      at: now,
      kind: "snap",
      shop: "hunt",
      sku: hunt.id,
      rail: item.rail,
      cents: hunt.id === "liquidity" ? 0n : BigInt(item.cents),
      sompi,
      txid,
      note: PACK_BANNER,
    });
    members.push({ address: account.address, rail: item.rail, cents: item.cents });
  }
  const charged = new Set(chosen.map((item) => String(item.address).toLowerCase()));
  bag.intendos = bag.intendos.filter((item) => !charged.has(String(item.address).toLowerCase()));
  if (hunt.id !== "liquidity") {
    for (const item of chosen) unwindPile(next, item.address, item.rail, hunt.id, now);
  }
  bag.snaps.push({ at: now, members, banner: PACK_BANNER });
  const callerIn = chosen.some((item) => sameAddress(item.address, address));
  const result = {
    ok: true,
    paid: callerIn,
    hunts: publicHunts(next, address),
    account: publicAccount(next, address),
  };
  if (callerIn) {
    result.banner = PACK_BANNER;
    result.count = members.length;
    result.who = members.map((item) => item.address);
  }
  return { state: next, result };
}
