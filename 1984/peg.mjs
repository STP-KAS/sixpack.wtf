/** SquarePeg numbers. No keys. No node. */

import { createHash } from "node:crypto";
import { centsForSompi, usdMicro } from "./money.mjs";

export const RAIL_POC = 0;
export const RAIL_KUSDT = 1;
export const I64 = 9223372036854775807n;
export const JS_MAX = 9007199254740991n;

/** cents 5, sompi 100000000, quote 50000. SilverScript writes each int little-endian. */
export const KNOWN_DIGEST = "6dd17a078af24567a4df6f1a15a4d99a33ba3cf1abd6fddd80b89076b9354bd5";

export function birthMessage(cents, sompi, quoteMicro) {
  const buf = Buffer.alloc(24);
  buf.writeBigInt64LE(BigInt(cents), 0);
  buf.writeBigInt64LE(BigInt(sompi), 8);
  buf.writeBigInt64LE(BigInt(quoteMicro), 16);
  return buf;
}

export function birthDigestHex(cents, sompi, quoteMicro) {
  return createHash("sha256").update(birthMessage(cents, sompi, quoteMicro)).digest("hex");
}

export function railByte(rail) {
  if (rail === "poc" || rail === 0 || rail === "0") return RAIL_POC;
  if (rail === "kusdt" || rail === 1 || rail === "1") return RAIL_KUSDT;
  throw new Error("Convert locks tKAS into POCencept or KUSDT.");
}

export function railOf(byte) {
  const n = Number(byte);
  if (n === RAIL_POC) return "poc";
  if (n === RAIL_KUSDT) return "kusdt";
  throw new Error("That rail is not on this covenant.");
}

export function assertFits(cents, sompi, quoteMicro) {
  const c = BigInt(cents);
  const s = BigInt(sompi);
  const q = BigInt(quoteMicro);
  if (c <= 0n || s <= 0n || q <= 0n) throw new Error("That lock is empty.");
  if (c > I64 || s > I64 || q > I64 || c * s > I64) {
    throw new Error("That lock is too large for this covenant. Split it.");
  }
}

export function asNum(value) {
  const n = BigInt(value);
  if (n < 0n || n > JS_MAX) throw new Error("That lock is too large for this covenant. Split it.");
  return Number(n);
}

/** The chain does not fetch a price. The desk writes the quote it used, once. */
export function openingNumbers(sompi, usdPerKas) {
  const quoteMicro = usdMicro(usdPerKas);
  const cents = centsForSompi(sompi, usdPerKas);
  if (cents <= 0n) throw new Error("That payment is too small at the live price to mint 0.01.");
  assertFits(cents, sompi, quoteMicro);
  return { cents, sompi: BigInt(sompi), quoteMicro, bornCents: cents, bornSompi: BigInt(sompi) };
}
