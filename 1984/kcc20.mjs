/** KCC-20 Last Call checks. kccs main 3fbec524, kcc-0020.md. Not Final.
 * The square is still its own ledger. These checks are the rules that ledger can apply.
 * They are not a deployed covenant and not a spendable L1 stable.
 */

export const TRANSFER_TAG = "79c71c23";
export const DELEGATOR_TAG = "fd3ef14a";

/** Unkeyed BLAKE3 of the label. Same commitment means the same fungible class. */
export const POC_EXTENSION = "3e42b04d79af7dad33a257e74b37cc6e51f8164660c60028dba71f781ac41745";
export const KUSDT_EXTENSION = "70ebf3f244d85e42bab5375e47d5be22038d1281c47f8b137aa36b5c9b9bb63e";
export const KUSDT_FROZEN_EXTENSION = "9570434600bd7f269e2f58087be669f3c34679bacdceee2f7fe551f24101de96";

const ZERO_GUARD = "00".repeat(32);

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

/** Section 5. A borrowed receive has to increase the amount. Owner and extension stay. */
export function borrowedReceive(leader, next) {
  const scheme = leader.borrowScheme;
  if (scheme === 0x00) throw new Error("Borrowing is disabled.");
  if (scheme !== 0x01 && scheme !== 0x02 && scheme !== 0x03) {
    throw new Error("That borrow scheme is not in KCC-20 Last Call.");
  }
  if (leader.amount < 0n || next.amount < 0n) throw new Error("A token amount stays non-negative.");
  let threshold = 0n;
  if (scheme === 0x01) {
    threshold = effectiveThreshold(leader.borrowGuard);
    same(next.borrowGuard, leader.borrowGuard, "A borrowed receive keeps the borrow guard.");
  }
  if (next.amount - leader.amount <= threshold) throw new Error("A borrow has to increase the amount.");
  same(next.owner, leader.owner, "A borrowed receive keeps the owner.");
  same(next.ownerScheme, leader.ownerScheme, "A borrowed receive keeps the owner scheme.");
  same(next.borrowScheme, leader.borrowScheme, "A borrowed receive keeps the borrow scheme.");
  same(next.extension, leader.extension, "A borrowed receive keeps the extension commitment.");
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

const RESERVED_TICKS = new Set(["POC", "POCEPT", "POCENCEPT", "KUSDT", "KAS", "TKAS"]);

/** A mint name on this desk. Letters and digits, 1 to 12, starting with a letter. */
export function normalizeTick(name) {
  const tick = String(name || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,11}$/.test(tick)) {
    throw new Error("A token name is 1 to 12 letters and digits, and it starts with a letter.");
  }
  if (RESERVED_TICKS.has(tick)) throw new Error("That name is already a rail on this square.");
  return tick;
}

/** Unkeyed BLAKE3 of the token name. The same name keeps the same extension. */
export function tokenExtension(name) {
  return blake3Hex(new TextEncoder().encode(normalizeTick(name)));
}

/** A mint increases the holder's amount. Owner and extension stay. */
export function holderMint(before, after, extension, owner) {
  borrowedReceive(
    {
      amount: before,
      owner,
      ownerScheme: 0x01,
      borrowScheme: 0x01,
      borrowGuard: ZERO_GUARD,
      extension,
    },
    {
      amount: after,
      owner,
      ownerScheme: 0x01,
      borrowScheme: 0x01,
      borrowGuard: ZERO_GUARD,
      extension,
    }
  );
}

/** The square's second lock is amount-threshold with a zero guard: any increase passes. */
export function requireIncrease(before, after) {
  borrowedReceive(
    {
      amount: before,
      owner: "square",
      ownerScheme: 0x01,
      borrowScheme: 0x01,
      borrowGuard: ZERO_GUARD,
      extension: POC_EXTENSION,
    },
    {
      amount: after,
      owner: "square",
      ownerScheme: 0x01,
      borrowScheme: 0x01,
      borrowGuard: ZERO_GUARD,
      extension: POC_EXTENSION,
    }
  );
}

/** Section 2. One family, one extension, the total amount stays. */
export function standardTransfer(inputs, outputs) {
  if (!inputs.length || !outputs.length) throw new Error("A standard transfer needs inputs and outputs.");
  const extension = inputs[0].extension;
  let inn = 0n;
  let out = 0n;
  for (const row of inputs) {
    if (row.amount < 0n) throw new Error("A token amount stays non-negative.");
    same(row.extension, extension, "A standard transfer keeps one extension commitment.");
    inn += row.amount;
  }
  for (const row of outputs) {
    if (row.amount < 0n) throw new Error("A token amount stays non-negative.");
    same(row.extension, extension, "A standard transfer keeps one extension commitment.");
    out += row.amount;
  }
  if (inn !== out) throw new Error("A standard transfer keeps the total amount.");
}
