/** OLAF on the 1984 square. A ledger token. Not a covenant. Not Kaspa core. */

export const OLAF_PAY_LINE =
  "Swap tKAS for OLAF at the live KAS quote. The supply is fixed. The tKAS goes to the reserve. OLAF does not lock that tKAS and does not redeem.";

export const OLAF_NOTE = Object.freeze({
  title: "OLAF",
  lines: Object.freeze([
    "OLAF is a fixed supply on this Testnet-10 ledger. The whole supply is minted once. After that the book only transfers.",
    "The first holder is the square reserve, the same operator the other funded rows already use. There is no second mint and no public mint.",
    "The supply is 1,000,000.00 OLAF. 100 OLAF units are 1.00 OLAF. That is the same cent scale as a shop price and as POCencept and KUSDT. It is not sompi.",
    "tKAS still moves on Testnet-10 and can lock in a SquarePeg covenant. POCencept and KUSDT stay the two ledger tags on that lock. Swap tKAS for OLAF at the live KAS quote. The tKAS goes to the reserve. OLAF does not lock that tKAS, does not redeem, and does not pass through SquarePeg.",
    "The miner fee is still KAS. OLAF is not a dollar and not a stable. The buy uses the KCC-20 Last Call standard transfer. The public-mint allowance is exhausted, so remaining is 0. KCC-20 is Last Call, not Final. No covenant was broadcast.",
    "This is not the Kaspa Privacy Initiative. That work rejects new tokens. This is not Kaspa core. It is an experiment on the 1984 square.",
    "A receipt can later name a Based Apps lane. This book does not open that lane.",
  ]),
});

export const OLAF_RUN = Object.freeze([
  "From the sixpack.wtf repo: node --test 1984/olaf.test.mjs",
  "GET /api/1984/olaf reads the fixed supply. The square does not need to be open for that read.",
  "A transfer is POST /api/1984/olaf/send with to and amount. Amount is whole cents. 100 is 1.00 OLAF.",
  "A shop pay is POST /api/1984/spend with rail olaf, shop, and sku. No txid. Guest and pasted-address tabs use the same spend route and their test-tab token.",
  "A buy is POST /api/1984/convert with rail olaf and the txid of tKAS sent to the reserve. A funded test tab uses POST /api/1984/guest/convert with rail olaf and amount. The quote is the live KAS price.",
  "tKAS still settles through the existing payment check. POCencept and KUSDT still use the SquarePeg path where a lock already fits. OLAF does not.",
  "Mainnet addresses are refused. An unset SQUARE_OPEN stays on the square's existing open rule. SQUARE_OPEN=0 still refuses writes.",
]);
