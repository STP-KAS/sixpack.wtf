/** Village ledger. Toy balances. The chain check happens before these functions run. */

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
  railName,
  sompiForCents,
} from "./money.mjs";
import { SHOPS, itemBySku, shopById } from "./world.mjs";

export function freshState() {
  return { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0" };
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
  return state.accounts[key];
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

/** Shops burn practice coins first, so a locked redeem stays available. */
function takeToken(account, rail, cents) {
  const [field, backedField] = fields(rail);
  const have = bi(account[field]);
  if (have < cents) throw new Error("Not enough " + railName(rail) + ".");
  const backed = bi(account[backedField]);
  const practice = have - backed;
  const fromPractice = practice >= cents ? cents : practice;
  const fromBacked = cents - fromPractice;
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
    liability: "0",
    kusdtFrozen: false,
    practice: false,
    rules: defaultRules(),
    spentDay: "",
    spentCents: "0",
    seq: "0",
  };
  const receipts = state.receipts.filter((row) => row.address.toLowerCase() === clean.toLowerCase()).slice(-12);
  return {
    address: clean,
    poc: base.poc,
    kusdt: base.kusdt,
    pocBacked: base.pocBacked,
    kusdtBacked: base.kusdtBacked,
    liability: base.liability,
    kusdtFrozen: !!base.kusdtFrozen,
    practice: !!base.practice,
    roadster: !!base.roadster,
    rules: base.rules,
    spentDay: base.spentDay,
    spentCents: base.spentCents,
    seq: base.seq,
    receipts,
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
  const held = state.accounts[address.toLowerCase()];
  if (item.sku === "keys" && held && held.roadster) {
    throw new Error("You already own this roadster.");
  }
  const today = dayKey(now);
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
    next.txids[txid] = { address, kind: "spend" };
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
  const today = dayKey(now);
  const peek = ensure(clone(state), address);
  checkRules(peek, { shop: "", rail: input.rail, cents: 0n, confirmed: true }, today);
  const cents = centsForSompi(input.payment.paid, input.usdPerKas);
  if (cents <= 0n) throw new Error("That payment is too small at the live price to mint 0.01.");
  const next = clone(state);
  if (next.txids[input.payment.txid]) throw new Error("That transaction was already used.");
  const account = ensure(next, address);
  if (input.rail === "kusdt" && account.kusdtFrozen) {
    throw new Error("KUSDT is frozen. Unfreeze it before minting more.");
  }
  next.txids[input.payment.txid] = { address, kind: "convert" };
  const field = input.rail === "poc" ? "poc" : "kusdt";
  const backedField = input.rail === "poc" ? "pocBacked" : "kusdtBacked";
  account[field] = String(bi(account[field]) + cents);
  account[backedField] = String(bi(account[backedField]) + cents);
  account.liability = String(bi(account.liability) + input.payment.paid);
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "convert",
    rail: input.rail,
    cents,
    sompi: input.payment.paid,
    txid: input.payment.txid,
    note: "Locked tKAS at the live quote. Backed. Redeemable until the oracle moves past the lock.",
  });
  return { state: next, result: { ok: true, receipt, account: publicAccount(next, address), cents: String(cents) } };
}

export function applyRedeem(state, input, now) {
  const address = assertTestnet(input.address);
  if (address.toLowerCase() === RESERVE.toLowerCase()) {
    throw new Error("The reserve cannot redeem to itself.");
  }
  if (input.rail !== "poc" && input.rail !== "kusdt") throw new Error("Redeem POCencept or KUSDT.");
  const cents = BigInt(input.cents);
  if (cents <= 0n) throw new Error("Type a toy-dollar amount above zero.");
  const sompi = sompiForCents(cents, input.usdPerKas);
  if (sompi < MIN_REDEEM_SOMPI) throw new Error("That redeem is too small to broadcast on Testnet-10.");
  if (sompi > MAX_REDEEM_SOMPI) throw new Error("One redeem is capped at 10000 tKAS so the broadcast stays a normal transaction. Split it.");
  const next = clone(state);
  const account = ensure(next, address);
  if (input.rail === "kusdt" && account.kusdtFrozen) {
    throw new Error("KUSDT is frozen. A frozen tether-style balance does not redeem.");
  }
  if (bi(account.liability) < sompi) {
    throw new Error("The oracle moved. The lock no longer covers this redeem. PegLab: a peg without enough locked KAS does not pay.");
  }
  const redeemed = bi(next.redeemedSompi);
  if (redeemed + sompi > GLOBAL_REDEEM_CAP) {
    throw new Error("The village redeem pool for this process is full. The rest of the lock stays put.");
  }
  takeBacked(account, input.rail, cents);
  account.liability = String(bi(account.liability) - sompi);
  next.redeemedSompi = String(redeemed + sompi);
  const receipt = pushReceipt(next, account, {
    at: now,
    kind: "redeem",
    rail: input.rail,
    cents,
    sompi,
    note: "Redeem at the live quote. Miner fee stays tKAS.",
  });
  return {
    state: next,
    result: { ok: true, receipt, account: publicAccount(next, address) },
    sompi,
    to: address,
    receiptId: receipt.id,
  };
}

export function attachTxid(state, receiptId, txid) {
  const next = clone(state);
  const row = next.receipts.find((item) => item.id === String(receiptId));
  if (row) row.txid = String(txid || "");
  return next;
}
