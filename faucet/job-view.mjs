/** Decide when the faucet popup must leave Loading. */

export function classifyFaucetJob(j) {
  if (!j || j.html) return { kind: "wait" };
  if (j.code === "POOL") return { kind: "pool" };
  const txids = Array.isArray(j.txids) ? j.txids.filter((id) => id != null && String(id).length > 0) : [];
  const finished = j.pending === false || j.status === "done" || j.status === "error";
  if (txids.length && j.status !== "error" && (j.status === "done" || j.ok === true || j.pending === false)) {
    return { kind: "success", txids };
  }
  if (j.status === "done") return { kind: "success", txids };
  if (j.status === "error" || (finished && (j.ok === false || j.error))) {
    return {
      kind: "error",
      error: j.error || j.message || "Unable to send funds.",
      txids,
    };
  }
  if (typeof j.httpStatus === "number" && j.httpStatus >= 400 && j.error) {
    return { kind: "error", error: j.error, txids };
  }
  return { kind: "wait" };
}
