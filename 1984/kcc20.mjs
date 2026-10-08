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
