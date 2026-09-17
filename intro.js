(function () {
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (file === "faucet.html") {
    document.documentElement.classList.add("intro-done");
    return;
  }

  const KEY = "sixpack-intro";
  try {
    if (sessionStorage.getItem(KEY) === "1") document.documentElement.classList.add("intro-done");
  } catch (_) {}

  if (document.documentElement.classList.contains("intro-done")) return;

  let overlay = document.getElementById("intro");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "intro";
    overlay.className = "intro";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "intro-title");
    overlay.innerHTML =
      '<div class="intro-card">' +
      '<p id="intro-title" class="intro-title">Kaspa Explained STP</p>' +
      '<video class="intro-video" controls playsinline webkit-playsinline preload="metadata" poster="kaspa-explained.jpg">' +
      '<source src="kaspa-explained.mp4" type="video/mp4">' +
      "</video>" +
      '<div class="intro-copy">' +
      "<p>-Bitcoin started as proof of work: scarce money and ownership that does not depend on who already holds the coins.</p>" +
      "<p>-Proof of stake replaced work with capital. That is a different system.</p>" +
      "<p>-Kaspa kept Bitcoin’s proof of work and upgraded it: 10 blocks per second on average, now programmable.</p>" +
      "</div>" +
      '<button type="button" class="intro-proceed">Proceed</button>' +
      "</div>";
    document.body.insertBefore(overlay, document.body.firstChild);
  }

  const video = overlay.querySelector("video");
  const proceed = overlay.querySelector(".intro-proceed");

  function stopVideo() {
    if (!video) return;
    video.pause();
    while (video.firstChild) video.removeChild(video.firstChild);
    video.removeAttribute("src");
    video.load();
  }

  function close() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch (_) {}
    document.documentElement.classList.add("intro-done");
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("intro-open");
    stopVideo();
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  document.body.classList.add("intro-open");
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });
  if (proceed) proceed.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
})();
