import { browserMarker, clearGuest, readIdentity, writeIdentity } from "./identity.mjs";
import { BENCH, REPOS } from "./links.mjs?v=4";
import {
  GUEST_DISCLAIMER,
  RESERVE,
  assertNotMainnetNetwork,
  assertTestnet,
  normalizeKasName,
  centsForSompi,
  formatCents,
  formatTkas,
  parseDollars,
  parseTkas,
  sompiForCents,
} from "./money.mjs";
import { pageFeeRate, PAGE_PRIORITY_SOMPI } from "../faucet/fee-rate.mjs";
import { buyAskLine, lockSigner, payKind, settleLine, shopBanner, swapAskLine, tn10TxUrl, txidFromWallet } from "./kas-spend.mjs?v=4";
import { RAIL_NAMES, RAILS_NOTE, SWAP_PAY, payRail, railBarHtml, shortRail, swapNeed } from "./rails-note.mjs?v=8";
import { REELS, REEL_CAPTION, reelShuffle, reelStep } from "./reels.mjs?v=7";
import { ABYSS_HANG, DRIVE_MS, ENTRY_HINT, FLIGHT_LIFTOFF, FLIGHT_NOTE, FLIGHT_RELEASE, FLIGHT_STAGE, HOT_STAGE_MS, PAD_LEFT, PAD_LEFT_SECONDS, PAD_RIGHT, PAD_RIGHT_SECONDS, WALK_MS, countdownMs, cruiseLine, cruiseOfferEnd, cruiseProgress, escapeRoom, filmLaunchFill, flightBeat, flightClock, flightLine, flightOfferEnd, flightProgress, mountWorld, roomUse, seat, spaceJoke } from "./view3d.mjs?v=55";
import { HUNTS, LOT_LINE, ROADSTER_PARK, SHOPS, counterFace, destinationFor, findPath, huntById, nearShop, shopVisit, tripBySku, walkable, world } from "./world.mjs?v=4";
const TUNNEL = "https://authority-fireplace-earlier-spirit.trycloudflare.com";
const PAGE_LIFE = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
const map = world();
const view = document.getElementById("view");
const mini = document.getElementById("mini");
const mctx = mini ? mini.getContext("2d") : null;
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
  launchHold: false,
  liftoffWall: null,
  padPhase: "",
  preRoll: false,
  hotOn: false,
  releaseFilmOn: false,
  flightDark: false,
  flightEndedAt: 0,
  flightBackShown: false,
  flightBeat: "",
  cruiseStart: 0,
  cruiseSku: "",
  cruiseFrom: 0,
  jokeSent: -1,
  destOpen: false,
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
  state.liftoffWall = null;
  if (!audio) {
    state.launchHold = false;
    return;
  }
  claimMedia(audio);
  audio.muted = false;
  audio.volume = 0.9;
  state.launchHold = true;
  try { audio.currentTime = 0; } catch (err) { /* the file may still be opening */ }
  const clearHold = () => { state.launchHold = false; };
  const pending = audio.play();
  if (pending && pending.then) pending.then(clearHold).catch(clearHold);
  else clearHold();
}

/** The countdown follows launch.mp3. After liftoff the wall clock carries the shortened flight. */
function flightElapsed(now) {
  const wall = state.flightStart ? Math.max(0, now - state.flightStart) : 0;
  const audio = document.getElementById("launch-sound");
  const heard = audio && Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : 0;
  const step = countdownMs(wall, heard, {
    playing: !!(audio && !audio.paused && !audio.ended),
    ended: !!(audio && audio.ended),
    hold: state.launchHold,
    anchored: state.liftoffWall,
  });
  if (step.anchor != null) state.liftoffWall = step.anchor;
  return step.ms;
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
  claimMedia(audio);
  audio.muted = false;
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

function armMedia(el) {
  if (!el) return;
  const stamp = {};
  el._arm = stamp;
  // A phone allows a later play() only after this tap already started the clip with sound.
  el.muted = false;
  if (typeof el.playsInline === "boolean") {
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
  }
  if (el.tagName === "VIDEO") {
    el.hidden = false;
    el.style.cssText = "position:fixed;left:0;top:0;width:320px;height:180px;transform:translateX(-120vw);opacity:1;pointer-events:none";
  }
  const finish = () => {
    if (el._arm !== stamp) return;
    el._arm = null;
    try { el.pause(); } catch (err) { /* already quiet */ }
    try { el.currentTime = 0; } catch (err) { /* the file may still be opening */ }
  };
  const pending = el.play();
  if (pending && pending.then) pending.then(finish).catch(() => { if (el._arm === stamp) el._arm = null; });
  else finish();
}

function claimMedia(el) {
  if (el) el._arm = null;
}

function flightFilm(id) {
  return document.getElementById(id);
}

function hideFlightFilm(el) {
  if (!el) return;
  el.hidden = true;
  try { el.pause(); } catch (err) { /* already quiet */ }
}

function stopFlightFilms() {
  hideFlightFilm(flightFilm("hotstage-film"));
  hideFlightFilm(flightFilm("release-film"));
  state.hotOn = false;
  state.releaseFilmOn = false;
}

function playFlightFilm(el) {
  if (!el) return;
  claimMedia(el);
  el.hidden = false;
  el.muted = false;
  el.volume = 0.9;
  el.style.cssText = "position:fixed;left:0;top:0;width:320px;height:180px;transform:translateX(-120vw);opacity:1;pointer-events:none";
  const pending = el.play();
  if (pending && pending.catch) pending.catch(() => {});
}

function phoneLayout() {
  return window.matchMedia("(max-width: 980px)").matches;
}

/** On a phone the only joke is the abyss line about the old roadster and the Gulf of America. */
function jokeForScreen(text, sku) {
  if (!text) return "";
  if (!phoneLayout()) return text;
  if (sku !== "abyss") return "";
  if (!/old roadster/i.test(text) || !/gulf/i.test(text)) return "";
  return text;
}

function syncFlightFilms(ms) {
  const hot = flightFilm("hotstage-film");
  const comms = document.getElementById("comms-sound");
  const sepEnd = FLIGHT_STAGE + HOT_STAGE_MS;
  if (ms >= FLIGHT_RELEASE) {
    hideFlightFilm(flightFilm("release-film"));
    if (comms) {
      comms.volume = 0;
      try { comms.pause(); } catch (err) { /* already quiet */ }
    }
    if (hot && !state.releasePlayed) {
      state.releasePlayed = true;
      state.hotOn = false;
      try { hot.currentTime = 0.49; } catch (err) { /* the file may still be opening */ }
      playFlightFilm(hot);
    }
    return;
  }
  if (ms >= sepEnd) {
    if (state.hotOn) {
      state.hotOn = false;
      hideFlightFilm(hot);
    }
    return;
  }
  if (ms >= FLIGHT_STAGE && hot && !state.hotOn) {
    state.hotOn = true;
    if (comms) comms.volume = 0.12;
    try { hot.currentTime = 0; } catch (err) { /* the file may still be opening */ }
    playFlightFilm(hot);
  }
}

function padSlots() {
  const slots = worldView.padVideos && worldView.padVideos();
  return Array.isArray(slots) ? slots.filter(Boolean) : [];
}

function padPath(el) {
  const raw = String((el && (el.currentSrc || el.src)) || "");
  for (const mark of ["1984/", "random/"]) {
    const at = raw.lastIndexOf(mark);
    if (at >= 0) return raw.slice(at);
  }
  return raw;
}

function bindPad(el) {
  if (!el || el.dataset.padBound) return;
  el.dataset.padBound = "1";
  el.addEventListener("ended", () => onPadEnded(el));
  el.addEventListener("error", () => onPadEnded(el));
}

function cuePad(el, src) {
  if (!el || !src) return;
  bindPad(el);
  el.muted = false;
  el.volume = 0.85;
  el.loop = false;
  const shown = padPath(el);
  if (shown !== src) el.src = src;
  try { el.currentTime = 0; } catch (err) { /* the file may still be opening */ }
}

function onPadEnded(el) {
  const slots = padSlots();
  if (!state.preRoll || state.flightStart) return;
  if (el === slots[0] && state.padPhase === "left") startRightFilm();
  else if (el === slots[1] && state.padPhase === "right") beginCountdown();
}

function startLeftFilm() {
  const slots = padSlots();
  state.padOn = true;
  state.padPhase = "left";
  if (worldView.showPadFilms) worldView.showPadFilms();
  if (slots.length < 1) {
    beginCountdown();
    return;
  }
  cuePad(slots[0], PAD_LEFT);
  if (slots[1]) {
    cuePad(slots[1], PAD_RIGHT);
    armMedia(slots[1]);
  }
  claimMedia(slots[0]);
  slots[0].muted = false;
  slots[0].volume = 0.85;
  const pending = slots[0].play();
  if (pending && pending.catch) pending.catch(() => startRightFilm());
}

function startRightFilm() {
  if (state.flightStart || !state.preRoll || state.padPhase === "right") return;
  const slots = padSlots();
  state.padPhase = "right";
  if (slots.length < 2) {
    beginCountdown();
    return;
  }
  claimMedia(slots[1]);
  cuePad(slots[1], PAD_RIGHT);
  const pending = slots[1].play();
  if (pending && pending.catch) pending.catch(() => beginCountdown());
  const line = document.getElementById("flight-line");
  if (line) line.textContent = "Two short films, then the launch. Film on the right.";
}

function beginCountdown() {
  if (state.flightStart || !state.preRoll) return;
  state.preRoll = false;
  state.padPhase = "";
  state.flightStart = performance.now();
  stopPadFilms();
  state.padOn = false;
  launchSound();
  const barLabel = document.getElementById("flight-bar-label");
  const bar = document.getElementById("flight-bar");
  if (barLabel) {
    barLabel.hidden = false;
    barLabel.textContent = "Time before launch";
  }
  if (bar) bar.hidden = false;
  const clock = document.getElementById("flight-clock");
  if (clock) {
    clock.hidden = false;
    clock.textContent = flightClock(0);
  }
}

function stopPadFilms() {
  if (!state.padOn) return;
  state.padOn = false;
  if (worldView.dropPadFilms) worldView.dropPadFilms();
  for (const el of padSlots()) {
    try { el.pause(); } catch (err) { /* already quiet */ }
  }
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

function ledgerHeaders(extra) {
  return Object.assign({ accept: "application/json", "Bypass-Tunnel-Reminder": "true" }, extra || {});
}

async function api(path, options) {
  let last = "The village ledger is offline. Walking still works.";
  for (const base of bases()) {
    try {
      const res = await fetch(base + path, {
        method: options && options.method ? options.method : "GET",
        headers: ledgerHeaders({ "content-type": "application/json" }),
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
  const addrDraft = document.getElementById("addr");
  const nameDraft = document.getElementById("kasname");
  const keepAddr = addrDraft && document.activeElement === addrDraft ? addrDraft.value : null;
  const keepName = nameDraft && document.activeElement === nameDraft ? nameDraft.value : null;
  const addrSel = keepAddr != null ? [addrDraft.selectionStart, addrDraft.selectionEnd] : null;
  const nameSel = keepName != null ? [nameDraft.selectionStart, nameDraft.selectionEnd] : null;
  const id = state.id;
  const label = id.label || short(id.address);
  const kas = !id.address ? "— tKAS" : state.kasSompi == null ? "… tKAS" : formatTkas(state.kasSompi) + " tKAS";
  const poc = state.account ? formatCents(state.account.poc) + " POCencept stable" : "— POCencept stable";
  const kusdt = state.account ? formatCents(state.account.kusdt) + " KUSDT stable" : "— KUSDT stable";
  const frozen = state.account && state.account.kusdtFrozen ? " · KUSDT stable frozen" : "";
  const guestLine = id.kind === "guest" ? " · this tab only" : "";
  const driving = state.account && state.account.roadster ? (state.aboard ? " · driving" : " · roadster is yours") : "";
  const bankOn = state.mode === "bank" ? " on" : "";
  bar.innerHTML =
    '<p class="bal-line"><strong>' + esc(label) + "</strong>" + esc(guestLine) + driving + "</p>" +
    '<p class="bal-line">' + esc(kas) + "</p>" +
    '<p class="bal-line">' + esc(poc) + "</p>" +
    '<p class="bal-line">' + esc(kusdt) + esc(frozen) + "</p>" +
    '<button type="button" id="bar-bank" class="bar-bank' + bankOn + '">Bank</button>';

  const buttons = [
    ["world", "Square"],
    ["cafe", "Cafe"],
    ["mint", "Mint"],
    ["layer", "Layer"],
    ["kachat", "Kachat"],
    ["vault", "Vault"],
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
    "<p class=\"fine\">A funded wallet is prefunded with tKAS. Spend it at will. There is no risk. tKAS is worthless. This money is tKAS, Testnet-10 KAS. With tKAS you can go to the bank.</p>" +
    '<p class="fine">Testnet 10 only. A mainnet wallet is refused. Never a seed.</p>' +
    '<button type="button" id="use-guest">Use a funded test address</button>' +
    '<button type="button" id="log-out">Log out</button>' +
    '<p class="warn">' + esc(GUEST_DISCLAIMER) + "</p>" +
    (guestOn
      ? '<p class="warn">This funded wallet stays with this browser: ' + esc(short(id.address)) + ". Another browser cannot be matched. This desk says so.</p>"
      : "") +
    '<label>kaspatest address<input id="addr" spellcheck="false" autocomplete="off" value="' + esc(id.kind === "name" || guestOn ? "" : id.address) + '"></label>' +
    '<button type="button" id="use-addr">Use this address</button>' +
    '<label>.kas name, if you already have one<input id="kasname" spellcheck="false" autocomplete="off" placeholder="name.kas" value="' + esc(id.kind === "name" ? id.label : "") + '"></label>' +
    '<button type="button" id="use-name">Use this name</button>' +
    '<p class="warn">' + esc(PRIVACY) + '</p>' +
    '<p class="fine"><a href="https://app.knsdomains.org" target="_blank" rel="noopener">KNS app</a> · <a href="https://tn10.knsdomains.org" target="_blank" rel="noopener">TN10 names</a></p>';
  const addrBox = document.getElementById("addr");
  const nameBox = document.getElementById("kasname");
  if (addrBox && keepAddr != null) {
    addrBox.value = keepAddr;
    addrBox.focus();
    if (addrSel) addrBox.setSelectionRange(addrSel[0], addrSel[1]);
  }
  if (nameBox && keepName != null) {
    nameBox.value = keepName;
    if (keepAddr == null) nameBox.focus();
    if (nameSel) nameBox.setSelectionRange(nameSel[0], nameSel[1]);
  }
  watchAddressBox(addrBox);
  watchNameBox(nameBox);
  syncRide();
}

function groundTile() {
  return map.grid[state.player.y] && map.grid[state.player.y][state.player.x];
}

function canLaunch() {
  const owns = !!(state.account && state.account.roadster);
  const outside = groundTile() !== "i" && !state.inside && !state.venue;
  return owns && state.aboard && outside && !state.flightStart && !state.preRoll;
}

function syncRide() {
  const btn = document.getElementById("ride");
  const owns = !!(state.account && state.account.roadster);
  if (btn) {
    btn.hidden = !owns;
    btn.textContent = state.aboard ? "Get out" : "Drive in your roadster";
  }
  const launch = document.getElementById("launch");
  if (launch) {
    launch.hidden = !canLaunch();
    launch.textContent = "Launch into space";
  }
  const outside = groundTile() !== "i" && !state.inside && !state.venue && !state.flightStart && !state.preRoll;
  const showLot = !owns && outside && !gateIsOpen();
  const lot = document.getElementById("lot-buy");
  if (lot) {
    lot.hidden = !showLot;
    lot.textContent = LOT_LINE;
  }
  if (btn) btn.classList.toggle("out", !!state.aboard);
  const root = document.querySelector(".kw");
  if (root) {
    root.classList.toggle("driving", owns && state.aboard && outside);
    root.classList.toggle("owns", owns);
    root.classList.toggle("lot", showLot);
  }
}

function startLaunch() {
  if (!canLaunch()) return;
  if (state.mode !== "world") {
    hidePanel();
    state.mode = "world";
    markRoom();
  }
  state.path = [];
  state.arrived = null;
  state.lapUntil = 0;
  state.flightStart = 0;
  state.launchHold = false;
  state.liftoffWall = null;
  state.preRoll = true;
  state.flightDark = false;
  state.flightEndedAt = 0;
  state.flightBackShown = false;
  state.flightBeat = "";
  state.cruiseStart = 0;
  state.cruiseSku = "";
  state.cruiseFrom = 0;
  state.jokeSent = -1;
  state.destOpen = false;
  state.releasePlayed = false;
  state.commsPlayed = false;
  state.hotOn = false;
  state.releaseFilmOn = false;
  state.koniAt = 0;
  state.padOn = false;
  armMedia(document.getElementById("launch-sound"));
  armMedia(document.getElementById("comms-sound"));
  armMedia(flightFilm("hotstage-film"));
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
    clock.hidden = true;
    clock.textContent = "";
  }
  if (line) {
    line.hidden = false;
    line.textContent = "Two short films, then the launch. Film on the left.";
  }
  if (bar) bar.hidden = false;
  if (fill) fill.style.width = "0%";
  const barLabel = document.getElementById("flight-bar-label");
  if (barLabel) {
    barLabel.hidden = false;
    barLabel.textContent = "Time before launch";
  }
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
  setPayOpen(false);
  markFlight();
  syncRide();
  startLeftFilm();
}

function endAllowed(now) {
  if (!state.flightStart || state.flightDark) return false;
  if (state.cruiseStart) return cruiseOfferEnd(now - state.cruiseStart);
  return flightOfferEnd(flightElapsed(now));
}

function endLaunch() {
  if (!endAllowed(performance.now())) return;
  stopLaunchSound();
  stopReleaseSound();
  stopCommsSound();
  stopPadFilms();
  stopFlightFilms();
  state.preRoll = false;
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
  state.destOpen = false;
  const dest = document.getElementById("flight-dest");
  if (dest) dest.hidden = true;
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
  state.launchHold = false;
  state.liftoffWall = null;
  state.preRoll = false;
  state.flightDark = false;
  state.flightEndedAt = 0;
  state.flightBackShown = false;
  state.flightBeat = "";
  state.cruiseStart = 0;
  state.cruiseSku = "";
  state.cruiseFrom = 0;
  state.jokeSent = -1;
  state.destOpen = false;
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
  stopPadFilms();
  stopFlightFilms();
  const space = worldView.spaceVideo && worldView.spaceVideo();
  if (space) space.pause();
  say(SIM_LINE, false, "sim");
  showSimBig();
}

function paintPlanets() {
  const box = document.getElementById("flight-planets");
  if (!box) return;
  const rail = payRail(state.shopRail);
  const shop = ((state.home && state.home.shops) || []).find((item) => item.id === "orbit");
  const items = shop && shop.items ? shop.items : [];
  if (!items.length) return;
  const sig = rail + ":" + items.map((trip) => trip.sku + "@" + trip.cents).join(",") + ":" + (state.oracle || "") + ":" + (state.kasSompi || "") + ":" + (state.account && state.account.kusdtFrozen ? "f" : "");
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML = '<p class="flight-dest-title">Choose destination</p><p class="fine">' + esc(SWAP_PAY) + "</p>" + railBarHtml(rail) + items.map((trip) => saleButton(rail, "orbit", trip.sku, trip.cents, trip.name, true)).join("");
  }
}

function showDestList(open) {
  state.destOpen = !!open;
  const box = document.getElementById("flight-planets");
  const button = document.getElementById("flight-dest");
  if (box) box.hidden = !state.destOpen;
  if (button) button.hidden = state.destOpen;
}

function filmLaunchProgress() {
  const slots = padSlots();
  const left = slots[0];
  const right = slots[1];
  const leftDur = left && Number.isFinite(left.duration) && left.duration > 0 ? left.duration : PAD_LEFT_SECONDS;
  const rightDur = right && Number.isFinite(right.duration) && right.duration > 0 ? right.duration : PAD_RIGHT_SECONDS;
  const leftNow = left && Number.isFinite(left.currentTime) ? left.currentTime : 0;
  const rightNow = right && Number.isFinite(right.currentTime) ? right.currentTime : 0;
  return filmLaunchFill(state.padPhase, leftNow, rightNow, leftDur, rightDur);
}

function paintFlightCard(now) {
  if (state.flightDark) return;
  if (state.preRoll && !state.flightStart) {
    const clock = document.getElementById("flight-clock");
    const line = document.getElementById("flight-line");
    if (clock) clock.hidden = true;
    if (line) {
      line.hidden = false;
      line.textContent = state.padPhase === "right"
        ? "Two short films, then the launch. Film on the right."
        : "Two short films, then the launch. Film on the left.";
    }
    const label = document.getElementById("flight-bar-label");
    const bar = document.getElementById("flight-bar");
    const fill = document.getElementById("flight-fill");
    if (label) {
      label.hidden = false;
      label.textContent = "Time before launch";
    }
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = Math.round(filmLaunchProgress() * 100) + "%";
    return;
  }
  const cruising = !!state.cruiseStart;
  const flightMs = flightElapsed(now);
  const ms = cruising ? now - state.cruiseStart : flightMs;
  const progress = cruising ? cruiseProgress(ms) : flightProgress(ms);
  const offer = cruising ? cruiseOfferEnd(ms) : flightOfferEnd(ms);
  const before = !cruising && ms < FLIGHT_LIFTOFF;
  const label = document.getElementById("flight-bar-label");
  const bar = document.getElementById("flight-bar");
  if (label) {
    label.hidden = !before;
    label.textContent = "Time before launch";
  }
  if (bar) bar.hidden = false;
  const fill = document.getElementById("flight-fill");
  if (fill) fill.style.width = Math.round((before ? ms / FLIGHT_LIFTOFF : progress) * 100) + "%";
  const clock = document.getElementById("flight-clock");
  if (clock) clock.textContent = flightClock(ms);
  const beat = cruising ? "cruise" : flightBeat(flightMs);
  if (beat !== state.flightBeat || cruising || beat === "stage" || beat === "orbit") {
    state.flightBeat = beat;
    const line = document.getElementById("flight-line");
    if (line) {
      if (cruising) {
        const trip = tripBySku(state.cruiseSku);
        line.hidden = false;
        line.textContent = cruiseLine(progress, trip ? trip.name : "that world");
        const joke = spaceJoke(ms, state.cruiseSku);
        const lineJoke = jokeForScreen(joke.text, state.cruiseSku);
        const shown = document.getElementById("flight-joke");
        if (joke.index !== state.jokeSent) {
          state.jokeSent = joke.index;
          if (lineJoke) say(lineJoke);
        }
        if (shown) {
          shown.hidden = !lineJoke;
          shown.textContent = lineJoke;
        }
      } else {
        const said = flightLine(beat, flightMs);
        line.textContent = said;
        line.hidden = !said;
        const shown = document.getElementById("flight-joke");
        if (shown) shown.hidden = true;
      }
    }
  }
  const note = document.getElementById("flight-note");
  if (note) {
    note.hidden = !(offer || cruising);
    note.textContent = cruising && state.cruiseSku === "abyss"
      ? ABYSS_HANG + " The Gulf of America is beautiful. Wonderful."
      : FLIGHT_NOTE;
  }
  const panel = document.getElementById("flight-offer");
  if (panel) panel.hidden = !offer;
  const end = document.getElementById("flight-end");
  if (end) end.hidden = !offer;
  if (!cruising && flightBeat(flightMs) === "liftoff") commsSound();
  if (!cruising && flightBeat(flightMs) !== "light") stopPadFilms();
  if (!cruising) syncFlightFilms(flightMs);
  if (state.flightStart && now - (state.koniAt || 0) > 8000) {
    state.koniAt = now;
    readKoni();
  }
  const dest = document.getElementById("flight-dest");
  const planets = document.getElementById("flight-planets");
  if (offer) {
    paintPlanets();
    if (dest) dest.hidden = !!state.destOpen;
    if (planets) planets.hidden = !state.destOpen;
  } else {
    state.destOpen = false;
    if (planets) planets.hidden = true;
    if (dest) dest.hidden = true;
  }
}

function koniKas(sompi) {
  let s = 0n;
  try { s = BigInt(sompi || 0); } catch { s = 0n; }
  if (s < 0n) s = 0n;
  const whole = s / 100000000n;
  const frac = (s % 100000000n) / 1000000n;
  return whole.toString() + "." + frac.toString().padStart(2, "0");
}

async function readKoni() {
  const body = await api("/api/1984/koni");
  const lines = ["KONI", "TN10", "accepted block"];
  const accepted = body && body.ok && body.accepted && body.accepted.id;
  const reward = body && body.ok && body.reward && body.reward.id;
  if (accepted || reward) {
    lines.push(accepted ? String(body.accepted.id).slice(0, 12) : "waiting");
    const blue = (body && body.blue) || (body && body.accepted && body.accepted.blue) || "";
    if (blue) lines.push("score " + String(blue).slice(-8));
    lines.push("mining reward");
    if (reward) lines.push(String(body.reward.id).slice(0, 12) + "  " + koniKas(body.reward.sompi) + " tKAS");
    else lines.push("waiting");
  } else {
    lines.push("waiting");
    lines.push("mining reward");
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

async function refreshAccount(quiet) {
  if (!state.id.address) {
    state.account = null;
    state.kasSompi = null;
    paintChrome();
    return { ok: false };
  }
  const body = await api("/api/1984/account?address=" + encodeURIComponent(state.id.address));
  if (!body.ok) {
    if (!quiet) say(body.error || "Could not read the account.", true);
    paintChrome();
    return { ok: false, error: body.error || "Could not read the account." };
  }
  state.account = body.account;
  state.kasSompi = body.kasSompi;
  state.oracle = body.oracle;
  if (body.reserve) state.reserve = body.reserve;
  paintBooks();
  maybeSwapNotice();
  return { ok: true, account: body.account };
}

function paintBooks() {
  paintChrome();
  const face = counterFace(state.mode);
  if (face === "bank") paintBank();
  else if (face === "hunt") paintHunt();
  else if (face === "mint") paintMint();
  else if (face === "shop") paintShop(state.mode);
}

function maybeSwapNotice() {
  if (swapTold) return;
  const gateBox = document.getElementById("gate");
  if (gateBox && !gateBox.hidden) return;
  if (state.flightStart || state.preRoll) return;
  if (!state.account) return;
  const text = swapNeed({
    kas: state.id.kind === "guest" || state.kasSompi == null ? null : state.kasSompi,
    poc: state.account.poc || 0,
    kusdt: state.account.kusdt || 0,
  });
  if (!text) {
    swapTold = true;
    return;
  }
  const card = document.getElementById("need-swap");
  const line = document.getElementById("need-swap-line");
  const title = document.getElementById("need-swap-title");
  if (!card || !line) return;
  roadsterCard = false;
  setRoadsterBuys(false);
  if (title) title.textContent = "Pay with a swap";
  line.textContent = text;
  card.hidden = false;
  swapTold = true;
}

function forgetGuest(prev) {
  if (!prev || prev.kind !== "guest" || !prev.token) return;
  api("/api/1984/guest/close", {
    method: "POST",
    body: JSON.stringify({ token: prev.token, address: prev.address, life: PAGE_LIFE }),
  });
}

async function logOut() {
  const prev = state.id;
  if (prev && prev.kind === "guest") forgetGuest(prev);
  try {
    clearGuest(boxes());
  } catch (_) {}
  state.id = loadId();
  state.account = null;
  state.kasSompi = null;
  swapTold = false;
  const needSwap = document.getElementById("need-swap");
  if (needSwap) needSwap.hidden = true;
  closeCounter();
  const gateBox = document.getElementById("gate");
  if (gateBox) gateBox.hidden = false;
  paintChrome();
  if (state.id.address) refreshAccount();
  say(state.id.address
    ? "Logged out. A funded address keeps its history. This money is tKAS. With tKAS you can go to the bank."
    : "Logged out. The welcome gate is the landing.");
}

function setIdentity(next, quiet) {
  const prev = state.id;
  try {
    writeIdentity(boxes(), next);
  } catch (err) {
    say(err.message, true);
    return { ok: false, refused: true, error: err.message };
  }
  state.id = next;
  if (prev && prev.kind === "guest" && prev.token && prev.token !== next.token) forgetGuest(prev);
  paintChrome();
  const pending = refreshAccount(!!quiet);
  if (!quiet) {
    if (next.kind === "guest") say("Paying as this browser's funded wallet. " + GUEST_DISCLAIMER);
    else say("Paying as " + (next.label || next.address) + ". This one keeps its history on this browser.");
  }
  return pending;
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
  await enterAddress(address, name);
  if (switchError) say(name + " is on Testnet 10. The wallet did not switch from this page.");
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
        headers: ledgerHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ network: "testnet-10", life: PAGE_LIFE, progress: true, browser: browserMarker(boxes()) }),
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
  let last = "The test wallet is still opening. Leave this tab open and try Test without a wallet again if this stays.";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + "/api/1984/guest?job=" + encodeURIComponent(job), {
        headers: ledgerHeaders(),
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

function guestReturnLine(body) {
  const amount = formatTkas(body.sompi) + " tKAS. This money is tKAS. With tKAS you can go to the bank.";
  if (body.same) return "Same funded wallet. This browser already had this address. " + amount;
  if (body.replaced) return "The earlier funded wallet for this browser is gone. This desk cannot give that same wallet back. This is a new one. " + amount;
  if (body.remembered) return "This browser had no earlier funded wallet. This address stays with this browser. " + amount;
  return "This desk cannot tell this browser from a new one. This is a new funded wallet. " + amount;
}

async function startGuest(onStep) {
  if (guestBusy) return;
  guestBusy = true;
  try {
    say("Opening a funded test address. This money is tKAS. With tKAS you can go to the bank. " + GUEST_DISCLAIMER);
    const posted = await postGuest();
    let body = posted.body;
    if (body && body.step && onStep) onStep(body.step, body.detail || "");
    if (body && body.pending && body.job && posted.base) body = await pollGuest(posted.base, body.job, onStep);
    if (!body || !body.ok || !body.address || !body.token || body.key || body.privateKey) {
      return { ok: false, error: (body && body.error) || "No test wallet. Use your own Testnet-10 wallet if you want the history kept." };
    }
    setIdentity({ address: body.address, label: "test tab", kind: "guest", token: body.token });
    if (state.id.kind !== "guest" || state.id.token !== body.token) {
      return { ok: false, error: "The test wallet opened, but this tab could not keep it. Use a funded test address again." };
    }
    hideGate();
    gateStatus("");
    say(guestReturnLine(body));
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

function gateIsOpen() {
  const gateBox = document.getElementById("gate");
  return !!(gateBox && !gateBox.hidden);
}

function addressField() {
  const gateInput = document.getElementById("gate-addr");
  const panelInput = document.getElementById("addr");
  if (gateIsOpen() && gateInput && document.activeElement === gateInput) return gateInput;
  if (panelInput && document.activeElement === panelInput) return panelInput;
  if (gateIsOpen() && gateInput && String(gateInput.value || "").trim()) return gateInput;
  return panelInput || gateInput;
}

function nameField() {
  const gateInput = document.getElementById("gate-kasname");
  const panelInput = document.getElementById("kasname");
  if (gateIsOpen() && gateInput && document.activeElement === gateInput) return gateInput;
  if (panelInput && document.activeElement === panelInput) return panelInput;
  if (gateIsOpen() && gateInput && String(gateInput.value || "").trim()) return gateInput;
  return panelInput || gateInput;
}

function pickedField(from, pick) {
  if (from && typeof from.value === "string") return from;
  return pick();
}

function watchAddressBox(input) {
  if (!input || input.dataset.addrWatch) return;
  input.dataset.addrWatch = "1";
  input.addEventListener("paste", (ev) => {
    const text = (ev.clipboardData && ev.clipboardData.getData("text")) || "";
    let address = "";
    try { address = assertTestnet(text); } catch (_) { address = ""; }
    if (!address) return;
    ev.preventDefault();
    input.value = address;
    useAddress(input);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    useAddress(input);
  });
}

function watchNameBox(input) {
  if (!input || input.dataset.nameWatch) return;
  input.dataset.nameWatch = "1";
  input.addEventListener("paste", (ev) => {
    const text = (ev.clipboardData && ev.clipboardData.getData("text")) || "";
    const name = normalizeKasName(text);
    if (!name) return;
    ev.preventDefault();
    input.value = name;
    useName(input);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    useName(input);
  });
}

function accountHasHistory(account) {
  if (!account) return false;
  if (Array.isArray(account.receipts) && account.receipts.length > 0) return true;
  if (account.practice || account.roadster || account.kusdtFrozen) return true;
  if (account.spentDay) return true;
  for (const key of ["poc", "kusdt", "pocBacked", "kusdtBacked", "liability", "spentCents", "seq"]) {
    try {
      if (BigInt(account[key] || "0") !== 0n) return true;
    } catch (_) {
      return true;
    }
  }
  return false;
}

function sessionLine(walletName, loaded) {
  if (!loaded || !loaded.ok) return "The till did not answer. This address is set. Its history is not loaded yet.";
  if (accountHasHistory(loaded.account)) {
    return walletName
      ? walletName + " is on Testnet 10. This address already has a history."
      : "This address already has a history. It is loaded.";
  }
  return walletName
    ? walletName + " is on Testnet 10. Started a session for this address."
    : "Started a session for this address.";
}

const FUNDED_NEED = "That address has no tKAS. This money is tKAS, Testnet-10 KAS. Use a funded test address. With tKAS you can go to the bank.";
const FUNDED_UNREAD = "That address could not be read. A funded address already holds tKAS. This money is tKAS. With tKAS you can go to the bank.";

async function fundedEnough(address) {
  const body = await api("/api/1984/account?address=" + encodeURIComponent(address));
  if (!body.ok || body.kasSompi == null || body.kasSompi === "") return { ok: false, error: FUNDED_UNREAD };
  try {
    if (BigInt(body.kasSompi) <= 0n) return { ok: false, error: FUNDED_NEED };
  } catch {
    return { ok: false, error: FUNDED_UNREAD };
  }
  return { ok: true };
}

async function enterAddress(address, walletName) {
  const check = await fundedEnough(address);
  if (!check.ok) {
    say(check.error, true);
    if (gateIsOpen()) gateStatus(check.error, true);
    return { ok: false, refused: true, error: check.error };
  }
  const kind = walletName === "Kasware" ? "kasware" : walletName === "Kastle" ? "kastle" : "address";
  const loaded = await setIdentity({ address, label: walletName || address, kind }, true);
  if (loaded && loaded.refused) {
    if (gateIsOpen()) gateStatus(loaded.error || "That address was refused.", true);
    return;
  }
  hideGate();
  gateStatus("");
  say(sessionLine(walletName, loaded));
}

function gateAddressProblem(value) {
  const raw = String(value || "").replace(/[\u200b-\u200d\ufeff]/g, "").trim();
  if (!raw) return "Paste a kaspatest address.";
  try {
    assertTestnet(raw);
    return "";
  } catch (err) {
    return (err && err.message) || "Use a Testnet-10 kaspatest: address.";
  }
}

function paintGateAddress() {
  const button = document.getElementById("gate-use-addr");
  const field = document.getElementById("gate-addr");
  if (!button || !field) return;
  const problem = gateAddressProblem(field.value);
  button.disabled = !!problem;
  gateStatus(problem, !!problem);
}

async function useAddress(from) {
  const field = pickedField(from, addressField);
  let address = "";
  try {
    address = assertTestnet(field && field.value);
  } catch (err) {
    say(err.message, true);
    if (gateIsOpen()) gateStatus(err.message, true);
    return;
  }
  if (field) field.value = address;
  if (gateIsOpen() && field && field.id === "gate-addr") {
    await enterAddress(address, "");
    return;
  }
  const check = await fundedEnough(address);
  if (!check.ok) {
    say(check.error, true);
    if (gateIsOpen()) gateStatus(check.error, true);
    return;
  }
  setIdentity({ address, label: address, kind: "address" });
}

async function useName(from) {
  const field = pickedField(from, nameField);
  const raw = field ? field.value : "";
  const body = await api("/api/1984/resolve?name=" + encodeURIComponent(raw));
  if (!body.ok) {
    const msg = body.error || "KNS did not answer.";
    say(msg, true);
    if (gateIsOpen()) gateStatus(msg, true);
    return;
  }
  if (!body.found) {
    const msg = "That name is not on the TN10 KNS resolver. Create it at KNS, or keep the kaspatest address.";
    say(msg, true);
    if (gateIsOpen()) gateStatus(msg, true);
    return;
  }
  let address = "";
  try {
    address = assertTestnet(body.found.address);
  } catch (err) {
    say(err.message, true);
    if (gateIsOpen()) gateStatus(err.message, true);
    return;
  }
  const check = await fundedEnough(address);
  if (!check.ok) {
    say(check.error, true);
    if (gateIsOpen()) gateStatus(check.error, true);
    return;
  }
  say(PRIVACY);
  setIdentity({ address, label: body.found.domain, kind: "name" });
  if (state.id && state.id.kind === "name" && state.id.address === address && gateIsOpen()) {
    hideGate();
    gateStatus("");
  }
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
  if (root) root.classList.toggle("flight", !!(state.flightStart || state.preRoll));
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
  stopMintWatch();
  hideLayerPop();
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

function placeExitHtml() {
  return '<button type="button" id="place-exit">Exit to the square</button>';
}

function placeActs(closeHtml) {
  return '<div class="stall-acts">' + (closeHtml || "") + placeExitHtml() + "</div>";
}

function wirePlaceExit() {
  const exit = document.getElementById("place-exit");
  if (exit) exit.onclick = () => openMode("world");
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
    now.textContent = state.watching && clip ? REEL_CAPTION : "Ticket";
  }
  paintReelList();
  const rail = payRail(state.shopRail);
  const rails = document.getElementById("show-rails");
  if (rails) rails.innerHTML = railBarHtml(rail);
  const shop = cinemaShop();
  const ticket = shop && shop.items ? shop.items.find((item) => item.sku === "reel") : null;
  const pay = document.getElementById("show-pay");
  if (pay && ticket) {
    pay.innerHTML = "<p>The ticket is " + esc(formatCents(ticket.cents)) + " on this ledger.</p><p class=\"fine\">" + esc(SWAP_PAY) + "</p>" + saleButton(rail, "cinema", "reel", ticket.cents, ticket.name, false);
  }
  const box = document.getElementById("show-snacks");
  if (!box || !shop) return;
  const items = shop.items.filter((item) => item.sku !== "reel");
  box.innerHTML = items.map((item) => saleButton(rail, "cinema", item.sku, item.cents, item.name, true)).join("");
}

function paintReelList() {
  const list = document.getElementById("show-list");
  if (!list) return;
  if (list.dataset.ready !== "1") {
    list.innerHTML = REELS.map((clip, i) => {
      return '<button type="button" data-reel="' + i + '">' + esc(REEL_CAPTION) + "</button>";
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
    if (ev.target.closest("#show-exit")) openMode("world");
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
  if (mode !== "mint") stopMintWatch();
  if (mode !== "layer") hideLayerPop();
  markRoom();
  paintChrome();
  const shade = document.getElementById("bank-shade");
  const sheet = mode === "mint" || mode === "layer" || mode === "kachat" || mode === "vault";
  panel.classList.toggle("swap-pop", mode === "bank");
  panel.classList.toggle("stall-pop", (isVisit(mode) && mode !== "bank") || sheet);
  if (shade) shade.hidden = !(isVisit(mode) || sheet);
  if (mode === "world") {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  if (mode === "mint") {
    paintMint();
    startMintWatch();
  }
  else if (mode === "layer") {
    paintLayer();
    refreshLayer();
  }
  else if (mode === "kachat") {
    paintKachat();
    refreshChat();
  }
  else if (mode === "vault") {
    paintVault();
    refreshVault();
  }
  else if (mode === "bank") {
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
  const lockedKas = state.account ? formatTkas(state.account.liability) + " tKAS is locked behind the tags" : "";
  const frozen = state.account && state.account.kusdtFrozen ? " · frozen" : "";
  return (
    '<div class="balances">' +
    "<p><strong>tKAS</strong> " + esc(kas) + "</p>" +
    "<p><strong>POCencept stable</strong> " + esc(formatCents(poc.have)) + " · locked " + esc(formatCents(poc.lock)) + " · purse " + esc(formatCents(poc.purse)) + "</p>" +
    "<p><strong>KUSDT stable</strong> " + esc(formatCents(kusdt.have)) + " · locked " + esc(formatCents(kusdt.lock)) + " · purse " + esc(formatCents(kusdt.purse)) + esc(frozen) + "</p>" +
    (lockedKas ? '<p class="fine">' + esc(lockedKas) + "</p>" : "") +
    "</div>"
  );
}

function saleButton(rail, shop, sku, cents, name, withName) {
  const names = RAIL_NAMES;
  const sompi = quoteSompi(cents);
  const kas = sompi == null ? "quote down" : formatTkas(sompi) + " tKAS";
  const price = rail === "kas" ? kas : formatCents(cents) + " " + names[rail];
  const label = (text) => withName ? name + " · " + text : text;
  const blocked = (text, short) =>
    '<button type="button" class="buy short" data-short="' + esc(short) + '">' + esc(label(text)) + "</button>";
  if (rail === "kusdt" && state.account && state.account.kusdtFrozen) {
    return blocked("KUSDT is frozen", "KUSDT is frozen. POCencept and tKAS still spend.");
  }
  if (canPay(rail, cents) === false) {
    const have = rail === "kas"
      ? BigInt(state.kasSompi || 0)
      : BigInt(rail === "kusdt" ? (state.account && state.account.kusdt) || 0 : (state.account && state.account.poc) || 0);
    const line = shortRail(rail, have);
    return blocked(line, line);
  }
  const caption = sku === "keys"
    ? LOT_LINE + " · " + price
    : (withName ? name + " · " + price : "Buy · " + price);
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
    panel.innerHTML = '<div class="stall-head"><h2>' + esc(fallback ? fallback.name : "Shop") + "</h2>" + placeActs('<button type="button" id="stall-close">Close</button>') + "</div>" + balanceSheet() + "<p>The menu loads from the village ledger. " + esc(state.oracleError || "It is not reachable from this browser yet.") + "</p>";
    document.getElementById("stall-close").onclick = () => closeCounter();
    wirePlaceExit();
    return;
  }
  const rail = payRail(state.shopRail);
  const face = STALL_FACE[shop.id] || { tint: "#8a7040", letter: "S" };
  const rows = shop.items
    .map((item) => {
      const sompi = quoteSompi(item.cents);
      const kas = sompi == null ? "quote down" : formatTkas(sompi) + " tKAS";
      const button = saleButton(rail, shop.id, item.sku, item.cents, item.name, false);
      return (
        '<article class="good">' + goodsMark(item.sku) +
        "<div><strong>" + esc(item.name) + "</strong><span>" + esc(formatCents(item.cents)) +
        " on this ledger · " + esc(kas) + "</span></div>" + button + "</article>"
      );
    })
    .join("");
  const pasteOpen = shopTxid || (state.id && state.id.kind !== "guest");
  const txid = rail === "kas"
    ? '<details class="paid-already"' + (pasteOpen ? " open" : "") + '><summary>Already sent tKAS? Paste the txid</summary><textarea id="txid" rows="2">' + esc(shopTxid) + "</textarea></details>"
    : "";
  panel.innerHTML =
    '<div class="stall">' +
    '<div class="stall-head">' +
    '<svg class="stall-badge" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="10" fill="' + face.tint + '"/><text x="32" y="42" text-anchor="middle" fill="#f3e6c8" font-size="28" font-family="Georgia, serif">' + face.letter + "</text></svg>" +
    "<div><p class=\"stall-keeper\">" + esc(shop.keeper) + "</p><h2>" + esc(shop.name) + "</h2></div>" +
    placeActs('<button type="button" id="stall-close">Close</button>') + "</div>" +
    "<p>" + esc(shop.line) + "</p>" +
    balanceSheet() +
    railBarHtml(rail) +
    rows + txid +
    "<p class=\"fine\">" + esc(payKind("shop")) + "</p>" +
    "<p class=\"fine\">" + esc(SWAP_PAY) + " No tKAS, go to the bank. No POCencept, or no KUSDT, go to the bank and swap.</p>" +
    "<p class=\"fine\">One rail for this buy. A buy asks on this page, then OK. The wallet opens only when you swap tKAS at the bank. The miner fee on that swap is six times the standard Testnet 10 rate, and it is extra KAS.</p></div>";
  document.getElementById("stall-close").onclick = () => closeCounter();
  wirePlaceExit();
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
let swapTold = false;
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
  return '<p class="fine">' + esc(quote) + " Reserve " + esc(state.reserve) + ". Miner fee is extra KAS. " + esc(payingLine()) + "</p>";
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

function paintLedgerPreview() {
  const el = document.getElementById("ledger-preview");
  if (!el) return;
  const raw = fieldValue("redeem-amt").trim();
  if (!raw) {
    el.textContent = "Type an amount, like 1.00.";
    return;
  }
  try {
    el.textContent = formatCents(parseDollars(raw)) + " on this ledger.";
  } catch (err) {
    el.textContent = err.message;
  }
}

function paintBank() {
  rememberSwapFields();
  const clerk = state.bankClerk || "";
  const frozen = !!(state.account && state.account.kusdtFrozen);
  const close = placeActs('<button type="button" id="bank-close">Close</button>');
  const back = placeActs('<button type="button" id="clerk-back" data-clerk="">Back</button>');
  let body;
  if (!clerk) {
    const push = (id, title) =>
      '<button type="button" class="clerk-push" data-booth="' + id + '"><span>' + esc(title) + "</span><strong>" + esc(clerkFigure(id)) + "</strong><small>Push this window</small></button>";
    body =
      '<div class="swap-head"><h2>Venn\'s bank</h2>' + close + "</div>" +
      '<p class="clerk-ask">To pay for something, swap tKAS here for POCencept and KUSDT. Push a clerk.</p>' +
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
      '<div class="swap-head"><h2>The books</h2>' + back + "</div>" +
      "<p>Locked tags came from a real tKAS send. That part can come back as tKAS.</p>" +
      "<p>The purse is practice coins. Shops spend the purse first. The purse does not come back as tKAS.</p>" +
      "<p>A swap between POCencept and KUSDT moves each pile as itself. Locked stays locked. The purse stays a purse. No extra tKAS is locked or freed.</p>" +
      "<p>KUSDT can be frozen. POCencept cannot. A freeze blocks any swap that touches KUSDT.</p>" +
      "<p>The miner fee is always KAS. On a tKAS send it is extra. It is six times the standard Testnet 10 rate. The price is not reduced to pay the miner.</p>" +
      "<p>A tKAS payment smaller than the quote does not buy the item and does not mint a tag.</p>" +
      "<p>Sending the same accepted txid again, for the same address and the same purchase, returns the receipt already written. A different item or a different address with that txid is refused.</p>" +
      "<p>A lock has to increase the amount. A negative threshold counts as zero. POCencept and KUSDT keep different extension commitments, so they do not mix. A freeze changes the KUSDT commitment. This counter did not compile a covenant. The tags stay on this square. KCC-20 is Last Call, not Final.</p>" +
      '<div class="swap-bals">' +
      card("POCencept", formatCents(poc.have), "locked " + formatCents(poc.lock) + " · purse " + formatCents(poc.purse)) +
      card("KUSDT", formatCents(kusdt.have), "locked " + formatCents(kusdt.lock) + " · purse " + formatCents(kusdt.purse) + (frozen ? " · frozen" : "")) +
      "</div>" +
      '<div class="kw-row"><button type="button" id="purse" data-act>Practice purse</button><button type="button" id="freeze" data-act>' + (frozen ? "Thaw KUSDT" : "Freeze KUSDT") + "</button></div>" +
      statusLine() + bankFine();
  } else if (clerk === "kas") {
    body =
      '<div class="swap-head"><h2>tKAS</h2>' + back + "</div>" +
      '<p class="clerk-ask">Swap tKAS here for POCencept or KUSDT. That is how you pay for something.</p>' +
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
      '<div class="swap-head"><h2>' + esc(name) + "</h2>" + back + "</div>" +
      '<p class="clerk-ask">This window swaps into tKAS or ' + esc(otherName) + ".</p>" +
      '<p class="clerk-bal"><span>You have</span><strong>' + esc(clerkFigure(clerk)) + "</strong></p>" +
      '<p class="fine">Only the part that came from tKAS can come back. Practice stays a shop coin.</p>' +
      (blocked ? '<p class="fine">KUSDT is frozen. Thaw it in the books before these swaps.</p>' : "") +
      '<label class="amt">Amount<input id="redeem-amt" value="' + esc(redeemDraft) + '" placeholder="1.00" inputmode="decimal" autocomplete="off"></label>' +
      '<p class="swap-preview" id="ledger-preview"></p>' +
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
    paintLedgerPreview();
    document.getElementById("redeem-amt").addEventListener("input", () => {
      redeemDraft = fieldValue("redeem-amt");
      paintLedgerPreview();
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
  wirePlaceExit();
  if (swapBusy) setSwapBusy(true);
}

function setSwapBusy(on) {
  swapBusy = on;
  const root = panel.querySelector(".swap");
  if (!root) return;
  for (const button of root.querySelectorAll("button")) {
    if (button.id === "bank-close" || button.id === "clerk-back" || button.id === "place-exit") continue;
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
    const frozenKusdt = rail === "kusdt" && state.account && state.account.kusdtFrozen;
    const button = frozenKusdt
      ? '<button type="button" class="buy short" data-short="KUSDT is frozen. POCencept and tKAS still spend.">KUSDT is frozen</button>'
      : '<button type="button" class="buy" data-promise="' + row.id + '">Promise</button>';
    const drop = mine && mine.promise ? '<button type="button" class="buy short" data-drop="' + row.id + '">Drop promise</button>' : "";
    return (
      '<article class="good"><div><strong>' + esc(row.name) + "</strong><span>" + esc(formatCents(row.cents)) +
      " on this ledger</span></div><p>" + picks + "</p>" +
      '<label>Threshold is yours. <input class="hunt-need" data-need="' + row.id + '" type="number" min="2" max="20" value="' + esc(need) + '"></label>' +
      button + drop + status +
      "<p class=\"fine\">Hidden pack. Pays if enough promises clear. This square's ledger. Not that company.</p></article>"
    );
  }).join("");
  const showKas = HUNTS.some((row) => row.id !== "liquidity" && state.huntRails[row.id] === "kas");
  const huntPasteOpen = shopTxid || (state.id && state.id.kind !== "guest");
  const txid = showKas
    ? '<details class="paid-already"' + (huntPasteOpen ? " open" : "") + '><summary>Already sent tKAS? Paste the txid</summary><textarea id="hunt-txid" rows="2">' + esc(shopTxid) + "</textarea></details>"
    : "";
  panel.innerHTML =
    '<div class="stall"><div class="stall-head"><div><p class="stall-keeper">Reed</p><h2>Hunt Hall</h2></div>' +
    placeActs('<button type="button" id="stall-close">Close</button>') + "</div>" +
    "<p>Classroom pack desk. Tags on this ledger. Not Tether. Not a company till. Hidden until it pays.</p>" +
    balanceSheet() + rows + txid +
    "<p class=\"fine\">" + esc(SWAP_PAY) + "</p>" +
    "<p class=\"fine\">A promise asks on this page, then OK. The pack stays hidden. The wallet opens only when you swap tKAS at the bank.</p></div>";
  const close = document.getElementById("stall-close");
  if (close) close.onclick = () => closeCounter();
  wirePlaceExit();
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
  if (rail === "kusdt" && state.account && state.account.kusdtFrozen) {
    punch("shake");
    say("KUSDT is frozen. POCencept and tKAS still spend.", true);
    return;
  }
  const names = RAIL_NAMES;
  const agreed = await askOk("You want to promise " + row.name + " for " + formatCents(row.cents) + " " + names[rail] + " if others do?");
  if (!agreed) return;
  huntBusy = true;
  try {
    const guest = state.id.kind === "guest";
    const extra = guest ? { token: state.id.token } : {};
    let txid = "";
    if (rail === "kas" && !guest && id !== "liquidity") {
      const typed = panel.querySelector("#hunt-txid");
      txid = typed ? typed.value.trim() : shopTxid;
      if (!txid) {
        revealPaste("hunt-txid");
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
      const huntTx = (snapped.receipt && snapped.receipt.txid) || txid || "";
      paySlip({
        title: "Pack paid",
        steps: ["Asking on this page", "Promising", "Paying the pack", "Done"],
        place: "hunt",
        tx: huntTx,
        receipt: snapped.receipt && snapped.receipt.id,
        kind: huntTx ? payKind("lock") : payKind("shop"),
      });
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
    '<div class="stall-head"><h2>Spending rules</h2>' + placeActs("") + "</div>" +
    "<p>These are the square's rules for this address. An empty list means every shop and every rail. They are a stand-in for a covenant: a limit you chose, checked before the payment.</p>" +
    '<label>Daily cap on this ledger, 0 for none<input id="cap" value="' + esc((Number(rules.dailyCapCents) / 100).toFixed(2)) + '"></label>' +
    '<label>Ask again above this amount, 0 for never<input id="confirm" value="' + esc((Number(rules.confirmOverCents) / 100).toFixed(2)) + '"></label>' +
    "<p>Shops you allow. Leave all off to allow every shop.</p>" + shops +
    "<p>Rails you allow. Leave all off to allow every rail.</p>" + rails +
    '<button type="button" id="save-rules">Save rules</button>' +
    '<p class="fine">PegLab: this quote is an outside price. If it moves, a redeem can fail because the lock no longer covers the tagged amount. That is a peg failing. It is not a promise of dollars. Grams are not this dollar. BitCoffee\'s covenant KUSD is a different object and is not minted here.</p>' +
    '<p class="fine">A real covenant would enforce this on Testnet-10 without trusting this page. SilverScript and the Kaspero freelancer sheet are on the bench. This page checks the rule before it moves a ledger balance. A vProg guest can sequence a step. This square does not claim the shop spend is that step.</p>';
  document.getElementById("save-rules").onclick = saveRules;
  wirePlaceExit();
}

function paintBench() {
  const blocks = BENCH.map((block) => {
    const links = block.hrefs.map(([label, href]) => '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label) + "</a>").join(" · ");
    return "<h2>" + esc(block.title) + "</h2><p>" + esc(block.text) + "</p><p>" + links + "</p>";
  }).join("");
  const repos = REPOS.map((name) => '<a href="https://github.com/STP-KAS/' + encodeURIComponent(name) + '" target="_blank" rel="noopener">' + esc(name) + "</a>").join(" ");
  panel.innerHTML = placeActs("") + blocks + "<h2>STP-KAS repos</h2><div class=\"repo-cloud\">" + repos + "</div>";
  wirePlaceExit();
}

function paintGuide() {
  panel.innerHTML =
    '<div class="stall-head"><h2>How to try this on Testnet 10</h2>' + placeActs("") + "</div>" +
    "<ol>" +
    "<li>A funded wallet is prefunded with tKAS. Spend it at will. There is no risk. tKAS is worthless. The welcome gate takes that address. This money is tKAS, Testnet-10 KAS. With tKAS you can go to the bank. The same browser gets the same funded wallet. If this desk cannot tell it is the same browser, it says so. A mainnet address is refused.</li>" +
    "<li>A kaspatest address, or a .kas name that already resolves on TN10, is accepted when that address already holds tKAS. An empty address stays outside. The welcome gate takes a funded address.</li>" +
    "<li>Need coins: Use a funded test address on the welcome gate. The list of those addresses is on the economics tab. The faucet tab pays 0.6 tKAS. At the live price that is a few cents, so it will not buy supper. The practice purse is in the books desk at the bank. That purse is play money.</li>" +
    "<li class=\"only-desk\">On a computer, hold the left mouse button and move to look all the way around. Click the ground to point where you walk, or use the keyboard. Stand next to a building and click it to walk in. The bank card opens when you click a clerk. In the cafe, take a seat and the menu blinks, or order at the blinking counter. The mint opens when you click the counter. The market opens at the counter. Buy a roadster. See what happens. The gold button on the square buys it, and the parking lot sells it. Once it is yours, Launch into space is the gold button. The showroom still opens when you click Pike or the sign. W A S D move the way you look. The arrow keys do too. G gets in or out. Get out is the gold button. Esc closes the card, then leaves the room. Square leaves too. Exit to the square is on the shop, the bank, Hunt Hall, and the cinema.</li>" +
    "<li class=\"only-phone\">On a phone, drag a finger to look. Tap the ground to walk or drive. Tap a building you are next to and you walk in. Sit in the cafe, then the menu or the card. The mint opens when you tap the counter. The bank opens when you tap a clerk. Square leaves the room. Exit to the square is on the shop, the bank, Hunt Hall, and the cinema. Buy a roadster. See what happens. That gold button is on the square, and the parking lot sells it. Once it is yours, Launch into space is the gold button. Get out walks. Use a funded test address. This money is tKAS. With tKAS you can go to the bank.</li>" +
    "<li>To pay for something, swap tKAS for POCencept and KUSDT at the bank. No tKAS, go to the bank. No POCencept, or no KUSDT, go to the bank and swap. A POCencept stable swap, a KUSDT stable swap, or a shop buy asks on this page: you want this for that price, then OK. Close puts that ask away. The miner fee on a tKAS swap is six times the standard Testnet 10 rate, and it is extra KAS. When a payment settles, it goes through. On a tKAS send, confirmations are still ongoing. The steps and the transaction stay on the page. Close that card when you are done. Open the transaction, or start a new purchase on the card that stays open. Log out returns you to the welcome gate.</li>" +
    "<li>Venn's bank starts with three clerks. Push tKAS, POCencept, or KUSDT. The open clerk swaps into the other two. The books desk explains locked coins and the practice purse. The Result line says whether a swap landed. While the wallet is opening for a tKAS swap, the steps stay on that clerk.</li>" +
    "<li>Buy a roadster. See what happens. The gold button on the square buys it, and the parking lot sells it. Click the car or the sign on the lot. Once it is yours, you are in the car and Launch into space is the large gold button. Get out is the other gold button. Thrusters show while it moves. Inside a shop you are on foot. In the cafe, take a seat and the menu blinks, or order at the counter. The mint opens when you click the counter. Launch, while you are in the car and outside, plays two short films beside the rocket first, with the sound on, for context. The left film plays, then the right film. A bar fills across both films, so the launch is on its way. The launch starts when the second film ends. When both films are done, those screens go. The stack stands on the launch mount. The ship lifts off the mount when the count reaches zero. When the booster lets go, that separation plays its voice while this ship and the booster stay on screen. After the booster is gone, the ship coasts, then the roadster leaves. The comms stop when the roadster leaves the bay. A bar fills until the car leaves the ship. End the flight shows then. Simulation theory is the click after you end it. That button warns that it brings you back to the simulation on Earth. From there you can pay for the Moon, Mars, Jupiter, Saturn, or go into the abyss, with tKAS, POCencept stable, or KUSDT stable. Go into the abyss: you hang out with the old roadster. It has been cruising for years. The way there is ten seconds. Out there the two cars race in orbit around the Earth. The Moon, Mars, Jupiter, and Saturn fill the window the way the Earth does. Once you arrive, the same rails can send you to another world, or into the abyss. The card lines are the flight. On that hop the end popup waits ten seconds.</li>" +
    "<li>The Moon map is NASA. Mars, Jupiter, Saturn, and the rings are <a href=\"https://www.solarsystemscope.com/textures\" target=\"_blank\" rel=\"noopener\">Solar System Scope</a>, CC BY 4.0.</li>" +
    "<li>The balances stay in the top right, on the square, in a shop, in the cinema, and on a flight. Bank is on that card.</li>" +
    "<li>Lux's cinema is the dark building. Take a seat, then the screen. The ticket and the snacks take tKAS, POCencept stable, or KUSDT stable. What are the rails? opens the short note. That button is the opener on the whole square. One ticket plays every film, from a seat. Every film is labeled this desk agrees. Prev, Next, and Shuffle move the reel. Overview lists every film. The card sits to the left of the film. The current film stays up until the next one has a picture. The next film starts when one ends. Exit to the square leaves the cinema.</li>" +
    "<li>Reed's Hunt Hall is the timber building east of the lot. Click Reed, then the board. Every row takes tKAS, POCencept stable, or KUSDT stable. Promise is not Buy. The pack stays hidden until it pays.</li>" +
    "<li>The goal of a peer-to-peer chain is a settlement between two people, including while almost nobody takes the coin. That bill is a car, an AI service, a game purchase, or a rented service. The ceiling is a till a stranger can receive on. Proof of stake hands the next block to coins already held. Kaspa is proof of work. It sequences the coin now. Sequencing applications on that work is in process, and this square is not that product. <a href=\"https://github.com/STP-KAS/stable-staghunt-theory/blob/main/CEILING.md\" target=\"_blank\" rel=\"noopener\">The ceiling</a> is the longer note.</li>" +
    "<li>The best case is stable money you can spend anywhere. Kaspa is volatile. A stable is the other way to hold a spend. Without one of those, the coin has no point. Peer to peer is the payment. Five percent of this portfolio is crypto. A profit stays in crypto, in a stable, to hold or to spend, rather than cashed out to fiat. The use is to spend it, and to use it, fast, anywhere. Applications and the other utilities matter as much as the coin, and sometimes more. Kaspa needs both before it leaves the bubble. Proof of stake offers part of that spend. It does not offer what scalable proof of work offers. That is settled. This square is still the classroom.</li>" +
    "<li>Mint is the building with the Mint sign. Walk in and click the counter. What: a token on this ledger, under KCC-20 Last Call. It is not Final, and no covenant is deployed. How: open a new name, mint more, or send it. Open names sit in the list next to the card and update when a name opens. A name that has reached its cap is in the tall list. Click a name to see the addresses, the amounts, and the ledger lines. Why: so you can try a mint on Testnet 10. Type 0 in Cap for no cap. There is no maximum.</li>" +
    "<li>Layer-Kaspa is on the side rail. Open a .kas name. Visitors see the page. Only the address that owns that name on the KNS testnet index can change it. The window has the title, a tagline, the welcome, a color, a link, and offers. Register the name in the KNS app. This desk does not register it. This layer does not hide the path. It is not Tor.</li>" +
    "<li>Kachat is on the side rail. Paste the other kaspatest address and send a handshake. They accept it. Then you send messages. Each step is 0.01 POCencept. Messages only. The KaChat app on the chain is a different program.</li>" +
    "<li>Vault is on the side rail. It keeps a note on this square ledger and a rule for who may read it and when. The labels are a note, an NDA, an enterprise file, or other. A real secret does not belong here. This page checks the readers and the time. A covenant mark is a label. No covenant is deployed. Seal keeps the note and the rule.</li>" +
    "<li>Rules: a daily cap, a shop list, a rail list, a confirm line.</li>" +
    "<li>The freeze switch is only on KUSDT.</li>" +
    "</ol>" +
    "<p>Also on the bench: KNS, tic-tac-toe, KaChat, Kaspero Labs, SilverScript, Argent. Tidewater is an MIT fishing island; this square did not copy that ocean. The Go topic list is markers and private-server code. This page uses neither of those, and it does not ship a soundtrack.</p>" +
    "<p class=\"warn\">" + esc(PRIVACY) + "</p>" +
    "<h2>Name</h2><p>This tab is called 1984.</p>";
  wirePlaceExit();
}

function requireId() {
  if (!state.id.address) {
    say("Use a funded test address, or paste one that already holds tKAS. This money is tKAS. With tKAS you can go to the bank.", true);
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
    state.cruiseFrom = flightElapsed(performance.now());
    state.cruiseStart = performance.now();
    state.cruiseSku = sku;
    state.jokeSent = -1;
    state.destOpen = false;
    state.flightBeat = "";
    showBanner("Paid.");
    punch("nod");
    say(body.shop + " took the payment for " + body.item + ". " + (sku === "abyss" ? ABYSS_HANG + " " : "") + FLIGHT_NOTE);
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
    state.aboard = true;
    state.path = [];
    state.arrived = null;
    state.lapUntil = 0;
    if (state.venue || state.inside || isVisit(state.mode)) openMode("world");
    state.player = { x: ROADSTER_PARK.x, y: ROADSTER_PARK.y + 1 };
    state.facing = { x: 0, y: -1 };
    punch("nod");
    say("The roadster is yours. Launch into space is the gold button.");
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
  if (state.id.address) return "Paying as a pasted address. This money is tKAS. With tKAS you can go to the bank.";
  return "Choose who pays before locking.";
}

function signerRefusal(plan) {
  if (plan === "mainnet") return "The wallet is on mainnet. This square takes Testnet 10 only. Nothing moved.";
  if (plan === "mismatch") return "The open wallet is a different address than this page. Nothing moved.";
  if (plan === "absent") return "This page is logged in with the wallet, and the extension is not in this tab. Unlock it, then press Lock again. Nothing moved.";
  return "Use a funded test address. This money is tKAS. With tKAS you can go to the bank. Or paste the txid of tKAS already sent to the reserve. Nothing moved.";
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
  const opts = { priorityFee: PAGE_PRIORITY_SOMPI, feeRate: await walletFeeRate() };
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
  if (body && body.ok && Number.isFinite(n) && n >= 600) return n;
  return pageFeeRate(null);
}

function revealPaste(id) {
  const box = panel.querySelector("#" + id);
  if (!box) return;
  const details = box.closest("details");
  if (details) details.open = true;
  box.focus();
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
  const close = document.getElementById("ask-close");
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
      if (close) close.removeEventListener("click", onNo);
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
    if (close) close.addEventListener("click", onNo);
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
    const names = RAIL_NAMES;
    const paySteps = ["Asking on this page", "Paying", "Writing the receipt", "Done"];
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
    const agreed = await askOk(buyAskLine(goodsName(shop, sku), price) + (sku === "abyss" ? " " + ABYSS_HANG : ""));
    if (!agreed) return;
    paySlip({ title: "Payment", steps: paySteps, index: 1, place: shop, kind: "" });
    if (rail === "kas" && state.id.kind === "guest") {
      say("Paying from this browser's funded wallet.");
      const body = await post("/api/1984/guest/spend", { token: state.id.token, shop, sku, confirmed: true });
      if (!body.ok) {
        punch("shake");
        say(body.error || "The shop refused the payment.", true);
        return;
      }
      if (body.account) state.account = body.account;
      const guestTx = body.receipt && body.receipt.txid ? body.receipt.txid : "";
      paySlip({
        title: "Paid",
        steps: paySteps,
        place: shop,
        tx: guestTx,
        receipt: body.receipt && body.receipt.id,
        kind: guestTx ? payKind("lock") : payKind("shop"),
      });
      tookPayment(body, sku);
      paintBooks();
      await refreshAccount();
      return;
    }
    if (rail === "kas") {
      const typed = panel.querySelector("#txid");
      txid = typed ? typed.value.trim() : shopTxid;
      if (!txid) {
        revealPaste("txid");
        say("Paste the Testnet 10 txid. The wallet stays closed for a shop. Swapping tKAS at the bank asks the wallet to sign.", true);
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
    const paidTx = (body.receipt && body.receipt.txid) || txid || "";
    paySlip({
      title: "Paid",
      steps: paySteps,
      place: shop,
      tx: paidTx,
      receipt: body.receipt && body.receipt.id,
      kind: paidTx ? payKind("lock") : payKind("shop"),
    });
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
  return RAIL_NAMES[rail] || "stable";
}

let payPlace = "";

function paySlip(info) {
  const box = document.getElementById("pay-slip");
  if (!box) return;
  box.hidden = false;
  const steps = info.steps || [];
  const at = info.index == null ? steps.length : info.index;
  const title = document.getElementById("pay-slip-title");
  const list = document.getElementById("pay-slip-steps");
  const tx = document.getElementById("pay-slip-tx");
  const kind = document.getElementById("pay-slip-kind");
  const open = document.getElementById("pay-slip-open");
  if (title) title.textContent = info.title || "Payment";
  if (list) {
    list.innerHTML = steps.map((name, i) => {
      const cls = i < at ? "done" : i === at ? "on" : "";
      return '<li class="' + cls + '">' + esc(name) + "</li>";
    }).join("");
  }
  const chain = String(info.tx || "").trim();
  const href = tn10TxUrl(chain);
  const receipt = info.receipt ? "Ledger receipt " + info.receipt + ". No Testnet 10 tx." : "";
  if (tx) tx.textContent = chain ? "Tx " + chain : receipt;
  if (kind) kind.textContent = info.kind ? settleLine(!!chain) + " " + info.kind : "";
  if (open) {
    if (href) {
      open.hidden = false;
      open.href = href;
    } else {
      open.hidden = true;
      open.removeAttribute("href");
    }
  }
  if (info.place) payPlace = info.place;
  const again = document.getElementById("pay-slip-again");
  if (again) again.textContent = spaceSlip() ? "Close this tab" : "New purchase";
}

function spaceSlip() {
  return payPlace === "orbit" || !!(state.flightStart && !state.flightDark);
}

function closePaySlip() {
  const box = document.getElementById("pay-slip");
  if (box) box.hidden = true;
}

function newPurchase() {
  const box = document.getElementById("pay-slip");
  const inSpace = spaceSlip();
  if (box) box.hidden = true;
  if (inSpace || !payPlace) return;
  openMode(payPlace);
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
    swapNote("Not swapped. Use a funded test address. This money is tKAS. With tKAS you can go to the bank. Nothing moved.", "bad");
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
        steps = ["Checking the amount", "Opening " + who, "Approve the send in " + who, "Waiting for Testnet 10 to settle", "Adding the tag"];
        showSteps(steps, 1, who === "the wallet" ? "The wallet is opening." : who + " is opening.");
        const plan = await signerForSpend();
        if (plan !== "kit" && plan !== "kasware" && plan !== "kastle") {
          punch("shake");
          hideSteps();
          swapNote("Not swapped. " + signerRefusal(plan), "bad");
          return;
        }
        const named = walletWord(plan);
        steps = ["Checking the amount", "Opening " + named, "Approve the send in " + named, "Waiting for Testnet 10 to settle", "Adding the tag"];
        showSteps(steps, 2, "Approve the send in " + named + ".");
        swapNote("Approve " + shown + " in " + named + ". The miner fee is six times the standard rate, and it is extra KAS.", "wait");
        rememberWalletKind(plan);
        txid = await sendFromWallet(plan, sompi);
        showSteps(steps, 3, "Waiting for Testnet 10 to settle.");
      } else {
        steps = ["Checking the amount", "Waiting for Testnet 10 to settle", "Adding the tag"];
        showSteps(steps, 1, "Waiting for Testnet 10 to settle.");
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
      swapNote("Waiting for Testnet 10 to settle. Adding the " + name + " tag…", "wait");
      body = await post("/api/1984/convert", { rail, txid });
      showSteps(steps, steps.length, "Done.");
    }
    if (!body.ok) {
      punch("shake");
      swapNote("Not swapped. " + (body.error || "The lock did not clear.") + (sent ? " The txid is in the paste box. Press Swap again to claim it. That does not send a second time." : " Nothing moved."), "bad");
      return;
    }
    punch("nod");
    paySlip({
      title: "Swapped",
      steps: ["Checking the amount", "Paying", "Adding the tag", "Done"],
      place: "bank",
      tx: lockTxid,
      receipt: body.receipt && body.receipt.id,
      kind: payKind("lock"),
    });
    const paid = lockTxid;
    lockTxid = "";
    const got = body.cents == null || body.cents === "" ? "" : formatCents(body.cents);
    if (got) putRedeemAmount(got);
    const tx = paid ? " Tx " + paid.slice(0, 10) + "…." : "";
    swapNote(settleLine(!!paid) + " " + (got ? "Swapped. " + shown + " became " + got + " " + name + "." : "Swapped. " + shown + " locked into " + name + ".") + tx + " " + payKind("lock"), "ok");
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
    const backTx = body.txids && body.txids[0] ? String(body.txids[0]) : "";
    const tx = backTx ? " Tx " + backTx : "";
    paySlip({
      title: "Swapped",
      steps: ["Checking the amount", "Taking the locked tag", "Sending tKAS back", "Done"],
      place: "bank",
      tx: backTx,
      receipt: body.receipt && body.receipt.id,
      kind: backTx ? payKind("lock") : payKind("shop"),
    });
    swapNote(settleLine(!!backTx) + " Swapped. " + amount + " " + name + " came back as tKAS." + tx + " " + payKind("lock"), "ok");
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
    paySlip({
      title: "Swapped",
      steps: ["Checking the amount", "Moving the tag", "Done"],
      place: "bank",
      receipt: body.receipt && body.receipt.id,
      kind: payKind("shop"),
    });
    swapNote(settleLine(false) + " Swapped. " + amount + " " + source + " is now " + dest + ". Locked stayed locked. The purse stayed a purse. " + payKind("shop"), "ok");
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

let layerVisit = "";
let layerOwns = false;
let layerKns = "";
let chatPeer = "";
let vaultFocus = "";

function moneyLabel(cents) {
  return formatCents(cents);
}

function layerKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\.kas$/, "");
}

function layerSite(name) {
  const key = layerKey(name);
  return ((state.home && state.home.sites) || []).find((row) => row.name === key) || null;
}

function hideLayerPop() {
  layerVisit = "";
  layerOwns = false;
  layerKns = "";
  const pop = document.getElementById("layer-pop");
  if (!pop) return;
  pop.hidden = true;
  pop.innerHTML = "";
  pop.className = "kw-panel layer-pop";
}

function paintLayer() {
  const sites = (state.home && state.home.sites) || [];
  const directory = sites.length
    ? "<ul class=\"layer-scroll\">" + sites.map((row) => {
      const mark = row.kns === "tn10" ? " · KNS index" : " · earlier square page";
      return "<li><button type=\"button\" data-visit=\"" + esc(row.name) + "\">" + esc(row.host) + "</button> " + esc(row.title) + esc(mark) + "</li>";
    }).join("") + "</ul>"
    : "<p class=\"mint-cap-note\">No page yet. Open a name that is owned on the KNS testnet index.</p>";
  panel.innerHTML =
    '<div class="stall-head"><h2>Layer-Kaspa</h2>' + placeActs("") + "</div>" +
    "<p><strong>What.</strong> Layer-Kaspa opens a .kas name from the KNS testnet index. Visitors can open a published page. Only the address that owns the name can change it.</p>" +
    "<p><strong>How.</strong> Register the name in the <a href=\"https://app.knsdomains.org\" target=\"_blank\" rel=\"noopener\">KNS app</a>. The testnet index is <a href=\"https://tn10.knsdomains.org\" target=\"_blank\" rel=\"noopener\">tn10.knsdomains.org</a>. Open the name here. If this address owns it, a window opens with the page options. Visitors get the page without those controls. This desk does not register the name.</p>" +
    "<p><strong>Why.</strong> So a name you already own on the Kaspa testnet index can have a page on this square. It is not Tor, and it does not hide the path. No covenant is deployed.</p>" +
    '<label class="mint-line"><span>Name</span><input id="layer-name" maxlength="32" spellcheck="false" autocomplete="off" placeholder="name.kas"></label>' +
    '<button type="button" id="layer-open">Open</button> ' +
    '<button type="button" id="layer-bank">Bank</button>' +
    "<p><strong>Pages.</strong> Open one to visit. The owner is the only one who can change it.</p>" +
    directory;
  document.getElementById("layer-open").onclick = () => openLayer((document.getElementById("layer-name") || {}).value || "");
  document.getElementById("layer-bank").onclick = () => openMode("bank");
  for (const button of panel.querySelectorAll("[data-visit]")) {
    button.onclick = () => openLayer(button.getAttribute("data-visit"));
  }
  wirePlaceExit();
}

function layerOfferRows(site) {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const row = site && site.offers[i];
    return "<div class=\"mint-line\" data-offer><input class=\"offer-name\" maxlength=\"40\" placeholder=\"Offer\" value=\"" + esc(row ? row.name : "") + "\">" +
      "<input class=\"offer-cents\" inputmode=\"numeric\" placeholder=\"cents\" value=\"" + esc(row ? row.cents : "") + "\">" +
      "<select class=\"offer-kind\"><option value=\"product\"" + (row && row.kind === "service" ? "" : " selected") + ">Product</option>" +
      "<option value=\"service\"" + (row && row.kind === "service" ? " selected" : "") + ">Service</option></select></div>";
  }).join("");
}

function layerVisitHtml(site) {
  if (!site) {
    if (layerKns === "") return "<p>Checking the KNS testnet index.</p>";
    if (layerKns === "error") return "<p>The KNS testnet index did not answer. Open the name again in a moment.</p>";
    if (layerKns === "other") return "<p>This name is on the KNS testnet index for another address. That owner has not published a page here. Visitors cannot change it.</p>";
    return "<p>This name is not on the KNS testnet index. Register it in the <a href=\"https://app.knsdomains.org\" target=\"_blank\" rel=\"noopener\">KNS app</a>. This desk does not register it.</p>";
  }
  const link = site.linkUrl ? "<p><a href=\"" + esc(site.linkUrl) + "\" target=\"_blank\" rel=\"noopener\">" + esc(site.linkLabel || site.linkUrl) + "</a></p>" : "";
  const offers = site.offers.length
    ? site.offers.map((item) =>
      "<p>" + esc(item.name) + " · " + esc(item.kind) + " · " + esc(moneyLabel(item.cents)) +
      " <button type=\"button\" data-buy=\"" + esc(site.name) + "|" + esc(item.id) + "|poc\">POCencept</button>" +
      " <button type=\"button\" data-buy=\"" + esc(site.name) + "|" + esc(item.id) + "|kusdt\">KUSDT</button></p>"
    ).join("")
    : "<p>No offer yet.</p>";
  return "<p class=\"mint-cap-note\">You are visiting. Only the owner on the KNS testnet index can change this page.</p>" +
    (site.tagline ? "<p><strong>" + esc(site.tagline) + "</strong></p>" : "") +
    "<p>" + esc(site.about || "No description yet.") + "</p>" +
    (site.welcome ? "<p>" + esc(site.welcome) + "</p>" : "") +
    link +
    offers;
}

function paintLayerPop() {
  const pop = document.getElementById("layer-pop");
  if (!pop) return;
  if (!layerVisit) {
    hideLayerPop();
    return;
  }
  const site = layerSite(layerVisit);
  const accent = site ? site.accent : "stone";
  pop.className = "kw-panel layer-pop layer-accent-" + accent;
  pop.hidden = false;
  const host = layerKey(layerVisit) + ".kas";
  if (layerOwns) {
    const picked = (value) => (site && site.accent === value ? " selected" : (!site && value === "stone" ? " selected" : ""));
    pop.innerHTML =
      '<div class="stall-head"><h2>' + esc(host) + '</h2><div class="stall-acts"><button type="button" id="layer-pop-close">Close</button></div></div>' +
      "<p>You own this name on the KNS testnet index. Visitors can open the page. They cannot change it. This desk did not register the name.</p>" +
      '<label class="mint-line"><span>Title</span><input id="layer-title" maxlength="48" value="' + esc(site ? site.title : "") + '"></label>' +
      '<label class="mint-line"><span>Tagline</span><input id="layer-tagline" maxlength="80" value="' + esc(site ? site.tagline : "") + '"></label>' +
      '<label class="mint-line"><span>About</span><input id="layer-about" maxlength="280" value="' + esc(site ? site.about : "") + '"></label>' +
      '<label class="mint-line"><span>Welcome</span><textarea id="layer-welcome" class="layer-field" maxlength="400" rows="4">' + esc(site ? site.welcome : "") + "</textarea></label>" +
      '<label class="mint-line"><span>Color</span><select id="layer-accent">' +
      '<option value="stone"' + picked("stone") + ">Stone</option>" +
      '<option value="gold"' + picked("gold") + ">Gold</option>" +
      '<option value="green"' + picked("green") + ">Green</option>" +
      '<option value="blue"' + picked("blue") + ">Blue</option>" +
      "</select></label>" +
      '<label class="mint-line"><span>Link</span><input id="layer-link-label" maxlength="32" placeholder="Label" value="' + esc(site ? site.linkLabel : "") + '"></label>' +
      '<label class="mint-line"><span>https</span><input id="layer-link-url" maxlength="180" spellcheck="false" placeholder="https://" value="' + esc(site ? site.linkUrl : "") + '"></label>' +
      "<p><strong>Offers.</strong> Up to six. A price is whole cents. Visitors can buy. They cannot edit.</p>" +
      layerOfferRows(site) +
      '<button type="button" id="layer-publish">Save page</button>';
    document.getElementById("layer-publish").onclick = publishSite;
  } else {
    pop.innerHTML =
      '<div class="stall-head"><h2>' + esc(host) + '</h2><div class="stall-acts"><button type="button" id="layer-pop-close">Close</button></div></div>' +
      layerVisitHtml(site);
  }
  document.getElementById("layer-pop-close").onclick = () => hideLayerPop();
  for (const button of pop.querySelectorAll("[data-buy]")) {
    button.onclick = () => buyOffer(button.getAttribute("data-buy"));
  }
}

async function refreshLayer() {
  const body = await api("/api/1984");
  if (!body.ok || !body.sites) return;
  if (!state.home) state.home = {};
  state.home.sites = body.sites;
  if (state.mode !== "layer") return;
  const pop = document.getElementById("layer-pop");
  const focus = document.activeElement;
  if (focus && panel.contains(focus)) return;
  paintLayer();
  if (focus && pop && pop.contains(focus)) return;
  if (layerVisit) paintLayerPop();
}

async function openLayer(name) {
  const raw = String(name || "").trim();
  if (!raw) {
    say("Type a .kas name.", true);
    return;
  }
  layerVisit = raw;
  layerOwns = false;
  layerKns = "";
  paintLayerPop();
  const body = await api("/api/1984/resolve?name=" + encodeURIComponent(raw));
  if (state.mode !== "layer" || layerVisit !== raw) return;
  const found = body.ok ? body.found : null;
  if (!body.ok) layerKns = "error";
  else if (found && found.address && state.id.address && found.address.toLowerCase() === state.id.address.toLowerCase()) {
    layerOwns = true;
    layerKns = "tn10";
  } else if (found && found.address) layerKns = "other";
  else layerKns = "none";
  paintLayerPop();
}

async function publishSite() {
  if (!requireId()) return;
  if (!layerOwns) {
    say("Only the owner of this name on the KNS testnet index can change the page.", true);
    return;
  }
  const pop = document.getElementById("layer-pop");
  const read = (id) => (document.getElementById(id) || {}).value || "";
  const offers = [...pop.querySelectorAll("[data-offer]")].map((row) => ({
    name: (row.querySelector(".offer-name") || {}).value || "",
    cents: (row.querySelector(".offer-cents") || {}).value || "",
    kind: (row.querySelector(".offer-kind") || {}).value || "product",
  })).filter((row) => String(row.name).trim());
  const saved = await post("/api/1984/layer/save", {
    name: layerVisit,
    title: read("layer-title"),
    tagline: read("layer-tagline"),
    about: read("layer-about"),
    welcome: read("layer-welcome"),
    accent: read("layer-accent") || "stone",
    linkLabel: read("layer-link-label"),
    linkUrl: read("layer-link-url"),
    offers,
  });
  if (!saved.ok) {
    say(saved.error || "The page was not saved.", true);
    return;
  }
  if (!state.home) state.home = {};
  state.home.sites = saved.sites || [];
  say(saved.note || "Saved.");
  paintLayer();
  paintLayerPop();
}

async function buyOffer(spec) {
  if (!requireId()) return;
  const [name, offer, rail] = String(spec || "").split("|");
  const body = await post("/api/1984/layer/buy", { name, offer, rail });
  if (!body.ok) {
    say(body.error || "The offer was not bought.", true);
    return;
  }
  if (body.account) state.account = body.account;
  if (body.sites && state.home) state.home.sites = body.sites;
  say(body.note || "Bought.");
  paintChrome();
  paintLayer();
  if (layerVisit) paintLayerPop();
}

function paintKachat() {
  const book = state.chat || { hands: [], notes: [] };
  const me = (state.id.address || "").toLowerCase();
  const incoming = (book.hands || []).filter((row) => row.status === "open" && row.to.toLowerCase() === me);
  const ready = (book.hands || []).filter((row) => row.status === "done" && (row.from.toLowerCase() === me || row.to.toLowerCase() === me));
  const thread = (book.notes || []).filter((row) => {
    if (!chatPeer) return false;
    const peer = chatPeer.toLowerCase();
    return (row.from.toLowerCase() === me && row.to.toLowerCase() === peer) || (row.to.toLowerCase() === me && row.from.toLowerCase() === peer);
  });
  const asks = incoming.length
    ? "<ul class=\"chat-scroll\">" + incoming.map((row) => "<li>" + esc(short(row.from)) + " <button type=\"button\" data-accept=\"" + esc(row.from) + "\">Accept</button></li>").join("") + "</ul>"
    : "<p class=\"mint-cap-note\">No handshake is waiting.</p>";
  const people = ready.length
    ? "<ul class=\"chat-scroll\">" + ready.map((row) => {
      const other = row.from.toLowerCase() === me ? row.to : row.from;
      return "<li><button type=\"button\" data-peer=\"" + esc(other) + "\">" + esc(short(other)) + "</button></li>";
    }).join("") + "</ul>"
    : "<p class=\"mint-cap-note\">No connection yet.</p>";
  const lines = thread.length
    ? "<ul class=\"chat-scroll\">" + thread.map((row) => "<li><strong>" + esc(short(row.from)) + "</strong> " + esc(row.text) + "</li>").join("") + "</ul>"
    : "<p class=\"mint-cap-note\">No message in this thread yet.</p>";
  panel.innerHTML =
    '<div class="stall-head"><h2>Kachat</h2>' + placeActs("") + "</div>" +
    "<p><strong>What.</strong> Messages on this square's ledger. A handshake first, then text. Each step is 0.01 POCencept. Messages only. This desk does not seal a payload into a Kaspa transaction.</p>" +
    "<p><strong>How to connect.</strong> Your kaspatest address is in the box below. Copy it and give it to the other person. Paste their kaspatest address in To and press Send handshake. They open Kachat and press Accept. Then pick the connection and send a message. Swap tKAS at the bank if you have no POCencept, or take the practice purse in the bank books.</p>" +
    "<p><strong>Why.</strong> So two funded addresses can pass a note here for a small fee. The chain app is <a href=\"https://kachat.app/home\" target=\"_blank\" rel=\"noopener\">KaChat</a>. That one encrypts on the device and rides in a transaction. This one does not.</p>" +
    '<label class="mint-line"><span>You</span><input id="chat-me" readonly spellcheck="false" value="' + esc(state.id.address || "") + '"></label>' +
    '<label class="mint-line"><span>To</span><input id="chat-to" spellcheck="false" autocomplete="off" placeholder="kaspatest address" value="' + esc(chatPeer) + '"></label>' +
    '<button type="button" id="chat-hand">Send handshake</button> ' +
    '<button type="button" id="chat-bank">Bank</button>' +
    "<p><strong>Waiting.</strong></p>" + asks +
    "<p><strong>Connected.</strong></p>" + people +
    "<p><strong>Messages.</strong></p>" + lines +
    '<label class="mint-line"><span>Text</span><input id="chat-text" maxlength="240" autocomplete="off"></label>' +
    '<button type="button" id="chat-send">Send message</button>';
  document.getElementById("chat-hand").onclick = sendHandshake;
  document.getElementById("chat-send").onclick = sendChat;
  document.getElementById("chat-bank").onclick = () => openMode("bank");
  for (const button of panel.querySelectorAll("[data-accept]")) {
    button.onclick = () => acceptHandshake(button.getAttribute("data-accept"));
  }
  for (const button of panel.querySelectorAll("[data-peer]")) {
    button.onclick = () => { chatPeer = button.getAttribute("data-peer") || ""; paintKachat(); };
  }
  wirePlaceExit();
}

async function refreshChat() {
  if (!state.id.address) return;
  const body = await api("/api/1984/chat?address=" + encodeURIComponent(state.id.address));
  if (!body.ok) return;
  state.chat = body;
  if (state.mode !== "kachat") return;
  if (panel.querySelector("input:focus, textarea:focus")) return;
  paintKachat();
}

function takeChat(body) {
  if (body.account) state.account = body.account;
  if (body.hands) state.chat = body;
  paintChrome();
  paintKachat();
}

async function sendHandshake() {
  if (!requireId()) return;
  const to = (document.getElementById("chat-to") || {}).value || "";
  chatPeer = to.trim();
  const body = await post("/api/1984/chat/handshake", { to: chatPeer });
  if (!body.ok) {
    say(body.error || "The handshake did not send.", true);
    return;
  }
  say(body.note || "Handshake sent.");
  takeChat(body);
}

async function acceptHandshake(from) {
  if (!requireId()) return;
  const body = await post("/api/1984/chat/accept", { from });
  if (!body.ok) {
    say(body.error || "The handshake was not accepted.", true);
    return;
  }
  chatPeer = from || chatPeer;
  say(body.note || "Accepted.");
  takeChat(body);
}

async function sendChat() {
  if (!requireId()) return;
  const to = chatPeer || (document.getElementById("chat-to") || {}).value || "";
  const text = (document.getElementById("chat-text") || {}).value || "";
  const body = await post("/api/1984/chat/send", { to, text });
  if (!body.ok) {
    say(body.error || "The message did not send.", true);
    return;
  }
  chatPeer = to;
  say(body.note || "Sent.");
  takeChat(body);
}

function vaultStamp(ms) {
  const n = Number(ms || 0);
  if (!n) return "";
  const date = new Date(n);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function vaultName(row) {
  const purpose = { note: "Note", nda: "NDA", enterprise: "Enterprise", other: "Other" }[row.purpose] || "Note";
  if (!row.readable) return "Waiting · " + purpose;
  return purpose + " · " + (row.title || "Note");
}

function vaultRows() {
  return state.vaultBook || [];
}

function paintVault() {
  const me = (state.id.address || "").toLowerCase();
  const rows = vaultRows();
  const focus = rows.find((row) => row.id === vaultFocus) || null;
  const own = !!(focus && focus.owner && focus.owner.toLowerCase() === me && focus.readable);
  const sealed = !!(own && focus.sealed);
  const purpose = own ? focus.purpose : "note";
  const basis = own ? focus.basis : "desk";
  const title = own ? (focus.title || "") : "";
  const note = own ? (focus.body || "") : "";
  const readers = own ? (focus.readers || []).join("\n") : "";
  const openAt = own ? vaultStamp(focus.openAt) : "";
  const lock = sealed ? " disabled" : "";
  const picked = (value, current) => (value === current ? " selected" : "");
  const mine = rows.filter((row) => row.owner && row.owner.toLowerCase() === me);
  const shared = rows.filter((row) => !row.owner || row.owner.toLowerCase() !== me);
  const list = (items) => items.length
    ? "<ul class=\"vault-scroll\">" + items.map((row) => "<li><button type=\"button\" data-vault=\"" + esc(row.id) + "\">" + esc(vaultName(row)) + "</button></li>").join("") + "</ul>"
    : "<p class=\"mint-cap-note\">None yet.</p>";
  const waiting = focus && !focus.readable
    ? "<p class=\"mint-cap-note\">The open time has not arrived. This page is still holding the note.</p>"
    : "";
  const sharedNote = focus && focus.readable && focus.owner && focus.owner.toLowerCase() !== me
    ? "<p><strong>Note.</strong> " + esc(focus.body || "") + "</p>"
    : "";
  const actions = sealed
    ? '<button type="button" id="vault-new">New note</button>'
    : (own
      ? '<button type="button" id="vault-save">Save</button> <button type="button" id="vault-seal">Seal</button>'
      : '<button type="button" id="vault-save">Save</button>');
  const sealedLine = sealed ? "<p class=\"mint-cap-note\">Sealed. The note and the rule stay. This page still checks who may read it.</p>" : "";
  panel.innerHTML =
    '<div class="stall-head"><h2>Vault</h2>' + placeActs("") + "</div>" +
    "<p><strong>What.</strong> A note on this square ledger, with a rule for who may read it and when. The labels are a note, an NDA, an enterprise file, or other. Those names are for this classroom. A real NDA, a real enterprise secret, and an intelligence file do not belong here. This page shows the note only to the owner, and to a listed reader after the open time. The note sits in this square's book. It is not encrypted, so this desk can read it. It is not a worldwide vault.</p>" +
    "<p><strong>How.</strong> Write a title and a note. List the kaspatest addresses that may read it, one on each line. Leave that list empty and only this address can read it. An open time can wait. This page checks the list and the time. Mark the rule as this page, or mark it covenant-shaped. A covenant mark is a label. No covenant is deployed. Seal keeps the note and the rule. After that they stay.</p>" +
    "<p><strong>Why.</strong> So a funded address can try a rule for a note on Testnet 10. The chain does not hold the note, and it does not enforce the rule.</p>" +
    '<label class="mint-line"><span>Label</span><select id="vault-purpose"' + lock + '>' +
    '<option value="note"' + picked("note", purpose) + ">Note</option>" +
    '<option value="nda"' + picked("nda", purpose) + ">NDA</option>" +
    '<option value="enterprise"' + picked("enterprise", purpose) + ">Enterprise</option>" +
    '<option value="other"' + picked("other", purpose) + ">Other</option>" +
    "</select></label>" +
    '<label class="mint-line"><span>Rule</span><select id="vault-basis"' + lock + '>' +
    '<option value="desk"' + picked("desk", basis) + ">This page checks the rule</option>" +
    '<option value="covenant"' + picked("covenant", basis) + ">Covenant-shaped label</option>" +
    "</select></label>" +
    '<p class="mint-cap-note">A covenant-shaped label does not deploy a covenant. This page still checks the readers and the time.</p>' +
    '<label class="mint-line"><span>Title</span><input id="vault-title" maxlength="80" autocomplete="off"' + lock + ' value="' + esc(title) + '"></label>' +
    '<label class="mint-line"><span>Note</span><textarea id="vault-body" class="vault-field" maxlength="2000" rows="5"' + lock + ">" + esc(note) + "</textarea></label>" +
    '<label class="mint-line"><span>Readers</span><textarea id="vault-readers" class="vault-field" maxlength="800" rows="3" spellcheck="false" autocomplete="off" placeholder="One kaspatest address on each line"' + lock + ">" + esc(readers) + "</textarea></label>" +
    '<p class="mint-cap-note">Empty means only this address can read it. At most 8 readers.</p>' +
    '<label class="mint-line"><span>Opens</span><input id="vault-open" type="datetime-local"' + lock + ' value="' + esc(openAt) + '"></label>' +
    '<p class="mint-cap-note">Leave the time empty and a listed reader can read it now.</p>' +
    actions +
    sealedLine +
    waiting +
    sharedNote +
    "<p><strong>On this address.</strong></p>" + list(mine) +
    "<p><strong>You may read.</strong></p>" + list(shared);
  const save = document.getElementById("vault-save");
  if (save) save.onclick = saveVault;
  const seal = document.getElementById("vault-seal");
  if (seal) seal.onclick = sealVault;
  const fresh = document.getElementById("vault-new");
  if (fresh) fresh.onclick = () => { vaultFocus = ""; paintVault(); };
  for (const button of panel.querySelectorAll("[data-vault]")) {
    button.onclick = () => {
      vaultFocus = button.getAttribute("data-vault") || "";
      paintVault();
    };
  }
  wirePlaceExit();
}

async function refreshVault() {
  if (!state.id.address) return;
  const body = await api("/api/1984/vault?address=" + encodeURIComponent(state.id.address));
  if (!body.ok) return;
  if (state.mode !== "vault") return;
  state.vaultBook = body.vaults || [];
  if (panel.querySelector("input:focus, textarea:focus, select:focus")) return;
  paintVault();
}

function takeVault(body) {
  state.vaultBook = body.vaults || [];
  if (body.focus) vaultFocus = body.focus;
  paintChrome();
  paintVault();
}

async function saveVault() {
  if (!requireId()) return;
  const purpose = (document.getElementById("vault-purpose") || {}).value || "note";
  const basis = (document.getElementById("vault-basis") || {}).value || "desk";
  const title = (document.getElementById("vault-title") || {}).value || "";
  const text = (document.getElementById("vault-body") || {}).value || "";
  const readers = (document.getElementById("vault-readers") || {}).value || "";
  const when = (document.getElementById("vault-open") || {}).value || "";
  const openAt = when ? new Date(when).getTime() : 0;
  if (when && !Number.isFinite(openAt)) {
    say("That open time is not a time.", true);
    return;
  }
  const row = vaultRows().find((item) => item.id === vaultFocus);
  const own = row && state.id.address && row.owner && row.owner.toLowerCase() === state.id.address.toLowerCase() && !row.sealed;
  const body = await post("/api/1984/vault/save", {
    id: own ? row.id : "",
    purpose,
    basis,
    title,
    body: text,
    readers,
    openAt,
  });
  if (!body.ok) {
    say(body.error || "The note was not saved.", true);
    return;
  }
  say(body.note || "Saved.");
  takeVault(body);
}

async function sealVault() {
  if (!requireId()) return;
  const row = vaultRows().find((item) => item.id === vaultFocus);
  if (!row) {
    say("Save the note before you seal it.", true);
    return;
  }
  const body = await post("/api/1984/vault/seal", { id: row.id });
  if (!body.ok) {
    say(body.error || "The note was not sealed.", true);
    return;
  }
  say(body.note || "Sealed.");
  takeVault(body);
}

function paintMint() {
  const open = ((state.home && state.home.mints) || []).filter((row) => !mintIsDone(row));
  const mine = (state.account && state.account.tokens) || [];
  const names = open.map((row) => {
    const cap = !row.cap || row.cap === "0" ? " · no cap" : " · cap " + row.cap;
    return '<option value="' + esc(row.name) + '">' + esc(row.name) + " · supply " + esc(row.supply) + esc(cap) + "</option>";
  }).join("");
  const held = mine.length
    ? mine.map((row) => "<li>" + esc(row.amount) + " " + esc(row.name) + "</li>").join("")
    : "<li>None yet.</li>";
  panel.innerHTML =
    '<div class="stall-head"><h2>Mint</h2>' + placeActs("") + "</div>" +
    "<p><strong>Open mints.</strong> The list next to this card updates as soon as a name opens. Any funded address can mint more of it. Click a name there to see who holds it, how much, and the ledger lines. A name that has reached its cap moves to the tall list.</p>" +
    "<p><strong>What.</strong> This place writes a token on the square ledger. The rule is KCC-20 Last Call. It is not Final. No covenant is deployed. The token is not tKAS, not a dollar, and not a spendable Layer-1 coin.</p>" +
    "<p><strong>How.</strong> Pick one option. A new name opens a token and mints your amount. Mint more increases a token that is already open. Any funded address can mint more of a name someone else opened. Send moves some of yours to another kaspatest address. The same name keeps the same extension. A mint has to increase your amount. A send keeps the total. Open mints lists every name and every funded address that holds it. Join fills that name so you mint more.</p>" +
    "<p><strong>Why.</strong> So a funded address can try a mint here on Testnet 10, while KCC-20 is still Last Call. The cap is the most that can be minted. This desk checks it. Type 0 in Cap for no cap. There is no maximum.</p>" +
    "<p><strong>Options.</strong></p>" +
    '<div class="mint-form">' +
    '<label class="mint-choice"><input type="radio" name="mint-opt" value="new" checked><span>Open a new token</span></label>' +
    '<label class="mint-choice"><input type="radio" name="mint-opt" value="more"><span>Mint more of an open token</span></label>' +
    '<label class="mint-choice"><input type="radio" name="mint-opt" value="send"><span>Send to another address</span></label>' +
    '<label class="mint-line" id="mint-pick-row"' + (names ? "" : " hidden") + '><span>Open tokens</span><select id="mint-pick"><option value="">Choose</option>' + names + "</select></label>" +
    '<label class="mint-line"><span>Name</span><input id="mint-name" maxlength="12" spellcheck="false" autocomplete="off"></label>' +
    '<label class="mint-line"><span>Amount</span><input id="mint-amount" inputmode="numeric" spellcheck="false" autocomplete="off"></label>' +
    '<div id="mint-cap-row">' +
    '<label class="mint-line"><span>Cap</span><input id="mint-cap" inputmode="numeric" value="0" spellcheck="false" autocomplete="off"></label>' +
    '<p id="mint-cap-note" class="mint-cap-note">0 means no cap. There is no maximum.</p>' +
    "</div>" +
    '<label class="mint-line" id="mint-to-row" hidden><span>To</span><input id="mint-to" spellcheck="false" autocomplete="off" placeholder="kaspatest address"></label>' +
    "</div>" +
    '<button type="button" id="mint-go">Mint</button>' +
    "<p><strong>Yours.</strong></p><ul>" + held + "</ul>";
  const pick = document.getElementById("mint-pick");
  if (pick) {
    pick.onchange = () => {
      const box = document.getElementById("mint-name");
      if (box && pick.value) box.value = pick.value;
    };
  }
  for (const input of panel.querySelectorAll('input[name="mint-opt"]')) input.onchange = syncMintOption;
  const capBox = document.getElementById("mint-cap");
  const amountBox = document.getElementById("mint-amount");
  if (capBox) capBox.oninput = syncCapNote;
  if (amountBox) amountBox.oninput = syncCapNote;
  document.getElementById("mint-go").onclick = saveMint;
  syncMintOption();
  wirePlaceExit();
  paintMintBoards();
}

const MINT_MAX = 1000000000000000000n;

function capMeaning(value) {
  const text = String(value || "").trim();
  const amountText = String((document.getElementById("mint-amount") || {}).value || "").trim();
  const amountOk = /^[0-9]+$/.test(amountText) && amountText !== "0";
  if (text !== "" && text !== "0" && /^[0-9]+$/.test(text) && amountOk && BigInt(text) < BigInt(amountText)) {
    return "This cap is below the amount. Type 0 for no cap, or raise the cap to at least the amount.";
  }
  if (text === "" || text === "0") return "0 means no cap. There is no maximum.";
  if (/^[0-9]+$/.test(text)) return "The most that can be minted is " + text + ".";
  return "Type a whole number. 0 means no cap.";
}

function mintProblem(option, amount, cap) {
  const text = String(amount || "").trim();
  if (!/^[0-9]+$/.test(text) || text === "0") return "Type a whole amount above zero.";
  const value = BigInt(text);
  if (value > MINT_MAX) return "That amount is too large. One mint can be at most " + MINT_MAX.toString() + ".";
  if (option !== "new") return "";
  const capText = String(cap || "").trim();
  if (capText === "" || capText === "0") return "";
  if (!/^[0-9]+$/.test(capText)) return "Type a whole number. 0 means no cap.";
  if (BigInt(capText) < value) {
    return "The cap is smaller than this amount. Type 0 for no cap, or raise the cap to at least " + text + ".";
  }
  return "";
}

let mintPoll = 0;
let mintSeen = "";
let mintFocus = "";

function mintIsDone(row) {
  if (!row || row.cap == null || row.cap === "" || row.cap === "0") return false;
  try {
    return BigInt(row.supply || "0") >= BigInt(row.cap);
  } catch {
    return false;
  }
}

function mintWhen(at) {
  const n = Number(at);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function mintOp(op) {
  if (op === "new") return "Opened";
  if (op === "more") return "Minted";
  if (op === "send") return "Sent";
  return "Ledger";
}

function mintDetail(row) {
  const holders = row.holders || [];
  const txs = row.txs || [];
  const people = holders.length
    ? "<ul class=\"mint-open\">" + holders.map((item) =>
      "<li><span class=\"mint-addr\">" + esc(item.address) + "</span> " + esc(item.amount) + "</li>"
    ).join("") + "</ul>"
    : "<p class=\"mint-cap-note\">No address holds this yet.</p>";
  const lines = txs.length
    ? "<ul class=\"mint-open\">" + txs.map((tx) =>
      "<li><strong>" + esc(mintOp(tx.op)) + (tx.amount ? " " + esc(String(tx.amount)) : "") + "</strong>" +
      (mintWhen(tx.at) ? " · " + esc(mintWhen(tx.at)) : "") +
      " · line " + esc(tx.id || "") +
      "<span class=\"mint-addr\">" + esc(tx.address || "") + (tx.to ? " to " + esc(tx.to) : "") + "</span>" +
      (tx.note ? "<span class=\"mint-note\">" + esc(tx.note) + "</span>" : "") +
      "</li>"
    ).join("") + "</ul>"
    : "<p class=\"mint-cap-note\">No ledger line for this name yet.</p>";
  const join = mintIsDone(row)
    ? "<p class=\"mint-cap-note\">This name has reached its cap.</p>"
    : '<button type="button" data-join="' + esc(row.name) + '">Join</button>';
  return "<div class=\"mint-detail\"><p><strong>Holders.</strong> " + esc(String(row.holderCount || holders.length)) + " addresses.</p>" +
    people +
    "<p><strong>Lines.</strong> These are this square's ledger lines. A mint here does not broadcast a Kaspa transaction.</p>" +
    lines + join + "</div>";
}

function mintRow(row) {
  const cap = !row.cap || row.cap === "0" ? "no cap" : "cap " + row.cap;
  const count = String(row.holderCount != null ? row.holderCount : (row.holders || []).length);
  return "<li><button type=\"button\" data-mint=\"" + esc(row.name) + "\">" + esc(row.name) +
    "</button> · supply " + esc(row.supply) + " · " + esc(cap) + " · " + esc(count) +
    (mintFocus === row.name ? mintDetail(row) : "") + "</li>";
}

function paintOneMintPop(id, title, rows, empty) {
  const el = document.getElementById(id);
  if (!el) return;
  const scroll = el.scrollTop;
  el.hidden = false;
  el.innerHTML = "<h2>" + title + "</h2>" + (rows.length
    ? "<ul class=\"mint-open mint-names\">" + rows.map(mintRow).join("") + "</ul>"
    : "<p class=\"mint-cap-note\">" + empty + "</p>");
  el.scrollTop = scroll;
}

function paintMintBoards() {
  const rows = (state.home && state.home.mints) || [];
  mintSeen = JSON.stringify(rows);
  paintOneMintPop("mint-open-pop", "Open mints", rows.filter((row) => !mintIsDone(row)), "No open mint yet.");
  paintOneMintPop("mint-done-pop", "Completed mints", rows.filter((row) => mintIsDone(row)), "No mint has reached its cap.");
}

function bindMintPops() {
  for (const id of ["mint-open-pop", "mint-done-pop"]) {
    const el = document.getElementById(id);
    if (!el || el.dataset.bound) continue;
    el.dataset.bound = "1";
    el.addEventListener("click", (ev) => {
      const join = ev.target.closest("[data-join]");
      if (join) {
        joinMint(join.getAttribute("data-join") || "");
        return;
      }
      const button = ev.target.closest("[data-mint]");
      if (!button) return;
      const name = button.getAttribute("data-mint") || "";
      mintFocus = mintFocus === name ? "" : name;
      paintMintBoards();
    });
  }
}

function stopMintWatch() {
  if (mintPoll) clearInterval(mintPoll);
  mintPoll = 0;
  mintFocus = "";
  mintSeen = "";
  panel.classList.remove("mint-form-pop");
  for (const id of ["mint-open-pop", "mint-done-pop"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.hidden = true;
    el.innerHTML = "";
  }
}

function startMintWatch() {
  if (mintPoll) clearInterval(mintPoll);
  panel.classList.add("mint-form-pop");
  bindMintPops();
  paintMintBoards();
  refreshMints();
  mintPoll = setInterval(() => { refreshMints(); }, 2000);
}

function syncMintPick() {
  const pick = document.getElementById("mint-pick");
  const row = document.getElementById("mint-pick-row");
  if (!pick) return;
  const open = ((state.home && state.home.mints) || []).filter((item) => !mintIsDone(item));
  const current = pick.value;
  const names = open.map((item) => {
    const cap = !item.cap || item.cap === "0" ? " · no cap" : " · cap " + item.cap;
    return '<option value="' + esc(item.name) + '">' + esc(item.name) + " · supply " + esc(item.supply) + esc(cap) + "</option>";
  }).join("");
  pick.innerHTML = '<option value="">Choose</option>' + names;
  if ([...pick.options].some((option) => option.value === current)) pick.value = current;
  if (row) row.hidden = !open.length;
}

function joinMint(name) {
  const radio = panel.querySelector('input[name="mint-opt"][value="more"]');
  if (radio) radio.checked = true;
  syncMintOption();
  const box = document.getElementById("mint-name");
  if (box) box.value = name || "";
  const amount = document.getElementById("mint-amount");
  if (amount) amount.focus();
}

function syncCapNote() {
  const box = document.getElementById("mint-cap");
  const note = document.getElementById("mint-cap-note");
  if (box && note) note.textContent = capMeaning(box.value);
}

async function refreshMints() {
  if (state.mode !== "mint") return;
  const body = await api("/api/1984");
  if (state.mode !== "mint" || !body || !body.ok || !body.mints) return;
  const next = JSON.stringify(body.mints);
  if (next === mintSeen) return;
  if (!state.home) state.home = {};
  state.home.mints = body.mints;
  paintMintBoards();
  syncMintPick();
}

function syncMintOption() {
  const picked = panel.querySelector('input[name="mint-opt"]:checked');
  const option = picked ? picked.value : "new";
  const cap = document.getElementById("mint-cap-row");
  const to = document.getElementById("mint-to-row");
  const go = document.getElementById("mint-go");
  if (cap) cap.hidden = option !== "new";
  if (to) to.hidden = option !== "send";
  if (go) go.textContent = option === "send" ? "Send" : "Mint";
  syncCapNote();
}

async function saveMint() {
  if (!requireId()) return;
  const picked = panel.querySelector('input[name="mint-opt"]:checked');
  const option = picked ? picked.value : "new";
  const name = (document.getElementById("mint-name") || {}).value || "";
  const amount = (document.getElementById("mint-amount") || {}).value || "";
  const capRaw = String((document.getElementById("mint-cap") || {}).value || "").trim();
  const cap = capRaw === "" ? "0" : capRaw;
  const to = (document.getElementById("mint-to") || {}).value || "";
  const problem = mintProblem(option, amount, cap);
  if (problem) {
    say(problem, true);
    return;
  }
  const body = await post("/api/1984/mint", { option, name, amount, cap, to });
  if (!body.ok) {
    say(body.error || "The mint did not land.", true);
    return;
  }
  state.account = body.account;
  if (!state.home) state.home = {};
  if (body.mints) state.home.mints = body.mints;
  if (body.token && body.token.name) mintFocus = body.token.name;
  say(body.receipt && body.receipt.note ? body.receipt.note : "Minted.");
  paintChrome();
  paintMint();
}

async function saveRules() {
  if (!requireId()) return;
  const dollars = (id) => {
    const n = Number(document.getElementById(id).value);
    if (!Number.isFinite(n) || n < 0) throw new Error("Use a zero or a positive amount.");
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
  if (!mini || !mctx) return;
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
  if (state.flightStart || state.preRoll) {
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
    if (state.flightDark) return -1;
    if (state.preRoll) return 1;
    if (!state.flightStart) return 0;
    const ms = flightElapsed(performance.now());
    return ms > 0 ? ms : 0.001;
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
      buyRoadster();
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
    const need = document.getElementById("need-swap");
    if (need && !need.hidden) {
      ev.preventDefault();
      need.hidden = true;
      return;
    }
    const rails = document.getElementById("rails-note");
    if (rails && !rails.hidden) {
      ev.preventDefault();
      closeRailsNote();
      return;
    }
  }
  ev.preventDefault();
  if (state.flightStart || state.preRoll) {
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
function walkInto(mode) {
  if (state.flightStart || state.preRoll) return;
  if (!shopVisit(mode)) {
    openMode(mode);
    return;
  }
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
}
side.addEventListener("click", (ev) => {
  if (state.flightStart || state.preRoll) return;
  const button = ev.target.closest("[data-go]");
  if (!button) return;
  walkInto(button.getAttribute("data-go"));
});
bar.addEventListener("click", (ev) => {
  if (!ev.target.closest("#bar-bank")) return;
  const notice = document.getElementById("need-swap");
  if (notice) notice.hidden = true;
  if (state.flightStart || state.preRoll) {
    openMode("bank");
    return;
  }
  walkInto("bank");
});
you.addEventListener("click", (ev) => {
  if (ev.target.id === "log-out") logOut().catch((err) => say(err.message, true));
  if (ev.target.id === "use-kasware") connectWallet("kasware").catch((err) => say(err.message, true));
  if (ev.target.id === "use-kastle") connectWallet("kastle").catch((err) => say(err.message, true));
  if (ev.target.id === "use-guest") openFundedTest(ev.target);
  if (ev.target.closest("#use-addr")) useAddress(document.getElementById("addr"));
  if (ev.target.closest("#use-name")) useName(document.getElementById("kasname"));
});

const gate = document.getElementById("gate");
function hideGate() {
  if (gate) gate.hidden = true;
  maybeSwapNotice();
  syncRide();
}
const clearLogout = document.getElementById("log-out-clear");
if (clearLogout) clearLogout.addEventListener("click", () => logOut().catch((err) => say(err.message, true)));
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
function roadsterCents() {
  const place = SHOPS.find((row) => row.id === "roadster");
  const keys = place && place.items.find((row) => row.sku === "keys");
  return keys ? keys.cents : 100;
}

function railHave(rail) {
  if (rail === "kas") return BigInt(state.kasSompi || 0);
  if (rail === "kusdt") return BigInt((state.account && state.account.kusdt) || 0);
  return BigInt((state.account && state.account.poc) || 0);
}

let roadsterCard = false;

function setRoadsterBuys(shown) {
  for (const id of ["need-swap-poc", "need-swap-kusdt", "need-swap-kas"]) {
    const el = document.getElementById(id);
    if (el) el.hidden = !shown;
  }
}

function roadsterBalanceLine() {
  const kas = !state.id.address ? "— tKAS" : state.kasSompi == null ? "… tKAS" : formatTkas(state.kasSompi) + " tKAS";
  const poc = state.account ? formatCents(state.account.poc) + " POCencept" : "— POCencept";
  const kusdt = state.account ? formatCents(state.account.kusdt) + " KUSDT" : "— KUSDT";
  return kas + " · " + poc + " · " + kusdt;
}

function showRoadsterChoice() {
  const card = document.getElementById("need-swap");
  const line = document.getElementById("need-swap-line");
  const title = document.getElementById("need-swap-title");
  const text = roadsterBalanceLine() + ". The roadster is " + formatCents(roadsterCents()) + " on this ledger. Buy it with POCencept, KUSDT, or tKAS. To convert tKAS, POCencept, or KUSDT, go to the bank.";
  roadsterCard = true;
  setRoadsterBuys(true);
  if (title) title.textContent = "Buy a roadster";
  if (line) line.textContent = text;
  if (card) card.hidden = false;
  say("Buy the roadster with POCencept, KUSDT, or tKAS. To convert, go to the bank.");
}

function buyRoadsterOn(rail) {
  const card = document.getElementById("need-swap");
  if (card) card.hidden = true;
  roadsterCard = false;
  setRoadsterBuys(false);
  setShopRail(rail);
  if (rail === "kusdt" && state.account && state.account.kusdtFrozen) {
    say("KUSDT is frozen. POCencept and tKAS still spend.", true);
    return;
  }
  if (canPay(rail, roadsterCents()) === false) {
    walkInto("bank");
    say(shortRail(rail, railHave(rail)) + " Convert tKAS, POCencept, or KUSDT at the bank.", true);
    return;
  }
  spend(rail, "roadster", "keys").catch((err) => say(err && err.message ? err.message : "The shop refused the payment.", true));
}

function buyRoadster() {
  if (state.flightStart || state.preRoll || gateIsOpen()) return;
  if (state.account && state.account.roadster) return;
  if (!requireId()) return;
  showRoadsterChoice();
}
const rideButton = document.getElementById("ride");
if (rideButton) rideButton.addEventListener("click", toggleRide);
const lotBuy = document.getElementById("lot-buy");
if (lotBuy) lotBuy.addEventListener("click", buyRoadster);
const launchButton = document.getElementById("launch");
if (launchButton) launchButton.addEventListener("click", startLaunch);
const flightEnd = document.getElementById("flight-end");
if (flightEnd) flightEnd.addEventListener("click", endLaunch);
const flightBack = document.getElementById("flight-back");
if (flightBack) flightBack.addEventListener("click", returnFromFlight);
const simBig = document.getElementById("sim-big");
if (simBig) simBig.addEventListener("click", () => { simBig.hidden = true; });
const payAgain = document.getElementById("pay-slip-again");
if (payAgain) payAgain.addEventListener("click", newPurchase);
const payClose = document.getElementById("pay-slip-close");
if (payClose) payClose.addEventListener("click", closePaySlip);
const siteTab = document.querySelector(".tabs a.on");
if (siteTab && siteTab.parentElement) {
  const parent = siteTab.parentElement;
  const left = siteTab.offsetLeft - (parent.clientWidth - siteTab.offsetWidth) / 2;
  parent.scrollLeft = Math.max(0, left);
}
const needSwapCard = document.getElementById("need-swap");
if (needSwapCard) {
  needSwapCard.addEventListener("click", (ev) => {
    if (ev.target === needSwapCard || ev.target.closest("#need-swap-ok")) {
      needSwapCard.hidden = true;
      roadsterCard = false;
      setRoadsterBuys(false);
    }
  });
}
const needSwapBank = document.getElementById("need-swap-bank");
if (needSwapBank) {
  needSwapBank.addEventListener("click", () => {
    const converting = roadsterCard;
    if (needSwapCard) needSwapCard.hidden = true;
    roadsterCard = false;
    setRoadsterBuys(false);
    walkInto("bank");
    say(converting ? "Convert tKAS, POCencept, or KUSDT at the bank." : SWAP_PAY);
  });
}
for (const [id, rail] of [["need-swap-poc", "poc"], ["need-swap-kusdt", "kusdt"], ["need-swap-kas", "kas"]]) {
  const button = document.getElementById(id);
  if (button) button.addEventListener("click", () => buyRoadsterOn(rail));
}
const railsNote = document.getElementById("rails-note");
if (railsNote) {
  railsNote.addEventListener("click", (ev) => {
    if (ev.target === railsNote || ev.target.closest("#rails-close")) closeRailsNote();
  });
}
const flightDest = document.getElementById("flight-dest");
if (flightDest) flightDest.addEventListener("click", () => {
  paintPlanets();
  showDestList(true);
});
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
  showDestList(false);
  spend(btn.getAttribute("data-pay"), "orbit", btn.getAttribute("data-sku"));
});
const gateAddr = document.getElementById("gate-addr");
const gateName = document.getElementById("gate-kasname");
const gateUseAddr = document.getElementById("gate-use-addr");
const gateUseName = document.getElementById("gate-use-name");
if (gateAddr) {
  gateAddr.addEventListener("input", paintGateAddress);
  gateAddr.addEventListener("paste", (ev) => {
    const text = (ev.clipboardData && ev.clipboardData.getData("text")) || "";
    let address = "";
    try { address = assertTestnet(text); } catch (_) { address = ""; }
    if (!address) return;
    ev.preventDefault();
    gateAddr.value = address;
    paintGateAddress();
    enterAddress(address, "").catch((err) => {
      gateStatus(err.message, true);
      say(err.message, true);
    });
  });
  gateAddr.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const problem = gateAddressProblem(gateAddr.value);
    if (problem) {
      paintGateAddress();
      return;
    }
    enterAddress(assertTestnet(gateAddr.value), "").catch((err) => {
      gateStatus(err.message, true);
      say(err.message, true);
    });
  });
}
if (gateUseAddr) {
  gateUseAddr.addEventListener("click", () => {
    if (gateUseAddr.disabled || !gateAddr) return;
    const problem = gateAddressProblem(gateAddr.value);
    if (problem) {
      paintGateAddress();
      return;
    }
    enterAddress(assertTestnet(gateAddr.value), "").catch((err) => {
      gateStatus(err.message, true);
      say(err.message, true);
    });
  });
}
if (gateUseName) gateUseName.addEventListener("click", () => useName(gateName));
watchNameBox(gateName);
paintGateAddress();
function openFundedTest(button) {
  if (guestBusy) return;
  if (button) button.disabled = true;
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
      if (result && result.ok) return;
      if (result && result.error) {
        if (gateIsOpen()) gateStatus(result.error, true);
        say(result.error, true);
      }
    })
    .catch((err) => {
      if (gateIsOpen()) gateStatus(err.message, true);
      say(err.message, true);
    })
    .finally(() => {
      clearTimeout(timer);
      if (button) button.disabled = false;
    });
}
const gateGuest = document.getElementById("gate-guest");
if (gateGuest) gateGuest.addEventListener("click", () => openFundedTest(gateGuest));
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
say("1984. LUMBRIDGE. Testnet 10. The gate asks who pays.");
window.addEventListener("pagehide", () => {
  if (state.id.kind !== "guest" || !state.id.token) return;
  const payload = JSON.stringify({ token: state.id.token, address: state.id.address, life: PAGE_LIFE });
  for (const base of bases()) {
    fetch(base + "/api/1984/guest/close", {
      method: "POST",
      headers: ledgerHeaders({ "content-type": "application/json" }),
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
  if (state.oracle) say("Live KAS $" + Number(state.oracle).toFixed(4) + ". Shop tags stay on this ledger.");
  else if (state.oracleError) say(state.oracleError, true);
  paintChrome();
  if (state.mode !== "world") openMode(state.mode);
});
if (state.id.address) refreshAccount();
