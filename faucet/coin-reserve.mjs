/** Coins already used by a payment that is still in flight.
 * The next send skips them. Confirmed change is a new coin, so it is free.
 */

const reserved = new Set();
let chain = Promise.resolve();

export function coinId(entry) {
  const out = entry && (entry.outpoint || entry);
  const id = out && (out.transactionId || out.transaction_id);
  const index = out && (out.index ?? out.outputIndex);
  if (id == null || index == null || index === "") return "";
  return String(id).toLowerCase() + ":" + String(Number(index));
}

export function freeCoins(entries) {
  return (entries || []).filter((entry) => {
    const id = coinId(entry);
    return !id || !reserved.has(id);
  });
}

export function holdCoins(entries) {
  for (const entry of entries || []) {
    const id = coinId(entry);
    if (id) reserved.add(id);
  }
}

export function releaseCoins(entries) {
  for (const entry of entries || []) {
    const id = coinId(entry);
    if (id) reserved.delete(id);
  }
}

/** One signer at a time. The wait for inclusion stays outside this lock. */
export function withCoinLock(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
}
