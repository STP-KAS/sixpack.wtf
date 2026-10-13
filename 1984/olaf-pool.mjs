/** Shielded OLAF notes for the 1984 square.
 * A note is a private dollar claim. The public pool keeps the commitment, the
 * ciphertext, and, once spent, the nullifier. The spend key never belongs in the pool.
 * The till can check a witness. It must not store one.
 * Shape follows the Kaspa Privacy Initiative note, nullifier, and reserve model,
 * the Zcash rule that a nullifier is a one-time PRF of the spend key and the note salt,
 * and an ECDH plus HKDF plus AES-GCM seal to the recipient key.
 * This is not a zero-knowledge proof and not a settlement covenant.
 */

import { blake3Hex } from "./kcc20.mjs";

const MAX_NOTES = 8000;
const text = new TextEncoder();

export function emptyPool() {
  return { version: 2, cents: "0", sompi: "0", notes: [], nullifiers: [], pending: {} };
}

function bytesToHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomHex(bytes = 32) {
  if (!globalThis.crypto || !globalThis.crypto.getRandomValues) {
    throw new Error("This browser cannot seal an OLAF note.");
  }
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

function hex64(value, label) {
  const got = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) throw new Error(label + " is not 32 bytes.");
  return got;
}

export function publicKeyHex(value) {
  const got = String(value || "").trim().toLowerCase();
  if (!/^04[0-9a-f]{128}$/.test(got)) throw new Error("The receive key is not a P-256 public key.");
  return got;
}

function u64(value) {
  const n = BigInt(value);
  if (n < 0n || n > 0xffffffffffffffffn) throw new Error("OLAF amount is out of range.");
  return n.toString(16).padStart(16, "0");
}

export function ownerTagOf(spendSecret) {
  return blake3Hex(text.encode("olaf-own-v2|" + hex64(spendSecret, "The spend key")));
}

export function commitmentOf(note) {
  return blake3Hex(text.encode(
    "olaf-cm-v2|" + hex64(note.ownerTag, "The receive tag") + "|" +
    u64(note.cents) + "|" + u64(note.sompi) + "|" +
    hex64(note.rho, "The note salt") + "|" + hex64(note.rcm, "The note blind")
  ));
}

export function nullifierOf(spendSecret, rho) {
  return blake3Hex(text.encode("olaf-nf-v2|" + hex64(spendSecret, "The spend key") + "|" + hex64(rho, "The note salt")));
}

export function receiveCodeOf(publicKey, ownerTag) {
  return "olaf1" + publicKeyHex(publicKey) + hex64(ownerTag, "The receive tag");
}

export function parseReceiveCode(raw) {
  const code = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!/^olaf104[0-9a-f]{128}[0-9a-f]{64}$/.test(code)) {
    throw new Error("Paste an OLAF receive code. It starts with olaf1.");
  }
  return { publicKeyHex: code.slice(5, 135), ownerTag: code.slice(135) };
}

/** Dust sompi stays on the burned side. The change note keeps a whole dollar count. */
export function changeSompi(inputSompi, inputCents, changeCents) {
  const inn = BigInt(inputSompi);
  const total = BigInt(inputCents);
  const change = BigInt(changeCents);
  if (change === 0n) return 0n;
  if (change === total) return inn;
  if (total <= 0n || change < 0n || change > total) throw new Error("OLAF change does not match the notes.");
  return (inn * change) / total;
}

function sealFields(note) {
  const iv = String(note.iv || "").trim().toLowerCase();
  const ciphertext = String(note.ciphertext || "").trim().toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(iv)) throw new Error("The note seal is short.");
  if (!/^[0-9a-f]+$/.test(ciphertext) || ciphertext.length < 32 || ciphertext.length > 2048 || ciphertext.length % 2 !== 0) {
    throw new Error("The note seal is short.");
  }
  return {
    commitment: hex64(note.commitment, "The commitment"),
    ephPub: publicKeyHex(note.ephPub),
    iv,
    ciphertext,
  };
}

function publicNote(note, expectCents, expectSompi) {
  if (!note || !note.witness) throw new Error("Shielding OLAF needs the note from this browser.");
  let gotCents;
  let gotSompi;
  try {
    gotCents = BigInt(note.witness.cents);
    gotSompi = BigInt(note.witness.sompi);
  } catch {
    throw new Error("The note amount is not a whole number.");
  }
  const wantCents = BigInt(expectCents);
  const wantSompi = BigInt(expectSompi);
  if (gotCents !== wantCents || gotSompi !== wantSompi) {
    throw new Error("The shielded note does not match this payment. cents " + wantCents.toString() + " sompi " + wantSompi.toString());
  }
  if (gotCents <= 0n || gotSompi <= 0n) throw new Error("A shielded note needs a dollar amount and tKAS backing.");
  const ownerTag = hex64(note.witness.ownerTag, "The receive tag");
  const rho = hex64(note.witness.rho, "The note salt");
  const rcm = hex64(note.witness.rcm, "The note blind");
  const stored = sealFields(note);
  const expect = commitmentOf({ ownerTag, cents: gotCents, sompi: gotSompi, rho, rcm });
  if (stored.commitment !== expect) throw new Error("The note does not match its commitment.");
  return stored;
}

export function assertDepositNote(note, cents, sompi) {
  return publicNote(note, cents, sompi);
}

function cleanPending(raw) {
  const pending = raw && typeof raw.pending === "object" && !Array.isArray(raw.pending) ? raw.pending : {};
  const out = {};
  for (const key of Object.keys(pending)) {
    const txid = String(key).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(txid) || out[txid]) throw new Error("A waiting OLAF payment is not a transaction id.");
    const row = pending[key];
    const cents = row && String(row.cents || "");
    const sompi = row && String(row.sompi || "");
    if (!row || typeof row.address !== "string" || !row.address || !/^[0-9]+$/.test(cents) || !/^[0-9]+$/.test(sompi)) {
      throw new Error("A waiting OLAF payment is unreadable.");
    }
    out[txid] = { address: row.address, cents, sompi };
  }
  return out;
}

export function cleanPool(raw) {
  const pool = emptyPool();
  const cents = String(raw && raw.cents != null ? raw.cents : "0");
  const sompi = String(raw && raw.sompi != null ? raw.sompi : "0");
  if (!/^[0-9]+$/.test(cents) || !/^[0-9]+$/.test(sompi)) throw new Error("The shielded pool totals are not numbers.");
  pool.cents = cents;
  pool.sompi = sompi;
  const notes = raw && Array.isArray(raw.notes) ? raw.notes : [];
  if (notes.length > MAX_NOTES) throw new Error("The shielded pool is full.");
  const seen = new Set();
  for (const row of notes) {
    const stored = sealFields(row);
    if (seen.has(stored.commitment)) throw new Error("The shielded pool repeats a note.");
    seen.add(stored.commitment);
    pool.notes.push(stored);
  }
  const nullifiers = raw && Array.isArray(raw.nullifiers) ? raw.nullifiers : [];
  const spent = new Set();
  for (const item of nullifiers) {
    const nf = hex64(item, "The nullifier");
    if (spent.has(nf)) throw new Error("The shielded pool repeats a nullifier.");
    spent.add(nf);
    pool.nullifiers.push(nf);
  }
  pool.pending = cleanPending(raw);
  return pool;
}

export function publicPool(raw) {
  const pool = raw && raw.version === 2 ? raw : emptyPool();
  let pendingCents = 0n;
  let pendingSompi = 0n;
  const pending = pool.pending && typeof pool.pending === "object" ? pool.pending : {};
  for (const row of Object.values(pending)) {
    pendingCents += BigInt(row.cents || 0);
    pendingSompi += BigInt(row.sompi || 0);
  }
  const notes = Array.isArray(pool.notes) ? pool.notes : [];
  return {
    version: 2,
    cents: String(pool.cents || "0"),
    sompi: String(pool.sompi || "0"),
    pendingCents: pendingCents.toString(),
    pendingSompi: pendingSompi.toString(),
    pendingCount: Object.keys(pending).length,
    notes: notes.map((row) => ({
      commitment: row.commitment,
      ephPub: row.ephPub,
      iv: row.iv,
      ciphertext: row.ciphertext,
    })),
    nullifiers: Array.isArray(pool.nullifiers) ? pool.nullifiers.slice() : [],
  };
}

function roomFor(pool, count) {
  if (pool.notes.length + count > MAX_NOTES) throw new Error("The shielded pool is full.");
}

export function depositNote(pool, note, cents, sompi) {
  const stored = publicNote(note, cents, sompi);
  if (pool.notes.some((item) => item.commitment === stored.commitment)) {
    throw new Error("That note is already in the pool.");
  }
  roomFor(pool, 1);
  pool.notes.push(stored);
  pool.cents = String(BigInt(pool.cents) + BigInt(cents));
  pool.sompi = String(BigInt(pool.sompi) + BigInt(sompi));
}

function readInputs(pool, inputs) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 8) {
    throw new Error("A shielded spend uses 1 to 8 notes.");
  }
  const spent = new Set(pool.nullifiers);
  const have = new Set(pool.notes.map((row) => row.commitment));
  const opened = [];
  const seenC = new Set();
  const seenN = new Set();
  for (const row of inputs) {
    const commitment = hex64(row && row.commitment, "The commitment");
    if (seenC.has(commitment)) throw new Error("The same note is listed twice.");
    seenC.add(commitment);
    if (!have.has(commitment)) throw new Error("That note is not in the pool.");
    const witness = row.witness || {};
    const secret = hex64(witness.spendSecret, "The spend key");
    const ownerTag = ownerTagOf(secret);
    const rho = hex64(witness.rho, "The note salt");
    const rcm = hex64(witness.rcm, "The note blind");
    let cents;
    let sompi;
    try {
      cents = BigInt(witness.cents);
      sompi = BigInt(witness.sompi);
    } catch {
      throw new Error("The note amount is not a whole number.");
    }
    if (cents <= 0n || sompi <= 0n) throw new Error("A shielded note needs a dollar amount and tKAS backing.");
    if (commitmentOf({ ownerTag, cents, sompi, rho, rcm }) !== commitment) {
      throw new Error("The note does not match its commitment.");
    }
    const nullifier = nullifierOf(secret, rho);
    if (hex64(row.nullifier, "The nullifier") !== nullifier) throw new Error("The nullifier does not match the note.");
    if (spent.has(nullifier) || seenN.has(nullifier)) throw new Error("That note was already spent.");
    seenN.add(nullifier);
    opened.push({ commitment, nullifier, cents, sompi });
  }
  return opened;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0n);
}

export function moveNotes(pool, inputs, outputs) {
  const opened = readInputs(pool, inputs);
  if (!Array.isArray(outputs) || outputs.length < 1 || outputs.length > 8) {
    throw new Error("A shielded send writes 1 to 8 notes.");
  }
  const rows = outputs.map((row) => publicNote(row, row.witness.cents, row.witness.sompi));
  const seen = new Set(pool.notes.map((row) => row.commitment));
  for (const row of rows) {
    if (seen.has(row.commitment)) throw new Error("That note is already in the pool.");
    seen.add(row.commitment);
  }
  const outCents = outputs.reduce((total, row) => total + BigInt(row.witness.cents), 0n);
  const outSompi = outputs.reduce((total, row) => total + BigInt(row.witness.sompi), 0n);
  if (sum(opened, "cents") !== outCents || sum(opened, "sompi") !== outSompi) {
    throw new Error("The shielded notes do not balance.");
  }
  roomFor(pool, rows.length);
  for (const row of rows) pool.notes.push(row);
  for (const row of opened) pool.nullifiers.push(row.nullifier);
}

export function burnNotes(pool, inputs, change, priceCents) {
  const opened = readInputs(pool, inputs);
  const price = BigInt(priceCents);
  const inCents = sum(opened, "cents");
  const inSompi = sum(opened, "sompi");
  if (price <= 0n || inCents < price) throw new Error("Not enough OLAF.");
  const changeCents = inCents - price;
  const nextSompi = changeSompi(inSompi, inCents, changeCents);
  let stored = null;
  if (changeCents === 0n) {
    if (change) throw new Error("An exact OLAF spend has no change note.");
  } else {
    if (!change) throw new Error("That OLAF spend needs a change note.");
    if (nextSompi <= 0n) throw new Error("That split leaves an unbacked note.");
    stored = publicNote(change, changeCents, nextSompi);
    if (pool.notes.some((row) => row.commitment === stored.commitment)) {
      throw new Error("That note is already in the pool.");
    }
  }
  const burnedSompi = inSompi - nextSompi;
  if (BigInt(pool.cents) < price || BigInt(pool.sompi) < burnedSompi) {
    throw new Error("The shielded pool cannot cover this spend.");
  }
  if (stored) roomFor(pool, 1);
  if (stored) pool.notes.push(stored);
  for (const row of opened) pool.nullifiers.push(row.nullifier);
  pool.cents = String(BigInt(pool.cents) - price);
  pool.sompi = String(BigInt(pool.sompi) - burnedSompi);
}

async function aesKey(sharedBits, ephPub) {
  const ikm = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: ephPub,
    info: text.encode("olaf-note-v2"),
  }, ikm, 256);
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function sealTo(publicKey, payload) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const recipient = await crypto.subtle.importKey(
    "raw",
    hexToBytes(publicKeyHex(publicKey)),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: recipient }, pair.privateKey, 256);
  const ephPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const key = await aesKey(shared, ephPub);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    text.encode(JSON.stringify(payload))
  ));
  return { ephPub: bytesToHex(ephPub), iv: bytesToHex(iv), ciphertext: bytesToHex(ciphertext) };
}

export async function openSeal(privateJwk, row) {
  try {
    const priv = await crypto.subtle.importKey(
      "jwk",
      privateJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );
    const ephPub = hexToBytes(publicKeyHex(row.ephPub));
    const pub = await crypto.subtle.importKey("raw", ephPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
    const key = await aesKey(shared, ephPub);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: hexToBytes(String(row.iv || "")) },
      key,
      hexToBytes(String(row.ciphertext || ""))
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain));
    if (!parsed || typeof parsed.c !== "string" || typeof parsed.s !== "string" || typeof parsed.rho !== "string" || typeof parsed.rcm !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function createIdentity() {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error("This browser cannot seal an OLAF note.");
  const spendSecret = randomHex(32);
  const ownerTag = ownerTagOf(spendSecret);
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = bytesToHex(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { spendSecret, ownerTag, publicKeyHex: publicKey, privateJwk, code: receiveCodeOf(publicKey, ownerTag) };
}

export async function createDepositNote(identity, cents, sompi) {
  return createOutputNote(identity, cents, sompi);
}

export async function createOutputNote(recipient, cents, sompi) {
  const rho = randomHex(32);
  const rcm = randomHex(32);
  const witness = {
    ownerTag: recipient.ownerTag,
    cents: String(BigInt(cents)),
    sompi: String(BigInt(sompi)),
    rho,
    rcm,
  };
  const sealed = await sealTo(recipient.publicKeyHex, { c: witness.cents, s: witness.sompi, rho, rcm });
  return { commitment: commitmentOf(witness), ...sealed, witness };
}

export async function scanNotes(identity, notes, nullifiers) {
  const spent = new Set(nullifiers || []);
  const mine = [];
  for (const row of notes || []) {
    const plain = await openSeal(identity.privateJwk, row);
    if (!plain) continue;
    const opened = {
      ownerTag: identity.ownerTag,
      cents: plain.c,
      sompi: plain.s,
      rho: plain.rho,
      rcm: plain.rcm,
    };
    if (commitmentOf(opened) !== row.commitment) continue;
    const nullifier = nullifierOf(identity.spendSecret, plain.rho);
    if (spent.has(nullifier)) continue;
    mine.push({ ...opened, commitment: row.commitment, nullifier });
  }
  return mine;
}

function coverNotes(notes, need) {
  const sorted = (notes || []).slice().sort((a, b) => (BigInt(b.cents) > BigInt(a.cents) ? 1 : BigInt(b.cents) < BigInt(a.cents) ? -1 : 0));
  const picked = [];
  let have = 0n;
  for (const note of sorted) {
    if (have >= need) break;
    picked.push(note);
    have += BigInt(note.cents);
    if (picked.length === 8) break;
  }
  if (have < need) return null;
  return picked;
}

function inputOf(identity, note) {
  return {
    commitment: note.commitment,
    nullifier: nullifierOf(identity.spendSecret, note.rho),
    witness: {
      spendSecret: identity.spendSecret,
      cents: String(BigInt(note.cents)),
      sompi: String(BigInt(note.sompi)),
      rho: note.rho,
      rcm: note.rcm,
    },
  };
}

export async function planOlafSpend(identity, notes, priceCents) {
  const price = BigInt(priceCents);
  const picked = coverNotes(notes, price);
  if (!picked) throw new Error("Not enough OLAF.");
  const inCents = picked.reduce((total, note) => total + BigInt(note.cents), 0n);
  const inSompi = picked.reduce((total, note) => total + BigInt(note.sompi), 0n);
  const changeCents = inCents - price;
  const inputs = picked.map((note) => inputOf(identity, note));
  if (changeCents === 0n) return { inputs, change: null };
  const sompi = changeSompi(inSompi, inCents, changeCents);
  if (sompi <= 0n) throw new Error("That split leaves an unbacked note.");
  return { inputs, change: await createOutputNote(identity, changeCents, sompi) };
}

export async function planOlafSend(identity, notes, sendCents, receiveCode) {
  const dest = parseReceiveCode(receiveCode);
  const send = BigInt(sendCents);
  if (send <= 0n) throw new Error("Type an amount like 1.00.");
  const picked = coverNotes(notes, send);
  if (!picked) throw new Error("Not enough OLAF.");
  const inCents = picked.reduce((total, note) => total + BigInt(note.cents), 0n);
  const inSompi = picked.reduce((total, note) => total + BigInt(note.sompi), 0n);
  const changeCents = inCents - send;
  const inputs = picked.map((note) => inputOf(identity, note));
  let recipientSompi;
  const outputs = [];
  if (changeCents === 0n) {
    recipientSompi = inSompi;
  } else {
    const changeS = changeSompi(inSompi, inCents, changeCents);
    recipientSompi = inSompi - changeS;
    if (recipientSompi <= 0n || changeS <= 0n) throw new Error("That amount is too small to shield.");
    outputs.push(await createOutputNote(identity, changeCents, changeS));
  }
  outputs.unshift(await createOutputNote(dest, send, recipientSompi));
  return { inputs, outputs };
}
