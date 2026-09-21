(function () {
  const clips = document.querySelectorAll(".aigen-grid video");
  const status = document.getElementById("aigen-status");

  function say(t) {
    if (status) status.textContent = t || "";
  }

  function arm(v) {
    v.muted = false;
    v.defaultMuted = false;
    v.volume = 1;
    if (!v.getAttribute("src")) {
      const src = v.getAttribute("data-src");
      if (src) v.src = src;
    }
  }

  function playThis(v) {
    arm(v);
    clips.forEach(function (other) {
      if (other === v) return;
      other.pause();
      if (other.getAttribute("src")) {
        other.removeAttribute("src");
        other.load();
      }
    });
    const name = v.closest("figure") && v.closest("figure").querySelector("figcaption");
    say("Loading " + (name ? name.textContent : "clip") + " with sound…");
    const go = v.play();
    if (go && go.then) {
      go.then(function () {
        v.muted = false;
        v.volume = 1;
        say((name ? name.textContent : "Clip") + " · sound on. Tap another still to switch.");
      }).catch(function () {
        v.muted = false;
        v.volume = 1;
        say("Tap the play triangle. Then the speaker if you hear nothing.");
      });
    }
  }

  clips.forEach(function (v) {
    v.controls = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.preload = "none";
    v.addEventListener("pointerdown", function () {
      arm(v);
    });
    v.addEventListener("play", function () {
      if (!v.getAttribute("src")) {
        v.pause();
        playThis(v);
        return;
      }
      v.muted = false;
      v.volume = 1;
      clips.forEach(function (other) {
        if (other === v) return;
        other.pause();
      });
    });
    v.addEventListener("waiting", function () {
      const name = v.closest("figure") && v.closest("figure").querySelector("figcaption");
      say("Loading " + (name ? name.textContent : "clip") + "… keep the speaker on.");
    });
    v.addEventListener("playing", function () {
      v.muted = false;
      v.volume = 1;
      const name = v.closest("figure") && v.closest("figure").querySelector("figcaption");
      say((name ? name.textContent : "Clip") + " · sound on.");
    });
    v.addEventListener("click", function (ev) {
      if (!v.paused && !v.ended) return;
      ev.preventDefault();
      playThis(v);
    });
  });
})();
