import { readIdentity, writeIdentity } from "./identity.mjs";
import { BENCH, REPOS } from "./links.mjs?v=3";
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
import { buyAskLine, lockSigner, payKind, shopBanner, swapAskLine, txidFromWallet } from "./kas-spend.mjs";
import { RAIL_NAMES, RAILS_NOTE, payRail, railBarHtml } from "./rails-note.mjs?v=2";
import { REELS, reelShuffle, reelStep } from "./reels.mjs?v=2";
import { DRIVE_MS, ENTRY_HINT, FLIGHT_NOTE, WALK_MS, cruiseLine, cruiseOfferEnd, cruiseProgress, escapeRoom, flightBeat, flightClock, flightLine, flightOfferEnd, flightProgress, mountWorld, roomUse, seat, spaceJoke } from "./view3d.mjs?v=25";
import { HUNTS, ROADSTER_PARK, SHOPS, counterFace, destinationFor, findPath, huntById, nearShop, shopVisit, tripBySku, walkable, world } from "./world.mjs";
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
  venue: "",
  seated: false,
  huntSpoke: false,
  huntRails: {},
  huntNeeds: {},
  huntBook: null,
  flightStart: 0,
  flightDark: false,
  flightEndedAt: 0,
  flightBackShown: false,
  flightBeat: "",
  cruiseStart: 0,
  cruiseSku: "",
  cruiseFrom: 0,
  jokeSent: -1,
  watching: false,
  showPaid: false,
  ticketAsk: false,
  reelAt: 0,
};

const SIM_LINE = "You are back on the square, in the roadster. You returned to a simulation of a simulation of a simulation, 255524 deep.";

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

function say(text, bad, kind) {
  const line = document.createElement("p");
  line.textContent = text;
  if (bad) line.className = "bad";
  else if (kind) line.className = kind;
  chat.append(line);
  while (chat.children.length > 40) chat.removeChild(chat.firstChild);
  chat.scrollTop = chat.scrollHeight;
}

function launchSound() {
  const audio = document.getElementById("launch-sound");
  if (!audio) return;
  audio.volume = 0.9;
  try { audio.currentTime = 0; } catch (err) { /* the file may still be opening */ }
  const pending = audio.play();
  if (pending && pending.catch) pending.catch(() => {});
}

function stopLaunchSound() {
  const audio = document.getElementById("launch-sound");
  if (!audio) return;
  audio.pause();
  try { audio.currentTime = 0; } catch (err) { /* already stopped */ }
}

function commsSound() {
  const audio = document.getElementById("comms-sound");
  if (!audio || state.commsPlayed) return;
  state.commsPlayed = true;
  const launch = document.getElementById("launch-sound");
  if (launch) launch.volume = 0.2;
  audio.volume = 0.9;
  try { audio.currentTime = 0; } catch (err) { /* the file may still be opening */ }
  const pending = audio.play();
  if (pending && pending.catch) pending.catch(() => {});
}

function stopCommsSound() {
  const audio = document.getElementById("comms-sound");
  if (!audio) return;
  audio.pause();
  try { audio.currentTime = 0; } catch (err) { /* already stopped */ }
}

function stopReleaseSound() {
  const audio = document.getElementById("release-sound");
  if (!audio) return;
  audio.pause();
  try { audio.currentTime = 0; } catch (err) { /* already stopped */ }
}

let simTimer = 0;
function showSimBig() {
  const el = document.getElementById("sim-big");
  if (!el) return;
  el.hidden = false;
  el.textContent = SIM_LINE;
  window.clearTimeout(simTimer);
  simTimer = window.setTimeout(() => { el.hidden = true; }, 14000);
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
    ["hunt", "Hunt"],
    ["bank", "Bank"],
    ["roadster", "Roadster"],
    ["cinema", "Cinema"],
    ["rules", "Rules"],
    ["bench", "Bench"],
    ["guide", "Guide"],
  ];
  side.innerHTML = buttons
    .map(([idName, text]) => {
      const on = state.mode === idName || (state.mode === "world" && state.venue === idName);
      return '<button type="button" data-go="' + idName + '"' + (on ? ' class="on"' : "") + ">" + text + "</button>";
    })
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

function canLaunch() {
  const owns = !!(state.account && state.account.roadster);
  const outside = groundTile() !== "i" && !state.inside && !state.venue;
  return owns && state.aboard && outside && !state.flightStart;
}

function syncRide() {
  const btn = document.getElementById("ride");
  if (btn) {
    const owns = !!(state.account && state.account.roadster);
    btn.hidden = !owns;
    btn.textContent = state.aboard ? "Get out" : "Get in";
  }
  const launch = document.getElementById("launch");
  if (launch) launch.hidden = !canLaunch();
  if (btn) btn.classList.toggle("out", !!state.aboard);
  const root = document.querySelector(".kw");
  if (root) {
    const owns = !!(state.account && state.account.roadster);
    const outside = groundTile() !== "i" && !state.inside && !state.venue && !state.flightStart;
    root.classList.toggle("driving", owns && state.aboard && outside);
  }
}

function startLaunch() {
  if (!canLaunch()) return;
  launchSound();
  if (state.mode !== "world") {
    hidePanel();
    state.mode = "world";
    markRoom();
  }
  state.path = [];
  state.arrived = null;
  state.lapUntil = 0;
  state.flightStart = performance.now();
  state.flightDark = false;
  state.flightEndedAt = 0;
  state.flightBackShown = false;
  state.flightBeat = "";
  state.cruiseStart = 0;
  state.cruiseSku = "";
  state.cruiseFrom = 0;
  state.jokeSent = -1;
  state.releasePlayed = false;
  state.commsPlayed = false;
  state.koniAt = 0;
  const space = worldView.spaceVideo && worldView.spaceVideo();
  if (space) {
    space.muted = true;
    const pending = space.play();
    if (pending && pending.catch) pending.catch(() => {});
  }
  const card = document.getElementById("flight");
  if (card) {
    card.hidden = false;
    card.classList.remove("ended");
  }
  const clock = document.getElementById("flight-clock");
  const line = document.getElementById("flight-line");
  const bar = document.getElementById("flight-bar");
  const fill = document.getElementById("flight-fill");
  const note = document.getElementById("flight-note");
  const offer = document.getElementById("flight-offer");
  const back = document.getElementById("flight-back");
  const planets = document.getElementById("flight-planets");
  if (clock) {
    clock.hidden = false;
    clock.textContent = flightClock(0);
  }
  if (line) {
    line.hidden = false;
    line.textContent = "";
  }
  if (bar) bar.hidden = false;
  if (fill) fill.style.width = "0%";
  if (note) note.hidden = true;
  if (offer) offer.hidden = true;
  if (planets) {
    planets.hidden = false;
    planets.dataset.rail = "";
  }
  if (back) back.hidden = true;
  const jokeLine = document.getElementById("flight-joke");
  if (jokeLine) {
    jokeLine.hidden = true;
    jokeLine.textContent = "";
  }
  const warn = document.getElementById("flight-warn");
  if (warn) warn.hidden = true;
  const big = document.getElementById("sim-big");
  if (big) big.hidden = true;
  markFlight();
  syncRide();
}

function endAllowed(now) {
  if (!state.flightStart || state.flightDark) return false;
  if (state.cruiseStart) return cruiseOfferEnd(now - state.cruiseStart);
  return flightOfferEnd(now - state.flightStart);
}

function endLaunch() {
  if (!endAllowed(performance.now())) return;
  stopLaunchSound();
  stopReleaseSound();
  stopCommsSound();
  state.flightDark = true;
  state.flightEndedAt = performance.now();
  state.flightBackShown = true;
  const card = document.getElementById("flight");
  if (card) card.classList.add("ended");
  const clock = document.getElementById("flight-clock");
  const line = document.getElementById("flight-line");
  const bar = document.getElementById("flight-bar");
  const note = document.getElementById("flight-note");
  const end = document.getElementById("flight-end");
  const planets = document.getElementById("flight-planets");
  const offer = document.getElementById("flight-offer");
  if (clock) clock.hidden = true;
  if (line) line.hidden = true;
  if (bar) bar.hidden = true;
  if (note) note.hidden = true;
  if (end) end.hidden = true;
  if (planets) planets.hidden = true;
  if (offer) offer.hidden = false;
  const back = document.getElementById("flight-back");
  if (back) back.hidden = false;
  const warn = document.getElementById("flight-warn");
  if (warn) warn.hidden = false;
  const veil = document.getElementById("veil");
  if (veil) {
    veil.style.background = "#07080c";
    veil.style.transition = "opacity 0.45s ease";
    veil.style.opacity = "1";
  }
}

function returnFromFlight() {
  if (!state.flightBackShown) return;
  state.flightStart = 0;
  state.flightDark = false;
  state.flightEndedAt = 0;
  state.flightBackShown = false;
  state.flightBeat = "";
  state.cruiseStart = 0;
  state.cruiseSku = "";
  state.cruiseFrom = 0;
  state.jokeSent = -1;
  state.releasePlayed = false;
  state.commsPlayed = false;
  state.aboard = true;
  state.path = [];
  state.arrived = null;
  state.lapUntil = 0;
  if (state.venue || state.inside || isVisit(state.mode)) openMode("world");
  state.player = { x: ROADSTER_PARK.x, y: ROADSTER_PARK.y };
  state.facing = { x: 0, y: -1 };
  const card = document.getElementById("flight");
  if (card) {
    card.hidden = true;
    card.classList.remove("ended");
  }
  markFlight();
  veilRoom();
  syncRide();
  paintChrome();
  if (worldView.snap) worldView.snap();
  stopLaunchSound();
  stopReleaseSound();
  stopCommsSound();
  const space = worldView.spaceVideo && worldView.spaceVideo();
  if (space) space.pause();
  say(SIM_LINE, false, "sim");
  showSimBig();
}

function paintPlanets() {
  const box = document.getElementById("flight-planets");
  if (!box) return;
  box.hidden = false;
  const rail = payRail(state.shopRail);
  const shop = ((state.home && state.home.shops) || []).find((item) => item.id === "orbit");
  const items = shop && shop.items ? shop.items : [];
  if (!items.length) return;
  const sig = rail + ":" + items.map((trip) => trip.sku + "@" + trip.cents).join(",") + ":" + (state.oracle || "") + ":" + (state.kasSompi || "") + ":" + (state.account && state.account.kusdtFrozen ? "f" : "");
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = railBarHtml(rail) + items.map((trip) => saleButton(rail, "orbit", trip.sku, trip.cents, trip.name, true)).join("");
  }
  maybeTeachRails();
}

function paintFlightCard(now) {
  if (state.flightDark) return;
  const cruising = !!state.cruiseStart;
  const ms = cruising ? now - state.cruiseStart : now - state.flightStart;
  const progress = cruising ? cruiseProgress(ms) : flightProgress(ms);
  const offer = cruising ? cruiseOfferEnd(ms) : flightOfferEnd(ms);
  const fill = document.getElementById("flight-fill");
  if (fill) fill.style.width = Math.round(progress * 100) + "%";
  const clock = document.getElementById("flight-clock");
  if (clock) clock.textContent = flightClock(cruising ? ms : now - state.flightStart);
  const beat = cruising ? "cruise" : flightBeat(now - state.flightStart);
  if (beat !== state.flightBeat || cruising || beat === "stage") {
    state.flightBeat = beat;
    const line = document.getElementById("flight-line");
    if (line) {
      if (cruising) {
        const trip = tripBySku(state.cruiseSku);
        line.textContent = cruiseLine(progress, trip ? trip.name : "that world");
        const joke = spaceJoke(ms, state.cruiseSku);
        const shown = document.getElementById("flight-joke");
        if (joke.index !== state.jokeSent) {
          state.jokeSent = joke.index;
          if (joke.text) say(joke.text);
        }
        if (shown) {
          shown.hidden = !joke.text;
          shown.textContent = joke.text;
        }
      } else {
        line.textContent = flightLine(beat, now - state.flightStart);
        const shown = document.getElementById("flight-joke");
        if (shown) shown.hidden = true;
      }
    }
  }
  const note = document.getElementById("flight-note");
  if (note) note.hidden = !(offer || cruising);
  const panel = document.getElementById("flight-offer");
  if (panel) panel.hidden = !offer;
  const end = document.getElementById("flight-end");
  if (end) end.hidden = !offer;
  if (!cruising && flightBeat(now - state.flightStart) === "liftoff") commsSound();
  if (state.flightStart && now - (state.koniAt || 0) > 8000) {
    state.koniAt = now;
    readKoni();
  }
  if (offer) paintPlanets();
  else {
    const planets = document.getElementById("flight-planets");
    if (planets) planets.hidden = true;
  }
}

async function readKoni() {
  const body = await api("/api/1984/koni");
  const lines = ["KONI", "TN10"];
  if (body && body.ok && Array.isArray(body.txs) && body.txs.length) {
    if (body.blue) lines.push("score " + String(body.blue).slice(-8));
    for (const tx of body.txs.slice(0, 3)) {
      const id = String(tx.id || "").slice(0, 8);
      const sompi = BigInt(tx.sompi || 0);
      const whole = sompi / 100000000n;
      lines.push(id + "  " + whole.toString() + " tKAS");
    }
  } else {
    lines.push("waiting");
  }
  if (worldView.showKoni) worldView.showKoni(lines);
}

function toggleRide() {
  if (!state.account || !state.account.roadster) return;
  state.aboard = !state.aboard;
  if (state.aboard) {
    showBanner("You drive.");
    say(groundTile() === "i"
      ? "You will drive when you step outside. Inside, you walk."
      : "You are in the roadster. Get out is the gold button.");
  } else {
    showBanner("You walk.");
    say("You got out. The roadster is back on the lot. Click it, or Get in, to drive.");
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
  paintBooks();
}

function paintBooks() {
  paintChrome();
  const face = counterFace(state.mode);
  if (face === "bank") paintBank();
  else if (face === "hunt") paintHunt();
  else if (face === "shop") paintShop(state.mode);
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

const GUEST_STEPS = [
  "Checking today's test wallets",
  "Making a Testnet-10 address",
  "Connecting to Testnet-10",
  "Gathering coins",
  "Putting the coins together",
  "Signing the send",
  "Broadcasting",
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paintGuestWait(step, detail) {
  const el = document.getElementById("gate-status");
  if (!el) return;
  const at = GUEST_STEPS.indexOf(step);
  el.className = "gate-status";
  el.replaceChildren();
  const line = document.createElement("span");
  line.className = "gate-wait";
  line.textContent = at < 0 && step ? step : "Opening a test wallet for this tab.";
  el.append(line);
  const list = document.createElement("ol");
  list.className = "gate-steps";
  for (let i = 0; i < GUEST_STEPS.length; i++) {
    const item = document.createElement("li");
    if (at >= 0 && i < at) item.className = "done";
    else if (i === at) item.className = "on";
    item.textContent = GUEST_STEPS[i];
    list.append(item);
  }
  el.append(list);
  const note = document.createElement("span");
  note.className = "gate-wait-note";
  note.textContent = detail
    ? detail + ". Leave this tab open."
    : "Leave this tab open. This wallet shows up when Testnet 10 takes the coins.";
  el.append(note);
}

async function postGuest() {
  let last = "The village ledger is offline. Walking still works.";
  for (const base of bases()) {
    try {
      const res = await fetch(base + "/api/1984/guest", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ network: "testnet-10", life: PAGE_LIFE, progress: true }),
        signal: AbortSignal.timeout(20000),
      });
      const text = await res.text();
      if (!text || text[0] === "<" || res.status === 404 || res.status === 405) continue;
      const body = JSON.parse(text);
      body.status = res.status;
      return { base, body };
    } catch (err) {
      last = err.message || last;
    }
  }
  return { base: "", body: { ok: false, error: last } };
}

async function pollGuest(base, job, onStep) {
  const deadline = Date.now() + 720000;
  let last = "The test wallet is still opening. Leave this tab open and try New arrival again if this stays.";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + "/api/1984/guest?job=" + encodeURIComponent(job), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      const text = await res.text();
      if (!text || text[0] === "<") throw new Error("The village ledger is offline. Walking still works.");
      const body = JSON.parse(text);
      if (body.step && onStep) onStep(body.step, body.detail || "");
      if (body.pending) {
        await wait(900);
        continue;
      }
      return body;
    } catch (err) {
      last = err.message || last;
      await wait(1500);
    }
  }
  return { ok: false, error: last };
}

async function startGuest(onStep) {
  if (guestBusy) return;
  guestBusy = true;
  try {
    say("Making a Testnet-10 address for this tab and putting tKAS on it. " + GUEST_DISCLAIMER);
    const posted = await postGuest();
    let body = posted.body;
    if (body && body.step && onStep) onStep(body.step, body.detail || "");
    if (body && body.pending && body.job && posted.base) body = await pollGuest(posted.base, body.job, onStep);
    if (!body || !body.ok || !body.address || !body.token || body.key || body.privateKey) {
      return { ok: false, error: (body && body.error) || "No test wallet. Use your own Testnet-10 wallet if you want the history kept." };
    }
    setIdentity({ address: body.address, label: "test tab", kind: "guest", token: body.token });
    if (state.id.kind !== "guest" || state.id.token !== body.token) {
      return { ok: false, error: "The test wallet opened, but this tab could not keep it. Use Returning, or Who pays." };
    }
    say("This tab has " + formatTkas(body.sompi) + " tKAS. The balance can take a moment to show. Close the tab and this address is gone.");
    const address = body.address;
    const later = (ms) => {
      setTimeout(() => {
        if (state.id.kind === "guest" && state.id.address === address && state.kasSompi == null) refreshAccount();
      }, ms);
    };
    later(2500);
    later(8000);
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
  if (root) root.classList.toggle("room", state.mode !== "world" || !!state.venue);
}

function markFlight() {
  const root = document.querySelector(".kw");
  if (root) root.classList.toggle("flight", !!state.flightStart);
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
    say(RAIL_CHAT[rail]);
    return;
  }
  say(RAIL_CHAT[rail]);
  paintBank();
}

function isVisit(mode) {
  return shopVisit(mode);
}

function hidePanel() {
  panel.hidden = true;
  panel.innerHTML = "";
  panel.classList.remove("swap-pop", "stall-pop");
  const shade = document.getElementById("bank-shade");
  if (shade) shade.hidden = true;
}

function veilRoom() {
  const veil = document.getElementById("veil");
  if (!veil) return;
  veil.style.background = "";
  veil.style.transition = "none";
  veil.style.opacity = "1";
  void veil.offsetWidth;
  veil.style.transition = "opacity 0.48s ease";
  veil.style.opacity = "0";
}

function enterVenue(shop) {
  if (!shopVisit(shop)) return;
  if (shop !== "cinema") stopShow(true);
  const changed = state.venue !== shop || !state.inside;
  if (changed) veilRoom();
  state.path = [];
  state.arrived = null;
  if (state.venue !== shop) {
    state.seated = false;
    state.huntSpoke = false;
  }
  state.venue = shop;
  state.inside = true;
  if (state.mode !== "world" && state.mode !== shop) {
    hidePanel();
    state.mode = "world";
  }
  markRoom();
  paintChrome();
  if (state.mode !== shop) {
    const hint = ENTRY_HINT[shop];
    if (hint) say(hint);
  }
}

function arriveVisit(shop) {
  enterVenue(shop);
}

function enterVisit(shop) {
  enterVenue(shop);
}

function closeCounter() {
  if (!isVisit(state.mode)) return;
  hidePanel();
  state.mode = "world";
  markRoom();
  paintChrome();
}

function reelVideo() {
  return worldView && worldView.cinemaVideo ? worldView.cinemaVideo() : null;
}

function markShow() {
  const root = document.querySelector(".kw");
  if (root) root.classList.toggle("watching", !!state.watching);
  const card = document.getElementById("show");
  if (card) card.hidden = !state.watching && !state.ticketAsk;
  const pay = document.getElementById("show-pay");
  if (pay) pay.hidden = !state.ticketAsk;
  const reel = card && card.querySelector(".show-reel");
  if (reel) reel.hidden = !state.watching;
  const label = card && card.querySelector(".show-label");
  if (label) label.hidden = !state.watching;
  const snacks = document.getElementById("show-snacks");
  if (snacks) snacks.hidden = !state.watching;
  const list = document.getElementById("show-list");
  if (list && !state.watching) list.hidden = true;
}

function cinemaShop() {
  const fromHome = ((state.home && state.home.shops) || []).find((item) => item.id === "cinema");
  if (fromHome && fromHome.items && fromHome.items.some((item) => item.sku === "reel")) return fromHome;
  return SHOPS.find((item) => item.id === "cinema");
}

function paintShow() {
  const now = document.getElementById("show-now");
  const clip = REELS[state.reelAt] || REELS[0];
  if (now) {
    now.textContent = state.watching && clip
      ? state.reelAt + 1 + " of " + REELS.length + " · " + clip.title
      : "Ticket";
  }
  paintReelList();
  const rail = payRail(state.shopRail);
  const rails = document.getElementById("show-rails");
  if (rails) rails.innerHTML = railBarHtml(rail);
  const shop = cinemaShop();
  const ticket = shop && shop.items ? shop.items.find((item) => item.sku === "reel") : null;
  const pay = document.getElementById("show-pay");
  if (pay && ticket) {
    pay.innerHTML = "<p>The ticket is " + esc(formatCents(ticket.cents)) + " toy dollars.</p>" + saleButton(rail, "cinema", "reel", ticket.cents, ticket.name, false);
  }
  const box = document.getElementById("show-snacks");
  if (!box || !shop) return;
  const items = shop.items.filter((item) => item.sku !== "reel");
  box.innerHTML = items.map((item) => saleButton(rail, "cinema", item.sku, item.cents, item.name, true)).join("");
  if (state.ticketAsk || state.watching) maybeTeachRails();
}

function paintReelList() {
  const list = document.getElementById("show-list");
  if (!list) return;
  if (list.dataset.ready !== "1") {
    list.innerHTML = REELS.map((clip, i) => {
      return '<button type="button" data-reel="' + i + '">' + esc((i + 1) + ". " + clip.title) + "</button>";
    }).join("");
    list.dataset.ready = "1";
  }
  for (const btn of list.querySelectorAll("[data-reel]")) {
    btn.classList.toggle("on", Number(btn.getAttribute("data-reel")) === state.reelAt);
  }
  const on = list.querySelector(".on");
  if (on && !list.hidden && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
}

function fitReel(video, clip) {
  if (!worldView || !worldView.fitCinema || !clip) return;
  const same = video && video.getAttribute("src") === clip.src && video.videoWidth > 0 && video.videoHeight > 0;
  worldView.fitCinema(same ? video.videoWidth : clip.w, same ? video.videoHeight : clip.h);
}

function playReelAt(index) {
  const clip = REELS[index];
  if (!clip) return;
  state.reelAt = index;
  paintShow();
  const play = document.getElementById("show-play");
  if (play) play.hidden = true;
  const start = (video) => {
    if (state.reelAt !== index) return;
    if (!video) {
      if (play) play.hidden = false;
      return;
    }
    fitReel(video, clip);
    video.muted = false;
    bindReel();
    const pending = video.play();
    if (pending && pending.catch) pending.catch(() => { if (play) play.hidden = false; });
  };
  if (worldView && worldView.cueCinema) {
    worldView.cueCinema(clip.src).then(start);
    return;
  }
  const video = reelVideo();
  if (!video) return;
  if (video.getAttribute("src") !== clip.src) video.src = clip.src;
  start(video);
}

function primeReel() {
  const clip = REELS[0];
  if (!clip) return;
  state.reelAt = 0;
  const arm = (video) => {
    if (!video) return;
    video.muted = true;
    fitReel(video, clip);
    const pending = video.play();
    if (pending && pending.catch) pending.catch(() => {});
  };
  if (worldView && worldView.cueCinema) {
    worldView.cueCinema(clip.src).then(arm);
    return;
  }
  const video = reelVideo();
  if (!video) return;
  if (video.getAttribute("src") !== clip.src) video.src = clip.src;
  arm(video);
}

function beginShow(fromStart) {
  if (isVisit(state.mode)) closeCounter();
  state.seated = true;
  state.ticketAsk = false;
  if (fromStart) state.reelAt = 0;
  state.watching = true;
  const video = reelVideo();
  if (fromStart && video) {
    try { video.currentTime = 0; } catch (err) { /* the file may still be opening */ }
  }
  markShow();
  playReelAt(state.reelAt || 0);
}

function stopShow(leave) {
  const was = state.watching || state.showPaid || state.ticketAsk;
  state.watching = false;
  state.ticketAsk = false;
  if (leave && worldView && worldView.clearCinema) worldView.clearCinema();
  else if (worldView && worldView.pauseCinema) worldView.pauseCinema();
  else {
    const video = reelVideo();
    if (video) video.pause();
    if (leave && video) {
      video.removeAttribute("src");
      video.load();
    }
  }
  if (leave) {
    state.showPaid = false;
    state.reelAt = 0;
  }
  markShow();
  return was;
}

function offerTicket() {
  state.seated = true;
  state.ticketAsk = true;
  state.watching = false;
  markShow();
  paintShow();
}

function buyReel() {
  armOnOk = primeReel;
  spend(payRail(state.shopRail), "cinema", "reel").finally(() => {
    armOnOk = null;
    if (!state.showPaid) {
      state.ticketAsk = true;
      markShow();
      paintShow();
    }
  });
}

function bindReel() {
  const video = reelVideo();
  if (!video || video.dataset.bound) return;
  video.dataset.bound = "1";
  let reelErrors = 0;
  video.addEventListener("ended", () => {
    if (!state.watching) return;
    reelErrors = 0;
    const next = reelStep(state.reelAt, REELS.length, 1);
    if (next === 0) say("The reel starts again.");
    playReelAt(next);
  });
  video.addEventListener("error", () => {
    if (!state.watching) return;
    if (video.error && video.error.code === 1) return;
    reelErrors += 1;
    if (reelErrors >= REELS.length) {
      say("This film did not start.", true);
      const play = document.getElementById("show-play");
      if (play) play.hidden = false;
      return;
    }
    playReelAt(reelStep(state.reelAt, REELS.length, 1));
  });
  video.addEventListener("playing", () => {
    reelErrors = 0;
    const play = document.getElementById("show-play");
    if (play) play.hidden = true;
  });
  video.addEventListener("loadedmetadata", () => {
    const clip = REELS[state.reelAt];
    if (!clip || video.getAttribute("src") !== clip.src) return;
    if (video.videoWidth > 0 && video.videoHeight > 0) fitReel(video, clip);
  });
  const card = document.getElementById("show");
  if (!card) return;
  card.addEventListener("click", (ev) => {
    const snack = ev.target.closest("[data-snack]");
    const pick = ev.target.closest("[data-rail-pick]");
    if (pick) {
      setShopRail(pick.getAttribute("data-rail-pick"));
      return;
    }
    if (ev.target.closest("[data-rails]")) {
      openRailsNote();
      return;
    }
    const blocked = ev.target.closest("[data-short]");
    if (blocked) {
      punch("shake");
      say(blocked.getAttribute("data-short"), true);
      return;
    }
    const pay = ev.target.closest("[data-pay]");
    if (pay) {
      if (pay.getAttribute("data-sku") === "reel") buyReel();
      else spend(pay.getAttribute("data-pay"), pay.getAttribute("data-shop"), pay.getAttribute("data-sku"));
      return;
    }
    if (snack) {
      spend(payRail(state.shopRail), "cinema", snack.getAttribute("data-snack"));
      return;
    }
    if (ev.target.closest("#show-play")) {
      playReelAt(state.reelAt || 0);
      return;
    }
    if (ev.target.closest("#show-prev")) {
      playReelAt(reelStep(state.reelAt, REELS.length, -1));
      return;
    }
    if (ev.target.closest("#show-next")) {
      playReelAt(reelStep(state.reelAt, REELS.length, 1));
      return;
    }
    if (ev.target.closest("#show-shuffle")) {
      playReelAt(reelShuffle(state.reelAt, REELS.length, Math.random()));
      return;
    }
    const picked = ev.target.closest("[data-reel]");
    if (picked) {
      playReelAt(Number(picked.getAttribute("data-reel")));
      return;
    }
    if (ev.target.closest("#show-over")) {
      const list = document.getElementById("show-list");
      if (list) {
        list.hidden = !list.hidden;
        paintReelList();
      }
      return;
    }
    if (ev.target.closest("#show-leave")) stopShow(false);
  });
}

function openMode(mode) {
  if (mode !== "cinema") stopShow(true);
  const enteringBank = mode === "bank" && state.mode !== "bank";
  const enteringShop = isVisit(mode) && mode !== "bank" && state.mode !== mode;
  const wasInside = !!state.venue || state.inside;
  if (wasInside && !isVisit(mode)) veilRoom();
  if (mode === "world") {
    const leaving = !!state.venue || state.inside || isVisit(state.mode);
    if (leaving || state.mode !== "world") state.arrived = null;
    if (leaving) {
      state.path = [];
      state.bankClerk = "";
    }
    state.venue = "";
    state.inside = false;
    state.seated = false;
    state.huntSpoke = false;
  } else if (isVisit(mode)) {
    state.venue = mode;
    state.inside = true;
  } else {
    state.venue = "";
    state.inside = false;
    state.seated = false;
    state.huntSpoke = false;
    if (state.mode !== "world") state.arrived = null;
  }
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
    if (enteringShop && mode !== "hunt") {
      const shop = (state.home && state.home.shops ? state.home.shops : []).find((item) => item.id === mode);
      const keeper = shop ? shop.keeper : (map.npcs.find((npc) => npc.shop === mode) || {}).name;
      say((keeper || "The keeper") + " is at the counter.");
    }
    if (mode === "hunt") {
      paintHunt();
      refreshHuntBook();
    } else paintShop(mode);
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

function walletShopKas(rail) {
  return rail === "kas" && state.id && (state.id.kind === "kasware" || state.id.kind === "kastle");
}

function saleButton(rail, shop, sku, cents, name, withName) {
  const names = RAIL_NAMES;
  const sompi = quoteSompi(cents);
  const kas = sompi == null ? "quote down" : formatTkas(sompi) + " tKAS";
  const price = rail === "kas" ? kas : formatCents(cents) + " " + names[rail];
  const label = (text) => withName ? name + " · " + text : text;
  const blocked = (text, short) =>
    '<button type="button" class="buy short" data-short="' + esc(short) + '">' + esc(label(text)) + "</button>";
  if (walletShopKas(rail)) {
    return blocked("Shop takes a toy", "The wallet stays closed for a shop. Pick POCencept or KUSDT. Swapping tKAS at the bank asks the wallet to sign.");
  }
  if (rail === "kusdt" && state.account && state.account.kusdtFrozen) {
    return blocked("KUSDT is frozen", "KUSDT is frozen. POCencept and tKAS still spend.");
  }
  if (canPay(rail, cents) === false) {
    return blocked("Not enough " + names[rail], "Not enough " + names[rail] + " for " + name + ".");
  }
  const caption = withName ? name + " · " + price : "Buy · " + price;
  return '<button type="button" class="buy" data-pay="' + rail + '" data-shop="' + shop + '" data-sku="' + sku + '">' + esc(caption) + "</button>";
}

function setShopRail(rail) {
  if (rail !== "kas" && rail !== "poc" && rail !== "kusdt") return;
  state.shopRail = payRail(rail);
  if (isVisit(state.mode) && state.mode !== "hunt") paintShop(state.mode);
  paintShow();
  if (state.flightStart && !state.cruiseStart) {
    const box = document.getElementById("flight-planets");
    if (box) box.dataset.sig = "";
    paintPlanets();
  }
}

let taughtRails = false;

function fillRailsNote() {
  const title = document.getElementById("rails-title");
  const body = document.getElementById("rails-body");
  if (title) title.textContent = RAILS_NOTE.title;
  if (!body || body.dataset.ready === "1") return;
  const links = RAILS_NOTE.links
    .map(([label, href]) => '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label) + "</a>")
    .join(" · ");
  body.innerHTML = RAILS_NOTE.lines.map((line) => "<p>" + esc(line) + "</p>").join("") + "<p>" + links + "</p>";
  body.dataset.ready = "1";
}

function openRailsNote() {
  fillRailsNote();
  const note = document.getElementById("rails-note");
  if (note) note.hidden = false;
  const close = document.getElementById("rails-close");
  if (close) close.focus();
}

function closeRailsNote() {
  const note = document.getElementById("rails-note");
  if (note) note.hidden = true;
}

function maybeTeachRails() {
  if (taughtRails) return;
  try {
    if (sessionStorage.getItem("1984-rails-seen") === "1") {
      taughtRails = true;
      return;
    }
    sessionStorage.setItem("1984-rails-seen", "1");
  } catch (err) { /* this page load still shows the note once */ }
  taughtRails = true;
  openRailsNote();
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
    document.getElementById("stall-close").onclick = () => closeCounter();
    return;
  }
  const rail = payRail(state.shopRail);
  const face = STALL_FACE[shop.id] || { tint: "#8a7040", letter: "S" };
  const rows = shop.items
    .map((item) => {
      const sompi = quoteSompi(item.cents);
      const kas = sompi == null ? "quote down" : formatTkas(sompi) + " tKAS";
      const ownedCar = item.sku === "keys" && state.account && state.account.roadster;
      const button = ownedCar
        ? '<button type="button" class="buy" disabled>Yours. Get in or get out.</button>'
        : saleButton(rail, shop.id, item.sku, item.cents, item.name, false);
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
    railBarHtml(rail) +
    rows + txid +
    "<p class=\"fine\">" + esc(payKind("shop")) + "</p>" +
    "<p class=\"fine\">One rail for this buy. A buy asks on this page, then OK. The wallet opens only when you swap tKAS at the bank. The miner fee on that swap is twice the standard Testnet 10 rate, and it is extra.</p></div>";
  maybeTeachRails();
  document.getElementById("stall-close").onclick = () => closeCounter();
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
      '<button type="button" class="rails-open" data-rails>What are the rails?</button>' +
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
      '<p class="fine">' + esc(payKind("lock")) + "</p>" +
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
  if (!clerk) maybeTeachRails();
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
  if (shut) shut.onclick = () => closeCounter();
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

function rememberHuntFields() {
  panel.querySelectorAll("[data-need]").forEach((el) => {
    state.huntNeeds[el.getAttribute("data-need")] = el.value;
  });
}

function huntRowState(id) {
  const list = state.huntBook && state.huntBook.hunts;
  if (!list) return null;
  return list.find((item) => item.id === id) || null;
}

async function refreshHuntBook() {
  if (!state.id.address || state.mode !== "hunt") return;
  const body = await api("/api/1984/hunts?address=" + encodeURIComponent(state.id.address));
  if (state.mode !== "hunt" || !body || !body.ok) return;
  state.huntBook = body;
  paintHunt();
}

function paintHunt() {
  rememberHuntFields();
  const names = { poc: "POCencept", kusdt: "KUSDT", kas: "tKAS" };
  const rows = HUNTS.map((row) => {
    const picked = state.huntRails[row.id];
    const rail = picked && row.rails.includes(picked) ? picked : (row.rails.includes("poc") ? "poc" : row.rails[0]);
    state.huntRails[row.id] = rail;
    const typed = state.huntNeeds[row.id];
    const need = typed != null && typed !== "" ? typed : String(row.need);
    const picks = row.rails
      .map((id) => {
        const on = id === rail ? ' class="on"' : "";
        return '<button type="button" data-hunt="' + row.id + '" data-hunt-rail="' + id + '"' + on + ">" + esc(names[id]) + "</button>";
      })
      .join(" ");
    const mine = huntRowState(row.id);
    let status = "";
    if (mine && mine.paid) {
      const who = Array.isArray(mine.paid.who) ? mine.paid.who.map(short).join(", ") : "";
      status = "<p>" + esc(mine.paid.banner || "Pack paid on this square.") + (who ? " " + esc(who) + "." : "") + "</p>";
    } else if (mine && mine.promise) status = "<p>Your promise is on the ledger.</p>";
    const button = walletShopKas(rail)
      ? '<button type="button" class="buy short" data-short="The wallet stays closed for a shop. Pick POCencept or KUSDT. Swapping tKAS at the bank asks the wallet to sign.">Shop takes a toy</button>'
      : '<button type="button" class="buy" data-promise="' + row.id + '">Promise</button>';
    const drop = mine && mine.promise ? '<button type="button" class="buy short" data-drop="' + row.id + '">Drop promise</button>' : "";
    return (
      '<article class="good"><div><strong>' + esc(row.name) + "</strong><span>" + esc(formatCents(row.cents)) +
      " toy dollars</span></div><p>" + picks + "</p>" +
      '<label>Threshold is yours. <input class="hunt-need" data-need="' + row.id + '" type="number" min="2" max="20" value="' + esc(need) + '"></label>' +
      button + drop + status +
      "<p class=\"fine\">Hidden pack. Pays if enough promises clear. This square's ledger. Not that company.</p></article>"
    );
  }).join("");
  const showKas = HUNTS.some((row) => state.huntRails[row.id] === "kas");
  const txid = showKas
    ? '<details class="paid-already"><summary>Already sent tKAS? Paste the txid</summary><textarea id="hunt-txid" rows="2">' + esc(shopTxid) + "</textarea></details>"
    : "";
  panel.innerHTML =
    '<div class="stall"><div class="stall-head"><div><p class="stall-keeper">Reed</p><h2>Hunt Hall</h2></div>' +
    '<button type="button" id="stall-close">Close</button></div>' +
    "<p>Classroom pack desk. Tags on this ledger. Not Tether. Not a company till. Hidden until it pays.</p>" +
    balanceSheet() + rows + txid +
    "<p class=\"fine\">A promise asks on this page, then OK. The pack stays hidden. The wallet opens only when you swap tKAS at the bank.</p></div>";
  const close = document.getElementById("stall-close");
  if (close) close.onclick = () => closeCounter();
  const pasted = document.getElementById("hunt-txid");
  if (pasted) pasted.addEventListener("input", () => {
    shopTxid = pasted.value.trim();
  });
}

let huntBusy = false;

async function dropPromise(id) {
  if (huntBusy || !requireId()) return;
  huntBusy = true;
  try {
    const body = await post("/api/1984/hunt/withdraw", { hunt: id });
    if (!body.ok) {
      punch("shake");
      say(body.error || "The promise stayed.", true);
      return;
    }
    if (body.account) state.account = body.account;
    if (body.hunts) state.huntBook = body.hunts;
    say("The promise is off the ledger.");
    paintHunt();
  } catch (err) {
    punch("shake");
    say(err && err.message ? err.message : "The promise stayed.", true);
  } finally {
    huntBusy = false;
  }
}

async function promiseHunt(id) {
  if (huntBusy || !requireId()) return;
  const row = huntById(id);
  if (!row) return;
  rememberHuntFields();
  const rail = state.huntRails[id] && row.rails.includes(state.huntRails[id]) ? state.huntRails[id] : row.rails[0];
  const raw = Number(state.huntNeeds[id] != null && state.huntNeeds[id] !== "" ? state.huntNeeds[id] : row.need);
  if (!Number.isInteger(raw) || raw < 2 || raw > 20) {
    punch("shake");
    say("Threshold is from 2 to 20.", true);
    return;
  }
  if (walletShopKas(rail)) {
    punch("shake");
    say("The wallet stays closed for a shop. Pick POCencept or KUSDT. Swapping tKAS at the bank asks the wallet to sign.", true);
    return;
  }
  const names = { kas: "tKAS", poc: "POCencept", kusdt: "KUSDT" };
  const agreed = await askOk("You want to promise " + row.name + " for " + formatCents(row.cents) + " " + names[rail] + " if others do?");
  if (!agreed) return;
  huntBusy = true;
  try {
    const guest = state.id.kind === "guest";
    const extra = guest ? { token: state.id.token } : {};
    let txid = "";
    if (rail === "kas" && !guest) {
      const typed = panel.querySelector("#hunt-txid");
      txid = typed ? typed.value.trim() : shopTxid;
      if (!txid) {
        say("Paste the Testnet 10 txid. The wallet stays closed on this row.", true);
        return;
      }
    }
    const promisePath = rail === "kas" && guest ? "/api/1984/guest/hunt/promise" : "/api/1984/hunt/promise";
    const promised = await post(promisePath, { ...extra, hunt: id, rail, need: raw, confirmed: true });
    if (!promised.ok) {
      punch("shake");
      say(promised.error || "The desk refused the promise.", true);
      return;
    }
    if (promised.hunts) state.huntBook = promised.hunts;
    if (promised.account) state.account = promised.account;
    const snapPath = rail === "kas" && guest ? "/api/1984/guest/hunt/snap" : "/api/1984/hunt/snap";
    const snapped = await post(snapPath, { ...extra, hunt: id, txid });
    if (snapped.account) state.account = snapped.account;
    if (snapped.hunts) state.huntBook = snapped.hunts;
    if (snapped.paid && snapped.banner === "Pack paid on this square.") {
      showBanner("Pack paid on this square.");
      punch("nod");
      const who = Array.isArray(snapped.who) ? snapped.who.map(short).join(", ") : "";
      say("Pack paid on this square." + (who ? " " + who + "." : ""));
    } else if (snapped.ready) {
      say("Paste the Testnet 10 txid. The wallet stays closed on this row.", true);
    } else if (snapped.error) {
      say(snapped.error);
    } else say("Your promise is still on the ledger.");
    paintHunt();
    paintChrome();
    await refreshAccount();
  } catch (err) {
    punch("shake");
    say(err && err.message ? err.message : "The desk refused the promise.", true);
  } finally {
    huntBusy = false;
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
    "<li>Or choose New arrival on the welcome gate. That is the same as Test without a wallet. This tab gets 50000 tKAS from Grok's Testnet-10 wallet. Close the tab and that address is gone. Leftover tKAS is swept back. It does not replace a wallet you already saved. Returning leaves the gate and uses a wallet that stays on this browser. One thousand of these test wallets can be opened in a day.</li>" +
    "<li>Or paste a kaspatest address. Or type a .kas name that already resolves on TN10. That choice stays until you change it.</li>" +
    "<li>Need coins: New arrival gives this tab 50000 tKAS. The faucet tab pays 0.6 tKAS. At the live price that is a few cents, so it will not buy supper. The practice purse is in the books desk at the bank. That purse is play money.</li>" +
    "<li class=\"only-desk\">On a computer, hold the left mouse button and move to look all the way around. Click the ground to point where you walk, or use the keyboard. Stand next to a building and click it to walk in. The bank card opens when you click a clerk. In the cafe or at the table, take a seat and the menu blinks, or order at the blinking counter. The market opens at the counter. The showroom opens when you click Pike or the sign. Buy the roadster and it waits on the lot. W A S D move the way you look. The arrow keys do too. G gets in or out. Get out is the gold button. Esc closes the card, then leaves the room. Square leaves too.</li>" +
    "<li class=\"only-phone\">On a phone, drag a finger to look. Tap the ground to walk or drive. Tap a building you are next to and you walk in. Sit in the cafe, then the menu or the card. The bank opens when you tap a clerk. Square leaves the room. Get in drives. Get out walks. A phone wallet cannot switch to Testnet 10 from this page. Set Testnet 10 inside Kasware or Kastle, or open this page in the Kastle browser. New arrival is the test wallet.</li>" +
    "<li>The wallet asks to sign only for a tKAS swap at the bank. A POCencept swap, a KUSDT swap, or a shop buy asks on this page: you want this for that price, then OK. The miner fee on a tKAS swap is twice the standard Testnet 10 rate, and it is extra tKAS.</li>" +
    "<li>Venn's bank starts with three clerks. Push tKAS, POCencept, or KUSDT. The open clerk swaps into the other two. The books desk explains locked coins and the practice purse. The Result line says whether a swap landed. While the wallet is opening for a tKAS swap, the steps stay on that clerk.</li>" +
    "<li>The roadster parks on the lot in front of Pike's shop. Click it, or Get in, to drive. Thrusters show while it moves. Get out is the gold button. Inside a shop you are on foot. In the cafe or at the table, take a seat and the menu blinks, or order at the counter. Launch, while you are in the car and outside, starts the countdown. The ship lifts when the count reaches zero. A bar fills until the car leaves the ship. KONI, the Kaspa node, leaves with the roadster, and the climb keeps the comms going. Its screen lists Testnet 10 transactions. End the flight shows then. Simulation theory is the click after you end it. That button warns that it brings you back to the simulation on Earth. From there you can pay for the Moon, Mars, Jupiter, Saturn, or go into the abyss, with tKAS, POCencept, or KUSDT. The way there is ten seconds. Once you arrive, the same rails can send you to another world, or into the abyss. The card lines are the flight. On that hop the end popup waits ten seconds.</li>" +
    "<li>Lux's cinema is the dark building. Take a seat, then the screen. The ticket and the snacks take tKAS, POCencept, or KUSDT. What are the rails? opens the short note. One ticket plays every film, from a seat. Prev, Next, and Shuffle move the reel. Overview lists every film. The card sits to the left of the film. The current film stays up until the next one has a picture. The next film starts when one ends.</li>" +
    "<li>Reed's Hunt Hall is the timber building east of the lot. Click Reed, then the board. Promise is not Buy. The pack stays hidden until it pays.</li>" +
    "<li>The goal of a peer-to-peer chain is a settlement between two people, including while almost nobody takes the coin. That bill is a car, an AI service, a game purchase, or a rented service. The ceiling is a till a stranger can receive on. Proof of stake hands the next block to coins already held. Kaspa is proof of work. It sequences the coin now. Sequencing applications on that work is in process, and this square is not that product. <a href=\"https://github.com/STP-KAS/stable-staghunt-theory/blob/main/CEILING.md\" target=\"_blank\" rel=\"noopener\">The ceiling</a> is the longer note.</li>" +
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
  const trip = tripBySku(sku);
  if (trip && state.flightStart && !state.flightDark) {
    state.cruiseFrom = performance.now() - state.flightStart;
    state.cruiseStart = performance.now();
    state.cruiseSku = sku;
    state.jokeSent = -1;
    state.flightBeat = "";
    showBanner("Paid.");
    punch("nod");
    say(body.shop + " took the payment for " + body.item + ". " + FLIGHT_NOTE);
    paintFlightCard(performance.now());
    return;
  }
  if (sku === "reel") {
    state.showPaid = true;
    showBanner("Paid.");
    punch("nod");
    say(body.shop + " took the payment for " + body.item + ". " + payKind("shop"));
    beginShow(true);
    return;
  }
  showBanner(shopBanner(sku));
  if (sku === "keys") {
    state.aboard = false;
    state.path = [];
    state.arrived = null;
    state.lapUntil = 0;
    if (state.venue || state.inside || isVisit(state.mode)) openMode("world");
    state.player = { x: ROADSTER_PARK.x, y: ROADSTER_PARK.y + 1 };
    state.facing = { x: 0, y: -1 };
    punch("nod");
    say("The roadster is parked on the lot. Click it, or Get in, to drive. Get out is the gold button.");
    syncRide();
    paintChrome();
    if (worldView.snap) worldView.snap();
  } else if (sku === "lap") {
    punch("lap");
    if (state.account && state.account.roadster) state.lapUntil = performance.now() + 6000;
    say(body.shop + " took the payment for " + body.item + ". " + payKind("shop"));
  } else {
    punch("nod");
    say(body.shop + " took the payment for " + body.item + ". " + payKind("shop"));
  }
}

function payingLine() {
  if (state.id.kind === "kasware") return "Paying as Kasware. The wallet signs a tKAS swap.";
  if (state.id.kind === "kastle") return "Paying as Kastle. The wallet signs a tKAS swap.";
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

function goodsName(shop, sku) {
  const lists = [state.home && state.home.shops, SHOPS];
  for (const list of lists) {
    const place = (list || []).find((item) => item.id === shop);
    const row = place && place.items.find((item) => item.sku === sku);
    if (row) return row.name;
  }
  return "this";
}

let askBusy = false;
let armOnOk = null;

function askOk(line) {
  const shade = document.getElementById("ask");
  const text = document.getElementById("ask-line");
  const ok = document.getElementById("ask-ok");
  const no = document.getElementById("ask-no");
  if (askBusy || !shade || !text || !ok || !no) return Promise.resolve(false);
  askBusy = true;
  text.textContent = line;
  shade.hidden = false;
  return new Promise((resolve) => {
    const finish = (yes) => {
      askBusy = false;
      shade.hidden = true;
      ok.removeEventListener("click", onOk);
      no.removeEventListener("click", onNo);
      shade.removeEventListener("click", onShade);
      document.removeEventListener("keydown", onKey);
      resolve(yes);
    };
    const onOk = () => {
      if (armOnOk) armOnOk();
      finish(true);
    };
    const onNo = () => finish(false);
    const onShade = (ev) => {
      if (ev.target === shade) finish(false);
    };
    const onKey = (ev) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      finish(false);
    };
    ok.addEventListener("click", onOk);
    no.addEventListener("click", onNo);
    shade.addEventListener("click", onShade);
    document.addEventListener("keydown", onKey);
    ok.focus();
  });
}

async function spend(rail, shop, sku) {
  if (spendBusy) return;
  if (!requireId()) return;
  spendBusy = true;
  try {
    const names = { kas: "tKAS", poc: "POCencept", kusdt: "KUSDT" };
    let price = names[rail] || "this";
    let txid = "";
    if (rail === "kas") {
      const quote = await api("/api/1984/quote?shop=" + encodeURIComponent(shop) + "&sku=" + encodeURIComponent(sku));
      if (!quote.ok) {
        say(quote.error || "No quote.", true);
        return;
      }
      price = formatTkas(quote.sompi) + " tKAS";
    } else {
      const place = ((state.home && state.home.shops) || []).find((item) => item.id === shop);
      const row = place && place.items.find((item) => item.sku === sku);
      if (row) price = formatCents(row.cents) + " " + (names[rail] || "");
    }
    const agreed = await askOk(buyAskLine(goodsName(shop, sku), price));
    if (!agreed) return;
    if (rail === "kas" && state.id.kind === "guest") {
      say("Paying from this tab's test address. Close the tab and it is gone.");
      const body = await post("/api/1984/guest/spend", { token: state.id.token, shop, sku, confirmed: true });
      if (!body.ok) {
        punch("shake");
        say(body.error || "The shop refused the payment.", true);
        return;
      }
      if (body.account) state.account = body.account;
      tookPayment(body, sku);
      paintBooks();
      await refreshAccount();
      return;
    }
    if (rail === "kas") {
      const typed = panel.querySelector("#txid");
      txid = typed ? typed.value.trim() : shopTxid;
      if (!txid) {
        say("The wallet stays closed for a shop. Pick POCencept or KUSDT, then OK. Swapping tKAS at the bank asks the wallet to sign.", true);
        return;
      }
    }
    const body = await post("/api/1984/spend", { shop, sku, rail, txid, confirmed: true });
    if (!body.ok) {
      punch("shake");
      const kept = rail === "kas" && txid ? " The txid stays in the paste box. Buy again claims it and does not send a second time." : "";
      say((body.error || "The shop refused the payment.") + kept, true);
      return;
    }
    if (rail === "kas") shopTxid = "";
    if (body.account) state.account = body.account;
    tookPayment(body, sku);
    paintBooks();
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
    const paid = lockTxid;
    lockTxid = "";
    const got = body.cents == null || body.cents === "" ? "" : formatCents(body.cents);
    if (got) putRedeemAmount(got);
    const tx = paid ? " Tx " + paid.slice(0, 10) + "…." : "";
    swapNote((got ? "Swapped. " + shown + " became " + got + " " + name + "." : "Swapped. " + shown + " locked into " + name + ".") + tx + " " + payKind("lock"), "ok");
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
  const agreed = await askOk(swapAskLine(amount, name, "tKAS"));
  if (!agreed) {
    swapNote("Not swapped. Nothing moved.", "");
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
    swapNote("Swapped. " + amount + " " + name + " came back as tKAS." + tx + " " + payKind("lock"), "ok");
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
  const agreed = await askOk(swapAskLine(amount, source, dest));
  if (!agreed) {
    swapNote("Not swapped. Nothing moved.", "");
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
    swapNote("Swapped. " + amount + " " + source + " is now " + dest + ". Locked stayed locked. The purse stayed a purse. " + payKind("shop"), "ok");
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
  if (state.flightStart) {
    paintFlightCard(now);
  }
  const ridingLap = !state.flightStart && state.lapUntil && now < state.lapUntil;
  if (!state.flightStart && !ridingLap) {
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
  state.arrived = then || (dest.shop ? () => enterVenue(dest.shop) : null);
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
  flight() {
    if (!state.flightStart) return 0;
    if (state.flightDark) return -1;
    return performance.now() - state.flightStart;
  },
  cruise() {
    if (!state.cruiseStart || state.flightDark) return null;
    return { ms: performance.now() - state.cruiseStart, sku: state.cruiseSku, from: state.cruiseFrom };
  },
  walk(x, y) {
    if (state.flightStart) return;
    const npc = map.npcs.find((item) => item.x === x && item.y === y);
    walkTo(x, y, npc ? () => arriveVisit(npc.shop) : null);
  },
  near(shop) {
    return nearShop(map, state.player.x, state.player.y, shop);
  },
  enter(shop) {
    if (state.flightStart) return;
    enterVisit(shop);
  },
  room: () => state.inside,
  venue: () => state.venue,
  seated: () => state.seated,
  huntSpoke: () => state.huntSpoke,
  watching: () => state.watching,
  clerk: () => state.bankClerk,
  use(hit, rail) {
    if (state.flightStart || state.watching) return;
    if (!state.venue) return;
    if (state.venue === "hunt") {
      const hall = roomUse("hunt", state.huntSpoke, hit);
      if (hall.spoke) state.huntSpoke = true;
      if (hall.say) say(hall.say);
      if (hall.open === "hunt") openMode("hunt");
      return;
    }
    const act = roomUse(state.venue, state.seated, hit);
    if (act.play) {
      state.seated = true;
      if (state.showPaid) beginShow();
      else offerTicket();
      return;
    }
    if (act.sit) state.seated = true;
    if (act.open === "bank" && act.clerk === "books") {
      state.bankClerk = "books";
      state.bankShutter = performance.now();
      keepClerk = true;
      openMode("bank");
      keepClerk = false;
      say("The books are locked coins and the practice purse. A clerk does the swap.");
      return;
    }
    if (act.open === "bank") {
      const next = rail === "poc" || rail === "kusdt" || rail === "kas" ? rail : "kas";
      chooseRail(next);
      return;
    }
    if (act.say) say(act.say);
    if (act.open) openMode(act.open);
  },
  step(dx, dy) {
    if (state.flightStart) return;
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
    if (state.flightStart) return;
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
      if (state.venue || state.inside || isVisit(state.mode)) openMode("world");
      showBanner("You drive.");
      say("You are in the roadster. Get out is the gold button.");
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
    if (state.flightStart) return;
    state.path = [];
    state.arrived = null;
    state.player = { x, y };
    state.lapUntil = 0;
  },
});
bindReel();

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
  if (key === "escape") {
    const rails = document.getElementById("rails-note");
    if (rails && !rails.hidden) {
      ev.preventDefault();
      closeRailsNote();
      return;
    }
  }
  ev.preventDefault();
  if (state.flightStart) {
    if (key === "escape") {
      const ask = document.getElementById("ask");
      if (ask && !ask.hidden) return;
      if (endAllowed(performance.now())) endLaunch();
    }
    return;
  }
  if (key === "g") {
    toggleRide();
    return;
  }
  if (key === "escape") {
    const ask = document.getElementById("ask");
    if (ask && !ask.hidden) return;
    if (state.watching || state.ticketAsk) {
      stopShow(false);
      return;
    }
    const act = escapeRoom(isVisit(state.mode), !!state.venue);
    if (act === "counter") closeCounter();
    else openMode("world");
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
  if (state.flightStart) return;
  const button = ev.target.closest("[data-go]");
  if (!button) return;
  const mode = button.getAttribute("data-go");
  if (shopVisit(mode)) {
    const near = nearShop(map, state.player.x, state.player.y, mode);
    if (state.venue && state.venue !== mode) {
      stopShow(true);
      if (!near) veilRoom();
      state.venue = "";
      state.inside = false;
      state.seated = false;
      state.huntSpoke = false;
      if (state.mode !== "world") hidePanel();
      state.mode = "world";
      markRoom();
      paintChrome();
    }
    if (near) enterVenue(mode);
    else {
      const npc = map.npcs.find((item) => item.shop === mode);
      if (npc) walkTo(npc.x, npc.y, () => enterVenue(mode));
    }
    return;
  }
  openMode(mode);
});
you.addEventListener("click", (ev) => {
  if (ev.target.id === "use-kasware") connectWallet("kasware").catch((err) => say(err.message, true));
  if (ev.target.id === "use-kastle") connectWallet("kastle").catch((err) => say(err.message, true));
  if (ev.target.id === "use-guest") {
    let last = "";
    let showed = false;
    const timer = setTimeout(() => {
      showed = true;
    }, 700);
    startGuest((step, detail) => {
      const line = detail ? step + " (" + detail + ")" : step;
      if (!line || line === last) return;
      last = line;
      const gateEl = document.getElementById("gate");
      if (gateEl && !gateEl.hidden) {
        if (showed) paintGuestWait(step, detail);
      } else if (showed) say(line);
    })
      .then((result) => {
        if (result && result.error) say(result.error, true);
      })
      .catch((err) => say(err.message, true))
      .finally(() => clearTimeout(timer));
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
  let latest = "Waiting for the till";
  let latestDetail = "";
  let showed = false;
  const timer = setTimeout(() => {
    showed = true;
    paintGuestWait(latest, latestDetail);
  }, 700);
  startGuest((step, detail) => {
    if (step) latest = step;
    latestDetail = detail || "";
    if (showed) paintGuestWait(latest, latestDetail);
  })
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
      clearTimeout(timer);
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
const launchButton = document.getElementById("launch");
if (launchButton) launchButton.addEventListener("click", startLaunch);
const flightEnd = document.getElementById("flight-end");
if (flightEnd) flightEnd.addEventListener("click", endLaunch);
const flightBack = document.getElementById("flight-back");
if (flightBack) flightBack.addEventListener("click", returnFromFlight);
const simBig = document.getElementById("sim-big");
if (simBig) simBig.addEventListener("click", () => { simBig.hidden = true; });
const railsNote = document.getElementById("rails-note");
if (railsNote) {
  railsNote.addEventListener("click", (ev) => {
    if (ev.target === railsNote || ev.target.closest("#rails-close")) closeRailsNote();
  });
}
const flightPlanets = document.getElementById("flight-planets");
if (flightPlanets) flightPlanets.addEventListener("click", (ev) => {
  const pick = ev.target.closest("[data-rail-pick]");
  if (pick) {
    setShopRail(pick.getAttribute("data-rail-pick"));
    return;
  }
  if (ev.target.closest("[data-rails]")) {
    openRailsNote();
    return;
  }
  const blocked = ev.target.closest("[data-short]");
  if (blocked) {
    punch("shake");
    say(blocked.getAttribute("data-short"), true);
    return;
  }
  const btn = ev.target.closest("[data-pay]");
  if (!btn || btn.disabled) return;
  spend(btn.getAttribute("data-pay"), "orbit", btn.getAttribute("data-sku"));
});
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
if (bankShade) bankShade.addEventListener("click", () => {
  if (isVisit(state.mode)) closeCounter();
  else openMode("world");
});
panel.addEventListener("click", (ev) => {
  if (ev.target.closest("[data-rails]")) {
    openRailsNote();
    return;
  }
  const huntRail = ev.target.closest("[data-hunt-rail]");
  if (huntRail) {
    rememberHuntFields();
    state.huntRails[huntRail.getAttribute("data-hunt")] = huntRail.getAttribute("data-hunt-rail");
    if (state.mode === "hunt") paintHunt();
    return;
  }
  const drop = ev.target.closest("[data-drop]");
  if (drop) {
    dropPromise(drop.getAttribute("data-drop"));
    return;
  }
  const promised = ev.target.closest("[data-promise]");
  if (promised) {
    promiseHunt(promised.getAttribute("data-promise"));
    return;
  }
  const pick = ev.target.closest("[data-rail-pick]");
  if (pick) {
    setShopRail(pick.getAttribute("data-rail-pick"));
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
