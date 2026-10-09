/** TN10 KNS inscription plan. No key, no broadcast.
 * The live name is the indexer inscription. KasRegistrar is a sketch and is not deployed.
 */

import { normalizeLabel } from "./layer.mjs";

export const KNS_FEE_ADDRESS =
  "kaspatest:qq9h47etjv6x8jgcla0ecnp8mgrkfxm70ch3k60es5a50ypsf4h6sak3g0lru";

const SOMPI = 100_000_000n;

export function knsFeeKas(label) {
  const name = normalizeLabel(label);
  const n = name.length;
  if (n <= 2) return 4200;
  if (n === 3) return 2100;
  if (n === 4) return 525;
  return 35;
}

export function knsPlan(label) {
  const name = normalizeLabel(label);
  const feeKas = knsFeeKas(name);
  const feeSompi = BigInt(feeKas) * SOMPI;
  const bufferSompi = (feeSompi * 5n) / 100n;
  const commitSompi = SOMPI;
  const prioritySompi = 3_000_000n;
  return {
    name,
    domain: name + ".kas",
    payload: JSON.stringify({ op: "create", p: "domain", v: name }),
    feeKas,
    feeAddress: KNS_FEE_ADDRESS,
    feeSompi,
    holdSompi: feeSompi + bufferSompi + commitSompi + prioritySompi,
  };
}
