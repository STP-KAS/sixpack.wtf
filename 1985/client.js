(function () {
  const BROWSER_KEY = "1985-browser-v1";
  const GUEST_KEY = "1985-guest-v1";
  const button = document.getElementById("use-guest");
  const desk = document.getElementById("desk");
  const status = document.getElementById("status");
  const chainStatus = document.getElementById("chain-status");
  let busy = false;
  let eatClick = false;
  let session = readSession();
  let chain = null;
  let view = "overview";
  let query = "";

  function deskHost(host) {
    const h = String(host || "").trim().toLowerCase();
    return h === "127.0.0.1" || h.indexOf("127.0.0.1:") === 0 ||
      h === "localhost" || h.indexOf("localhost:") === 0 ||
      h === "[::1]" || h.indexOf("[::1]:") === 0;
  }

  function onDesk() {
    return deskHost(location.host);
  }

  function setStatus(node, text, bad) {
    node.textContent = text || "";
    node.className = bad ? "meta bad" : "meta";
  }

  function marker() {
    try {
      const current = String(localStorage.getItem(BROWSER_KEY) || "");
      if (/^[0-9a-f]{32}$/.test(current)) return current;
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const id = [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(BROWSER_KEY, id);
      return id;
    } catch {
      return "";
    }
  }

  function readSession() {
    try {
      const body = JSON.parse(sessionStorage.getItem(GUEST_KEY) || "null");
      if (body && body.address && body.token && !body.key && !body.privateKey) return { address: body.address, token: body.token };
    } catch { /* a bad session is the same as none */ }
    return null;
  }

  function writeSession(next) {
    session = next;
    if (!next) sessionStorage.removeItem(GUEST_KEY);
    else sessionStorage.setItem(GUEST_KEY, JSON.stringify({ address: next.address, token: next.token }));
  }

  function secret(body) {
    return !!(body && (body.key || body.privateKey));
  }

  async function callJson(path, payload) {
    if (!onDesk()) return { ok: false, error: "This DevNet is on the desk. The public site cannot read it." };
    const res = await fetch(location.origin + path, {
      method: payload ? "POST" : "GET",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(payload && payload.amount ? 300000 : 30000),
    });
    const text = await res.text();
    if (!text || text[0] === "<") return { ok: false, error: "The till is not on this host." };
    const body = JSON.parse(text);
    body.status = res.status;
    return body;
  }

  function kas(sompi) {
    if (sompi == null || sompi === "") return "—";
    const n = BigInt(sompi);
    const whole = n / 100000000n;
    const frac = (n % 100000000n).toString().padStart(8, "0").replace(/0+$/, "");
    return frac ? whole.toString() + "." + frac : whole.toString();
  }

  function grouped(value) {
    if (value == null || value === "") return "0";
    return BigInt(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function when(ms) {
    const n = Number(ms);
    if (!n) return "—";
    const date = new Date(n);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toISOString().slice(0, 19).replace("T", " ") + " UTC";
  }

  function short(hash) {
    const text = String(hash || "");
    if (text.length < 20) return text;
    return text.slice(0, 8) + "…" + text.slice(-6);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function card(label, value) {
    const node = el("div", "d85-card");
    node.append(el("span", "k", label), el("span", "v", value));
    return node;
  }

  function linkButton(text, onClick) {
    const node = el("button", "link", text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function showDetail(row) {
    const box = document.getElementById("detail");
    box.replaceChildren();
    if (!row) return;
    const wrap = el("div", "d85-detail");
    wrap.append(
      el("p", "", "Block " + (row.hash || "")),
      el("p", "", "DAA " + (row.daa || "—") + " · " + when(row.time)),
      el("p", "", "Miner " + (row.miner || "—")),
      el("p", "", "Free " + kas(row.free) + " KAS · Locked " + kas(row.locked) + " KAS · Fees in this coinbase " + (row.fees === "" ? "—" : kas(row.fees) + " KAS")),
      el("p", "", "STP face " + grouped(row.face) + " · Transactions " + (row.txCount ?? "—"))
    );
    box.append(wrap);
  }

  function filteredBlocks() {
    const rows = (chain && chain.blocks) || [];
    const q = query.trim().toLowerCase();
    if (!q) return view === "overview" ? rows.slice(0, 12) : rows;
    return rows.filter((row) => String(row.hash).toLowerCase().indexOf(q) >= 0 || String(row.miner).toLowerCase() === q);
  }

  function paintCards() {
    const box = document.getElementById("cards");
    box.replaceChildren();
    if (!chain || chain.ok === false) return;
    const latest = chain.latest || {};
    const cards = [
      card("Network", "devnet"),
      card("DAA", chain.virtualDaa || "—"),
      card("Blocks", chain.blockCount || "—"),
      card("Mempool", chain.mempool === "" ? "—" : chain.mempool),
      card("Free KAS", kas(latest.free)),
      card("Locked sompi", kas(latest.locked) + " KAS"),
      card("STP face", grouped(latest.face)),
      card("Fees in coinbase", latest.fees === "" || latest.fees == null ? "—" : kas(latest.fees) + " KAS"),
    ];
    if (chain.supply) cards.push(card("Node supply", kas(chain.supply) + " KAS"));
    for (const item of cards) box.append(item);
  }

  function paintTable() {
    const box = document.getElementById("table");
    box.replaceChildren();
    if (!chain || chain.ok === false) return;
    const table = document.createElement("table");
    const head = document.createElement("tr");
    if (view === "miners") {
      for (const label of ["Miner", "Blocks", "Free KAS", "Locked KAS", "STP face", "Fees KAS"]) head.append(el("th", "", label));
      table.append(head);
      const q = query.trim().toLowerCase();
      const miners = (chain.miners || []).filter((row) => !q || row.address.toLowerCase().indexOf(q) >= 0);
      for (const row of miners) {
        const tr = document.createElement("tr");
        const miner = document.createElement("td");
        miner.append(linkButton(row.address, () => {
          query = row.address;
          document.getElementById("look").value = row.address;
          view = "blocks";
          paintViews();
          paintTable();
        }));
        tr.append(
          miner,
          el("td", "", String(row.blocks)),
          el("td", "", kas(row.free)),
          el("td", "", kas(row.locked)),
          el("td", "", grouped(row.face)),
          el("td", "", kas(row.fees))
        );
        table.append(tr);
      }
      if (!miners.length) box.append(el("p", "d85-muted", "No miner in this read matches that lookup."));
    } else {
      for (const label of ["DAA", "Time", "Block", "Txs", "Miner", "Free", "Locked", "STP face", "Fees"]) head.append(el("th", "", label));
      table.append(head);
      const rows = filteredBlocks();
      for (const row of rows) {
        const tr = document.createElement("tr");
        const hash = document.createElement("td");
        hash.append(linkButton(short(row.hash), () => showDetail(row)));
        const miner = document.createElement("td");
        miner.append(row.miner ? linkButton(short(row.miner), () => {
          query = row.miner;
          document.getElementById("look").value = row.miner;
          view = "miners";
          paintViews();
          paintTable();
        }) : el("span", "", "—"));
        tr.append(
          el("td", "", row.daa || "—"),
          el("td", "", when(row.time).slice(5, 19)),
          hash,
          el("td", "", String(row.txCount)),
          miner,
          el("td", "", kas(row.free)),
          el("td", "", kas(row.locked)),
          el("td", "", grouped(row.face)),
          el("td", "", row.fees === "" ? "—" : kas(row.fees))
        );
        table.append(tr);
      }
      if (!rows.length) box.append(el("p", "d85-muted", "No block in this read matches that lookup."));
    }
    box.append(table);
  }

  function paintViews() {
    document.getElementById("view-overview").className = view === "overview" ? "on" : "";
    document.getElementById("view-blocks").className = view === "blocks" ? "on" : "";
    document.getElementById("view-miners").className = view === "miners" ? "on" : "";
  }

  function paintChain() {
    paintCards();
    paintTable();
    if (!chain) return;
    const readN = Number(chain.read || 0);
    const countN = Number(chain.blockCount || 0);
    const shortRead = countN && readN + 2 < countN ? " Read " + chain.read + " of " + chain.blockCount + " blocks." : "";
    setStatus(chainStatus, "Sink " + short(chain.sink) + "." + shortRead, false);
  }

  async function refreshChain() {
    if (!onDesk()) {
      setStatus(chainStatus, "Live blocks are on the desk. This public page has the prepaid address list only.", false);
      return;
    }
    try {
      const body = await callJson("/api/1985/chain");
      if (secret(body)) {
        setStatus(chainStatus, "The till returned a wallet secret. This page stopped.", true);
        return;
      }
      if (!body || body.ok === false) {
        setStatus(chainStatus, (body && body.error) || "The DevNet node did not answer.", true);
        return;
      }
      chain = body;
      paintChain();
    } catch (error) {
      setStatus(chainStatus, error.message || "The DevNet node did not answer.", true);
    }
  }

  function paintWallet(body) {
    document.getElementById("address").textContent = body.address || "";
    document.getElementById("kas").textContent = (body.kas || "—") + " KAS";
    document.getElementById("face").textContent = grouped(body.faceText || body.face || 0);
    document.getElementById("locked").textContent = (body.lockedKas || "0") + " KAS";
    const mined = body.mined;
    document.getElementById("mined").textContent = mined
      ? "This address mined " + mined.blocks + " blocks in the desk read. Free " + kas(mined.free) + " KAS. Locked " + kas(mined.locked) + " KAS. STP face " + grouped(mined.face) + "."
      : "This address has no coinbase in the desk read. STP face 0 means there is no lab face here.";
    if (body.immature && body.immature !== "0") {
      document.getElementById("mined").textContent += " Immature Kaspa " + (body.immatureKas || kas(body.immature)) + ".";
    }
  }

  async function refreshWallet() {
    if (!session || !onDesk()) return;
    const body = await callJson("/api/1985/wallet?token=" + encodeURIComponent(session.token));
    if (secret(body)) {
      writeSession(null);
      desk.hidden = true;
      setStatus(status, "The till returned a wallet secret. This page stopped.", true);
      return;
    }
    if (!body || body.ok === false) {
      if (body && body.status === 404) {
        writeSession(null);
        desk.hidden = true;
      }
      setStatus(status, (body && body.error) || "This funded wallet is not open.", true);
      return;
    }
    desk.hidden = false;
    paintWallet(body);
    if (body.receipt) setStatus(status, body.receipt, false);
  }

  async function openGuest() {
    if (busy) return;
    if (!onDesk()) {
      setStatus(status, "Open this page on the desk. The public site cannot hand out a wallet.", true);
      return;
    }
    busy = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Opening the funded wallet";
    setStatus(status, "Opening a funded desk wallet.", false);
    try {
      const body = await callJson("/api/1985/guest", { browser: marker() });
      if (secret(body) || !body || !body.ok || !body.address || !body.token) {
        setStatus(status, (body && body.error) || "No desk wallet.", true);
        return;
      }
      writeSession({ address: body.address, token: body.token });
      desk.hidden = false;
      setStatus(status, body.same ? "Same funded wallet." : "This address stays with this browser.", false);
      await refreshWallet();
    } finally {
      busy = false;
      button.removeAttribute("aria-busy");
      if (!session) button.textContent = "Use a funded desk wallet";
    }
  }

  async function send() {
    if (!session || busy) return;
    busy = true;
    setStatus(status, "Sending.", false);
    try {
      const body = await callJson("/api/1985/send", {
        token: session.token,
        to: document.getElementById("send-to").value.trim(),
        amount: document.getElementById("send-amount").value.trim(),
      });
      if (secret(body)) {
        writeSession(null);
        desk.hidden = true;
        setStatus(status, "The till returned a wallet secret. This page stopped.", true);
        return;
      }
      if (!body || body.ok === false) {
        setStatus(status, (body && body.error) || "The desk could not send that.", true);
        return;
      }
      paintWallet(body);
      setStatus(status, body.receipt || "Sent.", false);
      await refreshChain();
    } finally {
      busy = false;
    }
  }

  async function lookup() {
    query = document.getElementById("look").value.trim();
    const hash = query.toLowerCase();
    if (/^[0-9a-f]{64}$/.test(hash) && onDesk()) {
      const known = chain && (chain.blocks || []).find((row) => row.hash === hash);
      if (known) showDetail(known);
      else {
        const body = await callJson("/api/1985/block?hash=" + encodeURIComponent(hash));
        if (body && body.block) showDetail(body.block);
        else setStatus(chainStatus, (body && body.error) || "That block is not in the desk read.", true);
      }
    }
    paintTable();
  }

  async function loadList() {
    try {
      const res = await fetch("1985/funded-list.json", { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const body = await res.json();
      const rows = body.wallets || [];
      const gift = kas(body.giftSompi || 0);
      document.getElementById("list-note").textContent = rows.length
        ? rows.length + " prepaid wallets, " + gift + " KAS each, from coins this DevNet already mined. The list has no keys."
        : "Prepaid wallets are not listed yet.";
      const box = document.getElementById("prepaid");
      box.replaceChildren();
      for (const row of rows) {
        box.append(el("p", "addr", row.address));
      }
    } catch { /* the chain view still stands on the desk */ }
  }

  function primaryPress(ev) {
    if (!ev || ev.button == null || ev.button === 0 || ev.button === -1) return true;
    return false;
  }

  function onPress(ev) {
    if (!primaryPress(ev)) return;
    if (ev && ev.type === "click" && eatClick) return;
    if (!ev || ev.type !== "click") {
      eatClick = true;
      setTimeout(() => { eatClick = false; }, 0);
    }
    openGuest();
  }

  button.addEventListener("pointerdown", onPress);
  button.addEventListener("click", onPress);
  document.getElementById("send").addEventListener("click", send);
  document.getElementById("address").addEventListener("click", async () => {
    const text = document.getElementById("address").textContent;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { /* the address is already on the page */ }
    setStatus(status, "Copied.", false);
  });
  document.getElementById("view-overview").addEventListener("click", () => { view = "overview"; paintViews(); paintTable(); });
  document.getElementById("view-blocks").addEventListener("click", () => { view = "blocks"; paintViews(); paintTable(); });
  document.getElementById("view-miners").addEventListener("click", () => { view = "miners"; paintViews(); paintTable(); });
  document.getElementById("look-go").addEventListener("click", lookup);
  document.getElementById("look").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") lookup();
  });

  if (onDesk()) {
    document.getElementById("where").textContent = "This page is on the desk. The numbers below are this DevNet.";
    refreshChain();
    setInterval(refreshChain, 5000);
    if (session) refreshWallet();
    setInterval(refreshWallet, 5000);
  }
  loadList();
})();
