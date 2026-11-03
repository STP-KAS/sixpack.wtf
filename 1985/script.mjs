/** Pure helpers for the 1985 desk. No keys, no RPC. */

export const SOMPI = 100_000_000n;
export const GIFT_SOMPI = 2_200_000_000n;
export const WALLET_COUNT = 40;
export const FEE_CUSHION = 1_000_000n;
export const COINBASE_MATURITY = 1000n;

const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

export function hexOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/^0x/, "").trim().toLowerCase();
  if (typeof value.toString === "function") {
    const text = value.toString();
    if (/^[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
  }
  return String(value).replace(/^0x/, "").trim().toLowerCase();
}

export function scriptBytes(spk) {
  if (spk == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(spk)) return spk;
  if (spk instanceof Uint8Array) return Buffer.from(spk);
  if (typeof spk === "string") {
    const text = hexOf(spk);
    if (!/^[0-9a-f]*$/.test(text) || text.length % 2 !== 0) return Buffer.alloc(0);
    return Buffer.from(text, "hex");
  }
  if (typeof spk.script === "string" || Buffer.isBuffer(spk.script) || spk.script instanceof Uint8Array) {
    return scriptBytes(spk.script);
  }
  return Buffer.alloc(0);
}

/** RPC sometimes hands back version bytes in front of the script. */
export function splitScript(spk) {
  const bytes = scriptBytes(spk);
  if (bytes.length >= 3 && bytes[1] === 0 && bytes[0] <= 1) {
    const script = bytes.subarray(2);
    const op = script[0];
    if (op === 0x04 || op === 0x20 || op === 0x21 || op === 0xaa || op === 0x51) {
      return { version: bytes[0], script };
    }
  }
  return { version: 0, script: bytes };
}

/**
 * STP1 coinbase lock. The owner script is data. The script ends in OP_FALSE.
 * `face` is the integer stored in the script. It is not the output value.
 */
export function parseStpLock(spk) {
  const script = splitScript(spk).script;
  if (script.length < 17 || script[0] !== 0x04) return null;
  if (script.subarray(1, 5).toString() !== "STP1" || script[5] !== 0x08 || script[14] !== 0x4c) return null;
  const face = script.readBigUInt64LE(6);
  const ownerLen = script[15];
  if (script.length !== 16 + ownerLen + 1 || script[script.length - 1] !== 0x00) return null;
  return { face, owner: script.subarray(16, 16 + ownerLen) };
}

export function coinbaseFee(free, locked) {
  if (locked <= 0n || free < locked) return null;
  return free - locked;
}

export function coinbaseRewards(outputs) {
  let free = 0n;
  let locked = 0n;
  let face = 0n;
  let minerScript = null;
  for (const output of outputs || []) {
    const value = BigInt(output.value ?? output.amount ?? 0);
    const parsed = parseStpLock(output.scriptPublicKey ?? output.spk);
    if (parsed) {
      locked += value;
      face += parsed.face;
    } else {
      free += value;
      if (!minerScript) minerScript = splitScript(output.scriptPublicKey ?? output.spk).script;
    }
  }
  return { free, locked, face, fees: coinbaseFee(free, locked), minerScript };
}

export function formatKas(sompi) {
  const n = BigInt(sompi);
  const neg = n < 0n;
  const v = neg ? -n : n;
  const whole = v / SOMPI;
  let frac = (v % SOMPI).toString().padStart(8, "0").replace(/0+$/, "");
  const text = frac ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${text}` : text;
}

export function parseKas(text) {
  const raw = String(text ?? "").trim();
  if (!/^\d+(\.\d{1,8})?$/.test(raw)) return null;
  const [whole, frac = ""] = raw.split(".");
  const padded = (frac + "00000000").slice(0, 8);
  return BigInt(whole) * SOMPI + BigInt(padded);
}

export function groupInt(value) {
  const n = BigInt(value);
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString();
  const text = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? `-${text}` : text;
}

export function isDevnetAddress(address) {
  return new RegExp(`^kaspadev:[${BECH32}]{59,70}$`).test(String(address || ""));
}

export function deskHost(host) {
  const h = String(host || "").trim().toLowerCase();
  return h === "127.0.0.1" || h.startsWith("127.0.0.1:") ||
    h === "localhost" || h.startsWith("localhost:") ||
    h === "[::1]" || h.startsWith("[::1]:");
}

export function allowDesk(host, origin) {
  if (!deskHost(host)) return false;
  if (!origin) return true;
  try {
    return deskHost(new URL(origin).host);
  } catch {
    return false;
  }
}

export function matureEntry(entry, virtualDaa) {
  const coinbase = entry?.isCoinbase === true || entry?.entry?.isCoinbase === true;
  if (!coinbase) return true;
  const born = BigInt(entry.blockDaaScore ?? entry.entry?.blockDaaScore ?? 0);
  return BigInt(virtualDaa) >= born + COINBASE_MATURITY;
}

export function shortHash(hash) {
  const text = hexOf(hash);
  if (text.length < 20) return text;
  return `${text.slice(0, 8)}…${text.slice(-6)}`;
}

export function parentHash(header) {
  const levels = header && (header.parentsByLevel || header.parents);
  if (!levels) return "";
  const first = Array.isArray(levels) ? levels[0] : levels;
  if (typeof first === "string") return hexOf(first);
  if (Array.isArray(first)) return hexOf(first[0]);
  if (first && Array.isArray(first.parentHashes)) return hexOf(first.parentHashes[0]);
  return "";
}
