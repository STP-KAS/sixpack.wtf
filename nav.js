(function () {
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const items = [
    { href: "./", files: ["", "index.html"], label: "Home" },
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
})();
