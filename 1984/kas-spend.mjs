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
