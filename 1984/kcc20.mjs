/** KCC-20 Final checks. kaspanet/kccs main 1ed87aef (KCC-1 Final #39).
 * KCC-20 Final is the parent commit 9dec4a04 (#41, 21 Oct 2026).
 * kcc-0020.md changed only the Status line between Last Call 3fbec524 and that Final commit.
 * POCencept and KUSDT have Testnet-10 covenants. An open name on the square ledger is still that ledger.
 * These checks are not themselves the deployed covenant and not a spendable L1 stable.
 *
 * Schnorr signatures in the conformance vectors are placeholder bytes.
 * This module does not verify them. A caller passes signatureVerified, or the
 * check rejects. On a covenant, the program verifies the signature.
 * See kcc-0020.md §5 and kcc-0020/vectors/conformance.json (copied beside this file).
 */

export const TRANSFER_TAG = "79c71c23";
export const DELEGATOR_TAG = "fd3ef14a";

/** Published extension constants. The preimage was not recovered. Same commitment, same fungible class. */
export const POC_EXTENSION = "3e42b04d79af7dad33a257e74b37cc6e51f8164660c60028dba71f781ac41745";
export const KUSDT_EXTENSION = "70ebf3f244d85e42bab5375e47d5be22038d1281c47f8b137aa36b5c9b9bb63e";
export const KUSDT_FROZEN_EXTENSION = "9570434600bd7f269e2f58087be669f3c34679bacdceee2f7fe551f24101de96";

/** Testnet-10 covenant ids, 21 Oct 2026. Shop locks stay SquarePeg. */
export const POC_COVENANT_ID = "7b52b945abaa17bc6b5cb12f2860e471726f01cb30354fd2d14ac89a608c6b7d";
export const KUSDT_COVENANT_ID = "4d916665551d11c90765831c6afefb047c6c473a9cbe3e20cf262f9ed3a425d6";

export function extensionFor(rail, frozen) {
  if (rail === "poc") return POC_EXTENSION;
  if (rail === "kusdt") return frozen ? KUSDT_FROZEN_EXTENSION : KUSDT_EXTENSION;
  throw new Error("POCencept and KUSDT are the token rails.");
}

/** First eight bytes are a KCC-1 signed-magnitude int. Negative counts as zero. */
export function effectiveThreshold(guardHex) {
  const hex = String(guardHex || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("A borrow guard is 32 bytes.");
  const bytes = [];
  for (let i = 0; i < 8; i += 1) bytes.push(Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  let mag = 0n;
  for (let i = 0; i < 8; i += 1) mag |= BigInt(bytes[i]) << (8n * BigInt(i));
  const negative = (bytes[7] & 0x80) !== 0;
  const magnitude = mag & ((1n << 63n) - 1n);
  const decoded = negative ? -magnitude : magnitude;
  return decoded > 0n ? decoded : 0n;
}

function same(left, right, label) {
  if (left !== right) throw new Error(label);
}

function tokenAmount(value) {
  if (typeof value !== "bigint") throw new Error("A token amount is an integer.");
  return value;
}

function guardHex(value) {
  const hex = String(value || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("A borrow guard is 32 bytes.");
  return hex;
}

function decodeHex(hex) {
  const text = String(hex || "").toLowerCase();
  if (!/^[0-9a-f]*$/.test(text) || text.length % 2) throw new Error("A witness is hex.");
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/** kcc-0020.md §2. The first witness byte is 0x00 or 0x01. Any other byte is invalid. */
export function witnessPath(witnessHex) {
  const bytes = decodeHex(witnessHex);
  if (!bytes.length) throw new Error("A witness starts with a path byte.");
  const path = bytes[0];
  if (path !== 0x00 && path !== 0x01) throw new Error("That witness path is not in KCC-20.");
  return path;
}

/**
 * kcc-0020.md §5. One borrowed state, not the whole family.
 * The official vectors increase this state and do not list the funding inputs.
 * A real transaction also calls familyTotal so the family amount stays the same.
 * Pass signatureVerified: true only after a real Schnorr check. This file does not verify signatures.
 * kasSompi on both states checks the KAS output rule. Omit both when there is no output to check.
 */
export function borrowedReceive(leader, next, options = {}) {
  if (options.leader === false) throw new Error("A borrowed receive is the leader only.");
  if (options.successorIndex != null && options.successorIndex !== 0) {
    throw new Error("The borrowed successor is next_states[0].");
  }
  if (options.borrowCount != null && options.borrowCount !== 1) {
    throw new Error("A family has at most one borrowed receive.");
  }
  const scheme = leader.borrowScheme;
  if (scheme === 0x00) throw new Error("Borrowing is disabled.");
  if (scheme !== 0x01 && scheme !== 0x02 && scheme !== 0x03) {
    throw new Error("That borrow scheme is not in KCC-20.");
  }
  const leaderAmount = tokenAmount(leader.amount);
  const nextAmount = tokenAmount(next.amount);
  if (leaderAmount < 0n || nextAmount < 0n) throw new Error("A token amount stays non-negative.");
  const leaderGuard = guardHex(leader.borrowGuard);
  const pathBytes = decodeHex(options.witness == null ? "01" : options.witness);
  if (pathBytes[0] !== 0x01) throw new Error("A borrowed receive uses witness path 0x01.");
  const borrowWitness = pathBytes.subarray(1);
  let threshold = 0n;
  let nextGuard = leaderGuard;
  if (scheme === 0x01) {
    if (borrowWitness.length !== 0) throw new Error("An amount-threshold borrow witness is empty.");
    threshold = effectiveThreshold(leaderGuard);
  } else if (scheme === 0x02) {
    if (borrowWitness.length !== 65) throw new Error("A schnorr borrow witness is 65 bytes.");
    if (options.signatureVerified !== true) throw new Error("The borrow signature is not verified off-chain.");
  } else {
    if (borrowWitness.length !== 129) throw new Error("A hash-chain borrow witness is 129 bytes.");
    const revealed = borrowWitness.subarray(0, 32);
    const pubkey = borrowWitness.subarray(32, 64);
    const link = new Uint8Array(64);
    link.set(revealed);
    link.set(pubkey, 32);
    if (blake3Hex(link) !== leaderGuard) throw new Error("The revealed link does not match the borrow guard.");
    nextGuard = bytesHex(revealed);
    if (options.signatureVerified !== true) throw new Error("The borrow signature is not verified off-chain.");
  }
  if (nextAmount - leaderAmount <= threshold) throw new Error("A borrow has to increase the amount.");
  same(guardHex(next.borrowGuard), nextGuard, "A borrowed receive keeps the borrow guard.");
  same(next.owner, leader.owner, "A borrowed receive keeps the owner.");
  same(next.ownerScheme, leader.ownerScheme, "A borrowed receive keeps the owner scheme.");
  same(next.borrowScheme, leader.borrowScheme, "A borrowed receive keeps the borrow scheme.");
  same(next.extension, leader.extension, "A borrowed receive keeps the extension commitment.");
  if (leader.kasSompi != null || next.kasSompi != null) {
    if (typeof leader.kasSompi !== "bigint" || typeof next.kasSompi !== "bigint") {
      throw new Error("A KAS value is an integer number of sompi.");
    }
    if (next.kasSompi < leader.kasSompi) throw new Error("A borrowed receive keeps the KAS value.");
  }
  if (options.familyInputs && options.familyOutputs) familyTotal(options.familyInputs, options.familyOutputs);
}

/** §2 MAY. This checker enforces the cap. It is not a consensus rule by itself. */
export const MAX_TOKEN_TOTAL = (1n << 63n) - 1n;

/** kcc-0020.md §5. The leader preserves the total token amount across the family. */
export function familyTotal(inputs, outputs) {
  if (!inputs?.length || !outputs?.length) throw new Error("A token family needs inputs and outputs.");
  const extension = inputs[0].extension;
  let inn = 0n;
  let out = 0n;
  for (const row of inputs) {
    const amount = tokenAmount(row.amount);
    if (amount < 0n) throw new Error("A token amount stays non-negative.");
    same(row.extension, extension, "A standard transfer keeps one extension commitment.");
    inn += amount;
  }
  for (const row of outputs) {
    const amount = tokenAmount(row.amount);
    if (amount < 0n) throw new Error("A token amount stays non-negative.");
    same(row.extension, extension, "A standard transfer keeps one extension commitment.");
    out += amount;
  }
  if (inn > MAX_TOKEN_TOTAL) throw new Error("A transfer stays within 2^63-1.");
  if (inn !== out) throw new Error("A standard transfer keeps the total amount.");
}

const BLAKE3_IV = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const BLAKE3_PERM = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

function rotr(value, bits) {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function blake3G(state, a, b, c, d, mx, my) {
  state[a] = (state[a] + state[b] + mx) >>> 0;
  state[d] = rotr(state[d] ^ state[a], 16);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotr(state[b] ^ state[c], 12);
  state[a] = (state[a] + state[b] + my) >>> 0;
  state[d] = rotr(state[d] ^ state[a], 8);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotr(state[b] ^ state[c], 7);
}

function blake3Compress(cv, block, counter, blockLen, flags) {
  const words = new Array(16);
  for (let i = 0; i < 16; i += 1) {
    words[i] = block[i * 4] | (block[i * 4 + 1] << 8) | (block[i * 4 + 2] << 16) | (block[i * 4 + 3] << 24);
  }
  const state = cv.slice(0, 8).concat(BLAKE3_IV.slice(0, 4), [
    counter >>> 0,
    Math.floor(counter / 2 ** 32) >>> 0,
    blockLen,
    flags,
  ]);
  const msg = words.slice();
  for (let round = 0; round < 7; round += 1) {
    blake3G(state, 0, 4, 8, 12, msg[0], msg[1]);
    blake3G(state, 1, 5, 9, 13, msg[2], msg[3]);
    blake3G(state, 2, 6, 10, 14, msg[4], msg[5]);
    blake3G(state, 3, 7, 11, 15, msg[6], msg[7]);
    blake3G(state, 0, 5, 10, 15, msg[8], msg[9]);
    blake3G(state, 1, 6, 11, 12, msg[10], msg[11]);
    blake3G(state, 2, 7, 8, 13, msg[12], msg[13]);
    blake3G(state, 3, 4, 9, 14, msg[14], msg[15]);
    if (round === 6) break;
    const next = new Array(16);
    for (let i = 0; i < 16; i += 1) next[i] = msg[BLAKE3_PERM[i]];
    for (let i = 0; i < 16; i += 1) msg[i] = next[i];
  }
  const out = new Array(16);
  for (let i = 0; i < 8; i += 1) {
    out[i] = (state[i] ^ state[i + 8]) >>> 0;
    out[i + 8] = (state[i + 8] ^ cv[i]) >>> 0;
  }
  return out;
}

/** Unkeyed BLAKE3, 32 bytes, lowercase hex. Token names are short, so one chunk is enough. */
export function blake3Hex(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (data.length > 1024) throw new Error("This hash is for a short token name.");
  const cv = BLAKE3_IV.slice();
  const blocks = Math.max(1, Math.ceil(data.length / 64));
  let hash = cv;
  for (let i = 0; i < blocks; i += 1) {
    const block = new Uint8Array(64);
    const start = i * 64;
    block.set(data.subarray(start, Math.min(data.length, start + 64)));
    const blockLen = Math.min(64, data.length - start);
    let flags = 0;
    if (i === 0) flags |= 1;
    if (i === blocks - 1) flags |= 2 | 8;
    const out = blake3Compress(cv, block, 0, blockLen < 0 ? 0 : blockLen, flags);
    hash = out;
    for (let w = 0; w < 8; w += 1) cv[w] = out[w];
  }
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    const word = hash[i] >>> 0;
    hex += (word & 0xff).toString(16).padStart(2, "0");
    hex += ((word >>> 8) & 0xff).toString(16).padStart(2, "0");
    hex += ((word >>> 16) & 0xff).toString(16).padStart(2, "0");
    hex += ((word >>> 24) & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}

const RESERVED_TICKS = new Set(["POC", "POCEPT", "POCENCEPT", "KUSDT", "KAS", "TKAS", "USDT", "1984"]);

/** OLAF is a shielded note. The open mint desk cannot mint it onto a public balance. */
export const OLAF_TICK = "OLAF";
/** Two decimals, the same cent scale as a shop price. 100 units are 1.00 OLAF. Not sompi. */
export const OLAF_DECIMALS = 2;
const FIXED_TICKS = new Set([OLAF_TICK]);

/** A mint name on this desk. Letters and digits, 1 to 12, starting with a letter. */
export function normalizeTick(name) {
  const tick = String(name || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,11}$/.test(tick)) {
    throw new Error("A token name is 1 to 12 letters and digits, and it starts with a letter.");
  }
  if (RESERVED_TICKS.has(tick)) throw new Error("That name is already a rail on this square.");
  if (FIXED_TICKS.has(tick)) throw new Error("OLAF is a shielded note. The mint desk does not mint it.");
  return tick;
}

/** Unkeyed BLAKE3 of OLAF. The mint desk rejects this name, so this hash is computed beside that check. */
export function olafExtension() {
  return blake3Hex(new TextEncoder().encode(OLAF_TICK));
}

/** Unkeyed BLAKE3 of the token name. The same name keeps the same extension. */
export function tokenExtension(name) {
  return blake3Hex(new TextEncoder().encode(normalizeTick(name)));
}

/**
 * Covenant-specific square credit. Not a KCC-20 operation and not a borrowed receive.
 * kcc-0020.md §4 allows a covenant-specific entrypoint. §5 says a borrowed receive
 * preserves the family's total amount, so it cannot mint. The owner and the extension
 * are the caller's labels. This rule only requires the holder's amount to rise.
 */
export function holderMint(before, after, extension, owner) {
  if (typeof extension !== "string" || !/^[0-9a-f]{64}$/.test(extension)) {
    throw new Error("An extension commitment is 32 bytes.");
  }
  if (owner == null || owner === "") throw new Error("A mint names an owner.");
  const from = tokenAmount(before);
  const to = tokenAmount(after);
  if (from < 0n || to < 0n) throw new Error("A token amount stays non-negative.");
  if (to <= from) throw new Error("A mint has to increase the amount.");
}

/**
 * Covenant-specific SquarePeg lock increase. Not a KCC-20 borrowed receive.
 * The tag amount has to rise. The lock still holds tKAS. KCC-20 does not define this rule.
 */
export function requireIncrease(before, after, extension = POC_EXTENSION) {
  if (extension !== POC_EXTENSION && extension !== KUSDT_EXTENSION && extension !== KUSDT_FROZEN_EXTENSION) {
    throw new Error("POCencept and KUSDT are the token rails.");
  }
  const from = tokenAmount(before);
  const to = tokenAmount(after);
  if (from < 0n || to < 0n) throw new Error("A token amount stays non-negative.");
  if (to <= from) throw new Error("A lock has to increase the amount.");
}

function ownerSchemeOk(row) {
  if (row.ownerScheme == null) return;
  if (!Number.isInteger(row.ownerScheme) || row.ownerScheme < 0x00 || row.ownerScheme > 0x04) {
    throw new Error("That owner scheme is not in KCC-20.");
  }
}

/**
 * kcc-0020.md §2. Default configuration is 3 inputs and 3 outputs.
 * A square ledger row that omits ownerScheme is not a full KCC20State.
 * The owner-scheme check runs when the field is present.
 * Pass options.witness to check the path byte. Path 0x00 is the normal transfer.
 */
export function standardTransfer(inputs, outputs, options = {}) {
  if (!inputs.length || !outputs.length) throw new Error("A standard transfer needs inputs and outputs.");
  if (inputs.length > 3 || outputs.length > 3) {
    throw new Error("A standard transfer stays within 3 inputs and 3 outputs.");
  }
  familyTotal(inputs, outputs);
  for (const row of outputs) ownerSchemeOk(row);
  if (options.witness != null) {
    if (witnessPath(options.witness) !== 0x00) throw new Error("A standard transfer uses witness path 0x00.");
  }
}
