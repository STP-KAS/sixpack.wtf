(function () {
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const items = [
    { href: "./", files: ["", "index.html"], label: "Map" },
    { href: "explained.html", files: ["explained.html"], label: "Doors" },
    { href: "till.html", files: ["till.html"], label: "Till" },
    { href: "rails.html", files: ["rails.html"], label: "Rails" },
    { href: "kusd.html", files: ["kusd.html", "poc.html", "tn10.html"], label: "KUSD" },
    { href: "x402.html", files: ["x402.html", "parker.html", "mix.html"], label: "x402" },
  ];
  for (const nav of document.querySelectorAll("[data-site-nav]")) {
    nav.classList.add("tabs");
    nav.setAttribute("aria-label", "Site");
    nav.replaceChildren();
    for (const item of items) {
      const a = document.createElement("a");
      a.href = item.href;
      a.textContent = item.label;
      if (item.files.includes(file)) a.className = "on";
      nav.append(a);
    }
  }

  const src = document.currentScript && document.currentScript.src;
  const root = src ? src.replace(/nav\.js(\?.*)?$/, "") : "";
  function load(path) {
    if (document.querySelector('script[src^="' + path + '"]')) return;
    const s = document.createElement("script");
    s.src = path;
    s.async = false;
    document.head.appendChild(s);
  }
  if (root) {
    load(root + "wallets/kaspa-wallets.js?v=9");
    load(root + "wallets/pay.js?v=9");
    load(root + "wallets/ui.js?v=9");
  }
})();
