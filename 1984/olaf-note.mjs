/** OLAF on the 1984 square. A shielded dollar note. Not a covenant. Not Kaspa core. */

export const OLAF_PAY_LINE =
  "1.00 OLAF is one dollar of tKAS at the quote when the note was made. POCencept and KUSDT are public tags and can redeem. This note cannot. The note is sealed to a key in this browser. A shop price is public. The till checks the note and does not keep the secret.";

export const OLAF_NOTE = Object.freeze({
  title: "OLAF",
  lines: Object.freeze([
    "OLAF is a shielded dollar note on this Testnet-10 square. 100 units are 1.00 OLAF, one dollar of tKAS at the quote when that note was made. A later quote does not reprice it. POCencept and KUSDT are public tags on a SquarePeg lock of tKAS. They are not dollars. OLAF is the dollar face, and it is private.",
    "The public book stores a commitment, a ciphertext, and a nullifier when the note is spent. It does not store the owner or the amount. The key stays in this browser. A POCencept or KUSDT balance is a number on the ledger. An OLAF balance is a note only this browser can open.",
    "tKAS paid in stays in the square reserve as backing. Shops, the cinema, a flight, gifts, SI stream, and the roadster can spend OLAF. The price of that purchase is public. The change note stays sealed. Hunt Hall does not take OLAF. A private send nullifies the old note and writes a new commitment. The pool total stays the same.",
    "This till checks the witness, then discards it. Other people see commitments, nullifiers, and ciphertexts. A quiet pool can still be guessed from timing. This is not a zero-knowledge proof and not a settlement covenant. The Kaspa Privacy Initiative is separate research: notes, nullifiers, and a reserve of native KAS. Its next step is a Based App proof on Testnet-10. This square does not run that proof. This is not Kaspa core.",
    "The old public 1,000,000.00 supply was deleted. New OLAF exists only as a note backed by tKAS paid in after that. There is no chain payout from this desk. Spending a note burns that dollar. The backing tKAS is not sent back to a wallet. You cannot redeem OLAF the way you redeem POCencept or KUSDT.",
    "POCencept and KUSDT stay the SquarePeg tags. They can redeem the lock. KUSDT can be frozen. POCencept cannot. OLAF does not pass through SquarePeg. KCC-20 is Final. The mint desk does not mint OLAF.",
    "Copy the receive code to take a private send. Copy the spend key if this browser is cleared. A lost key cannot be reset by the till.",
  ]),
});

export const OLAF_RUN = Object.freeze([
  "From the sixpack.wtf repo: node --test 1984/olaf.test.mjs",
  "GET /api/1984/olaf reads commitments, nullifiers, and ciphertexts. The square does not need to be open for that read.",
  "A private send is POST /api/1984/olaf/send with the opened notes and the new notes. The pool total stays the same. The book does not store the spend key.",
  "A shop pay is POST /api/1984/spend with rail olaf, the opened notes, and the change note. Guest and pasted-address tabs use the same spend route and their test-tab token.",
  "A shield is POST /api/1984/convert with rail olaf, the txid of tKAS sent to the reserve, and the note. A funded test tab uses POST /api/1984/guest/convert with rail olaf and amount. The quote is the live KAS price.",
  "tKAS still settles through the existing payment check. POCencept and KUSDT still use the SquarePeg path where a lock already fits. OLAF does not.",
  "Mainnet addresses are refused. An unset SQUARE_OPEN stays on the square's existing open rule. SQUARE_OPEN=0 still refuses writes.",
]);
