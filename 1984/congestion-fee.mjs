/** Capped fee for the 1984 square. Testnet-10 only.
 * The later congestion reading: watch the quote, raise when a spend waits, cap the raise, read two nodes.
 * The square still pays 87 times the agreed ordinary rate. One wild quote does not lift that rate.
 */

import { PAGE_FEE_MULTIPLE, STANDARD_FEE_RATE } from "../faucet/fee-rate.mjs";

/** One sigop allows 109,999 script units. A SquarePeg spend used 206,707. Three allow 309,999. */
export const COVENANT_SIGOPS = 3;
export const OUTLIER_RATIO = 3;
export const MEMPOOL_MARK = 50_000;
export const MAX_BUMPS = 4;
export const BUMP_FACTOR = 1.5;
/** 20 tKAS. Above an ordinary 87x spend, and the stop before a stale quote can drain the fee coin. */
export const ABSOLUTE_FEE_SOMPI = 2_000_000_000n;
export const FULL_BACKOFF_MS = Object.freeze([1_000, 2_000, 4_000]);

export function scriptUnitsForSigops(count) {
  return Number(count) * 100_000 + 9_999;
}

function bucketRate(bucket) {
  if (!bucket || typeof bucket !== "object") return 0;
  const n = Number(bucket.feerate ?? bucket.feeRate);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function quoteFromEstimate(estimate, mempoolSize) {
  const root = estimate && estimate.estimate ? estimate.estimate : estimate;
  const normal = root && Array.isArray(root.normalBuckets) ? bucketRate(root.normalBuckets[0]) : 0;
  const priority = root ? bucketRate(root.priorityBucket) : 0;
  const mem = Number(mempoolSize);
  return {
    normal,
    priority,
    mempool: Number.isFinite(mem) && mem > 0 ? mem : 0,
  };
}

function median(values) {
  const sorted = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function priceOf(node) {
  return node.priority > 0 ? node.priority : node.normal;
}

/** Median of two or more live nodes. A quote more than 3x the other is dropped. One node cannot raise past 3x the last agreed ordinary rate. */
export function agreeNodes(nodes, lastNormal) {
  const last = Math.max(Number(lastNormal) || 0, STANDARD_FEE_RATE);
  const live = (Array.isArray(nodes) ? nodes : []).filter((node) => node && (node.normal > 0 || node.priority > 0));
  if (!live.length) {
    return { normal: last, priority: last, mempool: 0, outlier: false, single: true, held: true };
  }
  if (live.length === 1) {
    const one = live[0];
    const normal = one.normal > 0 ? one.normal : last;
    if (normal > last * OUTLIER_RATIO) {
      return { normal: last, priority: last, mempool: 0, outlier: true, single: true, held: true };
    }
    const agreed = Math.max(normal, STANDARD_FEE_RATE);
    const priority = Math.max(one.priority, agreed);
    return { normal: agreed, priority, mempool: one.mempool || 0, outlier: false, single: true, held: false };
  }
  if (live.length === 2) {
    const hi = Math.max(priceOf(live[0]), priceOf(live[1]));
    const lo = Math.min(priceOf(live[0]), priceOf(live[1]));
    if (lo > 0 && hi > lo * OUTLIER_RATIO) {
      const lower = priceOf(live[0]) <= priceOf(live[1]) ? live[0] : live[1];
      const normal = Math.max(lower.normal || STANDARD_FEE_RATE, STANDARD_FEE_RATE);
      return {
        normal,
        priority: Math.max(lower.priority, normal),
        mempool: lower.mempool || 0,
        outlier: true,
        single: false,
        held: false,
      };
    }
  }
  const prioMed = median(live.map((node) => priceOf(node)));
  const kept = live.filter((node) => priceOf(node) <= prioMed * OUTLIER_RATIO);
  const use = kept.length ? kept : [live.slice().sort((a, b) => priceOf(a) - priceOf(b))[0]];
  const normal = Math.max(median(use.map((node) => (node.normal > 0 ? node.normal : STANDARD_FEE_RATE))), STANDARD_FEE_RATE);
  const priority = Math.max(median(use.map((node) => Math.max(node.priority, normal))), normal);
  const mempool = median(use.map((node) => node.mempool || 0));
  return { normal, priority, mempool, outlier: kept.length !== live.length, single: false, held: false };
}

/** 87x the agreed ordinary rate. A waiting spend may step 1.5x, four times, and then stops. A held single-node quote does not step. */
export function squarePlan(agreed, bump = 0) {
  const normal = Math.max(Number(agreed && agreed.normal) || 0, STANDARD_FEE_RATE);
  const base = normal * PAGE_FEE_MULTIPLE;
  const steps = agreed && agreed.held ? 0 : Math.max(0, Math.min(MAX_BUMPS, bump | 0));
  let rate = base;
  for (let i = 0; i < steps; i += 1) rate = Math.ceil(rate * BUMP_FACTOR);
  const ceiling = Math.ceil(base * BUMP_FACTOR ** MAX_BUMPS);
  return {
    rate: Math.min(rate, ceiling),
    base,
    normal,
    steps,
    congested: Number(agreed && agreed.mempool) >= MEMPOOL_MARK,
  };
}

export function feeWithinCap(sompi) {
  return BigInt(sompi) <= ABSOLUTE_FEE_SOMPI;
}

export function mempoolFull(err) {
  const text = String((err && err.message) || err || "");
  return /mempool is full|mempool full|rejectmempoolisfull|full with transactions with higher priority/i.test(text);
}

export function replacementRefused(err) {
  const text = String((err && err.message) || err || "");
  return /already spent|double[- ]spend|already in the mempool|already accepted/i.test(text);
}
