/** The three ways to pay, in the words the page shows. */

export const RAIL_NAMES = Object.freeze({
  poc: "POCencept stable",
  kusdt: "KUSDT stable",
  kas: "tKAS",
  olaf: "OLAF",
});

/** The rail a buy will use. An unknown choice is POCencept, the same default as the counter. OLAF stays OLAF. */
export function payRail(selected) {
  if (selected === "olaf") return "olaf";
  return selected === "kas" || selected === "kusdt" ? selected : "poc";
}

export const RAILS_NOTE = Object.freeze({
  title: "What each rail is",
  lines: Object.freeze([
    "tKAS is Testnet-10 KAS, the coin that moves. The miner fee is always KAS. Take it to the bank.",
    "POCencept is a public tag. It locks tKAS. Redeem returns that lock. It is not a dollar. It cannot be frozen.",
    "KUSDT is the other public tag. It locks tKAS the same way, and redeem returns that lock. The issuer can freeze the tag. A freeze blocks KUSDT. The locked tKAS can still be redeemed. It is not a dollar, and it is not Tether.",
    "OLAF is a shielded dollar note. 1.00 is one dollar of tKAS at the quote when the note was made. A later quote does not reprice it. The book does not show the owner. Redeem does not pay the tKAS back.",
    "A counter, the ticket, the snacks, a hop, gifts, SI stream, and the roadster take all four. Hunt Hall takes tKAS, POCencept, and KUSDT.",
    "Those rails are for a bill a stranger can take: a car, an SI service, a game purchase, and a rented service. This square is the classroom. A promise here does not buy the car, the service, the game, or the rental.",
    "To pay with a public tag, swap tKAS for POCencept and KUSDT at the bank. No tKAS, go to the bank. No POCencept, or no KUSDT, go to the bank and swap. To hold OLAF, shield tKAS at the bank.",
  ]),
  links: Object.freeze([
    Object.freeze(["Why, what, how", "https://github.com/STP-KAS/1984-why-what-how"]),
    Object.freeze(["The rails note", "https://github.com/STP-KAS/1984-rails"]),
    Object.freeze(["1984 raw idea", "https://sixpack.wtf/rails.html"]),
    Object.freeze(["Rails", "https://sixpack.wtf/rails-why.html"]),
  ]),
});

export const SWAP_PAY = "To pay for something, swap tKAS for POCencept and KUSDT at the bank.";

export function swapNeed(balances) {
  const poc = BigInt(balances.poc || 0);
  const kusdt = BigInt(balances.kusdt || 0);
  if (poc > 0n && kusdt > 0n) return "";
  const lines = [SWAP_PAY];
  if (balances.kas != null && BigInt(balances.kas) <= 0n) lines.push("No tKAS. Go to the bank.");
  if (poc <= 0n) lines.push("No POCencept. Go to the bank and swap.");
  if (kusdt <= 0n) lines.push("No KUSDT. Go to the bank and swap.");
  return lines.join(" ");
}

export function shortRail(rail, have) {
  const none = BigInt(have || 0) <= 0n;
  if (rail === "kas") return none ? "No tKAS. Go to the bank." : "Not enough tKAS. Go to the bank.";
  if (rail === "poc") return none ? "No POCencept. Go to the bank and swap." : "Not enough POCencept. Go to the bank and swap.";
  if (rail === "kusdt") return none ? "No KUSDT. Go to the bank and swap." : "Not enough KUSDT. Go to the bank and swap.";
  if (rail === "olaf") return none ? "No OLAF. Shield tKAS at the bank. The note stays in this browser." : "Not enough OLAF. Shield more tKAS at the bank, or take a private send.";
  return "";
}

/** The picker plus the button that opens the note. */
export function railBarHtml(selected) {
  const rail = payRail(selected);
  const picks = ["poc", "kusdt", "kas"].map((id) => {
    const on = id === rail ? ' class="on"' : "";
    return '<button type="button" data-rail-pick="' + id + '"' + on + ">" + RAIL_NAMES[id] + "</button>";
  }).join("");
  const olafOn = rail === "olaf" ? ' class="on"' : "";
  const olaf = '<button type="button" data-rail-pick="olaf"' + olafOn + ">OLAF</button>";
  return '<div class="rail-bar"><div class="booth-tabs">' + picks + olaf + '</div><button type="button" class="rails-open" data-rails>What are the rails?</button></div>';
}
