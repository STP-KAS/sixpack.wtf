/** This square's KNS book. The first owner this desk records for a free name wins here.
 *  The KNS testnet index remains the network record. Not a covenant. Not consensus.
 */

import { assertTestnet } from "./money.mjs";
import { normalizeLabel } from "./layer.mjs";

function list(state) {
  if (!state || !Array.isArray(state.knsIndex)) return [];
  return state.knsIndex;
}

function publicRow(row) {
  if (!row || typeof row !== "object") return null;
  const name = String(row.name || "");
  const owner = String(row.owner || "");
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(name) || name.endsWith("-")) return null;
  if (!/^kaspatest:/i.test(owner)) return null;
  const id = String(row.inscriptionId || "").trim().toLowerCase();
  if (id && !/^[0-9a-f]{64}i0$/.test(id)) return null;
  const at = Number(row.at);
  return {
    name,
    owner,
    inscriptionId: id,
    at: Number.isFinite(at) ? at : 0,
    source: row.source === "kns" ? "kns" : "square",
  };
}

export function publicKnsIndex(state) {
  const out = [];
  for (const row of list(state)) {
    const pub = publicRow(row);
    if (pub) out.push(pub);
  }
  return out;
}

export function lookupSquareName(state, name) {
  let label = "";
  try {
    label = normalizeLabel(name);
  } catch {
    return null;
  }
  for (const row of list(state)) {
    const pub = publicRow(row);
    if (pub && pub.name === label) return pub;
  }
  return null;
}

export function recordSquareName(state, input, now) {
  const name = normalizeLabel(input && input.name);
  const owner = assertTestnet((input && (input.owner || input.address)) || "");
  const id = String((input && input.inscriptionId) || "").trim().toLowerCase();
  if (id && !/^[0-9a-f]{64}i0$/.test(id)) throw new Error("The inscription id did not come back.");
  const source = input && input.source === "kns" ? "kns" : "square";
  const next = structuredClone(state);
  if (!Array.isArray(next.knsIndex)) next.knsIndex = [];
  const existing = next.knsIndex.find((row) => row && row.name === name);
  if (existing) {
    const pub = publicRow(existing);
    if (!pub || pub.owner.toLowerCase() !== owner.toLowerCase()) {
      return { state: next, row: pub, already: true, conflict: true };
    }
    if (!existing.inscriptionId && id) existing.inscriptionId = id;
    return { state: next, row: publicRow(existing), already: true, conflict: false };
  }
  const row = { name, owner, inscriptionId: id, at: now, source };
  next.knsIndex.push(row);
  return { state: next, row: publicRow(row), already: false, conflict: false };
}
