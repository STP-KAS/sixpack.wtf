/** Ledger math for the 1984 square. No keys. No mainnet. */

export const RESERVE =
  "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";

const BECH_CHAR = /[qpzry9x8gf2tvdw0s3jn54khce6mua7l]/i;
const SCALE = 1_000_000_000_000n;
const SOMPI = 100_000_000n;

export const RAILS = ["kas", "poc", "kusdt"];
export const PRACTICE_CENTS = 2000n;
export const MAX_REDEEM_SOMPI = 10_000n * SOMPI;
export const GLOBAL_REDEEM_CAP = 1_000_000n * SOMPI;
export const MIN_REDEEM_SOMPI = 1_000_000n;

export const GUEST_DISCLAIMER =
  "The same browser gets the same funded wallet. If this desk cannot tell it is the same browser, it says so. This money is tKAS, Testnet-10 KAS. With tKAS you can go to the bank.";

/** Body chars after the prefix. A wrap is joined until the body is long enough, then a space ends it. */
function takeBechBody(raw, start) {
  let body = "";
  for (let i = start; i < raw.length && body.length < 80; i += 1) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      if (body.length >= 50) break;
      continue;
    }
    if (!BECH_CHAR.test(ch)) break;
    body += ch;
  }
  if (body.length >= 50 && body.length <= 80) return body;
  return "";
}

/** Pull a kaspatest address out of a paste. Spaces and a surrounding page are ignored. */
function readKaspatest(raw) {
  const lower = raw.toLowerCase();
  const at = lower.indexOf("kaspatest");
  if (at >= 0) {
    let i = at + "kaspatest".length;
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (raw[i] === ":") {
      const body = takeBechBody(raw, i + 1);
      if (body) return "kaspatest:" + body;
      return "";
    }
    if (raw.slice(0, at).trim() === "") {
      const body = takeBechBody(raw, i);
      if (body) return "kaspatest:" + body;
    }
  }
  const bare = raw.trim().replace(/[\s\u00a0]+/g, "");
  if (/^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{50,80}$/i.test(bare)) return "kaspatest:" + bare;
  return "";
}

export function assertTestnet(value) {
  const raw = String(value || "").replace(/[\u200b-\u200d\ufeff]/g, "");
  const found = readKaspatest(raw);
  if (found) return found;
  const squashed = raw.replace(/[\s\u00a0]+/g, "");
  if (/kaspa:/i.test(squashed) && !/kaspatest:/i.test(squashed)) {
    throw new Error("Mainnet wallets are refused. Switch the wallet to Testnet 10.");
  }
  throw new Error("Use a Testnet-10 kaspatest: address.");
}

export function assertNotMainnetNetwork(network) {
  const s = String(network || "").toLowerCase().trim();
  if (!s) return;
  if (s.includes("testnet") || s.includes("tn10") || s.includes("testnet-10")) return;
  if (s.includes("main")) {
    throw new Error("Mainnet wallets are refused. In the wallet, switch the network to Testnet 10.");
  }
}

export function usdMicro(usdPerKas) {
  const n = Number(usdPerKas);
  if (!Number.isFinite(n) || n <= 0) throw new Error("The price oracle has no KAS quote.");
  const micro = BigInt(Math.round(n * 1e6));
  if (micro <= 0n) throw new Error("The price oracle has no KAS quote.");
  return micro;
}

/** Floor of sompi converted at the live dollar quote. 1.00 POC is 100 cents. */
export function centsForSompi(sompi, usdPerKas) {
  return (BigInt(sompi) * usdMicro(usdPerKas)) / SCALE;
}

/** Ceil, so a shop paid in tKAS is not short when the quote does not divide cleanly. */
export function sompiForCents(cents, usdPerKas) {
  const micro = usdMicro(usdPerKas);
  const c = BigInt(cents);
  if (c <= 0n) return 0n;
  return (c * SCALE + micro - 1n) / micro;
}

export function formatTkas(sompi) {
  let n = BigInt(sompi || 0);
  const neg = n < 0n;
  if (neg) n = -n;
  const whole = n / SOMPI;
  const frac = (n % SOMPI).toString().padStart(8, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

export function formatCents(cents) {
  let n = BigInt(cents || 0);
  const neg = n < 0n;
  if (neg) n = -n;
  const whole = n / 100n;
  const frac = (n % 100n).toString().padStart(2, "0");
  return (neg ? "-" : "") + whole.toString() + "." + frac;
}

export function parseTkas(text) {
  const s = String(text || "").trim();
  if (!/^\d+(\.\d{1,8})?$/.test(s)) throw new Error("Type a tKAS amount like 1 or 0.25.");
  const [w, f = ""] = s.split(".");
  const sompi = BigInt(w) * SOMPI + BigInt(f.padEnd(8, "0"));
  if (sompi <= 0n) throw new Error("Type a tKAS amount above zero.");
  return sompi;
}

export function parseDollars(text) {
  const s = String(text || "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Type an amount like 2.50.");
  const [w, f = ""] = s.split(".");
  const cents = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  if (cents <= 0n) throw new Error("Type an amount above zero.");
  return cents;
}

export function railName(rail) {
  if (rail === "kas") return "tKAS";
  if (rail === "poc") return "POCencept";
  if (rail === "kusdt") return "KUSDT";
  return rail;
}

export function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export function normalizeKasName(raw) {
  let v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("kaspatest:") || v.startsWith("kaspa:")) return null;
  if (v.endsWith(".kas")) v = v.slice(0, -4);
  if (!/^[a-z0-9-]{1,63}$/.test(v) || v.startsWith("-") || v.endsWith("-")) return null;
  return v + ".kas";
}
