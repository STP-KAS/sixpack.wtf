(function () {
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const items = [
    { href: "./", files: ["", "index.html"], label: "Home" },
    { href: "rails.html", files: ["rails.html"], label: "Rails" },
    { href: "faucet.html", files: ["faucet.html"], label: "Faucet" },
    { href: "help.html", files: ["help.html"], label: "Help" },
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
    if (document.querySelector('script[src^="' + path.split("?")[0] + '"]')) return;
    const s = document.createElement("script");
    s.src = path;
    s.async = false;
    document.head.appendChild(s);
  }
  if (root) {
    load(root + "sources.js?v=17");
    load(root + "intro.js?v=2");
  }
})();
