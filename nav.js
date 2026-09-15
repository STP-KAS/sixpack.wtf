(function () {
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const items = [
    { href: "./", files: ["", "index.html"], label: "Map" },
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
})();
