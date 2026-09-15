(function () {
  var amount = 0;
  var raw = "";
  var tipPct = 0;
  var kasUsd = null;

  document.querySelectorAll('nav[aria-label="Till"] button').forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll('nav[aria-label="Till"] button').forEach(function (b) {
        b.classList.toggle("on", b === btn);
      });
      var pane = btn.getAttribute("data-pane");
      document.getElementById("pane-original").classList.toggle("hide", pane !== "original");
      document.getElementById("pane-new").classList.toggle("hide", pane !== "new");
    };
  });

  function money(n) {
    return n.toFixed(2);
  }
  function total() {
    var tip = amount * tipPct / 100;
    return { base: amount, tip: tip, all: amount + tip };
  }
  function paint() {
    var t = total();
    document.getElementById("display").innerHTML = money(t.all) + " <small>EUR</small>";
    var btn = document.getElementById("charge-btn");
    btn.textContent = "Charge " + money(t.all) + " EUR in KAS";
    btn.disabled = t.base <= 0;
  }

  document.getElementById("keypad").addEventListener("click", function (e) {
    var k = e.target.getAttribute("data-k");
    if (!k) return;
    if (k === "c") { raw = ""; amount = 0; }
    else if (k === "." && raw.indexOf(".") >= 0) return;
    else {
      if (raw.indexOf(".") >= 0 && raw.split(".")[1].length >= 2) return;
      raw += k;
      amount = parseFloat(raw) || 0;
    }
    paint();
  });

  document.querySelector(".tips").addEventListener("click", function (e) {
    var t = e.target.getAttribute("data-tip");
    if (t == null) return;
    tipPct = parseInt(t, 10);
    document.querySelectorAll(".tips button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-tip") === t);
    });
    paint();
  });

  fetch("https://api.kaspa.org/info/price")
    .then(function (r) { return r.json(); })
    .then(function (j) {
      kasUsd = Number(j.price);
      var el = document.getElementById("rate");
      if (kasUsd) el.textContent = "KAS $" + kasUsd.toFixed(4) + " · 10 selected-chain conf · 10 BPS · not finality";
    })
    .catch(function () {});

  document.getElementById("charge-btn").onclick = function () {
    var t = total();
    if (t.base <= 0) return;
    var id = "inv_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
    var kas = kasUsd ? (t.all / kasUsd) : null;
    var sompi = kas ? Math.round(kas * 1e8) : null;
    var payTo = "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";
    var uri = payTo + "?message=" + encodeURIComponent(id) + (sompi ? "&amount=" + (sompi / 1e8) : "");
    var ticket = document.getElementById("ticket");
    ticket.classList.remove("hide");
    ticket.innerHTML =
      "<p><strong>Invoice</strong> <code>" + id + "</code></p>" +
      "<p>Quote " + money(t.all) + " EUR. Settlement rail: <strong>KAS only</strong>. kUSD off. USDT off.</p>" +
      (sompi ? "<p>~" + sompi + " sompi at the quoted rate. Rate is not a peg.</p>" : "") +
      "<p>Pay with a wallet that copies URI <code>message</code> into the tx payload. Claim without that payload is refused.</p>" +
      "<p><code>" + uri + "</code></p>" +
      "<p class=\"meta\">This process does not hold keys. This is not x402. Machine-payable calls bind <a href=\"https://github.com/STP-KAS/kaspa-x402\">STP-KAS/kaspa-x402</a>.</p>";
  };

  paint();

  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "ishum-pos-height") return;
    var f = document.querySelector("iframe.pos");
    if (!f) return;
    var h = Number(e.data.height);
    if (h > 400) f.style.height = h + "px";
  });

  var original = "http://127.0.0.1:8090/pos";
  fetch(original, { mode: "no-cors" }).catch(function () {});
  fetch(original)
    .then(function (r) {
      document.getElementById("probe").textContent = r.ok
        ? "Original till is up at " + original + " (HTTP " + r.status + ")."
        : "Original till probe HTTP " + r.status + ".";
      return r.text();
    })
    .then(function (html) {
      if (!html) return;
      var x402 = /PAYMENT-|x402Version|x402/i.test(html);
      document.getElementById("o-x402").textContent = x402 ? "fail — 402 language on POS" : "pass — no PAYMENT-* on POS";
      document.getElementById("o-kas").textContent = /EUR/.test(html) ? "pass — quotes EUR" : "see source";
    })
    .catch(function () {
      document.getElementById("probe").textContent =
        "Could not fetch " + original + " from this origin. Open the original tab on this machine. Scores below still use the Ishum source review.";
      document.getElementById("o-x402").textContent = "pass (source: zero x402 hits)";
      document.getElementById("o-kas").textContent = "pass — quotes EUR, live rail KAS";
    });
})();
