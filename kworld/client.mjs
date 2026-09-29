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
  while (chat.children.length > 10) chat.removeChild(chat.firstChild);
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

function openMode(mode) {
  state.mode = mode;
  paintChrome();
  if (mode === "world") {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  if (mode === "bank") paintBank();
  else if (mode === "rules") paintRules();
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

function paintBank() {
  panel.innerHTML =
    "<h2>Venn's bank</h2>" +
    "<p>Lock tKAS and receive a toy dollar at the live price. POCencept has no freeze switch. KUSDT has one, so you can see the difference. Practice coins spend at the shops and do not redeem.</p>" +
    '<p class="warn">PegLab: this quote is an outside price. If it is wrong, or it moves, a redeem can fail because the lock no longer covers the toy dollars. That is a peg failing. It is not a promise of dollars.</p>' +
    '<label>tKAS to lock<input id="lock-amt" value="1"></label>' +
    '<div class="kw-row"><button type="button" id="lock-poc">Lock into POCencept</button><button type="button" id="lock-kusdt">Lock into KUSDT</button></div>' +
    '<label>txid, if you sent it yourself<input id="lock-txid" spellcheck="false"></label>' +
    '<label>Toy dollars to redeem<input id="redeem-amt" value="0.05"></label>' +
    '<div class="kw-row"><button type="button" id="redeem-poc">Redeem POC</button><button type="button" id="redeem-kusdt">Redeem KUSDT</button></div>' +
    '<div class="kw-row"><button type="button" id="purse">Take the practice purse</button><button type="button" id="freeze">Freeze or thaw KUSDT</button></div>' +
    '<p class="fine">Reserve ' + esc(state.reserve) + ". Miner fee stays tKAS. Grams are not this dollar. BitCoffee's covenant KUSD is a different object and is not minted here.</p>";
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
    '<p class="fine">A real covenant would enforce this on Testnet-10 without trusting this page. SilverScript and the Kaspero freelancer sheet are on the bench. This page checks the rule before it moves a toy balance.</p>';
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
    "<li>Or press Test without a wallet. This tab gets a new funded kaspatest address. Close the tab and that address is gone. Leftover tKAS is swept back. It does not replace a wallet you already saved.</li>" +
    "<li>Or paste a kaspatest address. Or type a .kas name that already resolves on TN10. That choice stays until you change it.</li>" +
    "<li>Need coins: the faucet tab pays 0.6 tKAS. At the live price that is a few cents, so it will not buy supper. Take the practice purse in the bank. That purse is play money.</li>" +
    "<li>Walk to a door, or use the left tabs. Pay tKAS, POCencept, or KUSDT.</li>" +
    "<li>tKAS asks the wallet to sign a real Testnet-10 transaction. The miner fee is extra tKAS.</li>" +
    "<li>The bank locks tKAS into POC or KUSDT at the live dollar price. Redeem sends tKAS back only for the locked part.</li>" +
    "<li>Rules: a daily cap, a shop list, a rail list, a confirm line.</li>" +
    "<li>The freeze switch is only on KUSDT.</li>" +
    "</ol>" +
    "<p>Also on the bench: KNS, tic-tac-toe, KaChat, Kaspero Labs, SilverScript, Argent. Tidewater is an MIT fishing island; this square did not copy that ocean. The Go RuneScape topic list is markers and private-server code. This page uses neither Jagex art nor a private server.</p>" +
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
  const tile = Math.max(8, Math.min(cssW / map.w, cssH / map.h));
  const offX = (cssW - map.w * tile) / 2;
  const offY = (cssH - map.h * tile) / 2;
  return { cssW, cssH, dpr, tile, offX, offY };
}

function tileColor(tile, x, y, t) {
  if (tile === "g") return (x + y) % 2 ? "#3e6b38" : "#46743f";
  if (tile === "c") return (x + y) % 2 ? "#8d8478" : "#9a9186";
  if (tile === "p") return "#c2b48a";
  if (tile === "i") return (x + y) % 2 ? "#6d5a45" : "#75624c";
  if (tile === "W") return "#5c4638";
  if (tile === "d") return "#e1c27a";
  if (tile === "w") return t % 800 < 400 ? "#2f6f98" : "#3d82ad";
  if (tile === "t") return "#1d4a2c";
  if (tile === "f") return "#3e6b38";
  if (tile === "r") return "#8d3a32";
  return "#333";
}

function drawPerson(g, x, y, color, name, tile) {
  const px = x * tile + tile / 2;
  const py = y * tile + tile / 2;
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(px, py + 8, 7, 3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.fillRect(px - 5, py - 4, 10, 12);
  g.fillStyle = "#f3e0c8";
  g.beginPath();
  g.arc(px, py - 8, 4, 0, Math.PI * 2);
  g.fill();
  if (name) {
    g.font = "11px Segoe UI, sans-serif";
    g.textAlign = "center";
    g.fillStyle = "#1a1612";
    g.fillText(name, px + 1, py - 16);
    g.fillStyle = "#f2d48a";
    g.fillText(name, px, py - 17);
  }
}

function draw() {
  const t = performance.now();
  const box = frame();
  const { dpr, tile, offX, offY, cssW, cssH } = box;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#142016";
  ctx.fillRect(0, 0, cssW, cssH);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      ctx.fillStyle = tileColor(map.grid[y][x], x, y, t);
      ctx.fillRect(offX + x * tile, offY + y * tile, tile + 0.4, tile + 0.4);
      if (map.grid[y][x] === "f") {
        ctx.fillStyle = "#e7c56a";
        ctx.fillRect(offX + x * tile + tile * 0.4, offY + y * tile + tile * 0.45, tile * 0.2, tile * 0.2);
      }
      if (map.grid[y][x] === "t") {
        ctx.fillStyle = "#14381f";
        ctx.beginPath();
        ctx.arc(offX + x * tile + tile / 2, offY + y * tile + tile * 0.42, tile * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  for (const building of map.buildings) {
    ctx.fillStyle = building.roof;
    ctx.fillRect(offX + building.x * tile, offY + building.y * tile, building.w * tile, tile * 1.15);
    ctx.fillStyle = "#f3e6c8";
    ctx.font = Math.max(10, tile * 0.46) + "px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(building.sign, offX + (building.x + building.w / 2) * tile, offY + building.y * tile + tile * 0.8);
  }
  ctx.fillStyle = "#c0392b";
  ctx.fillRect(offX + map.car.x * tile, offY + map.car.y * tile + tile * 0.2, map.car.w * tile, tile * 0.7);
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(offX + map.car.x * tile + tile * 0.25, offY + map.car.y * tile + tile * 0.7, tile * 0.28, tile * 0.28);
  ctx.fillRect(offX + (map.car.x + map.car.w) * tile - tile * 0.55, offY + map.car.y * tile + tile * 0.7, tile * 0.28, tile * 0.28);
  for (const npc of map.npcs) drawPerson(ctx, npc.x + offX / tile, npc.y + offY / tile, npc.color, npc.name, tile);
  const bob = Math.sin(t / 180) * 0.04;
  drawPerson(ctx, state.player.x + offX / tile, state.player.y + offY / tile + bob, "#f2d16b", "", tile);
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

function step(now) {
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
  const x = Math.floor((ev.clientX - rect.left - box.offX) / box.tile);
  const y = Math.floor((ev.clientY - rect.top - box.offY) / box.tile);
  return { x, y };
}

view.addEventListener("click", (ev) => {
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
panel.addEventListener("click", (ev) => {
  const button = ev.target.closest("[data-pay]");
  if (!button) return;
  spend(button.getAttribute("data-pay"), button.getAttribute("data-shop"), button.getAttribute("data-sku"), false).catch((err) => say(err.message, true));
});

requestAnimationFrame(step);
paintChrome();
say("Kworld. Testnet 10. Use a wallet, or test without one. A test address dies when you close the tab.");
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
