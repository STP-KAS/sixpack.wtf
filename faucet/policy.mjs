/** STP TN10 faucet rules. No keys. Testnet-10 only. */

export const NETWORK = "testnet-10";
export const FROM =
  "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const CAP_SOMPI = 30_000n * 100_000_000n; // 30,000 tKAS / 24h
export const DRIP_SOMPI = 10_000n * 100_000_000n; // per request, up to remaining
export const MIN_SOMPI = 10n * 100_000_000n; // 10 tKAS floor (KIP-9 / packing)
export const EXPLORER_HOME = "https://tn10.kaspa.stream/";
/** Desk-only unlimited withdrawals. Address + desk IP must both match. */
export const DESK_UNLIMITED_ADDR =
  "kaspatest:qzpvdakagvwfm95g8pv9ndpupjtndgjfhmve08cg3tv5wgfytjzf7cudwwzv0";
export const DESK_IPS = new Set(["81.243.19.34", "127.0.0.1", "::1"]);

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

export function tkasToSompi(tkas) {
  const s = String(tkas ?? "").trim();
  if (!s) return DRIP_SOMPI;
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error("Amount must be tKAS.");
  const [w, f = ""] = s.split(".");
  const sompi = BigInt(w) * 100000000n + BigInt((f + "00000000").slice(0, 8));
  if (sompi < MIN_SOMPI) throw new Error("Minimum 10 tKAS.");
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

export function dripAmount(remaining) {
  const rem = BigInt(remaining);
  if (rem <= 0n) return 0n;
  if (rem < MIN_SOMPI) return 0n;
  return rem < DRIP_SOMPI ? rem : DRIP_SOMPI;
}

export function planClaim({ address, ip, claims, now = Date.now(), amountTkas }) {
  const dest = requireTestnetAddress(address);
  const ipKey = "ip:" + String(ip || "unknown");
  const addrKey = "addr:" + dest.toLowerCase();
  if (isDeskUnlimited(dest, ip)) {
    const sompi = tkasToSompi(amountTkas == null || amountTkas === "" ? "10000" : amountTkas);
    return {
      address: dest,
      sompi,
      remainingAfter: 0n,
      leftAddr: 0n,
      leftIp: 0n,
      tkas: sompiToTkas(sompi),
      capTkas: "unlimited",
      windowHours: 24,
      addrKey,
      ipKey,
      unlimited: true,
    };
  }
  const leftAddr = remainingInWindow(claims, addrKey, now);
  const leftIp = remainingInWindow(claims, ipKey, now);
  const remaining = leftAddr < leftIp ? leftAddr : leftIp;
  const sompi = dripAmount(remaining);
  if (sompi <= 0n) {
    const err = new Error("Limit 30,000 tKAS per 24 hours. Come back later.");
    err.code = "RATE";
    throw err;
  }
  return {
    address: dest,
    sompi,
    remainingAfter: remaining - sompi,
    leftAddr,
    leftIp,
    tkas: sompiToTkas(sompi),
    capTkas: "30000",
    windowHours: 24,
    addrKey,
    ipKey,
    unlimited: false,
  };
}
