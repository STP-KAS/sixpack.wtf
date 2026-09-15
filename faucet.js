(function () {
  const form = document.getElementById("form");
  const out = document.getElementById("out");
  const go = document.getElementById("go");
  const statusEl = document.getElementById("api-status");

  function say(t, bad) {
    if (!out) return;
    out.textContent = t;
    out.style.fontWeight = bad ? "600" : "";
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
    const list = [""];
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      if (location.port !== "4020") list.push("http://127.0.0.1:4020");
      if (location.port !== "4021") list.push("http://127.0.0.1:4021");
    }
    return list;
  }

  async function probe() {
    for (const base of bases()) {
      try {
        const res = await fetch(base + "/api/faucet", { method: "GET" });
        const j = await readJson(res);
        if (!j.html && j.network === "testnet-10") {
          return { base: base, j: j };
        }
      } catch (_) {}
    }
    return null;
  }

  let apiBase = "";

  probe().then(function (found) {
    if (found) {
      apiBase = found.base;
      const where = found.base || location.origin;
      if (statusEl) statusEl.textContent = "API live · " + where + " · " + found.j.dripTkas + " tKAS / click · cap " + found.j.capTkas + " / 48h";
      say("Ready. kaspatest: only. Pays from groks-wallet.");
      if (go) go.disabled = false;
      return;
    }
    if (go) go.disabled = true;
    const local = "http://127.0.0.1:4020/faucet.html";
    const msg =
      location.protocol === "https:"
        ? "You are on the static GitHub copy. HTTPS cannot reach the desk API. Open " + local + " after: node serve.mjs"
        : "No faucet API on this port. In the sixpack.wtf folder run: node serve.mjs   then open " + local;
    if (statusEl) statusEl.textContent = msg;
    say(msg, true);
  });

  if (!form) return;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const address = document.getElementById("addr").value.trim();
    go.disabled = true;
    say("Sending…");
    fetch(apiBase + "/api/faucet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: address }),
    })
      .then(readJson)
      .then(function (j) {
        if (j.html) {
          say("Got an HTML page instead of the faucet API. Use http://127.0.0.1:4020/faucet.html with node serve.mjs running.", true);
          return;
        }
        if (!j.ok) {
          say(j.error || j.message || "Request failed.", true);
          return;
        }
        const tx = (j.txids || []).join(" ");
        const link = (j.explorer && j.explorer[0]) || "";
        say(
          "Sent " +
            (j.tkas || "") +
            " tKAS. " +
            (tx ? "txid " + tx + (link ? " · " + link : "") : "") +
            " Remaining in 48h: " +
            (j.remainingTkas || "") +
            " tKAS."
        );
      })
      .catch(function (err) {
        say("Could not reach the faucet API. Run node serve.mjs in sixpack.wtf, then open http://127.0.0.1:4020/faucet.html", true);
        console.error(err);
      })
      .finally(function () {
        go.disabled = false;
      });
  });
})();
