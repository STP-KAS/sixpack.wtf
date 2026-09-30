/** The three ways to pay, in the words the page shows. */

export const RAIL_NAMES = Object.freeze({
  poc: "POCencept",
  kusdt: "KUSDT",
  kas: "tKAS",
});

/** The rail a buy will use. An unknown choice is POCencept, the same default as the counter. */
export function payRail(selected) {
  return selected === "kas" || selected === "kusdt" ? selected : "poc";
}

export const RAILS_NOTE = Object.freeze({
  title: "Three ways to pay",
  lines: Object.freeze([
    "tKAS is the Testnet 10 coin. It is the one that moves. This tab can spend it at a counter, at the cinema, or on a hop. Kasware and Kastle sign only when you lock tKAS at the bank. That lock writes a toy tag.",
    "POCencept is a toy tag in this village ledger. It is not a dollar. KUSDT is the other toy tag. It can be frozen. A freeze blocks only KUSDT.",
    "Pick one rail. The page asks, then OK. The same three are on every counter, the ticket, the snacks, and a hop.",
    "Those rails are for a bill a stranger can take: a car, an AI service, a game purchase, and a rented service. This square is the classroom for that bill. A promise here does not buy the car, the service, the game, or the rental.",
  ]),
  links: Object.freeze([
    Object.freeze(["Why, what, how", "https://github.com/STP-KAS/1984-why-what-how"]),
    Object.freeze(["The rails note", "https://github.com/STP-KAS/1984-rails"]),
    Object.freeze(["Rails on this site", "https://sixpack.wtf/rails.html"]),
  ]),
});

/** The picker plus the button that opens the note. */
export function railBarHtml(selected) {
  const rail = payRail(selected);
  const picks = ["poc", "kusdt", "kas"].map((id) => {
    const on = id === rail ? ' class="on"' : "";
    return '<button type="button" data-rail-pick="' + id + '"' + on + ">" + RAIL_NAMES[id] + "</button>";
  }).join("");
  return '<div class="rail-bar"><div class="booth-tabs">' + picks + '</div><button type="button" class="rails-open" data-rails>What are the rails?</button></div>';
}
