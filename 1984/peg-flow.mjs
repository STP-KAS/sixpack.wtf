/** Move SquarePeg locks one transaction at a time. Practice coins and older reserve rows stay on the ledger. */

import { MAX_REDEEM_SOMPI } from "./money.mjs";
import { applyChainLock, applyChainMove, applyExchange, applyFreeze, applyRedeem, attachTxid, publicAccount } from "./ledger.mjs";
import { afterMove, findPending, planTake, readPending, savePending, shortMessage } from "./peg-book.mjs";

const SIGN = "This desk signs that covenant for the funded test wallet on this tab. A pasted address keeps the older reserve lock.";

function moved(message) {
  const err = new Error(message);
  err.moved = true;
  return err;
}

async function signer(guests, token, address) {
  if (!guests || typeof guests.sessionKey !== "function" || !token) throw new Error(SIGN);
  const session = await guests.sessionKey({ token, address });
  if (!session || !session.key || !session.address) throw new Error(SIGN);
  return session;
}

function lockRecord(pending, seen) {
  return {
    id: String(seen.txid) + ":" + String(seen.index),
    txid: String(seen.txid),
    index: Number(seen.index),
    pegAddress: pending.pegAddress,
    rail: pending.rail,
    cents: String(pending.cents),
    sompi: String(pending.sompi),
    owner: pending.owner,
    frozen: false,
    quoteMicro: String(pending.quoteMicro),
    bornCents: String(pending.bornCents),
    bornSompi: String(pending.bornSompi),
    openSig: pending.openSig,
    issuer: pending.issuer,
    reserve: pending.reserve,
  };
}

export async function openGuestLock({ pegLock, guests, address, token, rail, sompi, usdPerKas, getState, setState, now }) {
  if (!pegLock) return null;
  let pending = findPending(getState(), address, rail, sompi);
  if (!pending) {
    const session = await signer(guests, token, address);
    pending = await pegLock.plan({ address, rail, sompi, usdPerKas, ownerKey: session.key });
    await setState((current) => savePending(current, pending));
  }
  if (!pending.txid) {
    if (!guests || typeof guests.payTo !== "function") throw new Error(SIGN);
    const paid = await guests.payTo({ token, address, sompi, to: pending.pegAddress });
    const txid = paid && (paid.txid || (paid.txids && paid.txids[0]));
    if (!txid) throw new Error("The test wallet could not cover that payment.");
    pending = { ...pending, txid: String(txid) };
    await setState((current) => savePending(current, pending));
  }
  const seen = await pegLock.waitOutput(pending.pegAddress, pending.txid, pending.sompi);
  if (BigInt(seen.amount) !== BigInt(pending.sompi)) {
    const session = await signer(guests, token, address);
    await pegLock.recover({
      lock: { ...lockRecord(pending, seen), sompi: String(seen.amount), txid: seen.txid, index: seen.index },
      ownerKey: session.key,
      ownerAddress: address,
    });
    throw new Error("That payment did not match the lock. The coins were sent back. Nothing was tagged.");
  }
  let out;
  await setState((current) => {
    out = applyChainLock(current, { address, lock: lockRecord(pending, seen), pendingId: pending.id }, now);
    return out.state;
  });
  return { status: 200, body: out.result };
}

export async function openWalletPlan({ pegLock, address, rail, sompi, usdPerKas, ownerKey }) {
  if (!pegLock) return null;
  if (!ownerKey) throw new Error(SIGN);
  return pegLock.plan({ address, rail, sompi, usdPerKas, ownerKey });
}

export async function claimLock({ pegLock, address, id, txid, getState, setState, now }) {
  if (!pegLock) return null;
  const pending = readPending(getState(), id);
  if (!pending || String(pending.address).toLowerCase() !== String(address).toLowerCase()) {
    throw new Error("That lock is not waiting on this address.");
  }
  const seen = await pegLock.waitOutput(pending.pegAddress, txid, pending.sompi);
  if (BigInt(seen.amount) !== BigInt(pending.sompi)) {
    throw new Error("That payment did not match the lock. Nothing was tagged.");
  }
  let out;
  await setState((current) => {
    out = applyChainLock(current, { address, lock: lockRecord(pending, seen), pendingId: pending.id }, now);
    return out.state;
  });
  return { status: 200, body: out.result };
}

async function runChain(plan, each) {
  const txids = [];
  let last = null;
  for (const take of plan.chain) {
    if (take.pay > MAX_REDEEM_SOMPI) {
      throw new Error("One redeem is capped at 10000 tKAS so the broadcast stays a normal transaction. Split it.");
    }
    const txid = await each(take);
    txids.push(txid);
    last = txid;
  }
  return { txids, last };
}

async function remember(setState, address, take, entry, txid, now) {
  const next = afterMove(take.row, entry, take.take, take.pay, txid);
  let out;
  await setState((current) => {
    out = applyChainMove(current, {
      address,
      lockId: take.id,
      entry,
      cents: take.take,
      sompi: take.pay,
      txid,
      next,
      rail: entry === "exchange" ? (take.row.rail === "poc" ? "kusdt" : "poc") : take.row.rail,
    }, now);
    return out.state;
  });
  return out;
}

export async function settleRedeem({ pegLock, guests, pay, address, token, rail, cents, getState, setState, now }) {
  const account = (getState().accounts && getState().accounts[String(address).toLowerCase()]) || {};
  const plan = planTake(account, rail, cents, "redeem");
  if (plan.short > 0n) throw new Error(shortMessage(plan, rail, "redeem"));
  if (!plan.chain.length) return null;
  if (!pegLock) throw new Error("That lock is a Testnet-10 covenant. This desk cannot move it.");
  const session = await signer(guests, token, address);
  let ran = false;
  let chain;
  try {
    chain = await runChain(plan, async (take) => {
      const paid = await pegLock.redeem({ lock: take.row, ownerKey: session.key, take: take.take, ownerAddress: address });
      ran = true;
      await remember(setState, address, take, "redeem", paid.txid, now);
      return paid.txid;
    });
  } catch (err) {
    if (ran) throw moved((err && err.message) || "Part of this redeem is on Testnet 10. Redeem again for the rest.");
    throw err;
  }
  const txids = chain.txids;
  if (plan.old > 0n) {
    let before;
    let out;
    await setState((current) => {
      before = structuredClone(current);
      out = applyRedeem(current, { address, rail, cents: plan.old }, now);
      return out.state;
    });
    try {
      const paid = await pay(out.to, out.sompi);
      const txid = paid && paid.txids && paid.txids[0];
      if (!txid) throw new Error("Redeem did not broadcast.");
      await setState((current) => attachTxid(current, out.receiptId, txid));
      txids.push(txid);
      return { status: 200, body: { ...out.result, txids, peg: true, account: publicAccount(getState(), address) } };
    } catch (err) {
      await setState(() => before);
      return {
        status: 200,
        body: {
          ok: true,
          partial: true,
          peg: true,
          txids,
          account: publicAccount(getState(), address),
          note: "The covenant part is on Testnet 10. The reserve part did not send. Redeem again for the rest.",
        },
      };
    }
  }
  return { status: 200, body: { ok: true, peg: true, txids, account: publicAccount(getState(), address) } };
}

export async function settleExchange({ pegLock, guests, address, token, from, to, cents, getState, setState, now }) {
  const account = (getState().accounts && getState().accounts[String(address).toLowerCase()]) || {};
  if ((from === "kusdt" || to === "kusdt") && account.kusdtFrozen) {
    throw new Error("KUSDT is frozen. A frozen tether-style balance does not move.");
  }
  const plan = planTake(account, from, cents, "exchange");
  if (plan.short > 0n) throw new Error(shortMessage(plan, from, "exchange"));
  if (!plan.chain.length) return null;
  if (!pegLock) throw new Error("That lock is a Testnet-10 covenant. This desk cannot move it.");
  const session = await signer(guests, token, address);
  const txids = [];
  for (const take of plan.chain) {
    const paid = await pegLock.exchange({ lock: take.row, ownerKey: session.key, take: take.take, ownerAddress: address });
    txids.push(paid.txid);
    await remember(setState, address, take, "exchange", paid.txid, now);
  }
  const ledgerCents = plan.practice + plan.old;
  if (ledgerCents > 0n) {
    let out;
    await setState((current) => {
      out = applyExchange(current, { address, from, to, cents: ledgerCents }, now);
      return out.state;
    });
    return { status: 200, body: { ...out.result, txids, peg: true } };
  }
  return { status: 200, body: { ok: true, peg: true, txids, account: publicAccount(getState(), address) } };
}

export async function settleFreeze({ pegLock, guests, address, token, frozen, getState, setState, now }) {
  const account = (getState().accounts && getState().accounts[String(address).toLowerCase()]) || {};
  const rows = Array.isArray(account.chainLocks) ? account.chainLocks.filter((row) => row.rail === "kusdt" && !!row.frozen !== !!frozen) : [];
  if (rows.length && !pegLock) throw new Error("That lock is a Testnet-10 covenant. This desk cannot move it.");
  if (rows.length > 8) throw new Error("Freeze eight KUSDT locks at a time.");
  let session = null;
  if (rows.length && token) session = await signer(guests, token, address);
  if (rows.length && !session && !token) {
    /* The faucet pays the miner fee only. The lock itself stays put. */
  }
  for (const row of rows) {
    const paid = await pegLock.freeze({
      lock: row,
      feeKey: session ? session.key : "",
      feeAddress: session ? session.address : "",
    });
    const take = { id: row.id, take: BigInt(row.cents), pay: BigInt(row.sompi), row };
    await remember(setState, address, take, "freeze", paid.txid, now);
  }
  let out;
  await setState((current) => {
    out = applyFreeze(current, { address, frozen }, now);
    return out.state;
  });
  return { status: 200, body: out.result };
}

export async function settleSpend({ pegLock, guests, address, token, rail, cents, getState, setState, now }) {
  if (rail !== "poc" && rail !== "kusdt") return null;
  const account = (getState().accounts && getState().accounts[String(address).toLowerCase()]) || {};
  if (rail === "kusdt" && account.kusdtFrozen) {
    throw new Error("KUSDT is frozen on this address. POCencept and tKAS are not.");
  }
  const plan = planTake(account, rail, cents, "spend");
  if (plan.short > 0n) throw new Error(shortMessage(plan, rail, "spend"));
  if (!plan.chain.length) return null;
  if (!pegLock) throw new Error("That lock is a Testnet-10 covenant. This desk cannot move it.");
  const session = await signer(guests, token, address);
  const txids = [];
  let sompi = 0n;
  let prepaid = 0n;
  for (const take of plan.chain) {
    const paid = await pegLock.spend({ lock: take.row, ownerKey: session.key, take: take.take, ownerAddress: address });
    txids.push(paid.txid);
    sompi += take.pay;
    prepaid += take.take;
    await remember(setState, address, take, "spend", paid.txid, now);
  }
  return { prepaidCents: prepaid, chainSompi: sompi, chainTxid: txids[0] || "", txids, peg: true };
}

export function spendResult(out, extra) {
  if (!extra) return out;
  return { ...out, txids: extra.txids };
}
