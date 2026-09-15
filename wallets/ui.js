/**
 * Top-right Log in. Kasware / Kastle only after a click.
 * Never requestAccounts on page load. Never a seed field.
 */
(function () {
  function safetyHref() {
    const s = document.currentScript && document.currentScript.src;
    if (s) return s.replace(/wallets\/ui\.js(\?.*)?$/, "safety.html");
    if (location.pathname.indexOf("/original-pos") !== -1) return "../safety.html";
    return "safety.html";
  }

  function shortAddr(a) {
    if (!a) return "";
    if (a.length <= 22) return a;
    return a.slice(0, 10) + "…" + a.slice(-6);
  }

  function status(msg, bad) {
    const el = document.getElementById("wallet-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("bad", !!bad);
  }

  function paint() {
    const KW = window.KaspaWallets;
    const c = KW && KW.current ? KW.current() : { id: "", address: "" };
    const login = document.querySelector("[data-wallet-connect]");
    const out = document.querySelector("[data-wallet-logout]");
    const who = document.querySelector("[data-wallet-who]");
    if (login) {
      if (c.address) {
        login.textContent = shortAddr(c.address);
        login.title = (c.id || "wallet") + " · " + c.address;
        login.dataset.connected = c.id;
      } else {
        login.textContent = login.getAttribute("data-idle-label") || "Log in";
        login.removeAttribute("title");
        delete login.dataset.connected;
      }
    }
    if (out) out.hidden = !c.address;
    if (who) who.textContent = c.address || "";
  }

  function closeModal() {
    const m = document.getElementById("walletModal");
    if (m) m.hidden = true;
  }

  function openModal() {
    const m = document.getElementById("walletModal");
    if (m) {
      m.hidden = false;
      status("Kasware or Kastle will ask this origin for permission. Decline is fine.");
    }
  }

  async function pick(id) {
    const KW = window.KaspaWallets;
    if (!KW) {
      status("Wallet kit not loaded.", true);
      return;
    }
    status("Waiting for the wallet popup…");
    try {
      const r = await KW.connect(id);
      status("Connected " + shortAddr(r.address));
      paint();
      closeModal();
    } catch (err) {
      status((err && err.message) || String(err), true);
    }
  }

  function ensureChrome() {
    let slot = document.querySelector(".wallet-slot");
    const top = document.querySelector("header.top") || document.querySelector("header");
    if (!slot && top) {
      slot = document.createElement("div");
      slot.className = "wallet-slot";
      slot.innerHTML =
        '<button type="button" class="wallet-login" data-wallet-connect data-idle-label="Log in">Log in</button>' +
        '<button type="button" class="wallet-out" data-wallet-logout hidden>Log out</button>';
      top.appendChild(slot);
    }
    if (document.getElementById("walletModal")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML =
      '<div id="walletModal" class="wmodal" hidden>' +
      '<div class="wmodal-card" role="dialog" aria-labelledby="wallet-title">' +
      '<div class="wmodal-head"><strong id="wallet-title">Connect a wallet</strong>' +
      '<button type="button" class="wallet-x" data-wallet-close>Close</button></div>' +
      '<p class="wmodal-lead">This site never asks for a seed, a private key, or a password. If anything on this page does, close the tab.</p>' +
      '<p class="wmodal-lead">Clicking Kasware or Kastle opens <em>their</em> permission popup (usually top-right). You can decline.</p>' +
      '<div class="wmodal-row">' +
      '<button type="button" class="wallet-go" data-wallet-id="kasware">Kasware</button>' +
      '<button type="button" class="wallet-go" data-wallet-id="kastle">Kastle</button>' +
      '<a class="wallet-x" href="https://www.kasware.xyz" target="_blank" rel="noopener">Install Kasware</a>' +
      "</div>" +
      '<p class="wmodal-lead">Other wallets (Kaspium, Tangem, Ledger/KasVault, Kaspa NG): scan the payment QR or open the <code>kaspa:</code> URI. No fake inject.</p>' +
      '<p id="wallet-status" class="wmodal-status"></p>' +
      '<p class="wmodal-lead"><a href="' + safetyHref() + '">Safety</a></p>' +
      "</div></div>";
    document.body.appendChild(wrap.firstElementChild);
  }

  function bind() {
    ensureChrome();
    paint();
    document.addEventListener("click", function (e) {
      const login = e.target.closest("[data-wallet-connect]");
      if (login) {
        e.preventDefault();
        const KW = window.KaspaWallets;
        if (KW && KW.current && KW.current().address) return;
        openModal();
        return;
      }
      if (e.target.closest("[data-wallet-close]")) {
        closeModal();
        return;
      }
      const out = e.target.closest("[data-wallet-logout]");
      if (out) {
        e.preventDefault();
        const KW = window.KaspaWallets;
        if (KW && KW.logout) {
          KW.logout().then(paint).catch(function (err) {
            status((err && err.message) || String(err), true);
          });
        }
        return;
      }
      const pickBtn = e.target.closest("[data-wallet-id]");
      if (pickBtn) {
        e.preventDefault();
        pick(pickBtn.getAttribute("data-wallet-id"));
        return;
      }
      if (e.target.id === "walletModal") closeModal();
    });
    window.addEventListener("kaspa-wallet", paint);
  }

  window.SixpackWallet = {
    open: function () {
      ensureChrome();
      openModal();
    },
    paint: paint,
    close: closeModal,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
