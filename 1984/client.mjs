import { readIdentity, writeIdentity } from "./identity.mjs";
import { BENCH, REPOS } from "./links.mjs";
import {
  GUEST_DISCLAIMER,
  RESERVE,
  assertNotMainnetNetwork,
  assertTestnet,
  centsForSompi,
  formatCents,
  formatTkas,
  parseDollars,
  parseTkas,
  sompiForCents,
} from "./money.mjs";
import { payFeeRate, WALLET_PRIORITY_SOMPI } from "../faucet/fee-rate.mjs";
import { kasSpendAction, lockSigner, shopBanner, txidFromWallet } from "./kas-spend.mjs";
import { DRIVE_MS, WALK_MS, mountWorld, seat } from "./view3d.mjs?v=10";
import { ROADSTER_PARK, destinationFor, findPath, nearShop, shopVisit, walkable, world } from "./world.mjs";
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
  bankClerk: "",
  shopRail: "poc",
  bankShutter: 0,
  bankFlight: null,
  boothHits: [],
  lapUntil: 0,
  aboard: false,
  inside: false,
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
  const driving = state.account && state.account.roadster ? (state.aboard ? " · driving" : " · walking") : "";
  bar.innerHTML =
    "<strong>" + esc(label) + "</strong> · " + esc(kas) + " · " + esc(poc) + " · " + esc(kusdt) + frozen + esc(guestLine) + driving;

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
  syncRide();
}

function groundTile() {
  return map.grid[state.player.y] && map.grid[state.player.y][state.player.x];
}

function syncRide() {
  const btn = document.getElementById("ride");
  if (!btn) return;
  const owns = !!(state.account && state.account.roadster);
  btn.hidden = !owns;
  btn.textContent = state.aboard ? "Get out" : "Get in";
}

function toggleRide() {
  if (!state.account || !state.account.roadster) return;
  state.aboard = !state.aboard;
  if (state.aboard) {
    showBanner("You drive.");
    say(groundTile() === "i"
      ? "You will drive when you step outside. Inside, you walk."
      : "You are in the roadster. Get out when you want to walk.");
  } else {
    showBanner("You walk.");
    say("You got out. The roadster is parked in front of Pike's shop. Click it to get back in.");
  }
  paintChrome();
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

let keepClerk = false;

function chooseRail(rail) {
  if (rail !== "kas" && rail !== "poc" && rail !== "kusdt") return;
  if (swapBusy) return;
  state.bankFlight = null;
  state.bankRail = rail;
  state.bankClerk = rail;
  state.bankShutter = performance.now();
  if (state.mode !== "bank") {
    keepClerk = true;
    openMode("bank");
    keepClerk = false;
    return;
  }
  say(RAIL_CHAT[rail]);
  paintBank();
}

function isVisit(mode) {
  return shopVisit(mode);
}

function arriveVisit(shop) {
  state.inside = true;
  openMode(shop);
}

function enterVisit(shop) {
  state.path = [];
  state.arrived = null;
  state.inside = true;
  openMode(shop);
}

function openMode(mode) {
  const enteringBank = mode === "bank" && state.mode !== "bank";
  const enteringShop = isVisit(mode) && mode !== "bank" && state.mode !== mode;
  if (mode === "world" && state.mode !== "world") state.arrived = null;
  state.inside = isVisit(mode);
  state.mode = mode;
  markRoom();
  paintChrome();
  const shade = document.getElementById("bank-shade");
  panel.classList.toggle("swap-pop", mode === "bank");
  panel.classList.toggle("stall-pop", isVisit(mode) && mode !== "bank");
  if (shade) shade.hidden = !isVisit(mode);
  if (mode === "world") {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  if (mode === "bank") {
    if (enteringBank && !keepClerk) {
      state.bankClerk = "";
      state.bankShutter = performance.now();
      say("Push a clerk. tKAS, POCencept, or KUSDT.");
    }
    paintBank();
  } else if (mode === "rules") paintRules();
  else if (mode === "bench") paintBench();
  else if (mode === "guide") paintGuide();
  else {
    if (enteringShop) {
      const shop = (state.home && state.home.shops ? state.home.shops : []).find((item) => item.id === mode);
      const keeper = shop ? shop.keeper : (map.npcs.find((npc) => npc.shop === mode) || {}).name;
      say((keeper || "The keeper") + " is at the counter.");
    }
    paintShop(mode);
  }
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

const STALL_FACE = {
  cafe: { tint: "#8d3b2f", letter: "C" },
  restaurant: { tint: "#8a5a2a", letter: "T" },
  groceries: { tint: "#3d6b45", letter: "M" },
  roadster: { tint: "#6e2430", letter: "R" },
};

function goodsMark(sku) {
  const marks = {
    water: ["#1c4a5c", "#9fd4ea", "M32 8c9 14 16 20 16 32a16 16 0 1 1-32 0C16 28 23 22 32 8z"],
    coffee: ["#4a2a1c", "#f4efe6", "M18 24h22v16a10 10 0 0 1-10 10h-2a10 10 0 0 1-10-10zm22 4h6a6 6 0 0 1 0 12h-6"],
    tea: ["#2a4030", "#d7e6c8", "M20 22h20l-2 26H22zm6-10c2 4 2 6 0 10m8-10c2 4 2 6 0 10"],
    bun: ["#6a4020", "#e7c27a", "M16 36c0-12 8-20 16-20s16 8 16 20z"],
    soup: ["#3a2414", "#e7c27a", "M14 28h36c-2 14-8 22-18 22S16 42 14 28zm6-8c4 2 6 2 8 0m8 0c2 2 4 2 8 0"],
    supper: ["#3a2414", "#f4efe6", "M12 30h40v6H12zm6 6h28l-2 16H20z"],
    cake: ["#5a3028", "#f0c0c8", "M16 28h32v20H16zm0-8h32v8H16m8-8v-6m8 6v-8m8 8v-6"],
    pebble: ["#3a342c", "#c8beb0", "M22 40c-6-2-8-10-4-16 4-8 14-10 20-4 8 6 8 16 2 20-4 4-12 2-18 0z"],
    bread: ["#6a4020", "#e0b060", "M14 36c0-10 8-16 18-16s18 6 18 16v6H14z"],
    milk: ["#e8e4dc", "#f7f4ee", "M24 16h16l4 10v24H20V26zm2 14h12"],
    apples: ["#2a4030", "#d24a3a", "M22 36a10 10 0 1 1 8-16 10 10 0 1 1 8 16c-2 6-6 10-8 10s-6-4-8-10z"],
    keys: ["#6e2430", "#e7c27a", "M18 32a8 8 0 1 1 4 7v5h4v4h4v4H22v-12a8 8 0 0 1-4-8z"],
    postcard: ["#1c3a4a", "#f4efe6", "M12 18h40v28H12zm4 6h14v10H16zm18 2h14m-14 6h14m-14 6h10"],
    sit: ["#2a241c", "#f0a36a", "M16 40h32v6H16zm6-6h8V22h12v12h6l-4 8"],
    lap: ["#6e2430", "#e7c27a", "M10 36c8-14 36-14 44 0M18 36a6 6 0 1 0 0.1 0M46 36a6 6 0 1 0 0.1 0"],
  };
  const pair = marks[sku] || marks.pebble;
  return (
    '<svg class="good-mark" viewBox="0 0 64 64" aria-hidden="true">' +
    '<rect width="64" height="64" rx="8" fill="' + pair[0] + '"/>' +
    '<path d="' + pair[2] + '" fill="none" stroke="' + pair[1] + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
    "</svg>"
  );
}

function paintShop(shopId) {
  const shop = (state.home && state.home.shops ? state.home.shops : []).find((item) => item.id === shopId);
  const fallback = map.npcs.find((npc) => npc.shop === shopId);
  if (!shop) {
    panel.innerHTML = '<div class="stall-head"><h2>' + esc(fallback ? fallback.name : "Shop") + '</h2><button type="button" id="stall-close">Close</button></div>' + balanceSheet() + "<p>The menu loads from the village ledger. " + esc(state.oracleError || "It is not reachable from this browser yet.") + "</p>";
    document.getElementById("stall-close").onclick = () => openMode("world");
    return;
  }
  const rail = state.shopRail === "kas" || state.shopRail === "kusdt" ? state.shopRail : "poc";
  const names = { kas: "tKAS", poc: "POCencept", kusdt: "KUSDT" };
  const picks = ["poc", "kusdt", "kas"]
    .map((id) => '<button type="button" data-rail-pick="' + id + '"' + (id === rail ? ' class="on"' : "") + ">" + names[id] + "</button>")
    .join("");
  const face = STALL_FACE[shop.id] || { tint: "#8a7040", letter: "S" };
  const rows = shop.items
    .map((item) => {
      const sompi = quoteSompi(item.cents);
      const kas = sompi == null ? "quote down" : formatTkas(sompi) + " tKAS";
      const price = rail === "kas" ? kas : formatCents(item.cents) + " " + names[rail];
      const frozenRail = rail === "kusdt" && state.account && state.account.kusdtFrozen;
      const ownedCar = item.sku === "keys" && state.account && state.account.roadster;
      const afford = frozenRail ? false : canPay(rail, item.cents);
      const short = frozenRail ? "KUSDT is frozen. POCencept and tKAS still spend." : "Not enough " + names[rail] + " for " + item.name + ".";
      const button = ownedCar
        ? '<button type="button" class="buy" disabled>Yours. Get in or get out.</button>'
        : afford === false
        ? '<button type="button" class="buy short" data-short="' + esc(short) + '">' + esc(frozenRail ? "KUSDT is frozen" : "Not enough " + names[rail]) + "</button>"
        : '<button type="button" class="buy" data-pay="' + rail + '" data-shop="' + shop.id + '" data-sku="' + item.sku + '">Buy · ' + esc(price) + "</button>";
      return (
        '<article class="good">' + goodsMark(item.sku) +
        "<div><strong>" + esc(item.name) + "</strong><span>" + esc(formatCents(item.cents)) +
        " toy dollars · " + esc(kas) + "</span></div>" + button + "</article>"
      );
    })
    .join("");
  const txid = rail === "kas"
    ? '<details class="paid-already"' + (shopTxid ? " open" : "") + '><summary>Already sent tKAS? Paste the txid</summary><textarea id="txid" rows="2">' + esc(shopTxid) + "</textarea></details>"
    : "";
  panel.innerHTML =
    '<div class="stall">' +
    '<div class="stall-head">' +
    '<svg class="stall-badge" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="10" fill="' + face.tint + '"/><text x="32" y="42" text-anchor="middle" fill="#f3e6c8" font-size="28" font-family="Georgia, serif">' + face.letter + "</text></svg>" +
    "<div><p class=\"stall-keeper\">" + esc(shop.keeper) + "</p><h2>" + esc(shop.name) + "</h2></div>" +
    '<button type="button" id="stall-close">Close</button></div>' +
    "<p>" + esc(shop.line) + "</p>" +
    balanceSheet() +
    '<div class="booth-tabs">' + picks + "</div>" +
    rows + txid +
    "<p class=\"fine\">One rail for the whole menu. POCencept and KUSDT are toys. tKAS asks the wallet. The miner fee is twice the standard Testnet 10 rate, and it is extra.</p></div>";
  document.getElementById("stall-close").onclick = () => openMode("world");
  const pasted = document.getElementById("txid");
  if (pasted) pasted.addEventListener("input", () => {
    shopTxid = pasted.value.trim();
  });
}

let lockDraft = "1";
let redeemDraft = "";
let swapNoteText = "Push a clerk. tKAS, POCencept, or KUSDT.";
let swapNoteKind = "";
let swapBusy = false;
let spendBusy = false;
let shopTxid = "";
let lockTxid = "";

function fieldValue(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function rememberSwapFields() {
  const lockEl = document.getElementById("lock-amt");
  const redeemEl = document.getElementById("redeem-amt");
  if (lockEl) lockDraft = lockEl.value;
  if (redeemEl) redeemDraft = redeemEl.value;
}

function swapNote(text, kind) {
  swapNoteText = text;
  swapNoteKind = kind || "";
  const el = document.getElementById("swap-status");
  if (el) {
    el.textContent = text;
    el.className = "swap-status" + (swapNoteKind ? " " + swapNoteKind : "");
  }
  say(text, kind === "bad");
}

function paintLockPreview() {
  const el = document.getElementById("lock-preview");
  if (!el) return;
  let sompi;
  try {
    sompi = parseTkas(fieldValue("lock-amt"));
  } catch (err) {
    el.textContent = err.message;
    return;
  }
  if (!state.oracle) {
    el.textContent = formatTkas(sompi) + " tKAS. The live price is not in yet, so the tag amount is not known.";
    return;
  }
  const cents = centsForSompi(sompi, state.oracle);
  const tag = formatCents(cents);
  el.textContent = cents > 0n
    ? formatTkas(sompi) + " tKAS becomes about " + tag + " at $" + Number(state.oracle).toFixed(4) + "."
    : formatTkas(sompi) + " tKAS is below 0.01 at this price. Swap more tKAS.";
}

function clerkFigure(id) {
  if (id === "kas") {
    if (!state.id.address) return "—";
    if (state.kasSompi == null) return "…";
    return formatTkas(state.kasSompi) + " tKAS";
  }
  if (!state.account) return "—";
  const cents = id === "poc" ? state.account.poc : state.account.kusdt;
  const frozen = id === "kusdt" && state.account.kusdtFrozen ? " · frozen" : "";
  return formatCents(cents) + frozen;
}

function bankFine() {
  const quote = state.oracle ? "Live KAS $" + Number(state.oracle).toFixed(4) + "." : "Live quote unavailable.";
  return '<p class="fine">' + esc(quote) + " Reserve " + esc(state.reserve) + ". Miner fee is extra tKAS. " + esc(payingLine()) + "</p>";
}

function statusLine() {
  return '<p id="swap-status" class="swap-status' + (swapNoteKind ? " " + swapNoteKind : "") + '" role="status">' + esc(swapNoteText) + "</p>";
}

function swapLoadHtml() {
  return '<p class="swap-load" id="swap-load" hidden><span class="sspin" aria-hidden="true"></span><span id="swap-load-text">Kasware is opening.</span></p><ol id="swap-steps" class="swap-steps" hidden></ol>';
}

function showSteps(steps, index, headline) {
  const load = document.getElementById("swap-load");
  const text = document.getElementById("swap-load-text");
  const list = document.getElementById("swap-steps");
  if (load) load.hidden = false;
  if (text) text.textContent = headline;
  if (!list) return;
  list.hidden = false;
  list.innerHTML = steps.map((name, i) => {
    const cls = i < index ? "done" : i === index ? "on" : "";
    return '<li class="' + cls + '">' + esc(name) + "</li>";
  }).join("");
}

function hideSteps() {
  const load = document.getElementById("swap-load");
  const list = document.getElementById("swap-steps");
  if (load) load.hidden = true;
  if (list) {
    list.hidden = true;
    list.innerHTML = "";
  }
}

function paintToyPreview() {
  const el = document.getElementById("toy-preview");
  if (!el) return;
  const raw = fieldValue("redeem-amt").trim();
  if (!raw) {
    el.textContent = "Type an amount, like 1.00.";
    return;
  }
  try {
    el.textContent = formatCents(parseDollars(raw)) + " toy dollars.";
  } catch (err) {
    el.textContent = err.message;
  }
}

function paintBank() {
  rememberSwapFields();
  const clerk = state.bankClerk || "";
  const frozen = !!(state.account && state.account.kusdtFrozen);
  const close = '<button type="button" id="bank-close">Close</button>';
  let body;
  if (!clerk) {
    const push = (id, title) =>
      '<button type="button" class="clerk-push" data-booth="' + id + '"><span>' + esc(title) + "</span><strong>" + esc(clerkFigure(id)) + "</strong><small>Push this window</small></button>";
    body =
      '<div class="swap-head"><h2>Venn\'s bank</h2>' + close + "</div>" +
      '<p class="clerk-ask">Push a clerk.</p>' +
      '<div class="clerk-picks">' + push("kas", "tKAS") + push("poc", "POCencept") + push("kusdt", "KUSDT") + "</div>" +
      '<button type="button" class="clerk-books" data-clerk="books">The books</button>' +
      statusLine() + bankFine();
  } else if (clerk === "books") {
    const poc = splitCents(state.account && state.account.poc, state.account && state.account.pocBacked);
    const kusdt = splitCents(state.account && state.account.kusdt, state.account && state.account.kusdtBacked);
    const card = (title, amount, detail) =>
      '<div class="swap-bal"><span>' + esc(title) + "</span><strong>" + esc(amount) + "</strong><small>" + esc(detail) + "</small></div>";
    body =
      '<div class="swap-head"><h2>The books</h2><button type="button" id="clerk-back" data-clerk="">Back</button></div>' +
      "<p>Locked toy dollars came from a real tKAS send. That part can come back as tKAS.</p>" +
      "<p>The purse is practice coins. Shops spend the purse first. The purse does not come back as tKAS.</p>" +
      "<p>A swap between POCencept and KUSDT moves each pile as itself. Locked stays locked. The purse stays a purse. No extra tKAS is locked or freed.</p>" +
      "<p>KUSDT can be frozen. POCencept cannot. A freeze blocks any swap that touches KUSDT.</p>" +
      '<div class="swap-bals">' +
      card("POCencept", formatCents(poc.have), "locked " + formatCents(poc.lock) + " · purse " + formatCents(poc.purse)) +
      card("KUSDT", formatCents(kusdt.have), "locked " + formatCents(kusdt.lock) + " · purse " + formatCents(kusdt.purse) + (frozen ? " · frozen" : "")) +
      "</div>" +
      '<div class="kw-row"><button type="button" id="purse" data-act>Practice purse</button><button type="button" id="freeze" data-act>' + (frozen ? "Thaw KUSDT" : "Freeze KUSDT") + "</button></div>" +
      statusLine() + bankFine();
  } else if (clerk === "kas") {
    body =
      '<div class="swap-head"><h2>tKAS</h2><button type="button" id="clerk-back" data-clerk="">Back</button></div>' +
      '<p class="clerk-ask">This window swaps into POCencept or KUSDT.</p>' +
      '<p class="clerk-bal"><span>You have</span><strong>' + esc(clerkFigure("kas")) + "</strong></p>" +
      '<p class="fine">Only the part that came from tKAS can come back. Practice stays a shop coin.</p>' +
      '<label class="amt">tKAS to swap<input id="lock-amt" value="' + esc(lockDraft) + '" inputmode="decimal" autocomplete="off"></label>' +
      '<p class="swap-preview" id="lock-preview"></p>' +
      '<div class="kw-row"><button type="button" id="lock-poc" data-act>Swap to POCencept</button><button type="button" id="lock-kusdt" data-act' + (frozen ? ' data-hold="1" disabled' : "") + ">Swap to KUSDT</button></div>" +
      swapLoadHtml() + statusLine() +
      '<details class="paid-already"' + (lockTxid ? " open" : "") + '><summary>Already sent tKAS? Paste the txid</summary><textarea id="lock-txid" rows="2">' + esc(lockTxid) + "</textarea></details>" +
      bankFine();
  } else {
    const name = clerk === "poc" ? "POCencept" : "KUSDT";
    const other = clerk === "poc" ? "kusdt" : "poc";
    const otherName = clerk === "poc" ? "KUSDT" : "POCencept";
    const blocked = clerk === "kusdt" && frozen;
    const otherBlocked = other === "kusdt" && frozen;
    body =
      '<div class="swap-head"><h2>' + esc(name) + '</h2><button type="button" id="clerk-back" data-clerk="">Back</button></div>' +
      '<p class="clerk-ask">This window swaps into tKAS or ' + esc(otherName) + ".</p>" +
      '<p class="clerk-bal"><span>You have</span><strong>' + esc(clerkFigure(clerk)) + "</strong></p>" +
      '<p class="fine">Only the part that came from tKAS can come back. Practice stays a shop coin.</p>' +
      (blocked ? '<p class="fine">KUSDT is frozen. Thaw it in the books before these swaps.</p>' : "") +
      '<label class="amt">Toy dollars<input id="redeem-amt" value="' + esc(redeemDraft) + '" placeholder="1.00" inputmode="decimal" autocomplete="off"></label>' +
      '<p class="swap-preview" id="toy-preview"></p>' +
      '<div class="kw-row"><button type="button" id="redeem-' + clerk + '" data-act' + (blocked ? ' data-hold="1" disabled' : "") + ">Swap to tKAS</button>" +
      '<button type="button" id="x-' + clerk + "-" + other + '" data-act' + (blocked || otherBlocked ? ' data-hold="1" disabled' : "") + ">Swap to " + esc(otherName) + "</button></div>" +
      swapLoadHtml() + statusLine() + bankFine();
  }
  panel.innerHTML = '<div class="swap">' + body + "</div>";
  if (clerk === "kas") {
    paintLockPreview();
    document.getElementById("lock-amt").addEventListener("input", () => {
      lockDraft = fieldValue("lock-amt");
      paintLockPreview();
    });
    const tx = document.getElementById("lock-txid");
    if (tx) tx.addEventListener("input", () => {
      lockTxid = fieldValue("lock-txid").trim();
    });
    document.getElementById("lock-poc").onclick = () => lock("poc");
    document.getElementById("lock-kusdt").onclick = () => lock("kusdt");
  } else if (clerk === "poc" || clerk === "kusdt") {
    paintToyPreview();
    document.getElementById("redeem-amt").addEventListener("input", () => {
      redeemDraft = fieldValue("redeem-amt");
      paintToyPreview();
    });
    const other = clerk === "poc" ? "kusdt" : "poc";
    document.getElementById("redeem-" + clerk).onclick = () => redeem(clerk);
    document.getElementById("x-" + clerk + "-" + other).onclick = () => exchange(clerk, other);
  } else if (clerk === "books") {
    document.getElementById("purse").onclick = practice;
    document.getElementById("freeze").onclick = freeze;
  }
  const shut = document.getElementById("bank-close");
  if (shut) shut.onclick = () => openMode("world");
  if (swapBusy) setSwapBusy(true);
}

function setSwapBusy(on) {
  swapBusy = on;
  const root = panel.querySelector(".swap");
  if (!root) return;
  for (const button of root.querySelectorAll("button")) {
    if (button.id === "bank-close" || button.id === "clerk-back") continue;
    button.disabled = on || button.getAttribute("data-hold") === "1";
  }
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
    "<li class=\"only-desk\">Click Kasware or Kastle and approve the login. This page asks the wallet to open on Testnet 10. If the window is black, close it, click the wallet icon, unlock, and try again. A mainnet address is still refused. That login stays on this browser.</li>" +
    "<li class=\"only-phone\">On a phone, set Testnet 10 inside Kasware or Kastle before you log in. This page cannot switch the phone wallet. Or open this page in the Kastle browser. If the window is black, close it, unlock the wallet, and try again. A mainnet address is still refused. That login stays on this browser.</li>" +
    "<li>Or choose New arrival on the welcome gate. That is the same as Test without a wallet. This tab gets 10000 tKAS from Grok's Testnet-10 wallet. Close the tab and that address is gone. Leftover tKAS is swept back. It does not replace a wallet you already saved. Returning leaves the gate and uses a wallet that stays on this browser. One thousand of these test wallets can be opened in a day.</li>" +
    "<li>Or paste a kaspatest address. Or type a .kas name that already resolves on TN10. That choice stays until you change it.</li>" +
    "<li>Need coins: New arrival gives this tab 10000 tKAS. The faucet tab pays 0.6 tKAS. At the live price that is a few cents, so it will not buy supper. The practice purse is in the books desk at the bank. That purse is play money.</li>" +
    "<li class=\"only-desk\">On a computer, hold the left mouse button and move to look all the way around. Click the ground to point where you walk, or use the keyboard. Stand next to a building and click it to go in. The counter is a popup. Buy the roadster and you drive it. W A S D move the way you look. The arrow keys do too. G gets in or out. Esc closes. Pick one rail, then Buy.</li>" +
    "<li class=\"only-phone\">On a phone, drag a finger to look. Tap the ground to walk or drive. Step moves you. Left and Right turn you. Tap a building you are next to and you go in. Get in drives. Get out walks. Square closes a shop. A phone wallet cannot switch to Testnet 10 from this page. Set Testnet 10 inside Kasware or Kastle, or open this page in the Kastle browser. New arrival is the test wallet.</li>" +
    "<li>tKAS asks the wallet to sign a real Testnet-10 transaction. The miner fee is twice the standard Testnet 10 rate, and it is extra tKAS.</li>" +
    "<li>Venn's bank starts with three clerks. Push tKAS, POCencept, or KUSDT. The open clerk swaps into the other two. The books desk explains locked coins and the practice purse. The Result line says whether a swap landed. While Kasware is opening, the steps stay on that clerk.</li>" +
    "<li>The roadster parks in front of Pike's shop. Click it to get in. Thrusters show while it moves. Get out to walk. Inside a shop you are on foot. The car does not leave town.</li>" +
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

function tookPayment(body, sku) {
  showBanner(shopBanner(sku));
  if (sku === "keys") {
    state.aboard = true;
    punch("nod");
    say("The roadster is yours. You are in it. Get out to walk. Inside a shop you are on foot. Get in when you want to drive.");
    syncRide();
  } else if (sku === "lap") {
    punch("lap");
    if (state.account && state.account.roadster) state.lapUntil = performance.now() + 6000;
    say(body.shop + " took the payment for " + body.item + ".");
  } else {
    punch("nod");
    say(body.shop + " took the payment for " + body.item + ".");
  }
}

function payingLine() {
  if (state.id.kind === "kasware") return "Paying as Kasware.";
  if (state.id.kind === "kastle") return "Paying as Kastle.";
  if (state.id.kind === "guest") return "Paying as this tab's test address.";
  if (state.id.kind === "name") return "Paying as " + (state.id.label || "a .kas name") + ".";
  if (state.id.address) return "Paying as a pasted address. Lock uses Kasware or Kastle when that wallet is this same address.";
  return "Choose who pays before locking.";
}

function signerRefusal(plan) {
  if (plan === "mainnet") return "The wallet is on mainnet. This square takes Testnet 10 only. Nothing moved.";
  if (plan === "mismatch") return "The wallet is open on a different address than this page. Click Log in with Kasware so this page uses that address. Nothing moved.";
  if (plan === "absent") return "This page is logged in with the wallet, and the extension is not in this tab. Unlock it, then press Lock again. Nothing moved.";
  return "Log in with Kasware or Kastle, or paste the txid of tKAS already sent to the reserve. Nothing moved.";
}

async function signerNow() {
  const kaswareAddress = await readLiveAddress("kasware");
  const kastleAddress = await readLiveAddress("kastle");
  return lockSigner({
    kind: state.id.kind,
    pageAddress: state.id.address,
    kit: !!(window.KaspaWallets && typeof window.KaspaWallets.sendKaspa === "function"),
    kaswareReady: !!(window.kasware && typeof window.kasware.sendKaspa === "function"),
    kastleReady: !!(window.kastle && typeof window.kastle.sendKaspa === "function"),
    kaswareAddress,
    kastleAddress,
  });
}

async function signerForSpend() {
  let plan = await signerNow();
  if (plan === "stop" || plan === "absent") {
    if (window.kasware && typeof window.kasware.requestAccounts === "function" && !(await readLiveAddress("kasware"))) {
      try {
        await window.kasware.requestAccounts();
      } catch (_) {}
      plan = await signerNow();
    }
  }
  if ((plan === "stop" || plan === "absent") && state.id.kind !== "kasware") {
    if (window.kastle && typeof window.kastle.connect === "function" && !(await readLiveAddress("kastle"))) {
      try {
        await window.kastle.connect();
      } catch (_) {}
      plan = await signerNow();
    }
  }
  return plan;
}

function rememberWalletKind(plan) {
  if (plan !== "kasware" && plan !== "kastle") return;
  if (state.id.kind === plan) return;
  const label = plan === "kasware" ? "Kasware" : "Kastle";
  const next = { address: state.id.address, label, kind: plan };
  try {
    writeIdentity(boxes(), next);
  } catch (_) {
    return;
  }
  state.id = next;
}

async function sendFromWallet(plan, sompi) {
  const opts = { priorityFee: WALLET_PRIORITY_SOMPI, feeRate: await walletFeeRate() };
  const amount = Number(sompi);
  if (plan === "kit") {
    return window.KaspaWallets.sendKaspa(state.reserve, amount, opts);
  }
  const provider = plan === "kastle" ? window.kastle : window.kasware;
  if (!provider || typeof provider.sendKaspa !== "function") throw new Error("The wallet is not in this tab.");
  return txidFromWallet(await provider.sendKaspa(state.reserve, amount, opts));
}

async function walletFeeRate() {
  const body = await api("/api/1984/fee");
  const n = Number(body && body.feerate);
  if (body && body.ok && Number.isFinite(n) && n >= 200) return n;
  return payFeeRate(null);
}

function rememberShopTxid(txid) {
  shopTxid = String(txid || "").trim();
  const box = panel.querySelector("#txid");
  if (!box || !shopTxid) return;
  box.value = shopTxid;
  const details = box.closest("details");
  if (details) details.open = true;
}

async function spend(rail, shop, sku, confirmed) {
  if (spendBusy) return;
  if (!requireId()) return;
  spendBusy = true;
  try {
    let txid = "";
    let yes = !!confirmed;
    if (rail === "kas") {
      const quote = await api("/api/1984/quote?shop=" + encodeURIComponent(shop) + "&sku=" + encodeURIComponent(sku));
      if (!quote.ok) {
        say(quote.error || "No quote.", true);
        return;
      }
      if (state.id.kind === "guest") {
        say("Paying from this tab's test address. Close the tab and it is gone.");
        let body = await post("/api/1984/guest/spend", { token: state.id.token, shop, sku, confirmed: yes });
        if (body.needsConfirm) {
          const agreed = window.confirm("This is over your confirm line. Pay it?");
          if (!agreed) return;
          body = await post("/api/1984/guest/spend", { token: state.id.token, shop, sku, confirmed: true });
        }
        if (!body.ok) {
          punch("shake");
          say(body.error || "The shop refused the payment.", true);
          return;
        }
        tookPayment(body, sku);
        await refreshAccount();
        return;
      }
      const typed = panel.querySelector("#txid");
      txid = typed ? typed.value.trim() : shopTxid;
      if (!txid) {
        const plan = await signerForSpend();
        if (plan !== "kit" && plan !== "kasware" && plan !== "kastle") {
          punch("shake");
          const why = plan === "mainnet"
            ? "The wallet is on mainnet. This square takes Testnet 10 only."
            : plan === "mismatch"
              ? "The wallet is open on a different address than this page. Click Log in with Kasware."
              : plan === "absent"
                ? "This page is logged in with the wallet, and the extension is not in this tab."
                : "Connect Kasware or Kastle on Testnet 10.";
          say(why + " Or paste the txid after you pay " + formatTkas(quote.sompi) + " tKAS to the reserve.", true);
          return;
        }
        let gate = await post("/api/1984/spend", { shop, sku, rail, txid: "", confirmed: yes });
        let action = kasSpendAction({
          kind: state.id.kind,
          txid: "",
          needsConfirm: !!gate.needsConfirm,
          ready: !!gate.ready,
        });
        if (action === "ask") {
          const agreed = window.confirm("This is over your confirm line. Pay it?");
          if (!agreed) return;
          yes = true;
          gate = await post("/api/1984/spend", { shop, sku, rail, txid: "", confirmed: true });
          action = kasSpendAction({
            kind: state.id.kind,
            txid: "",
            needsConfirm: !!gate.needsConfirm,
            ready: !!gate.ready,
          });
        }
        if (action !== "sign") {
          punch("shake");
          say(gate.error || "The shop refused the payment.", true);
          return;
        }
        say("Approve " + formatTkas(quote.sompi) + " tKAS in the wallet. The miner fee is twice the standard rate, and it is extra.");
        rememberWalletKind(plan);
        txid = await sendFromWallet(plan, quote.sompi);
        rememberShopTxid(txid);
        if (!shopTxid) {
          say("The wallet did not return a transaction. Nothing was claimed.", true);
          return;
        }
        txid = shopTxid;
      }
    }
    let body = await post("/api/1984/spend", { shop, sku, rail, txid, confirmed: yes });
    if (body.needsConfirm) {
      const agreed = window.confirm("This is over your confirm line. Pay it?");
      if (!agreed) return;
      yes = true;
      body = await post("/api/1984/spend", { shop, sku, rail, txid, confirmed: true });
    }
    if (!body.ok) {
      punch("shake");
      const kept = rail === "kas" && txid ? " The txid stays in the paste box. Buy again claims it and does not send a second time." : "";
      say((body.error || "The shop refused the payment.") + kept, true);
      return;
    }
    if (rail === "kas") shopTxid = "";
    tookPayment(body, sku);
    await refreshAccount();
  } catch (err) {
    punch("shake");
    say(err && err.message ? err.message : "The shop refused the payment.", true);
  } finally {
    spendBusy = false;
  }
}

function tagName(rail) {
  return rail === "poc" ? "POCencept" : "KUSDT";
}

function putRedeemAmount(amount) {
  redeemDraft = amount;
  const el = document.getElementById("redeem-amt");
  if (el) el.value = amount;
}

function walletWord(plan) {
  if (plan === "kastle" || state.id.kind === "kastle") return "Kastle";
  if (plan === "kasware" || state.id.kind === "kasware") return "Kasware";
  return "the wallet";
}

async function lock(rail) {
  if (swapBusy) return;
  const name = tagName(rail);
  if (!requireId()) {
    punch("shake");
    swapNote("Not swapped. Choose Kasware, Kastle, a test tab, or a kaspatest address first. Nothing moved.", "bad");
    return;
  }
  let sompi;
  try {
    sompi = parseTkas(fieldValue("lock-amt"));
  } catch (err) {
    punch("shake");
    swapNote("Not swapped. " + err.message, "bad");
    return;
  }
  const shown = formatTkas(sompi) + " tKAS";
  setSwapBusy(true);
  swapNote("Locking " + shown + " into " + name + "…", "wait");
  let sent = false;
  try {
    let body;
    if (state.id.kind === "guest") {
      const steps = ["Checking the amount", "Paying from this tab", "Adding the tag", "Done"];
      showSteps(steps, 1, "Paying from this tab.");
      showSteps(steps, 2, "Adding the tag.");
      body = await post("/api/1984/guest/convert", {
        token: state.id.token,
        rail,
        amount: fieldValue("lock-amt").trim(),
      });
      showSteps(steps, steps.length, "Done.");
    } else {
      const txField = document.getElementById("lock-txid");
      let txid = (txField && txField.value.trim()) || lockTxid;
      let steps;
      if (!txid) {
        const who = walletWord();
        steps = ["Checking the amount", "Opening " + who, "Approve the send in " + who, "Waiting for Testnet 10", "Adding the tag"];
        showSteps(steps, 1, who === "the wallet" ? "The wallet is opening." : who + " is opening.");
        const plan = await signerForSpend();
        if (plan !== "kit" && plan !== "kasware" && plan !== "kastle") {
          punch("shake");
          hideSteps();
          swapNote("Not swapped. " + signerRefusal(plan), "bad");
          return;
        }
        const named = walletWord(plan);
        steps = ["Checking the amount", "Opening " + named, "Approve the send in " + named, "Waiting for Testnet 10", "Adding the tag"];
        showSteps(steps, 2, "Approve the send in " + named + ".");
        swapNote("Approve " + shown + " in " + named + ". The miner fee is twice the standard rate, and it is extra.", "wait");
        rememberWalletKind(plan);
        txid = await sendFromWallet(plan, sompi);
        showSteps(steps, 3, "Waiting for Testnet 10.");
      } else {
        steps = ["Checking the amount", "Waiting for Testnet 10", "Adding the tag"];
        showSteps(steps, 1, "Waiting for Testnet 10.");
      }
      sent = !!txid;
      if (txid) {
        lockTxid = txid;
        const box = document.getElementById("lock-txid");
        if (box) {
          box.value = txid;
          const details = box.closest("details");
          if (details) details.open = true;
        }
      }
      showSteps(steps, steps.length - 1, "Adding the tag.");
      swapNote("Waiting for Testnet 10. Adding the " + name + " tag…", "wait");
      body = await post("/api/1984/convert", { rail, txid });
      showSteps(steps, steps.length, "Done.");
    }
    if (!body.ok) {
      punch("shake");
      swapNote("Not swapped. " + (body.error || "The lock did not clear.") + (sent ? " The txid is in the paste box. Press Swap again to claim it. That does not send a second time." : " Nothing moved."), "bad");
      return;
    }
    punch("nod");
    lockTxid = "";
    const got = body.cents == null || body.cents === "" ? "" : formatCents(body.cents);
    if (got) putRedeemAmount(got);
    swapNote(got ? "Swapped. " + shown + " became " + got + " " + name + "." : "Swapped. " + shown + " locked into " + name + ".", "ok");
    await refreshAccount();
  } catch (err) {
    punch("shake");
    swapNote("Not swapped. " + (err && err.message ? err.message : "The lock did not clear.") + (sent ? " The txid is in the paste box. Press Swap again to claim it. That does not send a second time." : " Nothing moved."), "bad");
  } finally {
    setSwapBusy(false);
  }
}

async function redeem(rail) {
  if (swapBusy) return;
  const name = tagName(rail);
  if (!requireId()) {
    punch("shake");
    swapNote("Not swapped. Choose who pays first. Nothing moved.", "bad");
    return;
  }
  const amount = fieldValue("redeem-amt").trim();
  if (!amount) {
    punch("shake");
    swapNote("Not swapped. Type an amount, like 1.00.", "bad");
    return;
  }
  try {
    parseDollars(amount);
  } catch (err) {
    punch("shake");
    swapNote("Not swapped. " + err.message, "bad");
    return;
  }
  const steps = ["Checking the amount", "Taking the locked tag", "Sending tKAS back", "Done"];
  setSwapBusy(true);
  showSteps(steps, 1, "Taking the locked tag.");
  swapNote("Swapping " + amount + " " + name + " back to tKAS…", "wait");
  showSteps(steps, 2, "Sending tKAS back.");
  try {
    const body = await post("/api/1984/redeem", { rail, amount });
    if (!body.ok) {
      punch("shake");
      swapNote("Not swapped. " + (body.error || "The redeem did not clear.") + " The tag was put back.", "bad");
      await refreshAccount();
      return;
    }
    showSteps(steps, steps.length, "Done.");
    punch("nod");
    const tx = body.txids && body.txids[0] ? " Tx " + String(body.txids[0]).slice(0, 10) + "…" : "";
    swapNote("Swapped. " + amount + " " + name + " came back as tKAS." + tx, "ok");
    await refreshAccount();
  } catch (err) {
    punch("shake");
    swapNote("Not swapped. " + (err && err.message ? err.message : "The redeem did not clear.") + " The tag was put back.", "bad");
  } finally {
    setSwapBusy(false);
  }
}

async function exchange(from, to) {
  if (swapBusy) return;
  const source = tagName(from);
  const dest = tagName(to);
  if (!requireId()) {
    punch("shake");
    swapNote("Not swapped. Choose who pays first. Nothing moved.", "bad");
    return;
  }
  const amount = fieldValue("redeem-amt").trim();
  if (!amount) {
    punch("shake");
    swapNote("Not swapped. Type an amount, like 1.00.", "bad");
    return;
  }
  try {
    parseDollars(amount);
  } catch (err) {
    punch("shake");
    swapNote("Not swapped. " + err.message, "bad");
    return;
  }
  const steps = ["Checking the amount", "Moving the tag", "Done"];
  setSwapBusy(true);
  showSteps(steps, 1, "Moving the tag.");
  swapNote("Swapping " + amount + " " + source + " to " + dest + "…", "wait");
  try {
    const body = await post("/api/1984/exchange", { from, to, amount });
    if (!body.ok) {
      punch("shake");
      swapNote("Not swapped. " + (body.error || "The swap did not clear.") + " Nothing moved.", "bad");
      return;
    }
    showSteps(steps, steps.length, "Done.");
    punch("nod");
    swapNote("Swapped. " + amount + " " + source + " is now " + dest + ". Locked stayed locked. The purse stayed a purse.", "ok");
    await refreshAccount();
  } catch (err) {
    punch("shake");
    swapNote("Not swapped. " + (err && err.message ? err.message : "The swap did not clear.") + " Nothing moved.", "bad");
  } finally {
    setSwapBusy(false);
  }
}

async function practice() {
  if (!requireId()) return;
  const body = await post("/api/1984/practice", {});
  if (!body.ok) {
    punch("shake");
    swapNote("No purse. " + (body.error || "The practice purse was not given."), "bad");
    return;
  }
  punch("purse");
  swapNote("Practice purse taken. 20.00 POCencept and 20.00 KUSDT. That purse does not redeem.", "ok");
  await refreshAccount();
}

async function freeze() {
  if (!requireId()) return;
  const next = !(state.account && state.account.kusdtFrozen);
  const body = await post("/api/1984/freeze", { frozen: next });
  if (!body.ok) {
    punch("shake");
    swapNote("Not changed. " + (body.error || "The freeze did not stick."), "bad");
    return;
  }
  swapNote(next ? "KUSDT is frozen. POCencept and tKAS still move." : "KUSDT is thawed.", "ok");
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
  const ridingLap = state.lapUntil && now < state.lapUntil;
  if (!ridingLap) {
    if (state.lapUntil) state.lapUntil = 0;
    const ground = map.grid[state.player.y] && map.grid[state.player.y][state.player.x];
    const pace = state.inside ? WALK_MS : seat(!!(state.account && state.account.roadster), state.aboard, ground) === "drive" ? DRIVE_MS : WALK_MS;
    if (state.path.length && now - state.stepAt > pace) {
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
    walkTo(x, y, npc ? () => arriveVisit(npc.shop) : null);
  },
  near(shop) {
    return nearShop(map, state.player.x, state.player.y, shop);
  },
  enter(shop) {
    enterVisit(shop);
  },
  room: () => state.inside,
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
  car() {
    const owns = !!(state.account && state.account.roadster);
    if (!owns) {
      if (nearShop(map, state.player.x, state.player.y, "roadster")) enterVisit("roadster");
      else {
        const npc = map.npcs.find((item) => item.shop === "roadster");
        if (npc) walkTo(npc.x, npc.y, () => arriveVisit("roadster"));
      }
      return;
    }
    const hopIn = () => {
      state.aboard = true;
      if (state.inside || state.mode !== "world") {
        state.inside = false;
        openMode("world");
      }
      showBanner("You drive.");
      say("You are in the roadster. Get out when you want to walk.");
      syncRide();
    };
    const dist = Math.max(Math.abs(state.player.x - ROADSTER_PARK.x), Math.abs(state.player.y - ROADSTER_PARK.y));
    if (dist <= 2) hopIn();
    else walkTo(ROADSTER_PARK.x, ROADSTER_PARK.y, hopIn);
  },
  frozen: () => !!(state.account && state.account.kusdtFrozen),
  driving() {
    const ground = map.grid[state.player.y] && map.grid[state.player.y][state.player.x];
    return seat(!!(state.account && state.account.roadster), state.aboard, ground) === "drive";
  },
  place(x, y) {
    state.path = [];
    state.arrived = null;
    state.player = { x, y };
    state.lapUntil = 0;
  },
});

let bannerTimer = 0;
function showBanner(text) {
  const el = document.getElementById("juice-banner");
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 2200);
}
function punch(kind) {
  if (worldView && worldView.feel) worldView.feel(kind);
}

window.addEventListener("keydown", (ev) => {
  const key = ev.key.toLowerCase();
  if (key !== "e" && key !== "escape" && key !== "g") return;
  if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
  ev.preventDefault();
  if (key === "g") {
    toggleRide();
    return;
  }
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
  if (best && nearShop(map, state.player.x, state.player.y, best.shop)) enterVisit(best.shop);
  else if (best) walkTo(best.x, best.y, () => arriveVisit(best.shop));
});

window.addEventListener("resize", () => worldView.resize());
side.addEventListener("click", (ev) => {
  const button = ev.target.closest("[data-go]");
  if (!button) return;
  const mode = button.getAttribute("data-go");
  if (mode !== "world" && mode !== "rules" && mode !== "bench" && mode !== "guide") {
    const npc = map.npcs.find((item) => item.shop === mode);
    if (npc) walkTo(npc.x, npc.y, () => arriveVisit(mode));
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
  const turn = button.getAttribute("data-turn");
  const code = turn === "left" ? "TurnLeft" : turn === "right" ? "TurnRight" : "KeyW";
  const down = (ev) => {
    ev.preventDefault();
    try { button.setPointerCapture(ev.pointerId); } catch { /* the hold still starts */ }
    if (worldView.hold) worldView.hold(code, true);
  };
  const up = () => {
    if (worldView.hold) worldView.hold(code, false);
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("lostpointercapture", up);
}
const rideButton = document.getElementById("ride");
if (rideButton) rideButton.addEventListener("click", toggleRide);
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
    punch("shake");
    say(short.getAttribute("data-short"), true);
    return;
  }
  const clerkBtn = ev.target.closest("[data-clerk]");
  if (clerkBtn) {
    if (swapBusy) return;
    state.bankClerk = clerkBtn.getAttribute("data-clerk") || "";
    if (!state.bankClerk) say("Push a clerk. tKAS, POCencept, or KUSDT.");
    paintBank();
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
