(function () {
  const CLIPS = [
    { id: "r01", title: "Clock", duration: 11, w: 848, h: 480 },
    { id: "r02", title: "No Kings", duration: 104, w: 1440, h: 1080 },
    { id: "r03", title: "No Kings rally", duration: 23, w: 576, h: 768 },
    { id: "r04", title: "2024", duration: 77, w: 576, h: 566 },
    { id: "r05", title: "Epstein files", duration: 18, w: 1280, h: 720 },
    { id: "r06", title: "Wedding", duration: 19, w: 1080, h: 1080 },
    { id: "r07", title: "Fire", duration: 15, w: 1276, h: 720 },
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
    { id: "r21", title: "Better place", duration: 60, w: 1280, h: 720 },
    { id: "r22", title: "I voted for this", duration: 24, w: 848, h: 768 },
    { id: "r23", title: "Eternity", duration: 116, w: 480, h: 360 },
    { id: "r24", title: "Gym", duration: 126, w: 786, h: 1288 },
    { id: "r25", title: "I voted for this too", duration: 55, w: 720, h: 720 },
    { id: "r26", title: "Alley", duration: 163, w: 1280, h: 852 },
    { id: "r27", title: "Synagogue", duration: 60, w: 1080, h: 1920 },
    { id: "r28", title: "We are so back", duration: 119, w: 1920, h: 1080 },
    { id: "r29", title: "MAGA hats", duration: 32, w: 720, h: 1280 },
    { id: "r30", title: "Crowd", duration: 17, w: 494, h: 786 },
    { id: "r31", title: "I voted for this again", duration: 46, w: 720, h: 962 },
    { id: "r32", title: "Car", duration: 25, w: 1280, h: 1706 },
    { id: "r33", title: "Trump", duration: 25, w: 1558, h: 720 },
    { id: "r34", title: "I didn't vote for this either", duration: 69, w: 720, h: 1280 },
    { id: "r35", title: "Still didn't vote for this", duration: 507, w: 720, h: 1280 },
    { id: "r36", title: "I voted for this four", duration: 17, w: 720, h: 720 },
    { id: "r37", title: "Silly Walks", duration: 166, w: 1920, h: 1080 },
    { id: "r38", title: "Don't mention the war", duration: 263, w: 1350, h: 1080 },
  ];

  const CAPTION = "this desk agrees";

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
    now.textContent = CAPTION;
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
    strong.textContent = CAPTION;
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
