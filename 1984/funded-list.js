const rowsEl = document.getElementById("funded-rows");
const countEl = document.getElementById("funded-count");
const leadEl = document.getElementById("funded-lead");
const queryEl = document.getElementById("funded-q");
const moreEl = document.getElementById("funded-more");
const PAGE = 40;
let openCount = 0;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function tkas(sompi) {
  if (sompi == null || sompi === "") return "…";
  const n = BigInt(sompi);
  const whole = n / 100_000_000n;
  const frac = (n % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? whole.toString() + "." + frac : whole.toString();
}

function txLinks(txid) {
  return String(txid || "")
    .split(",")
    .filter(Boolean)
    .map((id) => {
      const short = id.slice(0, 8) + "…" + id.slice(-4);
      return '<a href="https://explorer-tn10.kaspa.org/txs/' + esc(id) + '"><code>' + esc(short) + "</code></a>";
    })
    .join(" ");
}

function paint(data, query) {
  const needle = String(query || "").trim().toLowerCase();
  const all = data.rows || [];
  const matched = needle
    ? all.filter((row) => (row.address || "").toLowerCase().includes(needle) || (row.txid || "").toLowerCase().includes(needle))
    : all;
  const visible = needle ? matched.slice(0, PAGE) : matched.slice(0, openCount);
  if (leadEl && data.note) leadEl.textContent = data.note;
  if (countEl) {
    const when = data.updated ? " Checked " + data.updated.replace("T", " ").replace(/\.\d+Z$/, " UTC") + "." : "";
    const scope = needle
      ? "Showing " + visible.length + " of " + matched.length + " matches."
      : "Showing " + visible.length + " of " + (data.count || all.length) + ".";
    countEl.textContent = scope + " Search, or open the list forty at a time." + when;
  }
  if (moreEl) {
    const more = !needle && openCount < all.length;
    moreEl.hidden = !more;
    moreEl.textContent = "Show " + Math.min(PAGE, all.length - openCount) + " more";
  }
  if (!rowsEl) return;
  rowsEl.innerHTML = visible
    .map((row) => {
      return "<tr><td><code>" + esc(row.address) + "</code></td><td>" + esc(tkas(row.sompi)) + "</td><td>" + esc(tkas(row.balanceSompi)) + "</td><td>" + txLinks(row.txid) + "</td></tr>";
    })
    .join("");
}

const data = await fetch("1984/funded-list.json", { cache: "no-cache" }).then((res) => {
  if (!res.ok) throw new Error("The funded list is not on this page yet.");
  return res.json();
}).catch((err) => {
  if (countEl) countEl.textContent = err.message || "The funded list did not load.";
  return null;
});

if (data) {
  paint(data, "");
  if (queryEl) queryEl.addEventListener("input", () => paint(data, queryEl.value));
  if (moreEl) moreEl.addEventListener("click", () => {
    openCount += PAGE;
    paint(data, queryEl ? queryEl.value : "");
  });
}
