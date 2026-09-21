(function () {
  const CLIPS = [
    { id: "r01", title: "Clock", duration: 11, w: 848, h: 480 },
    { id: "r02", title: "No Kings", duration: 104, w: 1440, h: 1080 },
    { id: "r03", title: "No Kings rally", duration: 23, w: 576, h: 768 },
    { id: "r04", title: "2024", duration: 77, w: 576, h: 566 },
    { id: "r05", title: "Epstein files", duration: 18, w: 1280, h: 720 },
    { id: "r06", title: "Wedding", duration: 19, w: 1080, h: 1080 },
    { id: "r07", title: "Fire", duration: 15, w: 1276, h: 720 },
    { id: "r08", title: "We stopped that plan", duration: 53, w: 720, h: 1280 },
    { id: "r09", title: "I didn't vote for this", duration: 54, w: 1440, h: 1440 },
    { id: "r10", title: "Never bet against Elon", duration: 23, w: 720, h: 638 },
    { id: "r11", title: "I used to be an old man", duration: 20, w: 1920, h: 868 },
    { id: "r12", title: "Iranian regime", duration: 46, w: 720, h: 1280 },
    { id: "r13", title: "Embarrassment to humanity", duration: 22, w: 1920, h: 1080 },
    { id: "r14", title: "Streets", duration: 113, w: 1276, h: 720 },
    { id: "r15", title: "I wanna be a billionaire", duration: 48, w: 1920, h: 1080 },
    { id: "r16", title: "White House", duration: 86, w: 1920, h: 1080 },
    { id: "r17", title: "Senate", duration: 15, w: 720, h: 1280 },
    { id: "r18", title: "Rally", duration: 85, w: 1280, h: 720 },
    { id: "r19", title: "Night", duration: 313, w: 576, h: 1024 },
    { id: "r20", title: "I don't even think I have a six pack", duration: 31, w: 720, h: 1280 },
  ];

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  const video = document.getElementById("random-video");
  const now = document.getElementById("random-now");
  const grid = document.getElementById("random-grid");
  if (!video || !now || !grid) return;

  let index = 0;

  function playAt(i, autoplay) {
    index = ((i % CLIPS.length) + CLIPS.length) % CLIPS.length;
    const clip = CLIPS[index];
    video.poster = "random/" + clip.id + ".jpg";
    video.src = "random/" + clip.id + ".mp4";
    video.setAttribute("width", String(clip.w));
    video.setAttribute("height", String(clip.h));
    now.textContent = clip.title + " · " + fmt(clip.duration);
    for (const btn of grid.querySelectorAll(".random-tile")) {
      btn.classList.toggle("on", btn.dataset.id === clip.id);
    }
    if (autoplay) {
      const p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  for (const clip of CLIPS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "random-tile";
    btn.dataset.id = clip.id;
    const img = document.createElement("img");
    img.src = "random/" + clip.id + ".jpg";
    img.alt = "";
    img.width = clip.w;
    img.height = clip.h;
    const meta = document.createElement("span");
    meta.className = "random-tile-meta";
    const strong = document.createElement("strong");
    strong.textContent = clip.title;
    const time = document.createElement("span");
    time.textContent = fmt(clip.duration);
    meta.append(strong, time);
    btn.append(img, meta);
    btn.addEventListener("click", function () {
      playAt(CLIPS.indexOf(clip), true);
    });
    grid.append(btn);
  }

  const shuffleBtn = document.getElementById("random-shuffle");
  const prevBtn = document.getElementById("random-prev");
  const nextBtn = document.getElementById("random-next");
  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", function () {
      let next = Math.floor(Math.random() * CLIPS.length);
      if (CLIPS.length > 1 && next === index) next = (next + 1) % CLIPS.length;
      playAt(next, true);
    });
  }
  if (prevBtn) prevBtn.addEventListener("click", function () { playAt(index - 1, true); });
  if (nextBtn) nextBtn.addEventListener("click", function () { playAt(index + 1, true); });
  video.addEventListener("ended", function () { playAt(index + 1, true); });

  playAt(Math.floor(Math.random() * CLIPS.length), false);
})();
