/** Testnet 10 standard fee is 100 sompi per gram. Sends pay twice that. */
export const STANDARD_FEE_RATE = 100;

/**
 * Extra sompi for a wallet that adds a flat fee on top of its own minimum.
 * 2,000,000 sompi is double the standard fee on a 10,000 gram payment.
 */
export const WALLET_PRIORITY_SOMPI = 2_000_000;

function bucketRate(bucket) {
  if (!bucket || typeof bucket !== "object") return 0;
  const n = Number(bucket.feerate ?? bucket.feeRate);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The node's ordinary bucket. A missing quote falls back to the known standard. */
export function standardFeeRate(estimate) {
  const root = estimate && estimate.estimate ? estimate.estimate : estimate;
  const normal = root && Array.isArray(root.normalBuckets) ? bucketRate(root.normalBuckets[0]) : 0;
  const low = root && Array.isArray(root.lowBuckets) ? bucketRate(root.lowBuckets[0]) : 0;
  const priority = root ? bucketRate(root.priorityBucket) : 0;
  const quoted = normal || low || priority;
  return quoted > 0 ? quoted : STANDARD_FEE_RATE;
}

/** Twice the ordinary rate, and never under twice the known standard. */
export function payFeeRate(estimate) {
  return Math.max(standardFeeRate(estimate), STANDARD_FEE_RATE) * 2;
}
