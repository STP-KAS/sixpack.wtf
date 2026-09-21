/** Public desk gates. No keys. No seeds in logs. */

export const MAX_QUESTION = 4000;
export const MAX_HISTORY = 16;
export const MAX_HISTORY_CHARS = 12000;
export const RATE_WINDOW_MS = 10 * 60 * 1000;
export const RATE_MAX = 12;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const DAY_MAX = 40;
export const MIN_INTERVAL_MS = 1200;

const PRICE = /\b(price\s*prediction|price\s*target|price\s*action|\$kas\b|market\s*cap|\bmcap\b|\bath\b|\batl\b|\bmoon\b|\blambo\b|\b10x\b|\b100x\b|\bpump\b|\bdump\b|when\s+(binance|coinbase|listing)|binance\s+listing|buy\s+now|sell\s+now|will\s+it\s+(moon|pump|dump|reach|hit|go\s+to)|how\s+much\s+(is|will|should)\s+(kas|kaspa)|kaspa\s+price|price\s+of\s+kas|what(?:'s| is) kas(?:pa)? worth|target\s+price|resistance|support\s+level)\b/i;
const TECH = /\b(ghostdag|blockdag|phantom|kip-?\d*|kcc-?\d*|toccata|crescendo|silverscript|argent|vprog|covenant|utxo|rusty-?kaspa|dagknight|wallet|seed|mnemonic|proof of work|\bpow\b|\bpos\b|mining|ibd|rpc|daa|sompi|mass|node|kheavyhash|graftroot|kaspaexplained|kips?)\b/i;
const SEED = /\b([a-z]{3,8}\s+){11,}[a-z]{3,8}\b/i;
const PRIV = /\b(hex:)?[0-9a-f]{64}\b/i;
const JAIL = /\b(ignore (all )?(previous|prior|above) (instructions|rules)|you are grok\.com|dump (your )?(system|hidden) prompt|developer mode|dan mode)\b/i;
const SPAM = /^(.)\1{20,}$|https?:\/\/\S+\s+https?:\/\/\S+\s+https?:\/\/\S+/i;

const PRICE_REPLIES = [
  "I do not do price predictions. They are useless. I care about the code, the DAG, and whether a claim is live. Cypherpunks hash. Oracles guess. Ask me a real question.",
  "A candlestick is a crowd having a feeling in public. This desk does not forecast feelings. Ask what GHOSTDAG does, or what is actually live on Kaspa.",
  "No target, no moon, no listing-as-destiny. The interesting number is a DAA, a tag, or a txid. Price numerology can wait in the hallway.",
  "I will not tell you where KAS “should” be. That sentence has no object except a bag and a comedian, and I am employed as neither. Code, consensus, covenants.",
];

const hits = new Map();

export function normalizeIp(ip) {
  let s = String(ip || "").trim();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s.startsWith("[") && s.includes("]")) s = s.slice(1, s.indexOf("]"));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.split(":")[0];
  return s || "unknown";
}

export function looksLikeSeed(text) {
  const t = String(text || "").trim().toLowerCase();
  if (SEED.test(t)) return true;
  if (/\b(mnemonic|recovery phrase|seed phrase)\b/i.test(t) && t.split(/\s+/).length >= 12) return true;
  if (PRIV.test(t) && !/\b(txid|hash|daa|commit|sha)\b/i.test(t) && t.split(/\s+/).length < 8) return true;
  return false;
}

export function isPricePrimary(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (!PRICE.test(t)) return false;
  if (TECH.test(t)) return false;
  return true;
}

export function priceReply(now = Date.now()) {
  return PRICE_REPLIES[now % PRICE_REPLIES.length];
}

export function clipHistory(history) {
  const list = Array.isArray(history) ? history : [];
  const out = [];
  let chars = 0;
  for (let i = list.length - 1; i >= 0 && out.length < MAX_HISTORY; i--) {
    const role = list[i]?.role === "assistant" ? "assistant" : "user";
    let content = String(list[i]?.content || "").slice(0, 2000);
    if (looksLikeSeed(content)) content = "[redacted: looked like a secret]";
    chars += content.length;
    if (chars > MAX_HISTORY_CHARS) break;
    out.push({ role, content });
  }
  return out.reverse();
}

function takeHits(ip, now) {
  const key = normalizeIp(ip);
  let row = hits.get(key);
  if (!row) {
    row = { times: [], last: 0 };
    hits.set(key, row);
  }
  row.times = row.times.filter((t) => now - t < DAY_MS);
  return row;
}

export function gateUserText(text, ip, now = Date.now()) {
  const q = String(text || "").trim();
  if (!q) {
    const err = new Error("Ask a question.");
    err.code = "BAD";
    throw err;
  }
  if (q.length > MAX_QUESTION) {
    const err = new Error("That is too long for this desk. Cut it down.");
    err.code = "BAD";
    throw err;
  }
  if (looksLikeSeed(q)) {
    const err = new Error(
      "Stop. That looks like a secret. Do not paste a recovery phrase or a key into a website. Wipe it. Treat it as burned. This desk will not store it."
    );
    err.code = "SEED";
    throw err;
  }
  if (SPAM.test(q) && q.length > 40) {
    const err = new Error("That reads as spam. Ask one real question about Kaspa, crypto, or the protocol.");
    err.code = "SPAM";
    throw err;
  }
  const row = takeHits(ip, now);
  if (row.last && now - row.last < MIN_INTERVAL_MS) {
    const err = new Error("Slow down. One question at a time.");
    err.code = "RATE";
    err.retryAfterMs = MIN_INTERVAL_MS - (now - row.last);
    throw err;
  }
  const recent = row.times.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    const err = new Error("Rate limit. This desk is a help desk, not a faucet for tokens.");
    err.code = "RATE";
    err.retryAfterMs = RATE_WINDOW_MS - (now - recent[0]);
    throw err;
  }
  if (row.times.length >= DAY_MAX) {
    const err = new Error("Daily cap. Come back tomorrow, or read kaspaexplained.com/start-here.");
    err.code = "RATE";
    err.retryAfterMs = DAY_MS - (now - row.times[0]);
    throw err;
  }
  row.times.push(now);
  row.last = now;
  return {
    question: q,
    price: isPricePrimary(q),
    jail: JAIL.test(q),
  };
}

export function statusFor(code) {
  if (code === "RATE") return 429;
  if (code === "SEED" || code === "SPAM" || code === "BAD") return 400;
  return 400;
}
