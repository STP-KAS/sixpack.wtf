import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("./ledger.json", import.meta.url));

function load() {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { claims: [] };
  }
}

function save(data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function listClaims() {
  return load().claims || [];
}

export function recordClaim(row) {
  const data = load();
  data.claims = data.claims || [];
  data.claims.push({
    key: row.key,
    address: row.address,
    sompi: String(row.sompi),
    txids: row.txids || [],
    at: row.at || Date.now(),
    ip: row.ip || "",
  });
  save(data);
  return data.claims;
}
