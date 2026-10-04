/** The three ways to pay, in the words the page shows. */

export const RAIL_NAMES = Object.freeze({
  poc: "POCencept stable",
  kusdt: "KUSDT stable",
  kas: "tKAS",
});

/** The rail a buy will use. An unknown choice is POCencept, the same default as the counter. */
export function payRail(selected) {
  return selected === "kas" || selected === "kusdt" ? selected : "poc";
}

export const RAILS_NOTE = Object.freeze({
  title: "Three ways to pay",
  lines: Object.freeze([
    "tKAS is the Testnet 10 label for KAS, the coin that moves. This tab can spend it at a counter, at the cinema, or on a hop. Kasware and Kastle sign only when you lock tKAS at the bank. That lock writes a toy tag. The miner fee is always KAS.",
    "POCencept stable is a tag in this village ledger. It is not a dollar. KUSDT stable is the other tag. It can be frozen. A freeze blocks only KUSDT stable.",
    "Pick one rail. The page asks, then OK. The same three are on every counter, the ticket, the snacks, a hop, and every row in Hunt Hall.",
    "Those rails are for a bill a stranger can take: a car, an AI service, a game purchase, and a rented service. This square is the classroom for that bill. A promise here does not buy the car, the service, the game, or the rental.",
    "To pay for something, swap tKAS for POCencept and KUSDT at the bank. No tKAS, go to the bank. No POCencept, or no KUSDT, go to the bank and swap.",
  ]),
  links: Object.freeze([
    Object.freeze(["Why, what, how", "https://github.com/STP-KAS/1984-why-what-how"]),
    Object.freeze(["The rails note", "https://github.com/STP-KAS/1984-rails"]),
    Object.freeze(["Rails on this site", "https://sixpack.wtf/rails.html"]),
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
  return "";
}

/** The picker plus the button that opens the note. */
export function railBarHtml(selected) {
  const rail = payRail(selected);
  const picks = ["poc", "kusdt", "kas"].map((id) => {
    const on = id === rail ? ' class="on"' : "";
    return '<button type="button" data-rail-pick="' + id + '"' + on + ">" + RAIL_NAMES[id] + "</button>";
  }).join("");
  return '<div class="rail-bar"><div class="booth-tabs">' + picks + '</div><button type="button" class="rails-open" data-rails>What are the rails?</button></div>';
}
