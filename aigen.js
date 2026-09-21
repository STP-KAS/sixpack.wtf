(function () {
  const clips = document.querySelectorAll(".aigen-grid video");
  const status = document.getElementById("aigen-status");

  function say(t) {
    if (status) status.textContent = t || "";
  }

  function nameOf(v) {
    const cap = v.closest("figure") && v.closest("figure").querySelector("figcaption");
    return cap ? cap.textContent.trim() : "Clip";
  }

  function frameOf(v) {
    return v.closest(".aigen-frame");
  }

  function buttonOf(v) {
    const frame = frameOf(v);
    return frame ? frame.querySelector(".aigen-play") : null;
  }

  function showStill(v) {
    v.pause();
    v.controls = false;
    const frame = frameOf(v);
    const btn = buttonOf(v);
    if (frame) frame.classList.remove("is-on");
    if (btn) btn.hidden = false;
    if (v.getAttribute("src")) {
      v.removeAttribute("src");
      v.load();
    }
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

  function markOn(v) {
    const frame = frameOf(v);
    const btn = buttonOf(v);
    if (frame) frame.classList.add("is-on");
    if (btn) btn.hidden = true;
    v.controls = true;
  }

  function playThis(v) {
    clips.forEach(function (other) {
      if (other !== v) showStill(other);
    });
    arm(v);
    markOn(v);
    const name = nameOf(v);
    say("Loading " + name + "…");
    function started(quiet) {
      if (!quiet) {
        v.muted = false;
        v.volume = 1;
      }
      say(quiet ? name + " is playing. Tap the speaker if it's quiet." : name + " is playing.");
    }
    const go = v.play();
    if (go && go.then) {
      go.then(function () { started(false); }).catch(function () {
        v.muted = true;
        const retry = v.play();
        if (retry && retry.then) {
          retry.then(function () { started(true); }).catch(function () {
            say("Tap the clip again.");
          });
        }
      });
    }
  }

  clips.forEach(function (v) {
    v.controls = false;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.preload = "none";
    const btn = buttonOf(v);
    if (btn) btn.setAttribute("aria-label", "Play " + nameOf(v));
    const figure = v.closest("figure");
    if (!figure) return;
    figure.addEventListener("click", function (ev) {
      const playing = frameOf(v) && frameOf(v).classList.contains("is-on");
      const onLabel = ev.target.closest("figcaption") || ev.target.closest(".aigen-play");
      if (playing && !onLabel) return;
      playThis(v);
    });
    v.addEventListener("ended", function () {
      v.controls = false;
      const frame = frameOf(v);
      const b = buttonOf(v);
      if (frame) frame.classList.remove("is-on");
      if (b) b.hidden = false;
      say("Tap a clip.");
    });
  });
})();
