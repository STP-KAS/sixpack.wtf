/**
 * Pay helpers used with KaspaWallets.
 * Inject sendKaspa when Kasware/Kastle is in the tab.
 * Otherwise build a kaspa: URI for any wallet (Kaspium, Tangem, Kaspa NG, …).
 */
(function (root) {
  function sompiToKas(sompi) {
    const n = Number(sompi || 0);
    if (!isFinite(n)) return "0";
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(Math.trunc(n));
    const whole = Math.floor(abs / 100000000);
    const frac = String(abs % 100000000).padStart(8, "0").replace(/0+$/, "");
    return sign + (frac ? whole + "." + frac : String(whole));
  }

  function kaspaUri(opts) {
    const address = String((opts && opts.address) || "").trim();
    if (!address) throw new Error("kaspaUri needs an address.");
    const params = [];
    if (opts.amountSompi != null && opts.amountSompi !== "") {
      params.push("amount=" + encodeURIComponent(sompiToKas(opts.amountSompi)));
    } else if (opts.amountKas != null && opts.amountKas !== "") {
      params.push("amount=" + encodeURIComponent(String(opts.amountKas)));
    }
    if (opts.label) params.push("label=" + encodeURIComponent(String(opts.label)));
    if (opts.message) params.push("message=" + encodeURIComponent(String(opts.message)));
    const body = address.indexOf(":") >= 0 ? address : "kaspa:" + address;
    return params.length ? body + "?" + params.join("&") : body;
  }

  async function pay(to, sompi, opts) {
    const wallets = root.KaspaWallets;
    if (wallets && wallets.detected && wallets.detected().length && wallets.sendKaspa) {
      try {
        return { method: "inject", txid: await wallets.sendKaspa(to, sompi, opts) };
      } catch (err) {
        return { method: "uri", uri: kaspaUri({ address: to, amountSompi: sompi }), error: err.message };
      }
    }
    return { method: "uri", uri: kaspaUri({ address: to, amountSompi: sompi }) };
  }

  root.KaspaPay = { kaspaUri: kaspaUri, sompiToKas: sompiToKas, pay: pay };
})(typeof window !== "undefined" ? window : globalThis);
