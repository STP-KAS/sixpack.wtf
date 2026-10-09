/** Lock book. Chain rows are not reserve liabilities. No keys. */

import { lockShare, railName } from "./money.mjs";

function bi(value) {
  return BigInt(value || 0);
}

export function locksOf(account) {
  return Array.isArray(account && account.chainLocks) ? account.chainLocks : [];
}

export function chainPublic(account) {
  let pocCents = 0n;
  let kusdtCents = 0n;
  let pocSompi = 0n;
  let kusdtSompi = 0n;
  let kusdtFrozen = false;
  for (const row of locksOf(account)) {
    const cents = bi(row.cents);
    const sompi = bi(row.sompi);
    if (row.rail === "kusdt") {
      kusdtCents += cents;
      kusdtSompi += sompi;
      if (row.frozen) kusdtFrozen = true;
    } else if (row.rail === "poc") {
      pocCents += cents;
      pocSompi += sompi;
    }
  }
  return { pocCents, kusdtCents, pocSompi, kusdtSompi, kusdtFrozen, count: locksOf(account).length };
}

export function liquidChain(account, rail) {
  let n = 0n;
  for (const row of locksOf(account)) {
    if (row.rail === rail && !row.frozen) n += bi(row.cents);
  }
  return n;
}

export function chainWouldCover(account, rail, cents) {
  const field = rail === "poc" ? "poc" : "kusdt";
  const stored = bi(account && account[field]);
  const need = BigInt(cents);
  if (stored >= need) return false;
  return stored + liquidChain(account, rail) >= need;
}

/**
 * Practice first, then covenant locks, then the older reserve liability.
 * A redeem skips the purse. A frozen lock still redeems.
 */
export function planTake(account, rail, cents, mode) {
  if (rail !== "poc" && rail !== "kusdt") throw new Error("Redeem POCencept or KUSDT.");
  const need = BigInt(cents);
  if (need <= 0n) throw new Error("Type an amount above zero.");
  const field = rail === "poc" ? "poc" : "kusdt";
  const backedField = rail === "poc" ? "pocBacked" : "kusdtBacked";
  const stored = bi(account && account[field]);
  const backed = bi(account && account[backedField]);
  const practice = stored > backed ? stored - backed : 0n;
  let left = need;
  let fromPractice = 0n;
  if (mode !== "redeem") {
    fromPractice = practice >= left ? left : practice;
    left -= fromPractice;
  }
  const chain = [];
  const skippedFrozen = [];
  for (const row of locksOf(account)) {
    if (left === 0n) break;
    if (row.rail !== rail) continue;
    if (mode !== "redeem" && row.frozen) {
      skippedFrozen.push(row);
      continue;
    }
    const have = bi(row.cents);
    if (have <= 0n) continue;
    const take = have >= left ? left : have;
    const pay = lockShare(row.sompi, have, take);
    if (pay <= 0n) throw new Error("That lock cannot pay this amount. Take the whole lock, or a larger part.");
    chain.push({ id: row.id, take, pay, row });
    left -= take;
  }
  let fromOld = 0n;
  if (left > 0n && backed > 0n) {
    fromOld = backed >= left ? left : backed;
    left -= fromOld;
  }
  return { practice: fromPractice, chain, old: fromOld, short: left, skippedFrozen, need };
}

export function shortMessage(plan, rail, mode) {
  if (plan.short <= 0n) return "";
  if (mode === "redeem") return "Practice coins spend in the shops. Only locked tKAS can be redeemed.";
  if (plan.skippedFrozen.length) return "KUSDT is frozen on this address. POCencept and tKAS are not.";
  return "Not enough " + railName(rail) + ".";
}

/** What the covenant writes after one entry. Output 0 is the moved part. A remainder is output 1. */
export function afterMove(lock, entry, take, pay, txid) {
  const cents = bi(lock.cents);
  const sompi = bi(lock.sompi);
  const takeC = BigInt(take);
  const payS = BigInt(pay);
  const restC = cents - takeC;
  const restS = sompi - payS;
  const idAt = (index) => String(txid) + ":" + String(index);
  if (entry === "freeze") {
    return [{ ...lock, id: idAt(0), txid: String(txid), index: 0, frozen: !lock.frozen }];
  }
  const rest = restC > 0n
    ? [{ ...lock, id: idAt(1), txid: String(txid), index: 1, cents: String(restC), sompi: String(restS) }]
    : [];
  if (entry === "exchange") {
    const moved = {
      ...lock,
      id: idAt(0),
      txid: String(txid),
      index: 0,
      rail: lock.rail === "poc" ? "kusdt" : "poc",
      cents: String(takeC),
      sompi: String(payS),
      frozen: false,
    };
    return [moved, ...rest];
  }
  return rest;
}

export function savePending(state, pending) {
  const next = structuredClone(state);
  if (!next.pegPending || typeof next.pegPending !== "object") next.pegPending = {};
  next.pegPending[pending.id] = pending;
  return next;
}

export function readPending(state, id) {
  const book = state && state.pegPending;
  if (!book || typeof book !== "object") return null;
  return book[id] || null;
}

export function findPending(state, address, rail, sompi) {
  const book = state && state.pegPending;
  if (!book || typeof book !== "object") return null;
  const want = String(address || "").toLowerCase();
  const amount = String(sompi);
  const rows = Object.values(book).filter(
    (row) => row && String(row.address || "").toLowerCase() === want && row.rail === rail && String(row.sompi) === amount
  );
  return rows.length ? rows[rows.length - 1] : null;
}
