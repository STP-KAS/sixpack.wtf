import { readIdentity, writeIdentity } from "./identity.mjs";
import { BENCH, REPOS } from "./links.mjs";
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
import { mountWorld } from "./view3d.mjs?v=4";
import { destinationFor, findPath, walkable, world } from "./world.mjs";
const TUNNEL = "https://hydrocodone-wireless-clay-requests.trycloudflare.com";
const PAGE_LIFE = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
const map = world();
const view = document.getElementById("view");
const mini = document.getElementById("mini");
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
  shopRail: "poc",
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
  if (window.TOWN_API) list.push(window.TOWN_API);
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
        signal: AbortSignal.timeout(45000),
      });
      const text = await res.text();
      if (!text || text[0] === "<" || res.status === 404 || res.status === 405) continue;
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
  const guestLine = id.kind === "guest" ? " · this tab only" : "";
  bar.innerHTML =
    "<strong>" + esc(label) + "</strong> · " + esc(kas) + " · " + esc(poc) + " · " + esc(kusdt) + frozen + esc(guestLine);

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
    '<p class="fine">Testnet 10 only. A mainnet wallet is refused.</p>' +
    '<div class="kw-row"><button type="button" id="use-kasware">Log in with Kasware</button><button type="button" id="use-kastle">Log in with Kastle</button></div>' +
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
  const body = await api("/api/1984/account?address=" + encodeURIComponent(state.id.address));
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
  api("/api/1984/guest/close", {
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

async function readLiveAddress(kind) {
  try {
    if (kind === "kasware" && window.kasware && window.kasware.getAccounts) {
      const acc = await window.kasware.getAccounts();
      if (Array.isArray(acc) && acc[0]) return String(acc[0]);
    }
    if (kind === "kastle" && window.kastle && window.kastle.getAccount) {
      const acc = await window.kastle.getAccount();
      if (typeof acc === "string") return acc;
      if (acc && acc.address) return String(acc.address);
    }
  } catch (_) {}
  return "";
}

async function readLiveNetwork(kind) {
  try {
    const w = kind === "kasware" ? window.kasware : window.kastle;
    if (w && w.getNetwork) return String((await w.getNetwork()) || "");
  } catch (_) {}
  return "";
}

async function switchToTn10(kind) {
  const label = kind === "kasware" ? "Kasware" : "Kastle";
  const w = kind === "kasware" ? window.kasware : window.kastle;
  if (!w || typeof w.switchNetwork !== "function") {
    throw new Error(label + " has no network switch on this page. Set Testnet 10 in the wallet, then click again.");
  }
  try {
    await w.switchNetwork(kind === "kasware" ? "kaspa_testnet_10" : "testnet-10");
  } catch (err) {
    const detail = err && err.message ? String(err.message) : "";
    throw new Error(
      label + " did not switch to Testnet 10." +
      (detail ? " " + detail : " On a phone the wallet cannot switch from a page. Set Testnet 10 in the wallet, then click again."),
    );
  }
}

async function connectWallet(kind) {
  const kit = window.KaspaWallets;
  if (!kit || !kit.connect) {
    say("Wallet kit is not on this page. Hard-refresh.", true);
    return;
  }
  const name = kind === "kasware" ? "Kasware" : "Kastle";
  gateStatus("Opening " + name + " on Testnet 10…");
  say(name + ": approve the login. This page accepts Testnet 10 only.");
  const got = await kit.connect(kind);
  let switchError = "";
  try {
    await switchToTn10(kind);
  } catch (err) {
    switchError = err && err.message ? err.message : name + " did not switch to Testnet 10.";
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  let address = await readLiveAddress(kind);
  if (!address) address = (got && got.address) || "";
  let net = await readLiveNetwork(kind);
  if (/main/i.test(net) || (/^kaspa:/i.test(address) && !/^kaspatest:/i.test(address))) {
    try {
      await switchToTn10(kind);
    } catch (err) {
      switchError = switchError || (err && err.message) || name + " did not switch to Testnet 10.";
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    const again = await readLiveAddress(kind);
    if (again) address = again;
    net = await readLiveNetwork(kind);
  }
  try {
    assertNotMainnetNetwork(net);
    assertTestnet(address);
  } catch (err) {
    try {
      await kit.logout();
    } catch (_) {}
    gateStatus("Testnet 10 only. Mainnet was refused.", true);
    say(name + " is not on Testnet 10. Set Testnet 10 in the wallet and click again. Mainnet is refused.", true);
    if (switchError) say(switchError, true);
    return;
  }
  setIdentity({ address, label: name, kind });
  hideGate();
  gateStatus("");
  if (switchError) say(name + " is logged in. The address is Testnet 10. The wallet did not switch from this page.");
  else say(name + " is logged in on Testnet 10. This login stays on this browser.");
}

async function startGuest() {
  if (guestBusy) return;
  guestBusy = true;
  try {
    say("Making a Testnet-10 address for this tab and putting tKAS on it. " + GUEST_DISCLAIMER);
    const body = await api("/api/1984/guest", {
      method: "POST",
      body: JSON.stringify({ network: "testnet-10", life: PAGE_LIFE }),
    });
    if (!body.ok || !body.address || !body.token || body.key || body.privateKey) {
      return { ok: false, error: body.error || "No test wallet. Use your own Testnet-10 wallet if you want the history kept." };
    }
    setIdentity({ address: body.address, label: "test tab", kind: "guest", token: body.token });
    say("This tab has " + formatTkas(body.sompi) + " tKAS. The balance can take a moment to show. Close the tab and this address is gone.");
    return { ok: true };
  } finally {
    guestBusy = false;
  }
}

function gateStatus(text, bad) {
  const el = document.getElementById("gate-status");
  if (!el) return;
  el.textContent = text || "";
  el.className = bad ? "gate-status bad" : "gate-status";
}

async function keepGuest() {
  if (state.id.kind !== "guest" || !state.id.token) return;
  const body = await api("/api/1984/guest/keep", {
    method: "POST",
    body: JSON.stringify({ token: state.id.token, address: state.id.address, network: "testnet-10", life: PAGE_LIFE }),
  });
  if (body.ok) return;
  const msg = String(body.error || "");
  if (!/dropped|closing|does not match/i.test(msg)) return;
  try {
    sessionStorage.removeItem("1984-guest-v1");
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
  const body = await api("/api/1984/resolve?name=" + encodeURIComponent(raw));
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
  const shade = document.getElementById("bank-shade");
  panel.classList.toggle("swap-pop", mode === "bank");
  if (shade) shade.hidden = mode !== "bank";
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

function splitCents(total, backed) {
  const have = BigInt(total || 0);
  const lock = BigInt(backed || 0);
  const purse = have > lock ? have - lock : 0n;
  return { have, lock, purse };
}

function balanceSheet() {
  const kas = !state.id.address ? "—" : state.kasSompi == null ? "…" : formatTkas(state.kasSompi) + " tKAS";
  const poc = splitCents(state.account && state.account.poc, state.account && state.account.pocBacked);
  const kusdt = splitCents(state.account && state.account.kusdt, state.account && state.account.kusdtBacked);
  const lockedKas = state.account ? formatTkas(state.account.liability) + " tKAS is locked behind the toys" : "";
  const frozen = state.account && state.account.kusdtFrozen ? " · frozen" : "";
  return (
    '<div class="balances">' +
    "<p><strong>tKAS</strong> " + esc(kas) + "</p>" +
    "<p><strong>POCencept</strong> " + esc(formatCents(poc.have)) + " · locked " + esc(formatCents(poc.lock)) + " · purse " + esc(formatCents(poc.purse)) + "</p>" +
    "<p><strong>KUSDT</strong> " + esc(formatCents(kusdt.have)) + " · locked " + esc(formatCents(kusdt.lock)) + " · purse " + esc(formatCents(kusdt.purse)) + esc(frozen) + "</p>" +
    (lockedKas ? '<p class="fine">' + esc(lockedKas) + "</p>" : "") +
    "</div>"
  );
}

function canPay(rail, cents) {
  if (rail === "kas") {
    const sompi = quoteSompi(cents);
    if (sompi == null || state.kasSompi == null) return null;
    return BigInt(state.kasSompi) >= sompi;
  }
  if (!state.account) return null;
  const have = BigInt(rail === "kusdt" ? state.account.kusdt || 0 : state.account.poc || 0);
  return have >= BigInt(cents);
}

function paintShop(shopId) {
  const shop = (state.home && state.home.shops ? state.home.shops : []).find((item) => item.id === shopId);
  const fallback = map.npcs.find((npc) => npc.shop === shopId);
  if (!shop) {
    panel.innerHTML = balanceSheet() + "<h2>" + esc(fallback ? fallback.name : "Shop") + "</h2><p>The menu loads from the village ledger. " + esc(state.oracleError || "It is not reachable from this browser yet.") + "</p>";
    return;
  }
  const rail = state.shopRail === "kas" || state.shopRail === "kusdt" ? state.shopRail : "poc";
  const names = { kas: "tKAS", poc: "POCencept", kusdt: "KUSDT" };
  const picks = ["poc", "kusdt", "kas"]
    .map((id) => '<button type="button" data-rail-pick="' + id + '"' + (id === rail ? ' class="on"' : "") + ">" + names[id] + "</button>")
    .join("");
  const rows = shop.items
    .map((item) => {
      const sompi = quoteSompi(item.cents);
      const kas = sompi == null ? "quote down" : formatTkas(sompi) + " tKAS";
      const price = rail === "kas" ? kas : formatCents(item.cents) + " " + names[rail];
      const frozenRail = rail === "kusdt" && state.account && state.account.kusdtFrozen;
      const afford = frozenRail ? false : canPay(rail, item.cents);
      const short = frozenRail ? "KUSDT is frozen. POCencept and tKAS still spend." : "Not enough " + names[rail] + " for " + item.name + ".";
      const button = afford === false
        ? '<button type="button" class="buy short" data-short="' + esc(short) + '">' + esc(frozenRail ? "KUSDT is frozen" : "Not enough " + names[rail]) + "</button>"
        : '<button type="button" class="buy" data-pay="' + rail + '" data-shop="' + shop.id + '" data-sku="' + item.sku + '">Buy · ' + esc(price) + "</button>";
      return (
        '<div class="item"><strong>' + esc(item.name) + "</strong> · " + esc(formatCents(item.cents)) +
        " toy dollars · " + esc(kas) + button + "</div>"
      );
    })
    .join("");
  const txid = rail === "kas"
    ? '<details class="paid-already"><summary>Already sent tKAS? Paste the txid</summary><textarea id="txid" rows="2"></textarea></details>'
    : "";
  panel.innerHTML =
    balanceSheet() +
    "<h2>" + esc(shop.name) + "</h2><p>" + esc(shop.line) + "</p>" +
    '<div class="booth-tabs">' + picks + "</div>" +
    rows + txid +
    "<p class=\"fine\">One rail for the whole menu. POCencept and KUSDT are toys. tKAS asks the wallet, and the miner fee is extra.</p>";
}

function swapAmount() {
  const el = document.getElementById("swap-amt");
  return el ? el.value : "";
}

function paintBank() {
  const rail = state.bankRail || "kas";
  const quote = state.oracle ? "Live KAS $" + Number(state.oracle).toFixed(4) + "." : "Live quote unavailable.";
  const kas = !state.id.address ? "—" : state.kasSompi == null ? "…" : formatTkas(state.kasSompi);
  const poc = splitCents(state.account && state.account.poc, state.account && state.account.pocBacked);
  const kusdt = splitCents(state.account && state.account.kusdt, state.account && state.account.kusdtBacked);
  const frozen = !!(state.account && state.account.kusdtFrozen);
  const card = (id, title, amount, detail, extra) =>
    '<button type="button" class="swap-bal' + (id === rail ? " on" : "") + (extra ? " " + extra : "") + '" data-booth="' + id + '">' +
    "<span>" + esc(title) + "</span><strong>" + esc(amount) + "</strong><small>" + esc(detail) + "</small></button>";
  panel.innerHTML =
    '<div class="swap">' +
    '<div class="swap-head"><h2>Venn\'s bank</h2><button type="button" id="bank-close">Close</button></div>' +
    '<p class="fine">Swap. tKAS moves. POCencept and KUSDT are tags.</p>' +
    '<div class="swap-bals">' +
    card("kas", "tKAS", kas, "spendable") +
    card("poc", "POCencept", formatCents(poc.have), "locked " + formatCents(poc.lock) + " · purse " + formatCents(poc.purse)) +
    card("kusdt", "KUSDT", formatCents(kusdt.have), "locked " + formatCents(kusdt.lock) + " · purse " + formatCents(kusdt.purse) + (frozen ? " · frozen" : ""), frozen ? "frozen" : "") +
    "</div>" +
    '<label class="amt">Amount<input id="swap-amt" value="1" inputmode="decimal"></label>' +
    '<div class="kw-row"><button type="button" id="lock-poc">tKAS → POCencept</button><button type="button" id="lock-kusdt">tKAS → KUSDT</button></div>' +
    '<div class="kw-row"><button type="button" id="redeem-poc">Redeem POCencept</button><button type="button" id="redeem-kusdt">Redeem KUSDT</button></div>' +
    '<div class="kw-row"><button type="button" id="purse">Practice purse</button><button type="button" id="freeze">' + (frozen ? "Thaw KUSDT" : "Freeze KUSDT") + "</button></div>" +
    '<details class="paid-already"><summary>Already sent tKAS? Paste the txid</summary><textarea id="lock-txid" rows="2"></textarea></details>' +
    '<p class="fine">' + esc(quote) + " Reserve " + esc(state.reserve) + ". Miner fee is extra tKAS. Redeem returns only the locked part.</p>" +
    "</div>";
  document.getElementById("bank-close").onclick = () => openMode("world");
  document.getElementById("lock-poc").onclick = () => lock("poc");
  document.getElementById("lock-kusdt").onclick = () => lock("kusdt");
  document.getElementById("redeem-poc").onclick = () => redeem("poc");
  document.getElementById("redeem-kusdt").onclick = () => redeem("kusdt");
  document.getElementById("purse").onclick = practice;
  document.getElementById("freeze").onclick = freeze;
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
    "<li>Click Kasware or Kastle and approve the login. This page asks the wallet to open on Testnet 10. If the window is black, close it, click the wallet icon, unlock, and try again. A mainnet address is still refused. A phone wallet cannot switch from this page. That login stays on this browser.</li>" +
    "<li>Or choose New arrival on the welcome gate. That is the same as Test without a wallet. This tab gets a new funded kaspatest address. Close the tab and that address is gone. Leftover tKAS is swept back. It does not replace a wallet you already saved. Returning leaves the gate and uses a wallet that stays on this browser.</li>" +
    "<li>Or paste a kaspatest address. Or type a .kas name that already resolves on TN10. That choice stays until you change it.</li>" +
    "<li>Need coins: the faucet tab pays 0.6 tKAS. At the live price that is a few cents, so it will not buy supper. Take the practice purse in the bank. That purse is play money.</li>" +
    "<li>Hold the left mouse button and move to look all the way around. Click the ground to walk, or use the left tabs. Pick one rail, then Buy.</li>" +
    "<li>tKAS asks the wallet to sign a real Testnet-10 transaction. The miner fee is extra tKAS.</li>" +
    "<li>Venn's bank opens as a swap. The three balances sit at the top. tKAS locks into a tag. Redeem returns only the locked part. KUSDT is the only freeze.</li>" +
    "<li>Rules: a daily cap, a shop list, a rail list, a confirm line.</li>" +
    "<li>The freeze switch is only on KUSDT.</li>" +
    "</ol>" +
    "<p>Also on the bench: KNS, tic-tac-toe, KaChat, Kaspero Labs, SilverScript, Argent. Tidewater is an MIT fishing island; this square did not copy that ocean. The Go topic list is markers and private-server code. This page uses neither of those, and it does not ship a soundtrack.</p>" +
    "<p class=\"warn\">" + esc(PRIVACY) + "</p>" +
    "<h2>Name</h2><p>This tab is called 1984.</p>";
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
    const quote = await api("/api/1984/quote?shop=" + encodeURIComponent(shop) + "&sku=" + encodeURIComponent(sku));
    if (!quote.ok) {
      say(quote.error || "No quote.", true);
      return;
    }
    if (state.id.kind === "guest") {
      say("Paying from this tab's test address. Close the tab and it is gone.");
      let body = await post("/api/1984/guest/spend", { token: state.id.token, shop, sku, confirmed: !!confirmed });
      if (body.needsConfirm) {
        const yes = window.confirm("This is over your confirm line. Pay it?");
        if (!yes) return;
        body = await post("/api/1984/guest/spend", { token: state.id.token, shop, sku, confirmed: true });
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
  let body = await post("/api/1984/spend", { shop, sku, rail, txid, confirmed: !!confirmed });
  if (body.needsConfirm) {
    const yes = window.confirm("This is over your confirm line. Pay it?");
    if (!yes) return;
    body = await post("/api/1984/spend", { shop, sku, rail, txid, confirmed: true });
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
    sompi = parseTkas(swapAmount());
  } catch (err) {
    say(err.message, true);
    return;
  }
  if (state.id.kind === "guest") {
    say("Locking tKAS from this tab's test address. Close the tab and the address is gone.");
    const body = await post("/api/1984/guest/convert", {
      token: state.id.token,
      rail,
      amount: swapAmount().trim(),
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
  const txField = document.getElementById("lock-txid");
  let txid = txField ? txField.value.trim() : "";
  if (!txid) {
    const kit = window.KaspaWallets;
    if (!kit || (state.id.kind !== "kasware" && state.id.kind !== "kastle")) {
      say("Connect a Testnet-10 wallet, or paste the txid of a payment to the reserve.", true);
      return;
    }
    say("Approve the lock of " + formatTkas(sompi) + " tKAS.");
    txid = await kit.sendKaspa(state.reserve, Number(sompi), { priorityFee: 10000 });
  }
  const body = await post("/api/1984/convert", { rail, txid });
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
  const amount = swapAmount().trim();
  say("Redeeming " + amount + " toy dollars. Testnet-10 has to accept the send.");
  const body = await post("/api/1984/redeem", { rail, amount });
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
  const body = await post("/api/1984/practice", {});
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
  const body = await post("/api/1984/freeze", { frozen: next });
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
  const body = await post("/api/1984/rules", { rules });
  if (!body.ok) {
    say(body.error || "Rules were not saved.", true);
    return;
  }
  say("Spending rules saved for this address.");
  await refreshAccount();
  openMode("rules");
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
  const px = state.player.x * sx + 1.5;
  const py = state.player.y * sy + 1.5;
  mctx.fillRect(state.player.x * sx, state.player.y * sy, 3, 3);
  mctx.strokeStyle = "#f2d16b";
  mctx.lineWidth = 1;
  mctx.beginPath();
  mctx.moveTo(px, py);
  mctx.lineTo(px + state.facing.x * 7, py + state.facing.y * 7);
  mctx.stroke();
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
  worldView.render(now);
  paintMini();
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
const worldView = mountWorld(view, map, {
  mode: () => state.mode,
  rail: () => state.bankRail,
  player: () => state.player,
  facing: () => state.facing,
  walk(x, y) {
    const npc = map.npcs.find((item) => item.x === x && item.y === y);
    walkTo(x, y, npc ? () => openMode(npc.shop) : null);
  },
  step(dx, dy) {
    if (!dx && !dy) return;
    state.path = [];
    state.arrived = null;
    const tries = [{ x: dx, y: dy }];
    if (dx && dy) tries.push({ x: dx, y: 0 }, { x: 0, y: dy });
    for (const t of tries) {
      const x = state.player.x + t.x;
      const y = state.player.y + t.y;
      if (y >= 0 && x >= 0 && y < map.h && x < map.w && walkable(map.grid[y][x])) {
        state.player = { x, y };
        state.facing = { x: t.x, y: t.y };
        return;
      }
    }
  },
  booth(rail) {
    chooseRail(rail);
  },
});

window.addEventListener("keydown", (ev) => {
  const key = ev.key.toLowerCase();
  if (key !== "e" && key !== "escape") return;
  if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
  ev.preventDefault();
  if (key === "escape") {
    openMode("world");
    return;
  }
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
});

window.addEventListener("resize", () => worldView.resize());
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
  if (ev.target.id === "use-guest") {
    startGuest()
      .then((result) => {
        if (result && result.error) say(result.error, true);
      })
      .catch((err) => say(err.message, true));
  }
  if (ev.target.id === "use-addr") useAddress();
  if (ev.target.id === "use-name") useName();
});

const gate = document.getElementById("gate");
function hideGate() {
  if (gate) gate.hidden = true;
}
document.getElementById("gate-new").addEventListener("click", () => {
  const button = document.getElementById("gate-new");
  if (button) button.disabled = true;
  gateStatus("Opening a test wallet for this tab…");
  startGuest()
    .then((result) => {
      if (state.id.kind === "guest") {
        hideGate();
        return;
      }
      const msg = (result && result.error) || "No test wallet. Use Returning, or Who pays.";
      const usedUp = /used today's|used up/i.test(msg);
      say(msg, true);
      if (usedUp) {
        hideGate();
        say("The square is open. A new test wallet is not available from this network until tomorrow.");
        return;
      }
      gateStatus(msg, true);
    })
    .catch((err) => {
      gateStatus(err.message, true);
      say(err.message, true);
    })
    .finally(() => {
      if (button) button.disabled = false;
    });
});
const payToggle = document.getElementById("pay-toggle");
function setPayOpen(open) {
  you.hidden = !open;
  if (!payToggle) return;
  payToggle.setAttribute("aria-expanded", open ? "true" : "false");
  payToggle.textContent = open ? "Close" : "Who pays";
}
if (payToggle) payToggle.addEventListener("click", () => setPayOpen(you.hidden));
for (const button of document.querySelectorAll("[data-turn]")) {
  const code = button.getAttribute("data-turn") === "left" ? "ArrowLeft" : "ArrowRight";
  const down = (ev) => {
    ev.preventDefault();
    if (worldView.hold) worldView.hold(code, true);
  };
  const up = () => {
    if (worldView.hold) worldView.hold(code, false);
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("pointerleave", up);
}
document.getElementById("gate-back").addEventListener("click", () => {
  hideGate();
  setPayOpen(false);
  if (state.id.kind === "guest") {
    say("This tab is already a new arrival. Close the tab and that address is gone. Who pays is in the corner if you want a wallet kept.");
  } else if (state.id.address) {
    say("Returning as " + (state.id.label || state.id.address) + ". The square is open.");
  } else {
    say("The square is open. Who pays is in the corner for Kasware, Kastle, a kaspatest address, or a .kas name.");
  }
});
for (const [id, kind] of [["gate-kasware", "kasware"], ["gate-kastle", "kastle"]]) {
  const button = document.getElementById(id);
  if (!button) continue;
  button.addEventListener("click", () => {
    button.disabled = true;
    connectWallet(kind).catch((err) => {
      gateStatus(err.message, true);
      say(err.message, true);
    }).finally(() => {
      button.disabled = false;
    });
  });
}
const bankShade = document.getElementById("bank-shade");
if (bankShade) bankShade.addEventListener("click", () => openMode("world"));
panel.addEventListener("click", (ev) => {
  const pick = ev.target.closest("[data-rail-pick]");
  if (pick) {
    const rail = pick.getAttribute("data-rail-pick");
    if (rail === "kas" || rail === "poc" || rail === "kusdt") {
      state.shopRail = rail;
      paintShop(state.mode);
    }
    return;
  }
  const short = ev.target.closest("[data-short]");
  if (short) {
    say(short.getAttribute("data-short"), true);
    return;
  }
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
say("1984. Ashfields. Testnet 10. The gate asks if you are a new arrival or returning.");
window.addEventListener("pagehide", () => {
  if (state.id.kind !== "guest" || !state.id.token) return;
  const payload = JSON.stringify({ token: state.id.token, address: state.id.address, life: PAGE_LIFE });
  for (const base of bases()) {
    fetch(base + "/api/1984/guest/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
});
keepGuest();
setInterval(keepGuest, 45_000);
api("/api/1984").then((body) => {
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
