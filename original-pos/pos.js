(function () {
  var GROKS = "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";
  var amount = 0;
  var raw = "";
  var tipPct = 0;
  var lines = [];
  var mode = "keypad";
  var ccy = "EUR";
  var kasUsd = 0;
  var eurUsd = 1.08;
  var payTo = GROKS;
  var railsOn = { kas: true, kusd: true, usdt: true };
  var chosen = "";
  var invoice = null;

  function money(n) {
    return n.toFixed(2);
  }
  function hexid(n) {
    var s = "";
    var bytes = new Uint8Array(n);
    (crypto.getRandomValues || function (a) {
      for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
      return a;
    })(bytes);
    for (var i = 0; i < bytes.length; i++) s += ("0" + bytes[i].toString(16)).slice(-2);
    return s;
  }
  function total() {
    var base = mode === "cart"
      ? lines.reduce(function (s, l) { return s + l.price * l.n; }, 0)
      : amount;
    return { base: base, tip: base * tipPct / 100, all: base * (1 + tipPct / 100) };
  }
  function reportHeight() {
    var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    try { parent.postMessage({ type: "ishum-pos-height", height: h }, "*"); } catch (_) {}
  }
  function isTestnet(addr) {
    return /^kaspatest:/i.test(addr || "");
  }
  function validAddr(addr) {
    var s = String(addr || "").trim();
    var p = isTestnet(s) ? "kaspatest:" : (s.indexOf("kaspa:") === 0 ? "kaspa:" : "");
    if (!p) return false;
    var body = s.slice(p.length);
    if (body.length < 50 || body.length > 80) return false;
    return /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(body);
  }
  function indexer(addr) {
    return isTestnet(addr) ? "https://api-tn10.kaspa.org" : "https://api.kaspa.org";
  }
  function explorerTx(addr, txid) {
    var host = isTestnet(addr) ? "https://explorer-tn10.kaspa.org" : "https://explorer.kaspa.org";
    return host + "/txs/" + txid;
  }
  function loadStore() {
    try {
      var saved = localStorage.getItem("ishum-payTo");
      if (saved && validAddr(saved)) payTo = saved;
      var r = JSON.parse(localStorage.getItem("ishum-rails") || "null");
      if (r && typeof r === "object") {
        railsOn.kas = r.kas !== false;
        railsOn.kusd = r.kusd !== false;
        railsOn.usdt = r.usdt !== false;
      }
    } catch (_) {}
    if (!validAddr(payTo)) payTo = GROKS;
  }
  function saveStore() {
    try {
      localStorage.setItem("ishum-payTo", payTo);
      localStorage.setItem("ishum-rails", JSON.stringify(railsOn));
    } catch (_) {}
  }
  function paintStore() {
    var inp = document.getElementById("store-payto");
    if (inp) inp.value = payTo;
    document.getElementById("en-kas").checked = railsOn.kas;
    document.getElementById("en-kusd").checked = railsOn.kusd;
    document.getElementById("en-usdt").checked = railsOn.usdt;
    document.getElementById("store-net").textContent = isTestnet(payTo)
      ? "TN10 groks-wallet path. Indexer: api-tn10.kaspa.org. tKAS has no value."
      : "Mainnet kaspa: address. Indexer: api.kaspa.org.";
  }
  function paintPayTo() {
    var ok = document.getElementById("payto-ok");
    var warn = document.getElementById("payto-warn");
    if (validAddr(payTo)) {
      warn.classList.add("hide");
      ok.classList.remove("hide");
      ok.textContent = (isTestnet(payTo) ? "TN10 · " : "mainnet · ") + payTo;
    } else {
      ok.classList.add("hide");
      warn.classList.remove("hide");
    }
  }
  function paint() {
    var t = total();
    var d = document.getElementById("display");
    if (d) d.innerHTML = money(t.all) + " <small>" + ccy + "</small>";
    document.getElementById("amount").value = money(t.base);
    document.getElementById("tip").value = money(t.tip);
    var names = mode === "cart"
      ? lines.map(function (l) { return l.n + " × " + l.title; }).join(", ")
      : "sale";
    document.getElementById("item").value = names || "sale";
    var btn = document.getElementById("charge-btn");
    btn.textContent = "Charge " + money(t.all) + " " + ccy;
    btn.disabled = t.base <= 0;
    var ul = document.getElementById("lines");
    if (ul) {
      ul.innerHTML = lines.map(function (l) {
        return "<li><span>" + l.n + " × " + l.title + "</span><strong>" + money(l.price * l.n) + "</strong></li>";
      }).join("");
    }
    paintPayTo();
    reportHeight();
  }
  function setMode(m) {
    mode = m;
    document.getElementById("keypad").classList.toggle("hide", m !== "keypad");
    document.getElementById("cart").classList.toggle("hide", m !== "cart");
    document.getElementById("mode-keypad").classList.toggle("on", m === "keypad");
    document.getElementById("mode-cart").classList.toggle("on", m === "cart");
    paint();
  }
  function showView(name) {
    document.getElementById("view-till").classList.toggle("hide", name !== "till");
    document.getElementById("view-pay").classList.toggle("hide", name !== "pay");
    document.getElementById("view-store").classList.toggle("hide", name !== "store");
    document.getElementById("nav-pos").classList.toggle("on", name !== "store");
    document.getElementById("nav-store").classList.toggle("on", name === "store");
    if (name === "store") paintStore();
    reportHeight();
  }
  function fiatToUsd(n) {
    return ccy === "EUR" ? n * eurUsd : n;
  }
  function fiatToSompi(n) {
    var usd = fiatToUsd(n);
    if (!kasUsd || usd <= 0) return 0;
    var sompi = Math.round(usd / kasUsd * 1e8);
    return sompi > 0 ? sompi : 1;
  }
  function fiatToMicro(n) {
    var usd = fiatToUsd(n);
    return usd > 0 ? Math.round(usd * 1e6) : 0;
  }
  function kasText(sompi) {
    var whole = Math.floor(sompi / 1e8);
    var frac = ("00000000" + (sompi % 1e8)).slice(-8);
    return whole + "." + frac;
  }
  function microText(micro) {
    var whole = Math.floor(micro / 1e6);
    var frac = ("000000" + (micro % 1e6)).slice(-6);
    return whole + "." + frac;
  }
  function kasUri(sompi, message) {
    if (!validAddr(payTo)) return "";
    var kas = kasText(sompi).replace(/0+$/, "").replace(/\.$/, "");
    return payTo + "?amount=" + kas + (message ? "&message=" + encodeURIComponent(message) : "");
  }
  function railHtml(r, on) {
    return '<a class="rail ' + (on ? "on " : "") + (r.guest ? "guest" : "") + '" href="#" data-rail="' + r.id + '">' +
      "<strong>" + r.name + "</strong><span>" + r.due + "</span><em>" + r.badge + "</em></a>";
  }
  function setStatus(st, extra) {
    invoice.status = st;
    var el = document.getElementById("inv-status");
    el.className = "status st-" + st;
    el.textContent = extra || st;
  }
  function receiptHtml() {
    var r = invoice.rails.filter(function (x) { return x.id === invoice.rail; })[0];
    return "<div class=\"bill\">" +
      "<p class=\"kicker\">Receipt</p>" +
      "<div class=\"display\">" + money(invoice.amount) + " <small>" + ccy + "</small></div>" +
      "<p class=\"status st-" + invoice.status + "\">" + invoice.status + "</p>" +
      "<dl class=\"layers\">" +
      "<dt>Invoice</dt><dd>" + invoice.id + "</dd>" +
      "<dt>Item</dt><dd>" + invoice.item + "</dd>" +
      "<dt>Quote</dt><dd>" + money(invoice.amount) + " " + ccy + "</dd>" +
      "<dt>Sequence</dt><dd>Kaspa L1" + (isTestnet(payTo) ? " · testnet-10" : "") + "</dd>" +
      "<dt>Settled</dt><dd>" + (r ? r.name + " · " + r.due + " · " + r.badge : "—") + "</dd>" +
      "<dt>Tx</dt><dd class=\"mono\">" + (invoice.txid || (invoice.demo ? "demo" : "—")) + "</dd>" +
      "</dl>" +
      (invoice.demo ? "<p class=\"note\">Demo settle. Not an L1 transfer of a stable.</p>" : "") +
      (r && r.freeze ? "<p class=\"warn\">Settled as a guest IOU. Tether can freeze. Not native Kaspa money.</p>" : "") +
      (invoice.txid ? "<p><a href=\"" + explorerTx(payTo, invoice.txid) + "\" target=\"_blank\" rel=\"noopener\">Open tx</a></p>" : "") +
      "</div>";
  }
  function pickRail(id) {
    chosen = id;
    invoice.rail = id;
    var r = invoice.rails.filter(function (x) { return x.id === id; })[0];
    document.getElementById("lay-settle").textContent = r ? (r.due + " · " + r.badge) : "pick a rail";
    document.getElementById("rails").innerHTML = invoice.rails.map(function (x) {
      return railHtml(x, x.id === id);
    }).join("");
    var box = document.getElementById("paybox");
    box.classList.remove("hide");
    if (invoice.status === "Settled") {
      box.innerHTML = receiptHtml();
      reportHeight();
      return;
    }
    var html = "";
    if (r && r.uri) {
      html += '<img class="qr" alt="payment QR" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(r.uri) + '">';
      html += '<a class="uri" href="' + r.uri + '">' + r.uri + "</a>";
    } else if (r) {
      html += '<p class="due">' + r.due + "</p>";
    }
    if (r) html += '<p class="note">' + r.note + "</p>";
    if (r && r.freeze) {
      html += '<p class="warn">Guest IOU. Tether can freeze the address. Kaspa still sequences the tx. The money is not Kaspa’s.</p>';
    }
    if (r && !r.live) {
      html += '<p class="note">No issued asset on this till. Checkout is real. Settlement here is a demonstration. BitCoffee KUSD exists on TN10 as covenants — this keypad cannot yet transfer that Asset ID.</p>';
    }
    html += '<div class="actions">';
    html += '<form class="claim" id="claim-form"><input name="txid" placeholder="paste txid" spellcheck="false" autocomplete="off"><button type="submit">Claim</button></form>';
    if (r && !r.live) {
      html += '<button type="button" class="ghost" id="demo-settle">Mark settled (demo)</button>';
    }
    html += "</div>";
    box.innerHTML = html;

    var form = document.getElementById("claim-form");
    if (form) {
      form.onsubmit = function (e) {
        e.preventDefault();
        var txid = (form.querySelector("[name=txid]").value || "").trim();
        if (!txid) return;
        claimTx(txid);
      };
    }
    var demo = document.getElementById("demo-settle");
    if (demo) {
      demo.onclick = function () {
        invoice.demo = true;
        invoice.txid = "";
        setStatus("Settled", "Settled · demo");
        pickRail(id);
      };
    }
    reportHeight();
  }
  function claimTx(txid) {
    setStatus("Processing", "Processing · looking up " + txid.slice(0, 10) + "…");
    var url = indexer(payTo) + "/transactions/" + encodeURIComponent(txid);
    fetch(url).then(function (res) {
      if (!res.ok) throw new Error("indexer " + res.status);
      return res.json();
    }).then(function (tx) {
      var paid = 0;
      (tx.outputs || []).forEach(function (o) {
        var a = o.script_public_key_address || (o.script_public_key && o.script_public_key.script_public_key_address);
        if (a === payTo) paid += Number(o.amount || 0);
      });
      invoice.txid = tx.transaction_id || txid;
      if (!tx.is_accepted && chosen === "kas") {
        setStatus("Processing", "Seen, not yet accepted");
        return;
      }
      if (chosen === "kas" && invoice.sompi && paid && paid + 2000 < invoice.sompi) {
        setStatus("Invalid", "Underpaid · " + kasText(paid) + " KAS");
        return;
      }
      if (chosen === "kas" && invoice.sompi && paid === 0) {
        setStatus("Invalid", "txid does not pay " + payTo.slice(0, 18) + "…");
        return;
      }
      invoice.demo = false;
      setStatus("Settled", "Settled" + (paid ? " · " + kasText(paid) + " KAS" : ""));
      pickRail(chosen);
    }).catch(function (e) {
      setStatus("New", "Claim failed · " + (e.message || e));
    });
  }
  function openCheckout() {
    var t = total();
    if (t.base <= 0) return;
    var id = "i" + hexid(6);
    var sompi = fiatToSompi(t.all);
    var micro = fiatToMicro(t.all);
    var rails = [];
    if (railsOn.kas) {
      rails.push({
        id: "kas", name: "Kaspa native", live: true, guest: false, freeze: false,
        badge: "native · live",
        due: sompi ? (kasText(sompi) + " KAS") : "KAS",
        uri: kasUri(sompi, id),
        note: "No issuer. Volatile. This is why the till quotes EUR/USD. L1 KAS to the merchant address."
      });
    }
    if (railsOn.kusd) {
      rails.push({
        id: "kusd", name: "Kaspa stable", live: false, guest: false, freeze: false,
        badge: "reserved · BitCoffee TN10",
        due: micro ? (microText(micro) + " kUSD") : "kUSD",
        uri: "",
        note: "BitCoffee KUSD is a KAS-backed, oracle-free covenant protocol on Testnet 10. This till cannot yet transfer that Asset ID. Not Tether. No free dollar."
      });
    }
    if (railsOn.usdt) {
      rails.push({
        id: "usdt", name: "USDT (guest)", live: false, guest: true, freeze: true,
        badge: "guest IOU · freeze",
        due: micro ? (microText(micro) + " USDT") : "USDT",
        uri: "",
        note: "Custodial credit on a Kaspa rail. Tether prints, burns, freezes. Does not vote in GHOSTDAG. Not gas."
      });
    }
    invoice = {
      id: id,
      amount: t.all,
      item: document.getElementById("item").value || "sale",
      sompi: sompi,
      rails: rails,
      status: "New",
      rail: "",
      txid: "",
      demo: false
    };
    document.getElementById("inv-kicker").textContent = "Invoice " + id;
    document.getElementById("inv-display").innerHTML = money(t.all) + " <small>" + ccy + "</small>";
    document.getElementById("inv-item").textContent = invoice.item + " · quoted in " + ccy;
    document.getElementById("lay-quote").textContent = money(t.all) + " " + ccy + " — unit of account, not the chain";
    setStatus("New");
    showView("pay");
    pickRail(rails[0] ? rails[0].id : "kas");
  }

  loadStore();
  document.getElementById("mode-keypad").onclick = function () { setMode("keypad"); };
  document.getElementById("mode-cart").onclick = function () { setMode("cart"); };
  document.getElementById("nav-pos").onclick = function (e) {
    e.preventDefault();
    showView("till");
  };
  document.getElementById("nav-store").onclick = function (e) {
    e.preventDefault();
    showView("store");
  };
  document.getElementById("store-save").onclick = function () {
    var v = document.getElementById("store-payto").value.trim();
    if (v && !validAddr(v)) {
      alert("pay-to must be a kaspa: or kaspatest: address");
      return;
    }
    payTo = v || GROKS;
    railsOn.kas = document.getElementById("en-kas").checked;
    railsOn.kusd = document.getElementById("en-kusd").checked;
    railsOn.usdt = document.getElementById("en-usdt").checked;
    if (!railsOn.kas && !railsOn.kusd && !railsOn.usdt) {
      railsOn.kas = true;
      railsOn.kusd = true;
      railsOn.usdt = true;
    }
    saveStore();
    showView("till");
    paint();
  };
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
  document.getElementById("cart").addEventListener("click", function (e) {
    var b = e.target.closest(".item");
    if (!b) return;
    var title = b.getAttribute("data-title");
    var price = parseFloat(b.getAttribute("data-price"));
    var found = lines.filter(function (l) { return l.title === title; })[0];
    if (found) found.n += 1;
    else lines.push({ title: title, price: price, n: 1 });
    paint();
  });
  document.querySelector(".tips").addEventListener("click", function (e) {
    var t = e.target.getAttribute("data-tip");
    if (t == null) return;
    tipPct = parseInt(t, 10);
    [].forEach.call(document.querySelectorAll(".tips button"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-tip") === t);
    });
    paint();
  });
  document.getElementById("charge").addEventListener("submit", function (e) {
    e.preventDefault();
    openCheckout();
  });
  document.getElementById("rails").addEventListener("click", function (e) {
    var a = e.target.closest("[data-rail]");
    if (!a) return;
    e.preventDefault();
    pickRail(a.getAttribute("data-rail"));
  });
  document.getElementById("back-till").onclick = function () { showView("till"); };

  Promise.all([
    fetch("https://api.kaspa.org/info/price").then(function (r) { return r.json(); }).catch(function () { return {}; }),
    fetch("https://api.frankfurter.app/latest?from=EUR&to=USD").then(function (r) { return r.json(); }).catch(function () { return {}; })
  ]).then(function (pair) {
    kasUsd = Number(pair[0].price) || kasUsd;
    eurUsd = (pair[1].rates && Number(pair[1].rates.USD)) || eurUsd;
    var el = document.getElementById("rate");
    if (kasUsd) el.textContent = "KAS $" + kasUsd.toFixed(4) + " · 10 conf" + (isTestnet(payTo) ? " · TN10" : "");
  });

  var q = new URLSearchParams(location.search).get("payTo");
  if (q && validAddr(q)) {
    payTo = q;
    saveStore();
  }
  paint();
  window.addEventListener("load", reportHeight);
  window.addEventListener("resize", reportHeight);
  if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.body);
})();
