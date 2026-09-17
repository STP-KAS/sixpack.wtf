(function () {
  const form = document.getElementById("form");
  const out = document.getElementById("out");
  const go = document.getElementById("go");
  const statusEl = document.getElementById("api-status");
  const balEl = document.getElementById("faucet-balance");
  const txsEl = document.getElementById("faucet-txs");
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
    if (txsEl && j.recent && j.recent.length) {
      txsEl.innerHTML =
        "<table><thead><tr><th>txid</th></tr></thead><tbody>" +
        j.recent
          .map(function (row) {
            return '<tr><td><a href="' + row.explorer + '">' + row.txid + "</a></td></tr>";
          })
          .join("") +
        "</tbody></table>";
    }
  }
  function loadPublicBalance() {
    fetch("https://api-tn10.kaspa.org/addresses/" + encodeURIComponent(FROM) + "/balance", {
      headers: { Accept: "application/json" },
    })
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

  async function probe() {
    for (const base of bases()) {
      try {
        const res = await fetch(base + "/api/faucet", { method: "GET" });
        const j = await readJson(res);
        if (!j.html && j.network === "testnet-10") return { base: base, j: j };
      } catch (_) {}
    }
    return null;
  }

  let apiBase = "";
  loadPublicBalance();

  if (location.protocol === "file:") {
    say("You opened a local file. Use https://sixpack.wtf/faucet.html — file:// cannot reach the payout API.", true);
  }

  probe().then(function (found) {
    if (found) {
      apiBase = found.base;
      const hours = found.j.windowHours || 24;
      if (statusEl) {
        statusEl.textContent =
          "API live · " +
          (found.base || location.origin) +
          " · " +
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
    if (go) go.disabled = true;
    const msg =
      location.protocol === "file:"
        ? "file:// cannot pay. Open https://sixpack.wtf/faucet.html"
        : "Payout API is down (desk tunnel offline). Balance above is live from api-tn10. Kaspatest address still holds tKAS. Restart the Grok bot tunnel to pay out.";
    if (statusEl) statusEl.textContent = msg;
    if (availEl) availEl.textContent = "Cannot pay out until the desk tunnel is back.";
    say(msg, true);
  });

  const addrInput = document.getElementById("addr");
  if (addrInput) {
    addrInput.addEventListener("change", function () {
      const address = addrInput.value.trim();
      if (!apiBase || address.indexOf("kaspatest:") !== 0) return;
      fetch(apiBase + "/api/faucet?address=" + encodeURIComponent(address))
        .then(readJson)
        .then(function (j) {
          const left = j.remainingAddrTkas || j.remainingTkas;
          if (availEl && left != null && left !== "") {
            availEl.textContent = "This address has " + left + " tKAS still eligible in 24h (cap 30,000).";
          }
          if (j.error && availEl)
            availEl.textContent =
              j.error + (j.remainingAddrTkas ? " Address remaining: " + j.remainingAddrTkas + " tKAS." : "");
        })
        .catch(function () {});
    });
  }

  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!apiBase) {
      say("Payout API is down. Cannot send until the desk tunnel is back.", true);
      return;
    }
    const address = document.getElementById("addr").value.trim();
    const amount = document.getElementById("amount") ? document.getElementById("amount").value.trim() : "10000";
    go.disabled = true;
    say("Sending…");
    fetch(apiBase + "/api/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: address, amount: amount }),
    })
      .then(readJson)
      .then(function (j) {
        if (j.html) {
          say("Got HTML instead of the faucet API. Tunnel is down or blocked on this phone.", true);
          return;
        }
        if (!j.ok) {
          say(j.error || j.message || "Request failed.", true);
          return;
        }
        const addr = j.address || address;
        const addrUrl = j.addressExplorer || "https://tn10.kaspa.stream/addresses/" + encodeURIComponent(addr);
        const links = (j.explorer || [])
          .map(function (u, i) {
            const id = (j.txids && j.txids[i]) || u.split("/").pop();
            return '<li><a href="' + u + '">' + id + "</a></li>";
          })
          .join("");
        const left = j.remainingAddrTkas || j.remainingTkas || "0";
        sayHtml(
          "<strong>Sent " +
            (j.tkas || "") +
            " tKAS.</strong> Testnet-10.<br>" +
            'Address: <a href="' +
            addrUrl +
            '">' +
            addr +
            "</a><br>" +
            (links ? "Transactions:<ul>" + links + "</ul>" : "") +
            "Eligible remaining for this address in 24h: <strong>" +
            left +
            " tKAS</strong> (cap 30,000 / 24h, 10,000 per submit)."
        );
        loadPublicBalance();
      })
      .catch(function (err) {
        say("Could not reach the payout API from this phone.", true);
        console.error(err);
      })
      .finally(function () {
        go.disabled = false;
      });
  });
})();
