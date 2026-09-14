(function () {
  const overlay = document.getElementById("intro");
  if (!overlay) return;

  const KEY = "sixpack-intro";
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

  if (document.documentElement.classList.contains("intro-done")) {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    stopVideo();
    return;
  }

  document.body.classList.add("intro-open");
  overlay.addEventListener("click", function (e) {
    if (e.target.closest("video")) return;
    close();
  });
  if (proceed) proceed.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
})();
