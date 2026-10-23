/** KUSD on this square. Testnet-10 only. No mainnet. */

import { MAX_REDEEM_SOMPI, MIN_REDEEM_SOMPI, assertTestnet, centsForSompi, lockShare } from "./money.mjs";

function clone(state) {
  return structuredClone(state);
}

function mapOf(state) {
  if (!state.kusd || typeof state.kusd !== "object") state.kusd = {};
  return state.kusd;
}

function held(state, address) {
  const key = address.toLowerCase();
  const map = mapOf(state);
  if (!map[key]) map[key] = { address, cents: "0", sompi: "0" };
  return map[key];
}

export function kusdHolding(state, address) {
  const key = String(address || "").toLowerCase();
  const row = state && state.kusd && state.kusd[key];
  return {
    kusd: String((row && row.cents) || "0"),
    kusdSompi: String((row && row.sompi) || "0"),
  };
}

/** Lock accepted tKAS. The sompi stays until redeem. The quote is the one at mint. */
export function mintKusd(state, input) {
  const address = assertTestnet(input.address);
  if (!input.payment || !input.payment.txid) {
    throw new Error("Locking tKAS needs an accepted Testnet-10 transaction.");
  }
  const paid = BigInt(input.payment.paid);
  if (paid <= 0n) throw new Error("Type an amount above zero.");
  const cents = centsForSompi(paid, input.usdPerKas);
  if (cents <= 0n) throw new Error("That payment is too small at the live price to mint 0.01.");
  const txid = String(input.payment.txid);
  const next = clone(state);
  if (!next.txids) next.txids = {};
  if (next.txids[txid]) throw new Error("That transaction was already used.");
  const row = held(next, address);
  row.cents = String(BigInt(row.cents) + cents);
  row.sompi = String(BigInt(row.sompi) + paid);
  next.txids[txid] = { address, kind: "kusd-mint", rail: "kusd" };
  return {
    state: next,
    result: { ok: true, cents: String(cents), sompi: String(paid), txid },
  };
}

/** Burn KUSD and name the tKAS to pay back. A later quote is not used. */
export function redeemKusd(state, input) {
  const address = assertTestnet(input.address);
  const cents = BigInt(input.cents);
  if (cents <= 0n) throw new Error("Type an amount above zero.");
  const next = clone(state);
  const row = held(next, address);
  const have = BigInt(row.cents);
  const box = BigInt(row.sompi);
  if (have < cents) throw new Error("Not enough KUSD.");
  const sompi = lockShare(box, have, cents);
  if (sompi <= 0n) throw new Error("That KUSD has no tKAS left to redeem.");
  if (sompi < MIN_REDEEM_SOMPI) throw new Error("That redeem is too small to broadcast on Testnet-10.");
  if (sompi > MAX_REDEEM_SOMPI) {
    throw new Error("One redeem is capped at 10000 tKAS so the broadcast stays a normal transaction. Split it.");
  }
  row.cents = String(have - cents);
  row.sompi = String(box - sompi);
  return { state: next, sompi, to: address, result: { ok: true, cents: String(cents), sompi: String(sompi) } };
}

/** Move the claim and its locked tKAS share to another test address. The coins stay put until redeem. */
export function sendKusd(state, input) {
  const from = assertTestnet(input.address);
  const to = assertTestnet(input.to);
  if (from.toLowerCase() === to.toLowerCase()) throw new Error("Send KUSD to another test address.");
  const cents = BigInt(input.cents);
  if (cents <= 0n) throw new Error("Type an amount above zero.");
  const next = clone(state);
  const source = held(next, from);
  const have = BigInt(source.cents);
  const box = BigInt(source.sompi);
  if (have < cents) throw new Error("Not enough KUSD.");
  const sompi = lockShare(box, have, cents);
  if (sompi <= 0n) throw new Error("That KUSD has no tKAS left to send.");
  source.cents = String(have - cents);
  source.sompi = String(box - sompi);
  const dest = held(next, to);
  dest.cents = String(BigInt(dest.cents) + cents);
  dest.sompi = String(BigInt(dest.sompi) + sompi);
  return {
    state: next,
    result: { ok: true, cents: String(cents), sompi: String(sompi), to },
  };
}
