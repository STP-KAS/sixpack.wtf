import { readIdentity, writeIdentity } from "./identity.mjs";
import { BENCH, POST, REPOS } from "./links.mjs";
import {
  GUEST_DISCLAIMER,
  RESERVE,
  assertNotMainnetNetwork,
  assertTestnet,
  formatCents,
  formatTkas,
  parseTkas,
  sompiForCents,
} from "./money.mjs";
import { destinationFor, findPath, walkable, world } from "./world.mjs";
const TUNNEL = "https://hydrocodone-wireless-clay-requests.trycloudflare.com";
const PAGE_LIFE = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
const map = world();
const view = document.getElementById("view");
const mini = document.getElementById("mini");
const ctx = view.getContext("2d");
const mctx = mini.getContext("2d");
const side = document.getElementById("side");
const bar = document.getElementById("bar");
const you = document.getElementById("you");
const panel = document.getElementById("panel");
const chat = document.getElementById("chat");

const state = {
  player: { x: map.spawn.x, y: map.spawn.y },
  path: [],
  facing: { x: 0, y: -1 },
  stepAt: 0,
  mode: "world",
  home: null,
  account: null,
  kasSompi: null,
  oracle: null,
  oracleError: "",
  reserve: RESERVE,
  id: loadId(),
  arrived: null,
  bankRail: "kas",
  bankShutter: 0,
  bankFlight: null,
  boothHits: [],
};

const PRIVACY =
  "A .kas name that contains your name, your X handle, or anything that points at you ties this public spending to you. Pay at a shop and that payment sits on Testnet-10 next to the name. This desk prefers a plain kaspatest address, or a .kas name that does not identify you. To register a name, use KNS. This page does not create one.";

let guestBusy = false;

function boxes() {
  return { local: localStorage, session: sessionStorage };
}

function loadId() {
  try {
    return readIdentity(boxes());
  } catch (_) {}
  return { address: "", label: "", kind: "" };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function say(text, bad) {
  const line = document.createElement("p");
  line.textContent = text;
  if (bad) line.className = "bad";
  chat.append(line);
  while (chat.children.length > 4) chat.removeChild(chat.firstChild);
  chat.scrollTop = chat.scrollHeight;
}

function bases() {
  const list = [];
  if (location.origin && location.origin !== "null") list.push(location.origin);
  if (window.KWORLD_API) list.push(window.KWORLD_API);
  if (window.FAUCET_API) list.push(window.FAUCET_API);
  list.push(TUNNEL);
  list.push("http://127.0.0.1:4020");
  return [...new Set(list.map((item) => String(item).replace(/\/$/, "")))];
}

async function api(path, options) {
  let last = "The village ledger is offline. Walking still works.";
  for (const base of bases()) {
    try {
      const res = await fetch(base + path, {
        method: options && options.method ? options.method : "GET",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: options && options.body ? options.body : undefined,
      });
      const text = await res.text();
      if (!text || text[0] === "<") continue;
      const body = JSON.parse(text);
      body.status = res.status;
      return body;
    } catch (err) {
      last = err.message || last;
    }
  }
  return { ok: false, error: last };
}

function short(address) {
  if (!address) return "not chosen";
  if (address.length < 24) return address;
  return address.slice(0, 14) + "…" + address.slice(-6);
}

function paintChrome() {
  const id = state.id;
  const label = id.label || short(id.address);
  const kas = !id.address ? "— tKAS" : state.kasSompi == null ? "… tKAS" : formatTkas(state.kasSompi) + " tKAS";
  const poc = state.account ? formatCents(state.account.poc) + " POC" : "— POC";
  const kusdt = state.account ? formatCents(state.account.kusdt) + " KUSDT" : "— KUSDT";
  const frozen = state.account && state.account.kusdtFrozen ? " · KUSDT frozen" : "";
  const price = state.oracle ? "Live KAS $" + Number(state.oracle).toFixed(4) + ". " : "";
  const guestLine = id.kind === "guest" ? " This test address dies when you close the tab." : "";
  bar.innerHTML =
    "<strong>" + esc(label) + "</strong> · " + esc(kas) + " · " + esc(poc) + " · " + esc(kusdt) + frozen +
    '<p class="fine">' + esc(price) + "Testnet-10 toys. Not dollars. Not Tether. Not a SEPA rail. Mainnet wallets are refused. The POC and KUSDT tags do not move when the KAS price moves." + esc(guestLine) + "</p>";

  const buttons = [
    ["world", "Square"],
    ["cafe", "Cafe"],
    ["restaurant", "Table"],
    ["groceries", "Market"],
    ["bank", "Bank"],
    ["roadster", "Roadster"],
    ["rules", "Rules"],
    ["bench", "Bench"],
    ["guide", "Guide"],
  ];
  side.innerHTML = buttons
    .map(([idName, text]) => '<button type="button" data-go="' + idName + '"' + (state.mode === idName ? ' class="on"' : "") + ">" + text + "</button>")
    .join("");

  const guestOn = id.kind === "guest";
  you.innerHTML =
    "<h2>Who is paying</h2>" +
    "<p class=\"fine\">A wallet or a pasted address stays until you change it. A test address dies with this tab. Never a seed.</p>" +
    '<div class="kw-row"><button type="button" id="use-kasware">Kasware</button><button type="button" id="use-kastle">Kastle</button></div>' +
    '<button type="button" id="use-guest">Test without a wallet</button>' +
    '<p class="warn">' + esc(GUEST_DISCLAIMER) + "</p>" +
    (guestOn
      ? '<p class="warn">You are on a test address for this tab only: ' + esc(short(id.address)) + ". Close the tab and it is gone. A saved Testnet-10 wallet on this browser keeps its history.</p>"
      : "") +
    '<label>kaspatest address<input id="addr" spellcheck="false" autocomplete="off" value="' + esc(id.kind === "name" || guestOn ? "" : id.address) + '"></label>' +
    '<button type="button" id="use-addr">Use this address</button>' +
    '<label>.kas name, if you already have one<input id="kasname" spellcheck="false" autocomplete="off" placeholder="name.kas" value="' + esc(id.kind === "name" ? id.label : "") + '"></label>' +
    '<button type="button" id="use-name">Use this name</button>' +
    '<p class="warn">' + esc(PRIVACY) + '</p>' +
    '<p class="fine"><a href="https://app.knsdomains.org" target="_blank" rel="noopener">KNS app</a> · <a href="https://tn10.knsdomains.org" target="_blank" rel="noopener">TN10 names</a></p>';
}

async function refreshAccount() {
  if (!state.id.address) {
    state.account = null;
    state.kasSompi = null;
    paintChrome();
    return;
  }
  const body = await api("/api/kworld/account?address=" + encodeURIComponent(state.id.address));
  if (!body.ok) {
    say(body.error || "Could not read the account.", true);
    paintChrome();
    return;
  }
  state.account = body.account;
  state.kasSompi = body.kasSompi;
  state.oracle = body.oracle;
  if (body.reserve) state.reserve = body.reserve;
  paintChrome();
  if (state.mode === "bank") paintBank();
}

function forgetGuest(prev) {
  if (!prev || prev.kind !== "guest" || !prev.token) return;
  api("/api/kworld/guest/close", {
    method: "POST",
    body: JSON.stringify({ token: prev.token, address: prev.address, life: PAGE_LIFE }),
  });
}

function setIdentity(next) {
  const prev = state.id;
  try {
    writeIdentity(boxes(), next);
  } catch (err) {
    say(err.message, true);
    return;
  }
  state.id = next;
  if (prev && prev.kind === "guest" && prev.token && prev.token !== next.token) forgetGuest(prev);
  paintChrome();
  refreshAccount();
  if (next.kind === "guest") say("Paying as a test address for this tab only. " + GUEST_DISCLAIMER);
  else say("Paying as " + (next.label || next.address) + ". This one keeps its history on this browser.");
}

async function connectWallet(kind) {
  const kit = window.KaspaWallets;
  if (!kit || !kit.connect) {
    say("Wallet kit is not on this page. Hard-refresh.", true);
    return;
  }
  say(kind === "kasware" ? "Waiting for Kasware. It must already be on Testnet 10." : "Waiting for Kastle. It must already be on Testnet 10.");
  const got = await kit.connect(kind);
  let net = "";
  try {
    if (kind === "kasware" && window.kasware && window.kasware.getNetwork) net = String(await window.kasware.getNetwork());
    if (kind === "kastle" && window.kastle && window.kastle.getNetwork) net = String(await window.kastle.getNetwork());
  } catch (_) {}
  try {
    assertNotMainnetNetwork(net);
    assertTestnet(got.address);
  } catch (err) {
    try {
      await kit.logout();
    } catch (_) {}
    say(err.message, true);
    return;
  }
  setIdentity({ address: got.address, label: got.address, kind });
}

async function startGuest() {
  if (guestBusy) return;
  guestBusy = true;
  try {
    say("Making a Testnet-10 address for this tab and putting tKAS on it. " + GUEST_DISCLAIMER);
    const body = await api("/api/kworld/guest", {
      method: "POST",
      body: JSON.stringify({ network: "testnet-10", life: PAGE_LIFE }),
    });
    if (!body.ok || !body.address || !body.token || body.key || body.privateKey) {
      say(body.error || "No test wallet. Use your own Testnet-10 wallet if you want the history kept.", true);
      return;
    }
    setIdentity({ address: body.address, label: "test tab", kind: "guest", token: body.token });
    say("This tab has " + formatTkas(body.sompi) + " tKAS. The balance can take a moment to show. Close the tab and this address is gone.");
  } finally {
    guestBusy = false;
  }
}

async function keepGuest() {
  if (state.id.kind !== "guest" || !state.id.token) return;
  const body = await api("/api/kworld/guest/keep", {
    method: "POST",
    body: JSON.stringify({ token: state.id.token, address: state.id.address, network: "testnet-10", life: PAGE_LIFE }),
  });
  if (body.ok) return;
  const msg = String(body.error || "");
  if (!/dropped|closing|does not match/i.test(msg)) return;
  try {
    sessionStorage.removeItem("kworld-guest-v1");
  } catch (_) {}
  state.id = loadId();
  say(msg || "The test address for this tab is gone.", true);
  paintChrome();
  refreshAccount();
}

async function useAddress() {
  try {
    const address = assertTestnet(document.getElementById("addr").value);
    setIdentity({ address, label: address, kind: "address" });
  } catch (err) {
    say(err.message, true);
  }
}

async function useName() {
  const raw = document.getElementById("kasname").value;
  const body = await api("/api/kworld/resolve?name=" + encodeURIComponent(raw));
  if (!body.ok) {
    say(body.error || "KNS did not answer.", true);
    return;
  }
  if (!body.found) {
    say("That name is not on the TN10 KNS resolver. Create it at KNS, or keep the kaspatest address.", true);
    return;
  }
  try {
    assertTestnet(body.found.address);
  } catch (err) {
    say(err.message, true);
    return;
  }
  say(PRIVACY);
  setIdentity({ address: body.found.address, label: body.found.domain, kind: "name" });
}

function quoteSompi(cents) {
  if (!state.oracle) return null;
  try {
    return sompiForCents(cents, state.oracle);
  } catch (_) {
    return null;
  }
}

const RAIL_CHAT = {
  kas: "tKAS is the only coin that moves.",
  poc: "Tag only, no freeze. Redeem returns the locked part. Grams are not this dollar.",
  kusdt: "Freeze blocks KUSDT only.",
};

function markRoom() {
  const root = document.querySelector(".kw");
  if (root) root.classList.toggle("room", state.mode !== "world");
}

function chooseRail(rail) {
  if (rail !== "kas" && rail !== "poc" && rail !== "kusdt") return;
  if (state.bankRail === rail && !state.bankFlight) return;
  state.bankFlight = null;
  state.bankRail = rail;
  state.bankShutter = performance.now();
  say(RAIL_CHAT[rail]);
  if (state.mode === "bank") paintBank();
}

function openMode(mode) {
  const enteringBank = mode === "bank" && state.mode !== "bank";
  state.mode = mode;
  markRoom();
  paintChrome();
  if (mode === "world") {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  if (mode === "bank") {
    if (enteringBank) {
      state.bankShutter = performance.now();
      say("Examine Venn's bank. " + RAIL_CHAT[state.bankRail]);
    }
    paintBank();
  } else if (mode === "rules") paintRules();
  else if (mode === "bench") paintBench();
  else if (mode === "guide") paintGuide();
  else paintShop(mode);
}

function paintShop(shopId) {
  const shop = (state.home && state.home.shops ? state.home.shops : []).find((item) => item.id === shopId);
  const fallback = map.npcs.find((npc) => npc.shop === shopId);
  if (!shop) {
    panel.innerHTML = "<h2>" + esc(fallback ? fallback.name : "Shop") + "</h2><p>The menu loads from the village ledger. " + esc(state.oracleError || "It is not reachable from this browser yet.") + "</p>";
    return;
  }
  const rows = shop.items
    .map((item) => {
      const sompi = quoteSompi(item.cents);
      const kas = sompi == null ? "oracle down" : formatTkas(sompi) + " tKAS";
      return (
        '<div class="item"><strong>' + esc(item.name) + "</strong> · " + esc(formatCents(item.cents)) +
        " toy dollars · " + esc(kas) +
        '<div class="kw-row">' +
        '<button type="button" data-pay="kas" data-shop="' + shop.id + '" data-sku="' + item.sku + '">Pay tKAS</button>' +
        '<button type="button" data-pay="poc" data-shop="' + shop.id + '" data-sku="' + item.sku + '">Pay POC</button>' +
        '<button type="button" data-pay="kusdt" data-shop="' + shop.id + '" data-sku="' + item.sku + '">Pay KUSDT</button>' +
        "</div></div>"
      );
    })
    .join("");
  panel.innerHTML =
    "<h2>" + esc(shop.name) + "</h2><p>" + esc(shop.line) + "</p>" + rows +
    '<label>If the wallet did not return a txid, paste it<textarea id="txid" rows="2" style="width:100%"></textarea></label>' +
    "<p class=\"fine\">tKAS is a real Testnet-10 payment to the reserve, plus a miner fee. POC and KUSDT are the village toys. A frozen KUSDT button fails on purpose.</p>";
}

function slotGrid(cells) {
  let html = "";
  for (let i = 0; i < 32; i++) {
    const cell = cells[i];
    if (!cell) {
      html += '<div class="slot"></div>';
      continue;
    }
    html +=
      '<div class="slot filled' + (cell.extra ? " " + cell.extra : "") + '">' +
      '<span class="coin">' + esc(cell.label) + "</span>" +
      '<span class="qty">' + esc(cell.count) + "</span></div>";
  }
  return html;
}

function paintBank() {
  const rail = state.bankRail || "kas";
  const names = { kas: "tKAS", poc: "POCencept", kusdt: "KUSDT" };
  const tabs = ["kas", "poc", "kusdt"]
    .map((id) => {
      const on = id === rail && !state.bankFlight ? ' class="on"' : "";
      return '<button type="button" data-booth="' + id + '"' + on + ">" + names[id] + "</button>";
    })
    .join("");
  const quote = state.oracle ? "Live KAS $" + Number(state.oracle).toFixed(4) + "." : "Live quote unavailable.";
  const kas = !state.id.address ? "—" : state.kasSompi == null ? "…" : formatTkas(state.kasSompi);
  const poc = state.account ? formatCents(state.account.poc) : "0.00";
  const kusdt = state.account ? formatCents(state.account.kusdt) : "0.00";
  const frozen = !!(state.account && state.account.kusdtFrozen);
  let cells = [{ label: "tKAS", count: kas, extra: state.bankFlight ? "leaving" : "" }];
  let actions = "";
  if (rail === "kas") {
    actions =
      '<label class="amt">Enter amount<input id="lock-amt" value="1" inputmode="decimal"></label>' +
      '<div class="kw-row"><button type="button" id="lock-poc">Lock into POCencept</button><button type="button" id="lock-kusdt">Lock into KUSDT</button></div>' +
      '<label class="amt">txid, if you sent it yourself<input id="lock-txid" spellcheck="false" autocomplete="off"></label>' +
      '<p class="fine">' + esc(quote) + " Spendable " + esc(kas) + " tKAS. Reserve " + esc(state.reserve) + ". Miner fee is extra tKAS.</p>";
  } else if (rail === "poc") {
    cells = [{ label: "POC", count: poc }];
    if (state.account && state.account.practice) cells[1] = { label: "Purse", count: "20" };
    actions =
      '<label class="amt">Enter amount<input id="redeem-amt" value="0.05" inputmode="decimal"></label>' +
      '<div class="kw-row"><button type="button" id="redeem-poc">Redeem POC</button><button type="button" id="purse">Take the practice purse</button></div>';
  } else {
    cells = [{ label: "KUSDT", count: kusdt, extra: frozen ? "frozen-coin" : "" }];
    actions =
      '<label class="amt">Enter amount<input id="redeem-amt" value="0.05" inputmode="decimal"></label>' +
      '<p class="fine">' + (frozen ? "Frozen." : "Thawed.") + "</p>" +
      '<div class="kw-row"><button type="button" id="redeem-kusdt">Redeem KUSDT</button><button type="button" id="freeze">Freeze or thaw KUSDT</button></div>';
  }
  panel.innerHTML =
    '<div class="booth-tabs">' + tabs + "</div>" +
    "<h2>Venn's bank — " + names[rail] + "</h2>" +
    '<div class="slots' + (rail === "kusdt" && frozen ? " frozen" : "") + '">' + slotGrid(cells) + "</div>" +
    actions;
  const lockPoc = document.getElementById("lock-poc");
  const lockKusdt = document.getElementById("lock-kusdt");
  const redeemPoc = document.getElementById("redeem-poc");
  const redeemKusdt = document.getElementById("redeem-kusdt");
  const purse = document.getElementById("purse");
  const freezeBtn = document.getElementById("freeze");
  if (lockPoc) lockPoc.onclick = () => lock("poc");
  if (lockKusdt) lockKusdt.onclick = () => lock("kusdt");
  if (redeemPoc) redeemPoc.onclick = () => redeem("poc");
  if (redeemKusdt) redeemKusdt.onclick = () => redeem("kusdt");
  if (purse) purse.onclick = practice;
  if (freezeBtn) freezeBtn.onclick = freeze;
}

function paintRules() {
  const rules = (state.account && state.account.rules) || { dailyCapCents: 0, shops: [], rails: [], confirmOverCents: 0 };
  const shops = ["cafe", "restaurant", "groceries", "roadster"]
    .map((id) => '<label><input type="checkbox" data-shop value="' + id + '"' + (rules.shops.includes(id) ? " checked" : "") + "> " + id + "</label>")
    .join("");
  const rails = ["kas", "poc", "kusdt"]
    .map((id) => '<label><input type="checkbox" data-rail value="' + id + '"' + (rules.rails.includes(id) ? " checked" : "") + "> " + id + "</label>")
    .join("");
  panel.innerHTML =
    "<h2>Spending rules</h2>" +
    "<p>These are the square's rules for this address. An empty list means every shop and every rail. They are a stand-in for a covenant: a limit you chose, checked before the payment.</p>" +
    '<label>Daily cap in toy dollars, 0 for none<input id="cap" value="' + esc((Number(rules.dailyCapCents) / 100).toFixed(2)) + '"></label>' +
    '<label>Ask again above this many toy dollars, 0 for never<input id="confirm" value="' + esc((Number(rules.confirmOverCents) / 100).toFixed(2)) + '"></label>' +
    "<p>Shops you allow. Leave all off to allow every shop.</p>" + shops +
    "<p>Rails you allow. Leave all off to allow every rail.</p>" + rails +
    '<button type="button" id="save-rules">Save rules</button>' +
    '<p class="fine">PegLab: this quote is an outside price. If it moves, a redeem can fail because the lock no longer covers the toy dollars. That is a peg failing. It is not a promise of dollars. Grams are not this dollar. BitCoffee\'s covenant KUSD is a different object and is not minted here.</p>' +
    '<p class="fine">A real covenant would enforce this on Testnet-10 without trusting this page. SilverScript and the Kaspero freelancer sheet are on the bench. This page checks the rule before it moves a toy balance. A vProg guest can sequence a step. This square does not claim the shop spend is that step.</p>';
  document.getElementById("save-rules").onclick = saveRules;
}

function paintBench() {
  const blocks = BENCH.map((block) => {
    const links = block.hrefs.map(([label, href]) => '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label) + "</a>").join(" · ");
    return "<h2>" + esc(block.title) + "</h2><p>" + esc(block.text) + "</p><p>" + links + "</p>";
  }).join("");
  const repos = REPOS.map((name) => '<a href="https://github.com/STP-KAS/' + encodeURIComponent(name) + '" target="_blank" rel="noopener">' + esc(name) + "</a>").join(" ");
  panel.innerHTML = blocks + "<h2>STP-KAS repos</h2><div class=\"repo-cloud\">" + repos + "</div>";
}

function paintGuide() {
  panel.innerHTML =
    "<h2>How to try this on Testnet 10</h2>" +
    "<ol>" +
    "<li>Install Kasware or Kastle and set the network to Testnet 10 before you connect. A mainnet address is refused. That login stays on this browser.</li>" +
    "<li>Or choose New arrival on the welcome gate. That is the same as Test without a wallet. This tab gets a new funded kaspatest address. Close the tab and that address is gone. Leftover tKAS is swept back. It does not replace a wallet you already saved. Returning leaves the gate and uses a wallet that stays on this browser.</li>" +
    "<li>Or paste a kaspatest address. Or type a .kas name that already resolves on TN10. That choice stays until you change it.</li>" +
    "<li>Need coins: the faucet tab pays 0.6 tKAS. At the live price that is a few cents, so it will not buy supper. Take the practice purse in the bank. That purse is play money.</li>" +
    "<li>Walk to a door, or use the left tabs. Pay tKAS, POCencept, or KUSDT.</li>" +
    "<li>tKAS asks the wallet to sign a real Testnet-10 transaction. The miner fee is extra tKAS.</li>" +
    "<li>Venn's bank is a room with three booths. tKAS locks. POCencept redeems the locked part. KUSDT is the only booth with a freeze. The long note sits in Rules.</li>" +
    "<li>Rules: a daily cap, a shop list, a rail list, a confirm line.</li>" +
    "<li>The freeze switch is only on KUSDT.</li>" +
    "</ol>" +
    "<p>Also on the bench: KNS, tic-tac-toe, KaChat, Kaspero Labs, SilverScript, Argent. Tidewater is an MIT fishing island; this square did not copy that ocean. The Go topic list is markers and private-server code. This page uses neither of those, and it does not ship a soundtrack.</p>" +
    "<p class=\"warn\">" + esc(PRIVACY) + "</p>" +
    "<h2>Name</h2><p>This tab is called Kworld. The name can change.</p>" +
    "<h2>Text for X, not posted from this desk</h2>" +
    "<textarea id=\"post\" rows=\"12\" style=\"width:100%\">" + esc(POST) + "</textarea>" +
    '<button type="button" id="copy-post">Copy</button>';
  document.getElementById("copy-post").onclick = async () => {
    const text = document.getElementById("post").value;
    try {
      await navigator.clipboard.writeText(text);
      say("Copied. This desk did not post it.");
    } catch (_) {
      say(text);
    }
  };
}

function requireId() {
  if (!state.id.address) {
    say("Choose a Testnet-10 wallet, paste an address, or test without a wallet.", true);
    return false;
  }
  return true;
}

async function post(path, body) {
  return api(path, { method: "POST", body: JSON.stringify({ ...body, address: state.id.address, network: "testnet-10" }) });
}

async function spend(rail, shop, sku, confirmed) {
  if (!requireId()) return;
  let txid = "";
  if (rail === "kas") {
    const quote = await api("/api/kworld/quote?shop=" + encodeURIComponent(shop) + "&sku=" + encodeURIComponent(sku));
    if (!quote.ok) {
      say(quote.error || "No quote.", true);
      return;
    }
    if (state.id.kind === "guest") {
      say("Paying from this tab's test address. Close the tab and it is gone.");
      let body = await post("/api/kworld/guest/spend", { token: state.id.token, shop, sku, confirmed: !!confirmed });
      if (body.needsConfirm) {
        const yes = window.confirm("This is over your confirm line. Pay it?");
        if (!yes) return;
        body = await post("/api/kworld/guest/spend", { token: state.id.token, shop, sku, confirmed: true });
      }
      if (!body.ok) {
        say(body.error || "The shop refused the payment.", true);
        return;
      }
      say(body.shop + " took the payment for " + body.item + ".");
      await refreshAccount();
      return;
    }
    const typed = panel.querySelector("#txid");
    txid = typed ? typed.value.trim() : "";
    if (!txid) {
      const kit = window.KaspaWallets;
      if (!kit || (state.id.kind !== "kasware" && state.id.kind !== "kastle")) {
        say("Connect Kasware or Kastle on Testnet 10, or paste the txid after you pay " + formatTkas(quote.sompi) + " tKAS to the reserve.", true);
        return;
      }
      say("Approve " + formatTkas(quote.sompi) + " tKAS in the wallet. The miner fee is extra.");
      txid = await kit.sendKaspa(state.reserve, Number(quote.sompi), { priorityFee: 10000 });
    }
  }
  let body = await post("/api/kworld/spend", { shop, sku, rail, txid, confirmed: !!confirmed });
  if (body.needsConfirm) {
    const yes = window.confirm("This is over your confirm line. Pay it?");
    if (!yes) return;
    body = await post("/api/kworld/spend", { shop, sku, rail, txid, confirmed: true });
  }
  if (!body.ok) {
    say(body.error || "The shop refused the payment.", true);
    return;
  }
  say(body.shop + " took the payment for " + body.item + ".");
  await refreshAccount();
}

async function lock(rail) {
  if (!requireId()) return;
  let sompi;
  try {
    sompi = parseTkas(document.getElementById("lock-amt").value);
  } catch (err) {
    say(err.message, true);
    return;
  }
  if (state.id.kind === "guest") {
    say("Locking tKAS from this tab's test address. Close the tab and the address is gone.");
    const body = await post("/api/kworld/guest/convert", {
      token: state.id.token,
      rail,
      amount: document.getElementById("lock-amt").value.trim(),
    });
    if (!body.ok) {
      say(body.error || "The lock did not clear.", true);
      return;
    }
    say("Locked. You received " + formatCents(body.cents) + " " + (rail === "poc" ? "POCencept" : "KUSDT") + ".");
    await refreshAccount();
    state.bankRail = "kas";
    state.bankFlight = { rail, until: performance.now() + 600 };
    if (state.mode === "bank") paintBank();
    return;
  }
  let txid = document.getElementById("lock-txid").value.trim();
  if (!txid) {
    const kit = window.KaspaWallets;
    if (!kit || (state.id.kind !== "kasware" && state.id.kind !== "kastle")) {
      say("Connect a Testnet-10 wallet, or paste the txid of a payment to the reserve.", true);
      return;
    }
    say("Approve the lock of " + formatTkas(sompi) + " tKAS.");
    txid = await kit.sendKaspa(state.reserve, Number(sompi), { priorityFee: 10000 });
  }
  const body = await post("/api/kworld/convert", { rail, txid });
  if (!body.ok) {
    say(body.error || "The lock did not clear.", true);
    return;
  }
  say("Locked. You received " + formatCents(body.cents) + " " + (rail === "poc" ? "POCencept" : "KUSDT") + ".");
  await refreshAccount();
  state.bankRail = "kas";
  state.bankFlight = { rail, until: performance.now() + 600 };
  if (state.mode === "bank") paintBank();
}

async function redeem(rail) {
  if (!requireId()) return;
  const amount = document.getElementById("redeem-amt").value.trim();
  say("Redeeming " + amount + " toy dollars. Testnet-10 has to accept the send.");
  const body = await post("/api/kworld/redeem", { rail, amount });
  if (!body.ok) {
    say(body.error || "Redeem failed. The toy balance should still be there.", true);
    await refreshAccount();
    return;
  }
  say("Redeem broadcast " + ((body.txids && body.txids[0]) || "a transaction") + ".");
  await refreshAccount();
}

async function practice() {
  if (!requireId()) return;
  const body = await post("/api/kworld/practice", {});
  if (!body.ok) {
    say(body.error || "No purse.", true);
    return;
  }
  say("Practice purse taken. 20.00 POC and 20.00 KUSDT. Not redeemable.");
  await refreshAccount();
}

async function freeze() {
  if (!requireId()) return;
  const next = !(state.account && state.account.kusdtFrozen);
  const body = await post("/api/kworld/freeze", { frozen: next });
  if (!body.ok) {
    say(body.error || "Freeze failed.", true);
    return;
  }
  say(next ? "KUSDT is frozen. POC and tKAS are not." : "KUSDT is thawed.");
  await refreshAccount();
}

async function saveRules() {
  if (!requireId()) return;
  const dollars = (id) => {
    const n = Number(document.getElementById(id).value);
    if (!Number.isFinite(n) || n < 0) throw new Error("Use a zero or a positive toy-dollar amount.");
    return Math.round(n * 100);
  };
  let rules;
  try {
    rules = {
      dailyCapCents: dollars("cap"),
      confirmOverCents: dollars("confirm"),
      shops: [...panel.querySelectorAll("[data-shop]:checked")].map((el) => el.value),
      rails: [...panel.querySelectorAll("[data-rail]:checked")].map((el) => el.value),
    };
  } catch (err) {
    say(err.message, true);
    return;
  }
  const body = await post("/api/kworld/rules", { rules });
  if (!body.ok) {
    say(body.error || "Rules were not saved.", true);
    return;
  }
  say("Spending rules saved for this address.");
  await refreshAccount();
  openMode("rules");
}

function frame() {
  const rect = view.getBoundingClientRect();
  const cssW = Math.max(320, rect.width || 320);
  const cssH = Math.max(240, rect.height || 240);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const needW = Math.floor(cssW * dpr);
  const needH = Math.floor(cssH * dpr);
  if (view.width !== needW || view.height !== needH) {
    view.width = needW;
    view.height = needH;
  }
  const span = map.w + map.h;
  const tile = Math.max(6, Math.max(cssW / (span * 0.5), cssH / (span * 0.28)) * 1.02);
  const originX = cssW / 2;
  const originY = (cssH - span * tile * 0.28) / 2 + tile * 0.15;
  return { cssW, cssH, dpr, tile, originX, originY };
}

function iso(box, x, y) {
  return {
    x: box.originX + (x - y) * box.tile * 0.5,
    y: box.originY + (x + y) * box.tile * 0.28,
  };
}

function fillDiamond(g, box, x, y) {
  const a = iso(box, x, y);
  const b = iso(box, x + 1, y);
  const c = iso(box, x + 1, y + 1);
  const d = iso(box, x, y + 1);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.lineTo(c.x, c.y);
  g.lineTo(d.x, d.y);
  g.closePath();
  g.fill();
}

function tileColor(tile, x, y, t) {
  if (tile === "g") {
    const n = (x * 13 + y * 7) % 6;
    return ["#6d8a3a", "#7c9a46", "#73843a", "#8a7340", "#6a7a38", "#85784a"][n];
  }
  if (tile === "c") return (x + y) % 2 ? "#8d8982" : "#a39e96";
  if (tile === "p") return (x * 3 + y) % 3 === 0 ? "#a89070" : "#c6b896";
  if (tile === "i") return "#6a5340";
  if (tile === "W") return (x + y) % 2 ? "#8e8a84" : "#7d7973";
  if (tile === "d") return "#6b3e22";
  if (tile === "w") return t % 900 < 450 ? "#2f6fa3" : "#3d82b8";
  if (tile === "t") return "#24502e";
  if (tile === "f") return (x + y) % 2 ? "#6f8f3c" : "#7c9a46";
  if (tile === "r") return "#6e342c";
  return "#333";
}

function buildingAt(x, y) {
  return map.buildings.find((b) => x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) || null;
}

function drawPerson(g, x, y, color, name, tile) {
  const px = x * tile + tile / 2;
  const py = y * tile + tile / 2;
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(px, py + tile * 0.28, tile * 0.28, tile * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  const pace = Math.floor(performance.now() / 180) % 2 ? 0.05 : -0.02;
  g.fillStyle = "#2a241c";
  g.fillRect(px - tile * 0.12, py + tile * (0.05 + pace), tile * 0.08, tile * 0.22);
  g.fillRect(px + tile * 0.04, py + tile * (0.05 - pace), tile * 0.08, tile * 0.22);
  g.fillStyle = color;
  g.fillRect(px - tile * 0.2, py - tile * 0.18, tile * 0.4, tile * 0.32);
  g.fillStyle = "#f3e0c8";
  g.beginPath();
  g.arc(px, py - tile * 0.3, tile * 0.15, 0, Math.PI * 2);
  g.fill();
  if (name) {
    g.font = "600 " + Math.max(11, tile * 0.46) + "px Segoe UI, sans-serif";
    g.textAlign = "center";
    const width = g.measureText(name).width + tile * 0.35;
    g.fillStyle = "rgba(20, 16, 12, 0.78)";
    g.fillRect(px - width / 2, py - tile * 0.78, width, tile * 0.36);
    g.fillStyle = "#d5d5d5";
    g.fillText(name, px, py - tile * 0.52);
  }
}

function drawBuildings(g, tile, offX, offY) {
  for (const b of map.buildings) {
    const x = offX + b.x * tile;
    const y = offY + b.y * tile;
    const w = b.w * tile;
    const h = b.h * tile;
    g.fillStyle = "rgba(40, 22, 8, 0.33)";
    g.beginPath();
    g.ellipse(x + w * 0.72, y + h + tile * 0.05, w * 0.46, tile * 0.42, 0.45, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = b.id === "bank" ? "#1d4e86" : "#6a5344";
    g.fillRect(x + tile * 0.15, y + tile * 0.85, w - tile * 0.3, h - tile * 0.95);
    g.fillStyle = "#9b9791";
    g.fillRect(x, y + tile * 0.45, w, h - tile * 0.45);
    g.fillStyle = "#6f6b65";
    g.fillRect(x, y + h - tile * 0.35, w, tile * 0.35);
    for (let col = 1; col < b.w; col++) {
      g.fillStyle = "rgba(30,28,24,0.28)";
      g.fillRect(x + col * tile, y + tile * 0.45, 1, h - tile * 0.45);
    }
    for (let row = 1; row < 4; row++) {
      g.fillStyle = "rgba(20,16,12,0.18)";
      g.fillRect(x, y + tile * (0.45 + row * 0.7), w, 1);
    }
    const lit = (b.x + b.y) % 2 === 0;
    for (let col = 1; col < b.w - 1; col += 2) {
      g.fillStyle = "#14120f";
      g.fillRect(x + col * tile + tile * 0.28, y + tile * 1.65, tile * 0.38, tile * 0.5);
      if (lit) {
        g.fillStyle = "rgba(232, 138, 48, 0.9)";
        g.fillRect(x + col * tile + tile * 0.36, y + tile * 1.76, tile * 0.16, tile * 0.2);
      }
    }
    if (b.id === "bank") {
      g.fillStyle = "#c8c3bb";
      for (let col = 0; col < b.w; col += 1) {
        if (col % 2 === 0) g.fillRect(x + col * tile, y + tile * 0.38, tile * 0.62, tile * 0.2);
      }
    }
    g.fillStyle = b.roof;
    g.beginPath();
    g.moveTo(x - tile * 0.2, y + tile * 0.7);
    g.lineTo(x + w / 2, y - tile * 0.15);
    g.lineTo(x + w + tile * 0.2, y + tile * 0.7);
    g.closePath();
    g.fill();
    g.fillStyle = "#1a1612";
    g.fillRect(x + tile * 0.4, y + tile * 0.62, w - tile * 0.8, tile * 0.08);
    const sx = x + w / 2;
    g.font = "600 " + Math.max(13, tile * 0.62) + "px Segoe UI, sans-serif";
    g.textAlign = "center";
    const board = Math.min(w - tile * 0.4, Math.max(tile * 2.4, g.measureText(b.sign).width + tile * 0.9));
    g.fillStyle = "#5c3a22";
    g.fillRect(sx - board / 2, y + tile * 0.95, board, tile * 0.72);
    g.fillStyle = "#f3e6c8";
    g.fillText(b.sign, sx, y + tile * 1.48);
    const dx = offX + b.door.x * tile;
    const dy = offY + b.door.y * tile;
    g.fillStyle = "#5a3418";
    g.fillRect(dx + tile * 0.22, dy + tile * 0.12, tile * 0.56, tile * 0.88);
    g.fillStyle = "#e1c27a";
    g.fillRect(dx + tile * 0.62, dy + tile * 0.5, tile * 0.08, tile * 0.08);
  }
  const market = map.buildings.find((b) => b.id === "groceries");
  if (market) {
    const ax = offX + (market.x - 1) * tile;
    const ay = offY + (market.y + market.h) * tile;
    const aw = (market.w + 1) * tile;
    g.fillStyle = "#2f5f9a";
    g.fillRect(ax, ay, aw, tile * 0.55);
    for (let i = 0; i < market.w + 1; i++) {
      g.fillStyle = i % 2 ? "#f4f1e8" : "#2f5f9a";
      g.fillRect(ax + i * tile, ay, tile, tile * 0.55);
    }
  }
}

function drawBanner(g, x, y, tile, color) {
  g.fillStyle = "#5c3a22";
  g.fillRect(x, y, tile * 0.12, tile * 1.7);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x + tile * 0.12, y + tile * 0.1);
  g.lineTo(x + tile * 1.2, y + tile * 0.42);
  g.lineTo(x + tile * 0.12, y + tile * 0.95);
  g.closePath();
  g.fill();
  g.fillStyle = "#e1c27a";
  g.fillRect(x + tile * 0.22, y + tile * 0.42, tile * 0.5, tile * 0.08);
}

function drawCountry(g, tile, offX, offY) {
  const hx = offX + 8 * tile;
  const hy = offY + 28.3 * tile;
  g.fillStyle = "#c4a15a";
  g.beginPath();
  g.moveTo(hx, hy + tile);
  g.lineTo(hx + tile * 1.5, hy + tile * 0.12);
  g.lineTo(hx + tile * 3, hy + tile);
  g.closePath();
  g.fill();
  g.fillStyle = "#8a6230";
  g.fillRect(hx + tile * 0.35, hy + tile * 0.7, tile * 2.3, tile * 0.26);
  g.strokeStyle = "#6b4a2a";
  g.lineWidth = Math.max(2, tile * 0.08);
  const railY = offY + 30 * tile + tile * 0.4;
  g.beginPath();
  g.moveTo(offX + 2 * tile, railY);
  g.lineTo(offX + 13 * tile, railY);
  g.moveTo(offX + 2 * tile, railY - tile * 0.28);
  g.lineTo(offX + 13 * tile, railY - tile * 0.28);
  g.stroke();
  for (let x = 2; x <= 13; x += 2) {
    g.fillStyle = "#5c3a22";
    g.fillRect(offX + x * tile, railY - tile * 0.45, tile * 0.12, tile * 0.85);
  }
  drawBanner(g, offX + 16 * tile, offY + 12 * tile, tile, "#6e2430");
  drawBanner(g, offX + 26 * tile, offY + 12 * tile, tile, "#2f4d6a");
  g.font = "600 " + Math.max(12, tile * 0.62) + "px Segoe UI, sans-serif";
  g.textAlign = "left";
  const label = "Ashfields";
  const boardW = g.measureText(label).width + tile * 0.8;
  const bx = offX + 17.2 * tile;
  const by = offY + 13.15 * tile;
  g.fillStyle = "#5c3a22";
  g.fillRect(bx, by, boardW, tile * 0.85);
  g.fillStyle = "#f3e6c8";
  g.fillText(label, bx + tile * 0.35, by + tile * 0.6);
}

function drawDiamondWindow(g, x, y, w, h) {
  g.fillStyle = "#1d4e3a";
  g.fillRect(x, y, w, h);
  g.strokeStyle = "#c6a15a";
  g.lineWidth = 3;
  g.strokeRect(x, y, w, h);
  g.beginPath();
  g.moveTo(x, y + h / 2);
  g.lineTo(x + w / 2, y);
  g.lineTo(x + w, y + h / 2);
  g.lineTo(x + w / 2, y + h);
  g.closePath();
  g.stroke();
}

function drawBankRoom(cssW, cssH, t) {
  const g = ctx;
  g.fillStyle = "#2a261f";
  g.fillRect(0, 0, cssW, cssH);
  const doorX = cssW * 0.06;
  const doorW = Math.min(cssW * 0.26, 280);
  const doorY = cssH * 0.58;
  g.fillStyle = "#7c9a46";
  g.fillRect(doorX, doorY, doorW, cssH - doorY + 2);
  g.fillStyle = "#c6b896";
  g.fillRect(doorX + doorW * 0.36, doorY, doorW * 0.28, cssH - doorY + 2);
  g.fillStyle = "#9a958e";
  g.fillRect(doorX - 12, doorY - 6, 16, cssH - doorY + 8);
  g.fillRect(doorX + doorW - 4, doorY - 6, 16, cssH - doorY + 8);
  g.fillRect(doorX - 12, doorY - 18, doorW + 28, 18);
  const floorY = cssH * 0.48;
  g.fillStyle = "#6a655e";
  g.fillRect(0, 0, cssW, floorY);
  for (let y = 10; y < floorY; y += 16) {
    g.fillStyle = "rgba(20,16,12,0.22)";
    g.fillRect(0, y, cssW, 2);
  }
  g.fillStyle = "#6b4428";
  g.fillRect(0, floorY, cssW, cssH - floorY);
  const planks = Math.max(8, Math.floor((cssH - floorY) / 18));
  for (let i = 0; i < planks; i++) {
    g.fillStyle = i % 2 ? "rgba(255,220,170,0.08)" : "rgba(0,0,0,0.15)";
    g.fillRect(0, floorY + i * ((cssH - floorY) / planks), cssW, 2);
  }
  drawDiamondWindow(g, cssW * 0.03, cssH * 0.12, Math.max(36, cssW * 0.06), Math.max(48, cssH * 0.14));
  g.fillStyle = "#2f6a34";
  g.beginPath();
  g.arc(cssW * 0.16, floorY - 4, 18, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#5c3a22";
  g.fillRect(cssW * 0.155, floorY - 2, 10, 22);
  g.fillStyle = "#4a3424";
  g.fillRect(cssW * 0.72, floorY - 6, cssW * 0.05, 12);
  g.fillRect(cssW * 0.78, floorY - 6, cssW * 0.05, 12);
  const rails = [
    { id: "kas", label: "tKAS" },
    { id: "poc", label: "POCencept" },
    { id: "kusdt", label: "KUSDT" },
  ];
  const bw = Math.min(Math.max(150, cssW * 0.16), 250);
  const gap = Math.max(18, cssW * 0.028);
  const total = bw * 3 + gap * 2;
  const x0 = Math.max(24, (cssW - total) / 2 - cssW * 0.06);
  const by = cssH * 0.08;
  const bh = Math.min(cssH * 0.34, 280);
  const age = state.bankShutter ? Math.min(1, (t - state.bankShutter) / 600) : 1;
  const hits = [];
  rails.forEach((rail, i) => {
    const x = x0 + i * (bw + gap);
    const active = state.bankRail === rail.id && !state.bankFlight;
    g.fillStyle = "#e6d3b0";
    g.fillRect(x, by, bw, bh);
    g.fillStyle = "#8a7040";
    g.fillRect(x, by, bw, 8);
    g.fillRect(x, by + bh - 8, bw, 8);
    g.fillRect(x, by, 8, bh);
    g.fillRect(x + bw - 8, by, 8, bh);
    const ix = x + 14;
    const iy = by + 16;
    const iw = bw - 28;
    const ih = bh - 40;
    g.fillStyle = active ? "#2a2118" : "#4a3828";
    g.fillRect(ix, iy, iw, ih);
    if (active) {
      g.fillStyle = "#e7a04a";
      g.fillRect(ix + iw * 0.72, iy + ih * 0.42, 8, 16);
      g.fillStyle = "#9ecbff";
      g.fillRect(ix + iw * 0.38, iy + ih * 0.45, Math.max(10, iw * 0.16), ih * 0.28);
    }
    const shut = active ? 1 - age : 1;
    if (shut > 0.02) {
      g.fillStyle = "#5c3a22";
      g.fillRect(ix, iy, iw, ih * shut);
      g.fillStyle = "#3a2414";
      for (let s = 1; s < 5; s++) g.fillRect(ix, iy + ih * shut * (s / 5), iw, 2);
    }
    g.font = "600 " + Math.max(13, cssW * 0.013) + "px Segoe UI, sans-serif";
    g.textAlign = "center";
    g.fillStyle = "#1a1612";
    g.fillText(rail.label, x + bw / 2, by + bh - 14);
    const qy = floorY + 18;
    if (active) {
      const qx = x + bw / 2;
      g.fillStyle = "#e1c27a";
      g.fillRect(qx - 22, qy, 6, 40);
      g.fillRect(qx + 16, qy, 6, 40);
      g.strokeStyle = "#2f6a34";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(qx - 19, qy + 12);
      g.lineTo(qx + 19, qy + 12);
      g.stroke();
    } else {
      g.strokeStyle = "#8a3030";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + 8, qy + 8);
      g.lineTo(x + bw - 8, qy + 22);
      g.stroke();
    }
    hits.push({ rail: rail.id, x, y: by, w: bw, h: bh + 70 });
  });
  const rugW = Math.min(cssW * 0.16, 180);
  const rugH = Math.min(cssH * 0.1, 70);
  const rx = x0 + bw + gap * 0.2;
  const ry = Math.min(cssH * 0.78, floorY + 80);
  g.fillStyle = "#1d4e89";
  g.fillRect(rx, ry, rugW, rugH);
  g.strokeStyle = "#e1c27a";
  g.lineWidth = 2;
  g.strokeRect(rx + 5, ry + 5, rugW - 10, rugH - 10);
  g.fillStyle = "#f3e6c8";
  g.beginPath();
  g.moveTo(rx + rugW / 2, ry + 10);
  g.lineTo(rx + rugW - 14, ry + rugH / 2);
  g.lineTo(rx + rugW / 2, ry + rugH - 10);
  g.lineTo(rx + 14, ry + rugH / 2);
  g.closePath();
  g.fill();
  g.fillStyle = "#7c9a46";
  g.fillRect(doorX, Math.max(doorY, floorY), doorW, cssH);
  g.fillStyle = "#c6b896";
  g.fillRect(doorX + doorW * 0.36, Math.max(doorY, floorY), doorW * 0.28, cssH);
  g.fillStyle = "#b7b2aa";
  g.fillRect(doorX - 14, floorY - 8, 16, cssH);
  g.fillRect(doorX + doorW - 2, floorY - 8, 16, cssH);
  g.fillRect(doorX - 14, floorY - 20, doorW + 30, 18);
  state.boothHits = hits;
}

function paintMini() {
  mctx.fillStyle = "#1a1612";
  mctx.fillRect(0, 0, mini.width, mini.height);
  const sx = mini.width / map.w;
  const sy = mini.height / map.h;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const tile = map.grid[y][x];
      if (tile === "g") continue;
      mctx.fillStyle = tile === "w" ? "#3d82ad" : tile === "t" ? "#1d4a2c" : "#c6a15a";
      mctx.fillRect(x * sx, y * sy, sx, sy);
    }
  }
  mctx.fillStyle = "#f2d16b";
  mctx.fillRect(state.player.x * sx, state.player.y * sy, 3, 3);
}

function drawPrism(g, box, b) {
  const wall = box.tile * 0.95;
  const nw = iso(box, b.x, b.y);
  const ne = iso(box, b.x + b.w, b.y);
  const se = iso(box, b.x + b.w, b.y + b.h);
  const sw = iso(box, b.x, b.y + b.h);
  g.fillStyle = "rgba(40, 22, 8, 0.28)";
  g.beginPath();
  g.moveTo(ne.x + box.tile * 0.35, ne.y + box.tile * 0.15);
  g.lineTo(se.x + box.tile * 0.45, se.y + box.tile * 0.2);
  g.lineTo(sw.x + box.tile * 0.2, sw.y + box.tile * 0.22);
  g.lineTo(nw.x + box.tile * 0.1, nw.y + box.tile * 0.12);
  g.closePath();
  g.fill();
  g.fillStyle = "#5e5a54";
  g.beginPath();
  g.moveTo(ne.x, ne.y - wall);
  g.lineTo(se.x, se.y - wall);
  g.lineTo(se.x, se.y);
  g.lineTo(ne.x, ne.y);
  g.closePath();
  g.fill();
  g.fillStyle = "#7d7871";
  g.beginPath();
  g.moveTo(sw.x, sw.y - wall);
  g.lineTo(se.x, se.y - wall);
  g.lineTo(se.x, se.y);
  g.lineTo(sw.x, sw.y);
  g.closePath();
  g.fill();
  const lit = (b.x + b.y) % 2 === 0;
  const windows = Math.max(1, Math.floor(b.w / 3));
  for (let i = 0; i < windows; i++) {
    const t = (i + 1) / (windows + 1);
    const wx = sw.x + (se.x - sw.x) * t;
    const wy = sw.y + (se.y - sw.y) * t;
    g.fillStyle = "#14120f";
    g.fillRect(wx - 4, wy - wall * 0.62, 8, 12);
    if (lit) {
      g.fillStyle = "rgba(232, 138, 48, 0.9)";
      g.fillRect(wx - 2, wy - wall * 0.55, 4, 5);
    }
  }
  g.fillStyle = b.roof;
  g.beginPath();
  g.moveTo(nw.x, nw.y - wall - box.tile * 0.28);
  g.lineTo(ne.x, ne.y - wall);
  g.lineTo(se.x, se.y - wall);
  g.lineTo(sw.x, sw.y - wall - box.tile * 0.08);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.beginPath();
  g.moveTo(nw.x, nw.y - wall - box.tile * 0.28);
  g.lineTo((nw.x + ne.x) / 2, (nw.y + ne.y) / 2 - wall - box.tile * 0.1);
  g.lineTo((sw.x + se.x) / 2, (sw.y + se.y) / 2 - wall);
  g.lineTo(sw.x, sw.y - wall - box.tile * 0.08);
  g.closePath();
  g.fill();
  if (b.id === "bank") {
    g.fillStyle = "#d5d0c8";
    for (let i = 0; i <= b.w; i += 2) {
      const p = iso(box, b.x + i, b.y);
      g.fillRect(p.x - 3, p.y - wall - box.tile * 0.42, 7, box.tile * 0.22);
    }
  }
  const eastDoor = b.door.x === b.x + b.w - 1;
  const doorFrom = eastDoor ? iso(box, b.x + b.w, b.y + 0.35) : iso(box, b.x + 0.35, b.y + b.h);
  const doorTo = eastDoor ? iso(box, b.x + b.w, b.y + b.h - 0.35) : iso(box, b.x + b.w - 0.35, b.y + b.h);
  const doorX = (doorFrom.x + doorTo.x) / 2;
  const doorY = (doorFrom.y + doorTo.y) / 2;
  g.fillStyle = "#5a3418";
  g.fillRect(doorX - 6, doorY - wall * 0.72, 12, wall * 0.55);
  g.fillStyle = "#e1c27a";
  g.fillRect(doorX + 2, doorY - wall * 0.42, 2, 2);
  g.font = "600 " + Math.max(12, box.tile * 0.42) + "px Segoe UI, sans-serif";
  g.textAlign = "center";
  const sign = iso(box, b.x + b.w / 2, b.y + b.h / 2);
  const board = Math.max(box.tile * 1.6, g.measureText(b.sign).width + 14);
  g.fillStyle = "#5c3a22";
  g.fillRect(sign.x - board / 2, sign.y - wall - 8, board, 16);
  g.fillStyle = "#f3e6c8";
  g.fillText(b.sign, sign.x, sign.y - wall + 4);
}

function drawTown(box, t) {
  const g = ctx;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const kind = map.grid[y][x];
      const home = buildingAt(x, y);
      g.fillStyle = home && home.id === "bank" && kind === "i" ? "#3d4a44" : tileColor(kind, x, y, t);
      fillDiamond(g, box, x, y);
      if (kind === "t" && !(x === 0 || y === 0 || x === map.w - 1 || y === map.h - 1)) {
        const p = iso(box, x + 0.5, y + 0.5);
        g.fillStyle = "#5c3a22";
        g.fillRect(p.x - 2, p.y - box.tile * 0.35, 4, box.tile * 0.4);
        g.fillStyle = ["#c45a28", "#e0a030", "#8a3a28"][(x + y) % 3];
        g.beginPath();
        g.arc(p.x, p.y - box.tile * 0.48, box.tile * 0.28, 0, Math.PI * 2);
        g.fill();
      }
      if (kind === "f") {
        const p = iso(box, x + 0.5, y + 0.5);
        g.fillStyle = "#e7c56a";
        g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
    }
  }
  const buildings = map.buildings.slice().sort((a, b) => a.x + a.y + a.w + a.h - (b.x + b.y + b.w + b.h));
  for (const b of buildings) drawPrism(g, box, b);
  const market = map.buildings.find((b) => b.id === "groceries");
  if (market) {
    const a = iso(box, market.x, market.y + market.h);
    const c = iso(box, market.x + market.w, market.y + market.h + 1.2);
    g.fillStyle = "#2f5f9a";
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(iso(box, market.x + market.w, market.y + market.h).x, iso(box, market.x + market.w, market.y + market.h).y);
    g.lineTo(c.x, c.y);
    g.lineTo(iso(box, market.x, market.y + market.h + 1.2).x, iso(box, market.x, market.y + market.h + 1.2).y);
    g.closePath();
    g.fill();
  }
  const fx = iso(box, 21, 16.5);
  g.fillStyle = "#d7d2c8";
  g.beginPath();
  g.ellipse(fx.x, fx.y, box.tile * 1.15, box.tile * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = t % 900 < 450 ? "#2f6fa3" : "#3d82b8";
  g.beginPath();
  g.ellipse(fx.x, fx.y, box.tile * 0.82, box.tile * 0.42, 0, 0, Math.PI * 2);
  g.fill();
  const hay = iso(box, 9.5, 29);
  g.fillStyle = "#c4a15a";
  g.beginPath();
  g.moveTo(hay.x - box.tile * 0.7, hay.y);
  g.lineTo(hay.x, hay.y - box.tile * 0.55);
  g.lineTo(hay.x + box.tile * 0.7, hay.y);
  g.closePath();
  g.fill();
  g.strokeStyle = "#6b4a2a";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(iso(box, 2, 30.4).x, iso(box, 2, 30.4).y);
  g.lineTo(iso(box, 13, 30.4).x, iso(box, 13, 30.4).y);
  g.stroke();
  drawBanner(g, iso(box, 16, 12).x, iso(box, 16, 12).y - box.tile, box.tile * 0.7, "#6e2430");
  drawBanner(g, iso(box, 26, 12).x, iso(box, 26, 12).y - box.tile, box.tile * 0.7, "#2f4d6a");
  const plaque = iso(box, 18, 13.2);
  g.font = "600 " + Math.max(12, box.tile * 0.4) + "px Segoe UI, sans-serif";
  g.textAlign = "center";
  const label = "Ashfields";
  const boardW = g.measureText(label).width + 16;
  g.fillStyle = "#5c3a22";
  g.fillRect(plaque.x - boardW / 2, plaque.y - 14, boardW, 18);
  g.fillStyle = "#f3e6c8";
  g.fillText(label, plaque.x, plaque.y);
  const car = iso(box, map.car.x + map.car.w / 2, map.car.y + 0.6);
  g.fillStyle = "#c0392b";
  g.fillRect(car.x - box.tile * 0.9, car.y - box.tile * 0.28, box.tile * 1.8, box.tile * 0.36);
  g.fillStyle = "#8fd0f0";
  g.fillRect(car.x - box.tile * 0.35, car.y - box.tile * 0.22, box.tile * 0.7, box.tile * 0.12);
  g.fillStyle = "#1a1612";
  g.beginPath();
  g.arc(car.x - box.tile * 0.55, car.y + box.tile * 0.1, box.tile * 0.12, 0, Math.PI * 2);
  g.arc(car.x + box.tile * 0.55, car.y + box.tile * 0.1, box.tile * 0.12, 0, Math.PI * 2);
  g.fill();
  for (const npc of map.npcs) {
    const p = iso(box, npc.x + 0.5, npc.y + 0.5);
    drawPerson(g, (p.x - box.tile * 0.5) / box.tile, (p.y - box.tile * 0.5) / box.tile, npc.color, npc.name, box.tile);
  }
  const bob = Math.sin(t / 180) * 0.04;
  const player = iso(box, state.player.x + 0.5, state.player.y + 0.5 + bob);
  drawPerson(g, (player.x - box.tile * 0.5) / box.tile, (player.y - box.tile * 0.5) / box.tile, "#f2d16b", "", box.tile);
}

function draw() {
  const t = performance.now();
  const box = frame();
  const { dpr, cssW, cssH } = box;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state.mode === "bank") {
    drawBankRoom(cssW, cssH, t);
    paintMini();
    return;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, cssH);
  sky.addColorStop(0, "#f3d7a4");
  sky.addColorStop(0.45, "#c9844a");
  sky.addColorStop(1, "#6d8a3a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssW, cssH);
  drawTown(box, t);
  const sun = ctx.createLinearGradient(0, 0, cssW, cssH);
  sun.addColorStop(0, "rgba(255, 186, 90, 0.16)");
  sun.addColorStop(0.55, "rgba(255, 186, 90, 0)");
  sun.addColorStop(1, "rgba(30, 18, 8, 0.18)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, cssW, cssH);
  paintMini();
}

function step(now) {
  if (state.bankFlight && now >= state.bankFlight.until) {
    const rail = state.bankFlight.rail;
    state.bankFlight = null;
    state.bankRail = rail;
    state.bankShutter = now;
    if (state.mode === "bank") paintBank();
  }
  if (state.path.length && now - state.stepAt > 140) {
    const next = state.path.shift();
    state.facing = { x: next.x - state.player.x, y: next.y - state.player.y };
    state.player = next;
    state.stepAt = now;
    if (!state.path.length && state.arrived) {
      const fn = state.arrived;
      state.arrived = null;
      fn();
    }
  }
  draw();
  requestAnimationFrame(step);
}

function walkTo(x, y, then) {
  const dest = destinationFor(x, y);
  if (!dest) {
    say("That is not a path.", true);
    return;
  }
  const path = findPath(map.grid, state.player, dest);
  if (!path) {
    say("No path there.", true);
    return;
  }
  state.path = path.slice(1);
  state.arrived = then || (dest.shop ? () => openMode(dest.shop) : null);
  if (!state.path.length && state.arrived) {
    const fn = state.arrived;
    state.arrived = null;
    fn();
  }
}

function tileFromEvent(ev) {
  const rect = view.getBoundingClientRect();
  const box = frame();
  const px = ev.clientX - rect.left - box.originX;
  const py = ev.clientY - rect.top - box.originY;
  const gx = (px / (box.tile * 0.5) + py / (box.tile * 0.28)) / 2;
  const gy = (py / (box.tile * 0.28) - px / (box.tile * 0.5)) / 2;
  return { x: Math.floor(gx), y: Math.floor(gy) };
}

view.addEventListener("click", (ev) => {
  if (state.mode === "bank") {
    const rect = view.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const hit = state.boothHits.find((item) => px >= item.x && py >= item.y && px < item.x + item.w && py < item.y + item.h);
    if (hit) chooseRail(hit.rail);
    return;
  }
  const tile = tileFromEvent(ev);
  const npc = map.npcs.find((item) => item.x === tile.x && item.y === tile.y);
  walkTo(tile.x, tile.y, npc ? () => openMode(npc.shop) : null);
});

window.addEventListener("keydown", (ev) => {
  const key = ev.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "e", "escape"].includes(ev.key.toLowerCase()) || ["w", "a", "s", "d"].includes(key)) {
    if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
    ev.preventDefault();
  }
  if (key === "escape") {
    openMode("world");
    return;
  }
  if (key === "e") {
    let best = null;
    let bestD = 99;
    for (const npc of map.npcs) {
      const d = Math.abs(npc.x - state.player.x) + Math.abs(npc.y - state.player.y);
      if (d < bestD) {
        best = npc;
        bestD = d;
      }
    }
    if (best && bestD <= 2) openMode(best.shop);
    else if (best) walkTo(best.x, best.y, () => openMode(best.shop));
    return;
  }
  const dir = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] }[key];
  if (!dir) return;
  state.path = [];
  const x = state.player.x + dir[0];
  const y = state.player.y + dir[1];
  if (y >= 0 && x >= 0 && y < map.h && x < map.w && walkable(map.grid[y][x])) {
    state.player = { x, y };
    state.facing = { x: dir[0], y: dir[1] };
  }
});

window.addEventListener("resize", () => frame());
side.addEventListener("click", (ev) => {
  const button = ev.target.closest("[data-go]");
  if (!button) return;
  const mode = button.getAttribute("data-go");
  if (mode !== "world" && mode !== "rules" && mode !== "bench" && mode !== "guide") {
    const npc = map.npcs.find((item) => item.shop === mode);
    if (npc) walkTo(npc.x, npc.y, () => openMode(mode));
  }
  openMode(mode);
});
you.addEventListener("click", (ev) => {
  if (ev.target.id === "use-kasware") connectWallet("kasware").catch((err) => say(err.message, true));
  if (ev.target.id === "use-kastle") connectWallet("kastle").catch((err) => say(err.message, true));
  if (ev.target.id === "use-guest") startGuest().catch((err) => say(err.message, true));
  if (ev.target.id === "use-addr") useAddress();
  if (ev.target.id === "use-name") useName();
});

const gate = document.getElementById("gate");
function hideGate() {
  if (gate) gate.hidden = true;
}
document.getElementById("gate-new").addEventListener("click", () => {
  startGuest()
    .then(() => {
      if (state.id.kind === "guest") hideGate();
    })
    .catch((err) => say(err.message, true));
});
document.getElementById("gate-back").addEventListener("click", () => {
  hideGate();
  if (state.id.kind === "guest") {
    say("This tab is already a new arrival. Close the tab and that address is gone. Pick a wallet in the panel if you want the history kept.");
  } else if (state.id.address) {
    say("Returning as " + (state.id.label || state.id.address) + ". This one stays on this browser.");
  } else {
    say("Returning. Pick Kasware, Kastle, a kaspatest address, or a .kas name. That choice stays on this browser.");
  }
  const addr = document.getElementById("addr");
  if (addr) addr.focus();
});
panel.addEventListener("click", (ev) => {
  const booth = ev.target.closest("[data-booth]");
  if (booth) {
    chooseRail(booth.getAttribute("data-booth"));
    return;
  }
  const button = ev.target.closest("[data-pay]");
  if (!button) return;
  spend(button.getAttribute("data-pay"), button.getAttribute("data-shop"), button.getAttribute("data-sku"), false).catch((err) => say(err.message, true));
});

requestAnimationFrame(step);
paintChrome();
say("Kworld. Ashfields. Testnet 10. The gate asks if you are a new arrival or returning.");
window.addEventListener("pagehide", () => {
  if (state.id.kind !== "guest" || !state.id.token) return;
  const payload = JSON.stringify({ token: state.id.token, address: state.id.address, life: PAGE_LIFE });
  for (const base of bases()) {
    fetch(base + "/api/kworld/guest/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
});
keepGuest();
setInterval(keepGuest, 45_000);
api("/api/kworld").then((body) => {
  if (!body.ok) {
    state.oracleError = body.error || "Ledger offline.";
    say(state.oracleError, true);
    return;
  }
  state.home = body;
  state.oracle = body.oracle;
  state.oracleError = body.oracleError || "";
  state.reserve = body.reserve || RESERVE;
  if (state.oracle) say("Live KAS $" + Number(state.oracle).toFixed(4) + ". Shop tags stay in toy dollars.");
  else if (state.oracleError) say(state.oracleError, true);
  paintChrome();
  if (state.mode !== "world") openMode(state.mode);
});
if (state.id.address) refreshAccount();
