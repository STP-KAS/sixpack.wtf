/** Banner for a shop purchase. Driving and a lap say what changed. Anything else says paid. */
export function shopBanner(sku) {
  if (sku === "keys") return "You drive.";
  if (sku === "lap") return "One lap.";
  return "Paid.";
}

/** Next step for a shop tKAS buy. A wallet signs only after the till says ready. */
export function kasSpendAction({ kind, txid, needsConfirm, ready }) {
  if (kind === "guest") return "guest";
  if (txid) return "credit";
  if (needsConfirm) return "ask";
  if (ready) return "sign";
  return "stop";
}

function normAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function mainnetAddress(value) {
  const addr = String(value || "").trim();
  return /^kaspa:/i.test(addr) && !/^kaspatest:/i.test(addr);
}

/**
 * Who can sign a bank lock or a shop tKAS payment.
 * kit: the page wallet helper is loaded.
 * kasware / kastle: call that extension directly.
 * mainnet, mismatch, absent, and stop do not sign.
 */
export function lockSigner({
  kind,
  pageAddress,
  kit,
  kaswareReady,
  kastleReady,
  kaswareAddress,
  kastleAddress,
}) {
  const page = normAddress(pageAddress);
  const kasware = normAddress(kaswareAddress);
  const kastle = normAddress(kastleAddress);
  const kaswareMatch = !!(page && kasware && page === kasware);
  const kastleMatch = !!(page && kastle && page === kastle);
  const kaswareClash = !!(page && kasware && page !== kasware);
  const kastleClash = !!(page && kastle && page !== kastle);
  if (kind === "kasware" && mainnetAddress(kaswareAddress)) return "mainnet";
  if (kind === "kastle" && mainnetAddress(kastleAddress)) return "mainnet";
  if (kind !== "kasware" && kind !== "kastle" && kaswareReady && mainnetAddress(kaswareAddress) && !kastleMatch) return "mainnet";
  if (kind !== "kasware" && kind !== "kastle" && kastleReady && mainnetAddress(kastleAddress) && !kaswareMatch) return "mainnet";
  if (kind === "kasware" && kaswareClash) return "mismatch";
  if (kind === "kastle" && kastleClash) return "mismatch";
  if ((kind === "kasware" || kind === "kastle") && kit) return "kit";
  if (kind === "kasware" && kaswareReady) return "kasware";
  if (kind === "kastle" && kastleReady) return "kastle";
  if (kaswareMatch && kaswareReady) return "kasware";
  if (kastleMatch && kastleReady) return "kastle";
  if (kind === "kasware" || kind === "kastle") return "absent";
  if ((kaswareClash && kaswareReady) || (kastleClash && kastleReady)) return "mismatch";
  return "stop";
}

/** A wallet may return a string, or an object, or a JSON string. */
export function txidFromWallet(raw) {
  if (!raw) return "";
  if (typeof raw === "object") return String(raw.id || raw.transactionId || raw.txid || "").trim();
  const text = String(raw).trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return String(parsed.id || parsed.transactionId || parsed.txid || text).trim();
  } catch {
    /* the wallet returned the id itself */
  }
  return text;
}
