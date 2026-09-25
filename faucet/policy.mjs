/** STP TN10 faucet rules. No keys. Testnet-10 only. */
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const NETWORK = "testnet-10";
export const FROM =
  "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";
/** Personal and IP cap. The hour count is the public rule. */
export const WINDOW_HOURS = 21547889855;
export const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;
/** Hidden whole-faucet ceiling. Stays on 24h so older payouts do not zero the faucet. */
export const POOL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CAP_SOMPI = 60_000_000n; // 0.6 tKAS / address and IP / window
export const DRIP_SOMPI = 60_000_000n; // 0.6 tKAS per withdrawal
/** Whole faucet over 24h. Counted from payouts. Not returned by the API. */
export const POOL_SOMPI = 150_000n * 100_000_000n;
export const MIN_SOMPI = 60_000_000n; // 0.6 tKAS, same as one withdrawal
export const EXPLORER_HOME = "https://tn10.kaspa.stream/";
/** Desk-only unlimited withdrawals. Address + desk IP must both match. */
export const DESK_UNLIMITED_ADDR =
  "kaspatest:qzpvdakagvwfm95g8pv9ndpupjtndgjfhmve08cg3tv5wgfytjzf7cudwwzv0";
export const DESK_IPS = new Set(["<redacted-ip>", "127.0.0.1", "::1"]);

const BECH = /^kaspatest:[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{50,80}$/i;

export function normalizeIp(ip) {
  let s = String(ip || "").trim();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s.startsWith("[") && s.includes("]")) s = s.slice(1, s.indexOf("]"));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.split(":")[0];
  return s;
}

export function isDeskUnlimited(address, ip) {
  const dest = String(address || "").trim().toLowerCase();
  return dest === DESK_UNLIMITED_ADDR.toLowerCase() && DESK_IPS.has(normalizeIp(ip));
}

const HALL_FILE = fileURLToPath(new URL("./.local/hallpass.txt", import.meta.url));
let hallCache = { mtime: -1, set: new Set() };

function loadHallPass() {
  let mtime = -1;
  try {
    mtime = statSync(HALL_FILE).mtimeMs;
  } catch {
    hallCache = { mtime: -1, set: new Set() };
    return hallCache.set;
  }
  if (mtime === hallCache.mtime) return hallCache.set;
  try {
    const text = readFileSync(HALL_FILE, "utf8");
    const set = new Set();
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim().toLowerCase();
      if (!s || s.startsWith("#")) continue;
      set.add(s);
    }
    hallCache = { mtime, set };
  } catch {
    hallCache = { mtime, set: new Set() };
  }
  return hallCache.set;
}

/** Grok-bot addresses. Local file only, not served and not committed. */
export const HALL_PASS = loadHallPass();

export function isHallPass(address) {
  return loadHallPass().has(String(address || "").trim().toLowerCase());
}

export function tkasToSompi(tkas) {
  const s = String(tkas ?? "").trim();
  if (!s) return DRIP_SOMPI;
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error("Amount must be tKAS.");
  const [w, f = ""] = s.split(".");
  const sompi = BigInt(w) * 100000000n + BigInt((f + "00000000").slice(0, 8));
  if (sompi < MIN_SOMPI) throw new Error("Minimum 0.6 tKAS.");
  return sompi;
}

export function sompiToTkas(sompi) {
  const n = BigInt(sompi);
  const whole = n / 100000000n;
  const frac = n % 100000000n;
  if (frac === 0n) return whole.toString();
  return whole.toString() + "." + frac.toString().padStart(8, "0").replace(/0+$/, "");
}

export function requireTestnetAddress(value) {
  const address = String(value || "").trim();
  if (!BECH.test(address)) throw new Error("Use a Testnet-10 kaspatest: address.");
  if (address.toLowerCase() === FROM.toLowerCase()) {
    throw new Error("The faucet cannot pay itself.");
  }
  return address;
}

export function windowStart(now = Date.now()) {
  return now - WINDOW_MS;
}

function poolWindowStart(now = Date.now()) {
  return now - POOL_WINDOW_MS;
}

export function usedInWindow(claims, key, now = Date.now()) {
  const start = windowStart(now);
  let used = 0n;
  for (const c of claims || []) {
    if (c.key !== key) continue;
    if (Number(c.at) < start) continue;
    used += BigInt(c.sompi || 0);
  }
  return used;
}

export function remainingInWindow(claims, key, now = Date.now()) {
  const used = usedInWindow(claims, key, now);
  return used >= CAP_SOMPI ? 0n : CAP_SOMPI - used;
}

function countsTowardPool(row) {
  return String(row?.key || "").startsWith("addr:");
}

export function usedIpInWindow(claims, ipKey, now = Date.now()) {
  const start = windowStart(now);
  let used = 0n;
  for (const c of claims || []) {
    if (c.key !== ipKey) continue;
    if (Number(c.at) < start) continue;
    used += BigInt(c.sompi || 0);
  }
  return used;
}

export function remainingIp(claims, ipKey, now = Date.now()) {
  const used = usedIpInWindow(claims, ipKey, now);
  return used >= CAP_SOMPI ? 0n : CAP_SOMPI - used;
}

export function usedPool(claims, now = Date.now()) {
  const start = poolWindowStart(now);
  let used = 0n;
  for (const c of claims || []) {
    if (!countsTowardPool(c)) continue;
    if (Number(c.at) < start) continue;
    used += BigInt(c.sompi || 0);
  }
  return used;
}

export function remainingPool(claims, now = Date.now()) {
  const used = usedPool(claims, now);
  return used >= POOL_SOMPI ? 0n : POOL_SOMPI - used;
}

function oldestPoolAt(claims, now = Date.now()) {
  const start = poolWindowStart(now);
  let oldest = null;
  for (const c of claims || []) {
    if (!countsTowardPool(c)) continue;
    const at = Number(c.at);
    if (at < start) continue;
    if (oldest == null || at < oldest) oldest = at;
  }
  return oldest;
}

/** Whole hours until the oldest counted payout leaves the window. At least 1. */
export function restHours(ms) {
  const hours = Math.ceil(Math.max(0, Number(ms)) / (60 * 60 * 1000));
  return hours < 1 ? 1 : hours;
}

export function dripAmount(remaining) {
  const rem = BigInt(remaining);
  if (rem <= 0n) return 0n;
  if (rem < MIN_SOMPI) return 0n;
  return rem < DRIP_SOMPI ? rem : DRIP_SOMPI;
}

export function oldestInWindow(claims, key, now = Date.now()) {
  const start = windowStart(now);
  let oldest = null;
  for (const c of claims || []) {
    if (c.key !== key) continue;
    const at = Number(c.at);
    if (at < start) continue;
    if (oldest == null || at < oldest) oldest = at;
  }
  return oldest;
}

export function formatWait(ms) {
  let s = Math.max(0, Math.ceil(Number(ms) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return h + "h " + m + "m " + sec + "s";
}

export function rateLimitError({ claims, addrKey, ipKey, now = Date.now() }) {
  const leftAddr = remainingInWindow(claims, addrKey, now);
  const leftIp = remainingIp(claims, ipKey, now);
  const remaining = leftAddr < leftIp ? leftAddr : leftIp;
  const key = leftAddr <= leftIp ? addrKey : ipKey;
  const oldest = oldestInWindow(claims, key, now);
  const retryAfterMs = oldest == null ? WINDOW_MS : Math.max(0, oldest + WINDOW_MS - now);
  const wait = formatWait(retryAfterMs);
  const err = new Error(
    "Unable to send funds: you have " + sompiToTkas(remaining) + " tKAS remaining. Your limit will update in " + wait + "."
  );
  err.code = "RATE";
  err.retryAfterMs = retryAfterMs;
  err.retryAfter = wait;
  err.remainingTkas = sompiToTkas(remaining);
  return err;
}

export function poolLimitError({ claims, now = Date.now() }) {
  const oldest = oldestPoolAt(claims, now);
  const retryAfterMs = oldest == null ? POOL_WINDOW_MS : Math.max(0, oldest + POOL_WINDOW_MS - now);
  const hours = restHours(retryAfterMs);
  const unit = hours === 1 ? "hour" : "hours";
  const err = new Error(
    "Bot detected (not you). Faucet reached pay out limit. Rest for " + hours + " " + unit + "."
  );
  err.code = "POOL";
  err.retryAfterMs = retryAfterMs;
  err.retryAfter = formatWait(retryAfterMs);
  err.restHours = hours;
  err.remainingTkas = "0";
  return err;
}

export function planClaim({ address, ip, claims, now = Date.now(), amountTkas, enforcePool = true }) {
  const dest = requireTestnetAddress(address);
  const ipKey = "ip:" + String(ip || "unknown");
  const addrKey = "addr:" + dest.toLowerCase();
  const leftAddr = remainingInWindow(claims, addrKey, now);
  const leftIp = remainingIp(claims, ipKey, now);
  const personal = leftAddr < leftIp ? leftAddr : leftIp;
  if (personal < MIN_SOMPI) {
    throw rateLimitError({ claims, addrKey, ipKey, now });
  }
  const leftPool = enforcePool ? remainingPool(claims, now) : POOL_SOMPI;
  if (enforcePool && leftPool < MIN_SOMPI) {
    throw poolLimitError({ claims, now });
  }
  const remaining = personal < leftPool ? personal : leftPool;
  const sompi = dripAmount(remaining);
  if (sompi <= 0n) {
    throw rateLimitError({ claims, addrKey, ipKey, now });
  }
  return {
    address: dest,
    sompi,
    remainingAfter: personal - sompi,
    leftAddr,
    leftIp,
    tkas: sompiToTkas(sompi),
    capTkas: sompiToTkas(CAP_SOMPI),
    windowHours: WINDOW_HOURS,
    addrKey,
    ipKey,
    unlimited: false,
  };
}
