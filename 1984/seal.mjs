/** Private Layer note. Ciphertext only. The public page stays readable.
 * A payload of 1024 bytes is the on-chain cut. Kaspa's standard transaction
 * mass cap is 100_000 and this pin counts one mass per serialized byte, so
 * 1024 bytes of payload stays far under that cap.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { assertTestnet } from "./money.mjs";

export const SEAL_HEADER = "spseal1:";
export const SEAL_PAYLOAD_MAX = 1024;
export const SEAL_PLAIN_MAX = 8000;
const OVERHEAD = 28;
export const SEAL_PLAIN_CHAIN = SEAL_PAYLOAD_MAX - SEAL_HEADER.length - OVERHEAD;

function keyFromSecret(secret) {
  return createHash("sha256").update("sixpack-layer-seal-v1\0").update(String(secret || "")).digest();
}

function pack(plain, secret) {
  const text = String(plain ?? "").replace(/\u0000/g, "");
  if (!String(secret || "")) throw new Error("The note needs a key.");
  if (!text.trim()) throw new Error("Type the private note.");
  const size = Buffer.byteLength(text, "utf8");
  if (size > SEAL_PLAIN_MAX) throw new Error("A private note is at most 8000 bytes.");
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { text, size, packed: Buffer.concat([iv, tag, body]) };
}

export function encryptNote(plain, secret) {
  const sealed = pack(plain, secret);
  const onChain = sealed.packed.length + Buffer.byteLength(SEAL_HEADER) <= SEAL_PAYLOAD_MAX;
  const payload = onChain ? Buffer.concat([Buffer.from(SEAL_HEADER), sealed.packed]) : null;
  return {
    cipher: sealed.packed.toString("base64"),
    bytes: sealed.packed.length,
    plainBytes: sealed.size,
    onChain,
    payload,
  };
}

export function decryptNote(cipher, secret) {
  try {
    const packed = Buffer.from(String(cipher || ""), "base64");
    if (packed.length < OVERHEAD + 1) throw new Error("short");
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const body = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The sealed note did not open.");
  }
}

export function publicSeal(seal) {
  if (!seal || typeof seal !== "object") return null;
  const cipher = typeof seal.cipher === "string" ? seal.cipher : "";
  if (!cipher) return null;
  return {
    dest: typeof seal.dest === "string" ? seal.dest : "",
    where: seal.where === "chain" ? "chain" : "desk",
    bytes: Number(seal.bytes) || 0,
    txid: typeof seal.txid === "string" ? seal.txid : "",
    deskHoldsKey: seal.deskHoldsKey === true,
    cipher,
    at: seal.at || 0,
  };
}

function clone(state) {
  return structuredClone(state);
}

function ensure(state, address) {
  if (!state.accounts) state.accounts = {};
  const key = address.toLowerCase();
  if (!state.accounts[key]) state.accounts[key] = { address };
  return state.accounts[key];
}

export function applySeal(state, input, now) {
  const address = assertTestnet(input.address);
  const dest = assertTestnet(input.dest || input.address);
  const cipher = String(input.cipher || "").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cipher) || cipher.length < 16 || cipher.length > 16000) {
    throw new Error("The sealed note did not come back as ciphertext.");
  }
  const where = input.where === "chain" ? "chain" : "desk";
  const txid = where === "chain" ? String(input.txid || "").trim().toLowerCase() : "";
  if (where === "chain" && !/^[0-9a-f]{64}$/.test(txid)) throw new Error("The payload did not return a transaction id.");
  const next = clone(state);
  const account = ensure(next, address);
  account.seal = {
    dest,
    where,
    bytes: Number(input.bytes) || 0,
    txid,
    deskHoldsKey: input.deskHoldsKey === true,
    cipher,
    at: now,
  };
  const held = account.seal.deskHoldsKey;
  let note;
  if (where === "chain") {
    note = "The note is ciphertext in a Testnet-10 payload. This desk holds the funded test key, so it can read it. No covenant was deployed.";
  } else if (held) {
    note = "The note is too large for a payload, so the ciphertext stays on this desk. This desk holds the funded test key, so it can read it. No covenant was deployed.";
  } else {
    note = "The ciphertext stays on this desk for this tab. It is labeled for the address you chose. This desk did not keep the passphrase and did not send tKAS. That address uses the KNS app for a name. No covenant was deployed.";
  }
  return {
    state: next,
    result: {
      ok: true,
      seal: publicSeal(account.seal),
      note,
      at: now,
    },
  };
}
