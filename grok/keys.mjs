import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function jwtExpUnix(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return 0;
    const json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return Number(json.exp) || 0;
  } catch {
    return 0;
  }
}

export function tokenUsable(token, nowMs = Date.now()) {
  const t = String(token || "").trim();
  if (!t) return false;
  if (t.startsWith("xai-")) return true;
  const exp = jwtExpUnix(t);
  if (!exp) return true;
  return exp * 1000 > nowMs + 30_000;
}

export function readGrokCliKey(nowMs = Date.now()) {
  const homes = [];
  if (process.env.GROK_HOME) homes.push(process.env.GROK_HOME);
  homes.push(path.join(os.homedir(), ".grok"));
  for (const home of homes) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(home, "auth.json"), "utf8"));
      let best = "";
      let bestExp = 0;
      for (const row of Object.values(raw || {})) {
        const t = String(row?.key || row?.access_token || "").trim();
        if (!tokenUsable(t, nowMs)) continue;
        const exp = jwtExpUnix(t) || (row.expires_at ? Date.parse(row.expires_at) / 1000 : nowMs / 1000);
        if (exp >= bestExp) {
          best = t;
          bestExp = exp;
        }
      }
      if (best) return best;
    } catch {
      /* optional */
    }
  }
  return "";
}

export function resolveApiKey(env = process.env, nowMs = Date.now()) {
  const envKey = String(env.XAI_API_KEY || "").trim();
  if (tokenUsable(envKey, nowMs)) return envKey;
  const grok = readGrokCliKey(nowMs);
  if (grok) return grok;
  return "";
}

export function upstreamErrorMessage(status, text) {
  let msg = "SpaceXAI HTTP " + status;
  try {
    const j = JSON.parse(text);
    const err = j.error;
    msg = (typeof err === "string" ? err : err?.message) || j.message || j.code || msg;
  } catch {
    if (text) msg = String(text).slice(0, 200);
  }
  if (status === 401 || status === 403 || /unauthenticated|bad-credentials|could not be validated/i.test(msg)) {
    return "The desk key expired. Sign in to Grok on this machine, or put a console.x.ai key in the gitignored .env.";
  }
  return msg;
}
