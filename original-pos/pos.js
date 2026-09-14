(function () {
  var amount = 0;
  var raw = "";
  var tipPct = 0;
  var lines = [];
  var mode = "keypad";
  var ccy = "EUR";
  var kasUsd = 0;
  var eurUsd = 1.08;
  var payTo = "";
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
  function paint() {
    var t = total();
    var d = document.getElementById("display");
    if (d) d.innerHTML = money(t.all) + " <small>" + ccy + "</small>";
    document.getElementById("amount").value = money(t.base);
    document.getElementById("tip").value = money(t.tip);
    var names = mode === "cart"
      ? lines.map(function (l) { return l.n + "× " + l.title; }).join(", ")
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
    if (!payTo || payTo.indexOf("kaspa:") !== 0) return "";
    var kas = kasText(sompi).replace(/0+$/, "").replace(/\.$/, "");
    return payTo + "?amount=" + kas + (message ? "&message=" + encodeURIComponent(message) : "");
  }
  function showTill() {
    document.getElementById("view-till").classList.remove("hide");
    document.getElementById("view-pay").classList.add("hide");
    reportHeight();
  }
  function railHtml(r, on) {
    return '<a class="rail ' + (on ? "on " : "") + (r.guest ? "guest" : "") + '" href="#" data-rail="' + r.id + '">' +
      "<strong>" + r.name + "</strong><span>" + r.due + "</span><em>" + r.badge + "</em></a>";
  }
  function pickRail(id) {
    chosen = id;
    var r = invoice.rails.filter(function (x) { return x.id === id; })[0];
    document.getElementById("lay-settle").textContent = r ? (r.due + " · " + r.badge) : "pick a rail";
    document.getElementById("rails").innerHTML = invoice.rails.map(function (x) {
      return railHtml(x, x.id === id);
    }).join("");
    var box = document.getElementById("paybox");
    box.classList.remove("hide");
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
      html += '<p class="note">No issued asset on this process. Checkout is real. Settlement here is a demonstration.</p>';
    }
    if (r && r.id === "kas" && !r.uri) {
      html += '<p class="warn">No receive address. Set one under Store on the desk-local engine, or this public POS stays a demonstration for KAS.</p>';
    }
    box.innerHTML = html;
    reportHeight();
  }
  function openCheckout() {
    var t = total();
    if (t.base <= 0) return;
    var id = "i" + hexid(6);
    var sompi = fiatToSompi(t.all);
    var micro = fiatToMicro(t.all);
    invoice = {
      id: id,
      amount: t.all,
      item: document.getElementById("item").value || "sale",
      rails: [
        {
          id: "kas", name: "Kaspa native", live: true, guest: false, freeze: false,
          badge: "native · live",
          due: sompi ? (kasText(sompi) + " KAS") : "KAS",
          uri: kasUri(sompi, id),
          note: "No issuer. Volatile. This is why the till quotes EUR/USD. L1 KAS to the merchant address."
        },
        {
          id: "kusd", name: "Kaspa stable", live: false, guest: false, freeze: false,
          badge: "reserved · needs capital",
          due: micro ? (microText(micro) + " kUSD") : "kUSD",
          uri: "",
          note: "Native-stable slot if one is issued on Kaspa. Overcollateral or reserves. Not Tether. No free dollar. Not live."
        },
        {
          id: "usdt", name: "USDT (guest)", live: false, guest: true, freeze: true,
          badge: "guest IOU · freeze",
          due: micro ? (microText(micro) + " USDT") : "USDT",
          uri: "",
          note: "Custodial credit on a Kaspa rail. Tether prints, burns, freezes. Does not vote in GHOSTDAG. Not gas."
        }
      ]
    };
    document.getElementById("inv-kicker").textContent = "Invoice " + id;
    document.getElementById("inv-display").innerHTML = money(t.all) + " <small>" + ccy + "</small>";
    document.getElementById("inv-item").textContent = invoice.item + " · quoted in " + ccy;
    document.getElementById("lay-quote").textContent = money(t.all) + " " + ccy + " — unit of account, not the chain";
    document.getElementById("view-till").classList.add("hide");
    document.getElementById("view-pay").classList.remove("hide");
    pickRail("kas");
  }

  document.getElementById("mode-keypad").onclick = function () { setMode("keypad"); };
  document.getElementById("mode-cart").onclick = function () { setMode("cart"); };
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
  document.getElementById("back-till").onclick = showTill;

  Promise.all([
    fetch("https://api.kaspa.org/info/price").then(function (r) { return r.json(); }).catch(function () { return {}; }),
    fetch("https://api.frankfurter.app/latest?from=EUR&to=USD").then(function (r) { return r.json(); }).catch(function () { return {}; })
  ]).then(function (pair) {
    kasUsd = Number(pair[0].price) || kasUsd;
    eurUsd = (pair[1].rates && Number(pair[1].rates.USD)) || eurUsd;
    var el = document.getElementById("rate");
    if (kasUsd) el.textContent = "KAS $" + kasUsd.toFixed(4) + " · 10 conf";
  });

  var q = new URLSearchParams(location.search).get("payTo");
  if (q && q.indexOf("kaspa:") === 0) payTo = q;
  var warn = document.getElementById("payto-warn");
  if (payTo) warn.classList.add("hide");

  paint();
  window.addEventListener("load", reportHeight);
  window.addEventListener("resize", reportHeight);
  if (window.ResizeObserver) new ResizeObserver(reportHeight).observe(document.body);
})();
