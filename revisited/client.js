(function () {
  const BROWSER_KEY = "revisited-browser-v1";
  const GUEST_KEY = "revisited-guest-v1";
  const TUNNEL = "https://bob-aspects-ste-reporter.trycloudflare.com";
  const button = document.getElementById("use-guest");
  const desk = document.getElementById("desk");
  const status = document.getElementById("status");
  let busy = false;
  let eatClick = false;
  let session = readSession();

  function bases() {
    const list = [];
    if (location.origin && location.origin !== "null") list.push(location.origin);
    if (window.TOWN_API) list.push(window.TOWN_API);
    if (window.FAUCET_API) list.push(window.FAUCET_API);
    list.push(TUNNEL);
    list.push("http://127.0.0.1:4020");
    return [...new Set(list.map((item) => String(item).replace(/\/$/, "")))];
  }

  function headers(extra) {
    return Object.assign({ accept: "application/json", "Bypass-Tunnel-Reminder": "true" }, extra || {});
  }

  function setStatus(text, bad) {
    status.textContent = text || "";
    status.className = bad ? "meta bad" : "meta";
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

  async function postJson(path, payload, timeout) {
    let last = "The till is not on this host.";
    for (const base of bases()) {
      try {
        const res = await fetch(base + path, {
          method: "POST",
          headers: headers({ "content-type": "application/json" }),
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeout || 20000),
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

  async function getJson(path) {
    let last = "The till is not on this host.";
    for (const base of bases()) {
      try {
        const res = await fetch(base + path, { headers: headers(), signal: AbortSignal.timeout(20000) });
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

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pollGuest(base, job) {
    const deadline = Date.now() + 720000;
    let last = "The test wallet is still opening.";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(base + "/api/1984/guest?job=" + encodeURIComponent(job), {
          headers: headers(),
          signal: AbortSignal.timeout(12000),
        });
        const text = await res.text();
        if (!text || text[0] === "<") throw new Error("The till is not on this host.");
        const body = JSON.parse(text);
        if (secret(body)) return { ok: false, error: "The till returned a wallet secret. This page stopped." };
        if (body.step) setStatus(body.detail ? body.step + " (" + body.detail + ")" : body.step, false);
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

  function showGuest(open) {
    button.hidden = open;
    desk.hidden = !open;
  }

  function paint(body) {
    document.getElementById("address").textContent = body.address || (session && session.address) || "";
    const bits = [
      body.quote ? "KAS $" + body.quote : "No KAS quote",
      "tKAS " + (body.balance || "—"),
      "Locked " + (body.locked || "0"),
      "Spendable " + (body.spendable || "—"),
      "Calm " + (body.calm || "0.00"),
      "Debt " + (body.debt || "0.00"),
      body.ratio ? "Ratio " + body.ratio : "",
      body.surplus && body.surplus !== "0" ? "Surplus " + body.surplus + " tKAS" : "",
    ].filter(Boolean);
    document.getElementById("picture").textContent = bits.join(" · ");
    document.getElementById("mint").disabled = !!body.mintDisabled;
    const box = document.getElementById("listings");
    box.replaceChildren();
    for (const row of body.listings || []) {
      const line = document.createElement("p");
      line.className = "row";
      const name = document.createElement("span");
      const price = row.priceCents && row.priceCents !== "0" ? " · " + row.price : "";
      name.textContent = row.name + price + (row.kind === "person" && row.address ? " · " + row.address : "");
      line.append(name);
      if (row.priceCents && row.priceCents !== "0") {
        const pay = document.createElement("button");
        pay.type = "button";
        pay.className = "plain";
        pay.textContent = "Pay";
        pay.addEventListener("click", () => run({ action: "spend", id: row.id }));
        line.append(pay);
      }
      box.append(line);
    }
    if (body.balanceError) setStatus(body.balanceError, true);
    else if (body.receipt) setStatus(body.receipt, false);
    else if (body.line) setStatus(body.line, false);
  }

  async function refresh() {
    if (!session) return;
    const query = "/api/revisited?address=" + encodeURIComponent(session.address) + "&token=" + encodeURIComponent(session.token);
    const body = await getJson(query);
    if (secret(body)) {
      writeSession(null);
      showGuest(false);
      setStatus("The till returned a wallet secret. This page stopped.", true);
      return;
    }
    if (!body || body.ok === false || body.status === 400) {
      writeSession(null);
      showGuest(false);
      setStatus((body && body.error) || "This test tab has already been dropped. Open a new one.", true);
      return;
    }
    showGuest(true);
    paint(body);
  }

  async function run(payload) {
    if (!session || busy) return;
    busy = true;
    setStatus("Working.", false);
    try {
      const posted = await postJson("/api/revisited", Object.assign({ address: session.address, token: session.token }, payload), payload.action === "kas" || payload.action === "redeem" ? 120000 : 45000);
      const body = posted.body;
      if (secret(body)) {
        writeSession(null);
        showGuest(false);
        setStatus("The till returned a wallet secret. This page stopped.", true);
        return;
      }
      if (!body || body.ok === false) {
        if (body && body.status === 400 && /dropped|does not match|closing/i.test(body.error || "")) {
          writeSession(null);
          showGuest(false);
        }
        setStatus((body && body.error) || "The desk could not do that.", true);
        return;
      }
      showGuest(true);
      paint(body);
    } finally {
      busy = false;
    }
  }

  async function openGuest() {
    if (busy) return;
    busy = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Opening the funded wallet";
    setStatus("Opening a funded test address.", false);
    try {
      const posted = await postJson("/api/1984/guest", {
        network: "testnet-10",
        life: "revisited",
        progress: true,
        browser: marker(),
      }, 20000);
      let body = posted.body;
      if (secret(body)) {
        setStatus("The till returned a wallet secret. This page stopped.", true);
        return;
      }
      if (body && body.pending && body.job && posted.base) body = await pollGuest(posted.base, body.job);
      if (secret(body) || !body || !body.ok || !body.address || !body.token) {
        setStatus((body && body.error) || "No test wallet.", true);
        return;
      }
      writeSession({ address: body.address, token: body.token });
      showGuest(true);
      setStatus(body.same ? "Same funded wallet." : "This address stays with this browser.", false);
      await refresh();
    } finally {
      busy = false;
      button.removeAttribute("aria-busy");
      if (!session) button.textContent = "Use a funded test address";
    }
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
  document.getElementById("mint").addEventListener("click", () => run({ action: "mint", amount: document.getElementById("mint-amount").value }));
  document.getElementById("repay").addEventListener("click", () => run({ action: "repay", amount: document.getElementById("repay-amount").value }));
  document.getElementById("redeem").addEventListener("click", () => run({ action: "redeem", amount: document.getElementById("redeem-amount").value }));
  document.getElementById("surplus").addEventListener("click", () => run({ action: "surplus" }));
  document.getElementById("send").addEventListener("click", () => run({
    action: "send",
    to: document.getElementById("send-to").value,
    amount: document.getElementById("send-amount").value,
    note: document.getElementById("send-note").value,
  }));
  document.getElementById("kas").addEventListener("click", () => run({
    action: "kas",
    to: document.getElementById("kas-to").value,
    amount: document.getElementById("kas-amount").value,
  }));
  document.getElementById("list").addEventListener("click", () => run({
    action: "list",
    name: document.getElementById("list-name").value,
    kind: document.getElementById("list-kind").value,
    amount: document.getElementById("list-price").value,
    to: document.getElementById("list-to").value,
  }));

  if (session) refresh();
})();
