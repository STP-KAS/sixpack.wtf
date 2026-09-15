/**
 * Drop-in Kasware + Kastle inject. Other wallets are listed, not injected.
 * Load this script, then use window.KaspaWallets.
 *
 * Connect only after a user click.
 */
(function (root) {
  const KEY_ADDR = "kaspaAddress";
  const KEY_WALLET = "kaspaWallet";

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function withTimeout(p, ms, label) {
    return Promise.race([
      p,
      sleep(ms).then(function () {
        throw new Error(label || "wallet timed out");
      }),
    ]);
  }

  function detected() {
    const d = [];
    if (typeof window.kasware !== "undefined") d.push("kasware");
    if (typeof window.kastle !== "undefined") d.push("kastle");
    return d;
  }

  function persist(id, address) {
    try {
      sessionStorage.setItem(KEY_ADDR, address);
      sessionStorage.setItem(KEY_WALLET, id);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("kaspa-wallet", { detail: { id: id, address: address } }));
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(KEY_ADDR);
      sessionStorage.removeItem(KEY_WALLET);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent("kaspa-wallet", { detail: { id: "", address: "" } }));
  }

  function current() {
    try {
      return {
        id: sessionStorage.getItem(KEY_WALLET) || "",
        address: sessionStorage.getItem(KEY_ADDR) || "",
      };
    } catch (_) {
      return { id: "", address: "" };
    }
  }

  function shortAddr(a) {
    if (!a) return "";
    if (a.length <= 22) return a;
    return a.slice(0, 12) + "…" + a.slice(-8);
  }

  async function kaswareAccountsQuiet() {
    const w = window.kasware;
    if (!w || typeof w.getAccounts !== "function") return [];
    try {
      const acc = await withTimeout(w.getAccounts(), 2500, "getAccounts timeout");
      return acc && acc.length ? acc : [];
    } catch (_) {
      return [];
    }
  }

  async function connectKasware() {
    let w = window.kasware;
    if (!w) {
      for (let i = 0; i < 10 && !w; i++) {
        await sleep(100 * (i + 1));
        w = window.kasware;
      }
    }
    if (!w) {
      window.open("https://www.kasware.xyz", "_blank", "noopener");
      throw new Error("Kasware is not in this tab. Install the extension, unlock it, then connect.");
    }
    const quiet = await kaswareAccountsQuiet();
    if (quiet[0]) return { id: "kasware", address: quiet[0] };
    const acc = await withTimeout(w.requestAccounts(), 45000, "Kasware connect timed out");
    if (!acc || !acc[0]) throw new Error("Kasware returned no account.");
    return { id: "kasware", address: acc[0] };
  }

  async function connectKastle() {
    const w = window.kastle;
    if (!w || typeof w.connect !== "function") {
      window.open("https://kastle.cc", "_blank", "noopener");
      throw new Error("Kastle is not installed.");
    }
    const ok = await withTimeout(w.connect(), 45000, "Kastle connect timed out.");
    if (!ok) throw new Error("Kastle connect was declined.");
    const acc = await w.getAccount();
    const address = acc && (acc.address || acc);
    if (!address) throw new Error("Kastle returned no account.");
    return { id: "kastle", address: String(address) };
  }

  async function connect(id) {
    let r;
    if (id === "kasware") r = await connectKasware();
    else if (id === "kastle") r = await connectKastle();
    else throw new Error("This wallet has no in-page provider.");
    persist(r.id, r.address);
    return r;
  }

  async function logout() {
    const c = current();
    try {
      if (c.id === "kasware" && window.kasware && window.kasware.disconnect) {
        await window.kasware.disconnect(location.origin);
      }
    } catch (_) {}
    try {
      if (c.id === "kastle" && window.kastle && window.kastle.disconnect) {
        await window.kastle.disconnect();
      }
    } catch (_) {}
    clearSession();
  }

  async function walletNetwork(id) {
    try {
      if (id === "kasware" && window.kasware && window.kasware.getNetwork) return await window.kasware.getNetwork();
      if (id === "kastle" && window.kastle && window.kastle.getNetwork) return await window.kastle.getNetwork();
    } catch (_) {}
    return "mainnet";
  }

  function sompiFromBalance(b) {
    if (b == null) return 0;
    if (typeof b === "number") return b;
    if (typeof b === "string") return Number(b) || 0;
    return Number(b.total || b.confirmed || b.balance || b.amount || 0) || 0;
  }

  async function getBalance(id) {
    const which = id || current().id;
    try {
      if (which === "kasware" && window.kasware && typeof window.kasware.getBalance === "function") {
        return sompiFromBalance(await window.kasware.getBalance());
      }
      if (window.kastle && typeof window.kastle.getBalance === "function") {
        return sompiFromBalance(await window.kastle.getBalance());
      }
    } catch (_) {}
    return 0;
  }

  function parseTxid(raw) {
    if (!raw) return "";
    if (typeof raw === "object") return raw.id || raw.transactionId || raw.txid || "";
    const s = String(raw).trim();
    try {
      const j = JSON.parse(s);
      return j.id || j.transactionId || j.txid || s;
    } catch (_) {
      return s;
    }
  }

  async function sendKaspa(to, sompi, opts) {
    opts = opts || { priorityFee: 10000 };
    const order = [];
    if (window.kasware && typeof window.kasware.sendKaspa === "function") order.push(window.kasware);
    if (window.kastle && typeof window.kastle.sendKaspa === "function") order.push(window.kastle);
    let last = null;
    for (let i = 0; i < order.length; i++) {
      try {
        return parseTxid(await order[i].sendKaspa(to, sompi, opts));
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error("No in-page wallet. Open the kaspa: link, scan the QR, or paste a txid.");
  }

  function preferredWallet() {
    const d = detected();
    if (d.indexOf("kasware") !== -1) return "kasware";
    if (d.indexOf("kastle") !== -1) return "kastle";
    return "";
  }

  function paintButtons() {
    const c = current();
    document.querySelectorAll("[data-wallet-connect]").forEach(function (btn) {
      if (c.address) {
        btn.textContent = "Logged in";
        btn.title = c.address;
        btn.dataset.connected = c.id;
      } else {
        btn.textContent = btn.getAttribute("data-idle-label") || "Log in";
        btn.removeAttribute("title");
        delete btn.dataset.connected;
      }
    });
    document.querySelectorAll("[data-wallet-addr]").forEach(function (el) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.value = c.address || "";
      else el.textContent = c.address || "";
    });
    document.querySelectorAll("[data-wallet-logout]").forEach(function (btn) {
      btn.hidden = !c.address;
    });
  }

  async function resume() {
    const quiet = await kaswareAccountsQuiet();
    if (quiet[0]) persist("kasware", quiet[0]);
    paintButtons();
    return current();
  }

  if (window.kasware && typeof window.kasware.on === "function") {
    window.kasware.on("accountsChanged", function (accounts) {
      if (!accounts || !accounts[0]) {
        clearSession();
        paintButtons();
        return;
      }
      persist("kasware", String(accounts[0]));
      paintButtons();
    });
  }

  const api = {
    connect: connect,
    logout: logout,
    current: current,
    detected: detected,
    persist: persist,
    paintButtons: paintButtons,
    sendKaspa: sendKaspa,
    getBalance: getBalance,
    walletNetwork: walletNetwork,
    preferredWallet: preferredWallet,
    resume: resume,
    shortAddr: shortAddr,
    parseTxid: parseTxid,
    withTimeout: withTimeout,
  };

  root.KaspaWallets = api;
})(typeof window !== "undefined" ? window : globalThis);
