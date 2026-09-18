(function () {
  const form = document.getElementById("form");
  const out = document.getElementById("out");
  const go = document.getElementById("go");
  const statusEl = document.getElementById("api-status");
  const balEl = document.getElementById("faucet-balance");
  const availEl = document.getElementById("available");
  const fromEl = document.getElementById("from-addr");
  const FROM =
    window.FAUCET_FROM ||
    "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";

  function say(t, bad) {
    if (!out) return;
    out.textContent = t;
    out.style.fontWeight = bad ? "600" : "";
  }
  function sayHtml(html) {
    if (!out) return;
    out.style.fontWeight = "";
    out.innerHTML = html;
  }

  const modal = document.getElementById("faucet-modal");
  const modalTitle = document.getElementById("fmodal-title");
  const modalBody = document.getElementById("fmodal-body");
  const modalClose = document.getElementById("fmodal-close");
  const modalX = document.getElementById("fmodal-x");
  function hideModal() {
    if (modal) modal.hidden = true;
  }
  function popup(kind, title, html) {
    if (!modal || !modalTitle || !modalBody) {
      if (kind === "error") say(String(html).replace(/<[^>]+>/g, " "), true);
      else sayHtml(html);
      return;
    }
    modalTitle.textContent = title;
    modalTitle.className = "fmodal-title " + (kind === "error" ? "err" : kind === "success" ? "ok" : "wait");
    modalBody.innerHTML = html;
    modal.hidden = false;
  }
  if (modalClose) modalClose.addEventListener("click", hideModal);
  if (modalX) modalX.addEventListener("click", hideModal);
  if (modal) {
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) hideModal();
    });
  }
  function hdr() {
    return { "Bypass-Tunnel-Reminder": "true", Accept: "application/json" };
  }
  async function readJson(res) {
    const text = await res.text();
    const trimmed = (text || "").trim();
    if (!trimmed || trimmed.charAt(0) === "<") {
      return { html: true, status: res.status, ok: false };
    }
    try {
      const j = JSON.parse(trimmed);
      j.status = res.status;
      j.ok = res.ok;
      return j;
    } catch (err) {
      return { html: true, status: res.status, ok: false, parseError: String(err) };
    }
  }
  function bases() {
    const extra = window.FAUCET_API ? [String(window.FAUCET_API).replace(/\/$/, "")] : [];
    const list = extra.concat([""]);
    if (location.protocol === "file:") list.push("http://127.0.0.1:4020");
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      if (location.port !== "4020") list.push("http://127.0.0.1:4020");
    }
    return list;
  }
  function tkas(sompi) {
    const n = Number(sompi);
    if (!isFinite(n)) return "";
    return (n / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function paintStats(j) {
    if (fromEl && j.from) fromEl.textContent = j.from;
    if (balEl && j.faucetBalanceTkas) balEl.textContent = j.faucetBalanceTkas + " tKAS";
  }
  function loadPublicBalance() {
    fetch("https://api-tn10.kaspa.org/addresses/" + encodeURIComponent(FROM) + "/balance")
      .then(readJson)
      .then(function (j) {
        if (j.balance != null && balEl) balEl.textContent = tkas(j.balance) + " tKAS";
      })
      .catch(function () {});
  }
  function copyText(text) {
    text = String(text || "").trim();
    if (!text) return;
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (_) {}
      document.body.removeChild(ta);
      say("Copied.");
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        say("Copied.");
      }, fallback);
    } else fallback();
  }
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      var sel = btn.getAttribute("data-copy");
      var el = sel ? document.querySelector(sel) : null;
      copyText(el ? el.textContent : "");
    });
  });
  function downHtml() {
    return "Payout API is not answering from this page. Stay on https://sixpack.wtf/faucet.html — do not open the tunnel URL (that is a black error page). Refresh this tab after the desk tunnel is up.";
  }

  async function probe() {
    let sawHtml = false;
    for (const base of bases()) {
      try {
        const res = await fetch(base + "/api/faucet", { method: "GET", headers: hdr() });
        const j = await readJson(res);
        if (!j.html && j.network === "testnet-10") return { base: base, j: j };
        if (j.html) sawHtml = true;
      } catch (_) {}
    }
    return { base: "", j: null, sawHtml: sawHtml };
  }

  let apiBase = "";
  loadPublicBalance();

  probe().then(function (found) {
    if (found && found.j) {
      apiBase = found.base;
      const hours = found.j.windowHours || 24;
      if (statusEl) {
        statusEl.textContent =
          "API live · " +
          found.j.dripTkas +
          " tKAS / click · cap " +
          found.j.capTkas +
          " / " +
          hours +
          "h · not kaspanet";
      }
      paintStats(found.j);
      if (availEl) {
        availEl.textContent =
          "You can request up to " + found.j.dripTkas + " tKAS now, " + found.j.capTkas + " per 24h.";
      }
      say("Ready. Paste kaspatest: and Submit. Not kaspanet.");
      if (go) go.disabled = false;
      return;
    }
    if (go) go.disabled = false;
    if (found && found.sawHtml) {
      if (statusEl) statusEl.textContent = "Tunnel warning page (common on iPhone).";
      if (availEl) availEl.textContent = "Open the tunnel once, then refresh this page.";
      sayHtml(downHtml());
      return;
    }
    const msg = "Payout API is down. Balance above is live from api-tn10. Restart the Grok bot tunnel to pay out.";
    if (statusEl) statusEl.textContent = msg;
    if (availEl) availEl.textContent = "Cannot pay out until the desk tunnel is back.";
    say(msg, true);
  });

  const addrInput = document.getElementById("addr");
  if (addrInput) {
    addrInput.addEventListener("change", function () {
      const address = addrInput.value.trim();
      if (!apiBase || address.indexOf("kaspatest:") !== 0) return;
      fetch(apiBase + "/api/faucet?address=" + encodeURIComponent(address), { headers: hdr() })
        .then(readJson)
        .then(function (j) {
          const left = j.remainingAddrTkas || j.remainingTkas;
          if (availEl && left != null && left !== "") {
            availEl.textContent =
              left === "unlimited"
                ? "This address has unlimited tKAS from this IP."
                : "This address has " + left + " tKAS still eligible in 24h (cap 30,000).";
          }
        })
        .catch(function () {});
    });
  }

  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!apiBase) {
      popup("error", "Error", "<p>Payout API is not reachable. Stay on this page and refresh. Do not open a tunnel link.</p>");
      go.disabled = false;
      return;
    }
    const address = document.getElementById("addr").value.trim();
    const amount = document.getElementById("amount") ? document.getElementById("amount").value.trim() : "30000";
    go.disabled = true;
    popup("wait", "Sending", "<p>Sending funds. This can take a minute. Leave this tab open.</p>");
    fetch(apiBase + "/api/faucet", {
      method: "POST",
      headers: { "content-type": "application/json", "Bypass-Tunnel-Reminder": "true" },
      body: JSON.stringify({ address: address, amount: amount }),
    })
      .then(readJson)
      .then(function (j) {
        if (j.html) {
          popup("error", "Error", "<p>" + downHtml() + "</p>");
          return;
        }
        if (!j.ok) {
          const msg = String(j.error || j.message || "Unable to send funds.")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          popup("error", "Error", "<p>" + msg + "</p>");
          return;
        }
        const addr = j.address || address;
        const ids = j.txids || [];
        const first = ids[0] ? "<p>TXID: <code>" + ids[0] + "</code></p>" : "";
        const extra =
          ids.length > 1
            ? "<p>" +
              ids.length +
              " transactions (dust UTXOs). KasWare may show <em>incoming transaction…</em> until they confirm. Not a failed send.</p>"
            : "";
        const left = j.remainingAddrTkas || j.remainingTkas || "0";
        const leftLine =
          left === "unlimited"
            ? "<p>Eligible remaining: <strong>unlimited</strong>.</p>"
            : "<p>Eligible remaining for this address in 24h: <strong>" + left + " tKAS</strong>.</p>";
        popup(
          "success",
          "Success",
          "<p>We have successfully sent <strong>" +
            (j.tkas || "") +
            " tKAS</strong> to the requested address:</p><p><code>" +
            addr +
            "</code></p>" +
            first +
            extra +
            leftLine
        );
        loadPublicBalance();
      })
      .catch(function (err) {
        popup("error", "Error", "<p>Could not reach the payout API. The tunnel is slow or down. Wait and try again.</p>");
        console.error(err);
      })
      .finally(function () {
        go.disabled = false;
      });
  });
})();
