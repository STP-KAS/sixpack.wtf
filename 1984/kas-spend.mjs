/** Next step for a shop tKAS buy. A wallet signs only after the till says ready. */

export function kasSpendAction({ kind, txid, needsConfirm, ready }) {
  if (kind === "guest") return "guest";
  if (txid) return "credit";
  if (needsConfirm) return "ask";
  if (ready) return "sign";
  return "stop";
}
