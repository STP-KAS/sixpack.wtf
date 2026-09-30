/** Read Testnet-10 and the KNS TN10 resolver. No keys. */

import { RESERVE, assertTestnet, normalizeKasName } from "./money.mjs";

const COINBASE = "0100000000000000000000000000000000000000";
const TN10 = "https://api-tn10.kaspa.org";
const PRICE = "https://api.kaspa.org/info/price";
const KNS = "https://api.knsdomains.org/tn10/api/v1";

export function parsePrice(body) {
  const n = Number(body && body.price);
  if (!Number.isFinite(n) || n <= 0) throw new Error("The price oracle has no KAS quote.");
  return n;
}

export function parseBalance(body) {
  if (body == null || body === "") throw new Error("No balance.");
  if (typeof body === "bigint") return body;
  if (typeof body === "number") {
    if (!Number.isFinite(body)) throw new Error("Balance was not a number.");
    return BigInt(Math.trunc(body));
  }
  if (typeof body === "string" && /^-?\d+$/.test(body)) return BigInt(body);
  if (typeof body === "object") {
    if (body.balance != null && typeof body.balance !== "object") return parseBalance(body.balance);
    if (body.confirmed != null) return parseBalance(body.confirmed);
  }
  throw new Error("Balance was not a number.");
}

export function extractPayment(tx, { from, to, need }) {
  const body = tx && (tx.transaction || tx);
  if (!body || typeof body !== "object") throw new Error("Transaction not found on Testnet 10.");
  if (body.is_accepted === false) throw new Error("That transaction is not accepted yet. Wait and claim it again.");
  const sub = String(body.subnetwork_id || "");
  if (sub === COINBASE) throw new Error("A coinbase cannot pay a shop or mint a toy dollar.");
  const txid = String(body.transaction_id || body.transactionId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error("Missing transaction id.");
  const inputs = Array.isArray(body.inputs) ? body.inputs : [];
  if (!inputs.length) throw new Error("That transaction has no sender.");
  const fromL = assertTestnet(from).toLowerCase();
  const toL = assertTestnet(to).toLowerCase();
  let fromSeen = false;
  for (const inp of inputs) {
    const resolved = inp && inp.previous_outpoint_resolved;
    const addr = String(
      (inp && inp.previous_outpoint_address) || (resolved && resolved.script_public_key_address) || ""
    ).toLowerCase();
    if (addr === fromL) fromSeen = true;
  }
  if (!fromSeen) throw new Error("That transaction was not sent by this address.");
  let paid = 0n;
  for (const out of body.outputs || []) {
    const addr = String(out.script_public_key_address || "").toLowerCase();
    if (addr === toL) paid += BigInt(out.amount || 0);
  }
  const needBi = BigInt(need);
  if (paid < needBi) {
    throw new Error("The payment is smaller than the quote. Send at least the quoted tKAS to the reserve.");
  }
  return { txid, paid };
}

export function parseKns(body, domain) {
  if (!body || body.success !== true || !body.data) return null;
  const owner = String(body.data.owner || "");
  if (/^kaspa:/i.test(owner) && !/^kaspatest:/i.test(owner)) {
    throw new Error("That name points at a mainnet address. Mainnet is refused.");
  }
  if (!/^kaspatest:/i.test(owner)) return null;
  if (body.data.asset && String(body.data.asset).toLowerCase() !== domain.toLowerCase()) return null;
  return { domain, address: assertTestnet(owner) };
}

export async function fetchPrice(fetchImpl) {
  const res = await fetchImpl(PRICE, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("The price oracle did not answer.");
  return parsePrice(await res.json());
}

export async function fetchBalance(address, fetchImpl) {
  const clean = assertTestnet(address);
  const url = TN10 + "/addresses/" + encodeURIComponent(clean) + "/balance";
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("Testnet-10 did not return a balance.");
  return parseBalance(await res.json());
}

export function parseKoniTip(dag, block) {
  const blue = String((dag && (dag.virtualDaaScore || dag.blueScore)) || "");
  const txs = [];
  const list = block && Array.isArray(block.transactions) ? block.transactions : [];
  for (const tx of list) {
    const id = String((tx && tx.verboseData && tx.verboseData.transactionId) || "");
    if (!/^[0-9a-f]{64}$/.test(id)) continue;
    let sompi = 0n;
    for (const out of tx.outputs || []) {
      try { sompi += BigInt(out.amount || 0); } catch { /* skip a bad output */ }
    }
    txs.push({ id, sompi: sompi.toString() });
    if (txs.length >= 4) break;
  }
  return { blue, txs };
}

export async function fetchKoni(fetchImpl) {
  const dagRes = await fetchImpl(TN10 + "/info/blockdag", { headers: { accept: "application/json" } });
  if (!dagRes.ok) throw new Error("Testnet-10 did not return the tip.");
  const dag = await dagRes.json();
  const sink = String((dag && dag.sink) || "");
  if (!/^[0-9a-f]{64}$/.test(sink)) throw new Error("Testnet-10 tip was empty.");
  const blockRes = await fetchImpl(TN10 + "/blocks/" + sink, { headers: { accept: "application/json" } });
  if (!blockRes.ok) throw new Error("Testnet-10 did not return that block.");
  const block = await blockRes.json();
  return { ok: true, network: "testnet-10", ...parseKoniTip(dag, block) };
}

export async function fetchTx(txid, fetchImpl) {
  const id = String(txid || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("Paste the 64-character transaction id.");
  const url = TN10 + "/transactions/" + id + "?resolve_previous_outpoints=light";
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (res.status === 404) throw new Error("That transaction is not on Testnet 10 yet.");
  if (!res.ok) throw new Error("Testnet-10 did not return that transaction.");
  return res.json();
}

export async function resolveName(name, fetchImpl) {
  const domain = normalizeKasName(name);
  if (!domain) throw new Error("Type a .kas name, letters and numbers, or keep the kaspatest address.");
  const url = KNS + "/" + encodeURIComponent(domain) + "/owner";
  const res = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok && !body) throw new Error("KNS did not answer.");
  return parseKns(body, domain);
}

export function paymentFromTx(tx, from, need) {
  return extractPayment(tx, { from, to: RESERVE, need });
}
