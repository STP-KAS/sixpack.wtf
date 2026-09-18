/** Refuse faucet payouts to brand-new TN10 addresses. Fail closed. */

export const FIRST_TX_ON_OR_BEFORE = "2026-07-18";
/** First tx must be before 19 Jul 2026 00:00 UTC (18 Jul inclusive). */
export const FIRST_TX_DEADLINE_MS = Date.UTC(2026, 6, 19);
export const REST = "https://api-tn10.kaspa.org";

export function firstTxAllowed(firstTxMs) {
  const n = Number(firstTxMs);
  if (!Number.isFinite(n) || n <= 0) return false;
  return n < FIRST_TX_DEADLINE_MS;
}

export function tooNewError() {
  const err = new Error(
    "Unable to send funds: this address is too new. First TN10 transaction must be on or before 18 Jul 2026. New wallets are not paid."
  );
  err.code = "AGE";
  return err;
}

export async function lookupFirstTxMs(address, fetchImpl = fetch) {
  const dest = String(address || "").trim();
  const headers = { Accept: "application/json", "User-Agent": "Mozilla/5.0 sixpack-faucet" };
  const countRes = await fetchImpl(REST + "/addresses/" + encodeURIComponent(dest) + "/transactions-count", {
    headers,
  });
  if (!countRes.ok) throw tooNewError();
  const countBody = await countRes.json();
  const total = Number(countBody?.total || 0);
  if (!total) throw tooNewError();
  const offset = total - 1;
  const txRes = await fetchImpl(
    REST + "/addresses/" + encodeURIComponent(dest) + "/full-transactions?limit=1&offset=" + offset,
    { headers }
  );
  if (!txRes.ok) throw tooNewError();
  const rows = await txRes.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  const t = Number(row?.block_time ?? row?.blockTime ?? 0);
  if (!t) throw tooNewError();
  return t;
}

export async function requireOldAddress(address, opts = {}) {
  const firstTxMs = await lookupFirstTxMs(address, opts.fetchImpl || fetch);
  if (!firstTxAllowed(firstTxMs)) throw tooNewError();
  return firstTxMs;
}
