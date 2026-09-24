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
  let capTkas = "10000";
  loadPublicBalance();

  probe().then(function (found) {
    if (found && found.j) {
      apiBase = found.base;
      const hours = found.j.windowHours || 24;
      if (found.j.capTkas) capTkas = String(found.j.capTkas);
      const amountInput = document.getElementById("amount");
      if (amountInput && found.j.dripTkas) amountInput.value = String(found.j.dripTkas);
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
          if (j.code === "POOL") return;
          if (j.error || j.html) {
            if (availEl) availEl.textContent = String(j.error || "This address cannot be paid.");
            return;
          }
          const left = j.remainingAddrTkas || j.remainingTkas;
          if (availEl && left != null && left !== "") {
            availEl.textContent =
              left === "unlimited"
                ? "This address has unlimited tKAS from this IP."
                : "This address has " + left + " tKAS still eligible in 24h (cap " + capTkas + ").";
          }
        })
        .catch(function () {});
    });
  }

  const SEND_STEPS = [
    "Checking the address",
    "Connecting to Testnet-10",
    "Gathering coins",
    "Signing the send",
    "Broadcasting",
  ];
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function loadingHtml(amount, address, step) {
    const at = SEND_STEPS.indexOf(step);
    const items = SEND_STEPS.map(function (name, i) {
      const cls = at < 0 ? "" : i < at ? "done" : i === at ? "on" : "";
      return "<li class=\"" + cls + "\">" + name + "</li>";
    }).join("");
    return (
      "<p class=\"fload\"><span class=\"fspin\" aria-hidden=\"true\"></span>Loading the payout.</p>" +
      "<p>Sending <strong>" +
      esc(amount || "10000") +
      " tKAS</strong> to</p><p><code>" +
      esc(address) +
      "</code></p>" +
      "<ol class=\"fsteps\">" +
      items +
      "</ol>" +
      "<p class=\"fnote\">Leave this tab open. The transaction id shows here when Testnet-10 accepts it.</p>"
    );
  }
  function successHtml(j, address) {
    const addr = j.address || address;
    const ids = j.txids || [];
    const first = ids[0] ? "<p>TXID: <code>" + esc(ids[0]) + "</code></p>" : "";
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
        : "<p>Eligible remaining for this address in 24h: <strong>" + esc(left) + " tKAS</strong>.</p>";
    return (
      "<p>We have successfully sent <strong>" +
      esc(j.tkas || "") +
      " tKAS</strong> to the requested address:</p><p><code>" +
      esc(addr) +
      "</code></p>" +
      first +
      extra +
      leftLine
    );
  }
  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }
  function poolPopup(j) {
    var hours = Number(j && j.restHours);
    if (!isFinite(hours) || hours < 1) {
      var ms = Number(j && j.retryAfterMs);
      hours = isFinite(ms) && ms > 0 ? Math.ceil(ms / 3600000) : 1;
    }
    hours = Math.max(1, Math.round(hours));
    var unit = hours === 1 ? "hour" : "hours";
    popup(
      "error",
      "Pay out limit",
      "<p>Bot detected (not you).</p>" +
        "<p>Faucet reached pay out limit.</p>" +
        "<p>Rest for <strong>" + hours + "</strong> " + unit + ".</p>"
    );
  }
  function showResult(j, address) {
    if (j && (j.status === "done" || (j.ok && j.txids && j.txids.length))) {
      popup("success", "Success", successHtml(j, address));
      loadPublicBalance();
      return true;
    }
    if (j && j.code === "POOL") {
      poolPopup(j);
      return true;
    }
    if (j && j.status === "error") {
      popup("error", "Error", "<p>" + esc(j.error || "Unable to send funds.") + "</p>");
      return true;
    }
    return false;
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
    const amount = document.getElementById("amount") ? document.getElementById("amount").value.trim() : "10000";
    go.disabled = true;
    popup("wait", "Loading", loadingHtml(amount, address, "Checking the address"));
    fetch(apiBase + "/api/faucet", {
      method: "POST",
      headers: { "content-type": "application/json", "Bypass-Tunnel-Reminder": "true" },
      body: JSON.stringify({ address: address, amount: amount }),
    })
      .then(readJson)
      .then(async function (j) {
        if (j.html) {
          popup("error", "Error", "<p>" + downHtml() + "</p>");
          return;
        }
        if (j.pending && j.job) {
          const started = Date.now();
          let misses = 0;
          while (Date.now() - started < 180000) {
            await sleep(1200);
            let cur = null;
            try {
              const res = await fetch(apiBase + "/api/faucet?job=" + encodeURIComponent(j.job), { headers: hdr() });
              cur = await readJson(res);
            } catch (_) {
              misses += 1;
              if (misses >= 4) {
                popup("error", "Error", "<p>Loading paused. The payout API stopped answering. Stay on this page and refresh.</p>");
                return;
              }
              popup("wait", "Loading", loadingHtml(amount, address, j.step || "Checking the address") + "<p class=\"fnote\">Still loading. Checking the payout again.</p>");
              continue;
            }
            if (cur && cur.html) {
              misses += 1;
              continue;
            }
            misses = 0;
            if (showResult(cur, address)) return;
            const step = (cur && cur.step) || j.step || "Checking the address";
            popup("wait", "Loading", loadingHtml(amount, address, step));
          }
          popup("error", "Error", "<p>Still loading after three minutes. The send may still finish. Refresh this page in a moment and check the address.</p>");
          return;
        }
        if (showResult(j, address)) return;
        if (!j.ok) {
          if (j.code === "POOL") {
            poolPopup(j);
            return;
          }
          popup("error", "Error", "<p>" + esc(j.error || j.message || "Unable to send funds.") + "</p>");
          return;
        }
        popup("success", "Success", successHtml(j, address));
        loadPublicBalance();
      })
      .catch(function (err) {
        popup("error", "Error", "<p>Loading failed. The payout API did not answer. Stay on this page and refresh.</p>");
        console.error(err);
      })
      .finally(function () {
        go.disabled = false;
      });
  });
})();
