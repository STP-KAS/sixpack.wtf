(function () {
  const form = document.getElementById("gk-form");
  const box = document.getElementById("gk-q");
  const send = document.getElementById("gk-send");
  const stopBtn = document.getElementById("gk-stop");
  const log = document.getElementById("gk-log");
  const empty = document.getElementById("gk-empty");
  const thread = document.getElementById("gk-thread");
  const statusEl = document.getElementById("gk-status");
  const modal = document.getElementById("gk-modal");
  const chips = document.getElementById("gk-chips");
  const history = [];
  const TITLE = "Grok.SPCXAI.KAS — sixpack.wtf";
  let apiBase = "";
  let abort = null;
  let lastQ = "";
  let lastA = "";

  function bases() {
    const extra = window.GROK_API ? [String(window.GROK_API).replace(/\/$/, "")] : [];
    const list = extra.concat([""]);
    if (location.protocol === "file:") list.push("http://127.0.0.1:4020");
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") {
      if (location.port !== "4020") list.push("http://127.0.0.1:4020");
    }
    return list;
  }
  function hdr(accept) {
    return {
      "Bypass-Tunnel-Reminder": "true",
      Accept: accept || "application/json",
      "Content-Type": "application/json",
    };
  }
  function sayStatus(t, show) {
    if (!statusEl) return;
    statusEl.hidden = !show;
    statusEl.textContent = t || "";
  }
  function showLog() {
    if (empty) empty.hidden = true;
    if (log) log.hidden = false;
  }
  function resize() {
    box.style.height = "auto";
    box.style.height = Math.min(box.scrollHeight, 136) + "px";
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function renderMd(src) {
    const raw = String(src || "");
    const fences = [];
    let t = raw.replace(/```([\s\S]*?)```/g, function (_, code) {
      fences.push("<pre><code>" + escapeHtml(code.replace(/^\w*\n/, "")) + "</code></pre>");
      return "\u0000F" + (fences.length - 1) + "\u0000";
    });
    t = escapeHtml(t);
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\[\[(\d+)\]\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">[$1]</a>');
    t = t.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    t = t.replace(/^(?:- |\* )(.*)$/gm, "<li>$1</li>");
    t = t.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
    t = t.replace(/\n\n+/g, "</p><p>");
    t = "<p>" + t + "</p>";
    t = t.replace(/\u0000F(\d+)\u0000/g, function (_, i) {
      return fences[Number(i)] || "";
    });
    return t;
  }
  function addUser(text) {
    showLog();
    const el = document.createElement("div");
    el.className = "gk-msg user";
    el.textContent = text;
    log.append(el);
    thread.scrollTop = thread.scrollHeight;
  }
  function addAssistant() {
    showLog();
    const wrap = document.createElement("div");
    wrap.className = "gk-msg assistant";
    const think = document.createElement("div");
    think.className = "gk-think";
    think.setAttribute("data-open", "1");
    think.setAttribute("aria-live", "polite");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "gk-think-toggle";
    toggle.setAttribute("aria-expanded", "true");
    const spin = document.createElement("span");
    spin.className = "gk-spin";
    spin.setAttribute("aria-hidden", "true");
    const main = document.createElement("div");
    main.className = "gk-think-main";
    const titleRow = document.createElement("div");
    titleRow.className = "gk-think-title";
    const label = document.createElement("span");
    label.className = "gk-think-label";
    label.textContent = "Opening the Kaspa feed…";
    const dots = document.createElement("span");
    dots.className = "gk-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.innerHTML = "<i></i><i></i><i></i>";
    titleRow.append(label, dots);
    const meta = document.createElement("p");
    meta.className = "gk-think-meta";
    const live = document.createElement("span");
    live.className = "gk-think-live";
    live.textContent = "Working";
    const timeEl = document.createElement("span");
    timeEl.className = "gk-think-time";
    timeEl.textContent = "0s";
    meta.append(live, document.createTextNode(" · "), timeEl);
    main.append(titleRow, meta);
    toggle.append(spin, main);
    const note = document.createElement("p");
    note.className = "gk-think-note";
    note.textContent =
      "This desk is slow. Fat feed. Sloths type with two fingers. Same as Grok: search and think first, then answer.";
    const steps = document.createElement("ol");
    steps.className = "gk-think-steps";
    const reason = document.createElement("div");
    reason.className = "gk-think-reason";
    reason.hidden = true;
    think.append(toggle, note, steps, reason);
    const md = document.createElement("div");
    md.className = "gk-md";
    const actions = document.createElement("div");
    actions.className = "gk-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "Helpful";
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "Wrong";
    actions.append(copy, up, down);
    const cites = document.createElement("p");
    cites.className = "gk-cites";
    actions.hidden = true;
    wrap.append(think, md, actions, cites);
    log.append(wrap);
    const seen = {};
    function addStep(id, text) {
      const key = id || text;
      if (seen[key]) seen[key].textContent = text;
      else {
        const li = document.createElement("li");
        li.textContent = text;
        steps.append(li);
        seen[key] = li;
      }
      Object.keys(seen).forEach(function (k) {
        seen[k].classList.toggle("on", k === key);
      });
      label.textContent = text;
    }
    toggle.addEventListener("click", function () {
      const open = think.getAttribute("data-open") === "1";
      think.setAttribute("data-open", open ? "0" : "1");
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
    });
    return { md, copy, up, down, cites, wrap, actions, think, label, timeEl, addStep, reason, note };
  }
  function setBusy(on) {
    send.hidden = on;
    stopBtn.hidden = !on;
    box.disabled = false;
    send.disabled = !box.value.trim() && !on;
    document.body.classList.toggle("gk-busy", on);
    document.title = on ? "Working… · Grok.SPCXAI.KAS" : TITLE;
  }
  async function probe() {
    for (const base of bases()) {
      try {
        const res = await fetch(base + "/api/grok", { headers: hdr() });
        const j = await res.json();
        if (j && j.name === "Grok.SPCXAI.KAS") {
          apiBase = base;
          if (!j.ok) sayStatus("Desk is up. SpaceXAI key is not loaded yet.", true);
          else sayStatus("", false);
          return j;
        }
      } catch (_) {}
    }
    sayStatus("Desk API is not reachable. The static page is live; the sloths need the payout tunnel.", true);
    return null;
  }
  function takeSSE(buf, onEvent) {
    const parts = buf.split("\n\n");
    const rest = parts.pop() || "";
    for (const part of parts) {
      const data = part
        .split("\n")
        .filter(function (l) {
          return l.indexOf("data:") === 0;
        })
        .map(function (l) {
          return l.slice(5).trim();
        })
        .join("");
      if (!data || data === "[DONE]") continue;
      try {
        onEvent(JSON.parse(data));
      } catch (err) {
        if (err && err.name === "SyntaxError") continue;
        throw err;
      }
    }
    return rest;
  }
  async function readSSE(res, onEvent) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      buf = takeSSE(buf, onEvent);
    }
    buf += dec.decode();
    if (buf.trim()) takeSSE(buf + "\n\n", onEvent);
  }
  async function ask(text) {
    const q = String(text || "").trim();
    if (!q || abort) return;
    lastQ = q;
    lastA = "";
    box.value = "";
    resize();
    addUser(q);
    const ui = addAssistant();
    let acc = "";
    let thought = "";
    const t0 = Date.now();
    function elapsed() {
      return Math.max(0, Math.floor((Date.now() - t0) / 1000));
    }
    const tick = setInterval(function () {
      ui.timeEl.textContent = elapsed() + "s";
    }, 250);
    setBusy(true);
    ui.addStep("feed", "Opening the Kaspa feed. Slow: the catalog is a brick.");
    abort = new AbortController();
    try {
      if (!apiBase) await probe();
      const res = await fetch((apiBase || "") + "/api/grok", {
        method: "POST",
        headers: hdr("text/event-stream"),
        body: JSON.stringify({ q: q, history: history.slice(-16) }),
        signal: abort.signal,
      });
      if (!res.ok && !String(res.headers.get("content-type") || "").includes("event-stream")) {
        const j = await res.json().catch(function () {
          return {};
        });
        throw new Error(j.error || "Desk HTTP " + res.status);
      }
      let paint = 0;
      function paintMd() {
        if (paint) return;
        paint = requestAnimationFrame(function () {
          paint = 0;
          ui.md.innerHTML = renderMd(acc);
          thread.scrollTop = thread.scrollHeight;
        });
      }
      await readSSE(res, function (ev) {
        if (ev.type === "status" && ev.text) ui.addStep(ev.id || ev.text, ev.text);
        if (ev.type === "think" && ev.text) {
          thought += ev.text;
          ui.reason.hidden = false;
          ui.reason.textContent = thought.slice(-2500);
          ui.reason.scrollTop = ui.reason.scrollHeight;
        }
        if (ev.type === "delta" && ev.text) {
          acc += ev.text;
          ui.md.classList.add("streaming");
          paintMd();
        }
        if (ev.type === "error") throw new Error(ev.text || "Desk error");
        if (ev.type === "done") {
          lastA = acc;
          if (ev.citations && ev.citations.length) {
            ui.cites.innerHTML = ev.citations
              .slice(0, 8)
              .map(function (u) {
                var host = u;
                try {
                  host = new URL(u).hostname.replace(/^www\./, "");
                } catch (_) {}
                return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(host) + "</a>";
              })
              .join("");
          }
        }
      });
      if (!acc) acc = "Empty reply. Try again.";
      lastA = acc;
      ui.md.classList.remove("streaming");
      ui.md.innerHTML = renderMd(acc);
      ui.actions.hidden = false;
      history.push({ role: "user", content: q }, { role: "assistant", content: acc });
      ui.copy.addEventListener("click", function () {
        navigator.clipboard.writeText(acc).catch(function () {});
        ui.copy.textContent = "Copied";
      });
      function vote(up) {
        fetch((apiBase || "") + "/api/grok/feedback", {
          method: "POST",
          headers: hdr(),
          body: JSON.stringify({ up: up, q: lastQ, a: lastA }),
        }).catch(function () {});
        ui.up.disabled = true;
        ui.down.disabled = true;
      }
      ui.up.addEventListener("click", function () {
        vote(true);
        ui.up.textContent = "Noted";
      });
      ui.down.addEventListener("click", function () {
        vote(false);
        ui.down.textContent = "Noted";
      });
    } catch (err) {
      ui.md.classList.remove("streaming");
      if (err.name === "AbortError") {
        if (!acc) ui.md.innerHTML = renderMd("Stopped.");
        ui.label.textContent = "Stopped after " + elapsed() + "s.";
      } else {
        ui.md.innerHTML = renderMd(err.message || "Desk failed.");
        ui.label.textContent = "Failed after " + elapsed() + "s.";
      }
      if (acc) ui.actions.hidden = false;
    } finally {
      clearInterval(tick);
      ui.md.classList.remove("streaming");
      ui.think.classList.add("is-done");
      ui.timeEl.textContent = elapsed() + "s";
      if (acc && ui.label.textContent.indexOf("Failed") !== 0 && ui.label.textContent.indexOf("Stopped") !== 0) {
        ui.label.textContent = "Took " + elapsed() + "s. Slow, we know.";
        ui.note.textContent = "Searched and thought before answering, the same way Grok does. The wait is the work.";
        ui.think.setAttribute("data-open", "0");
        ui.think.querySelector(".gk-think-toggle").setAttribute("aria-expanded", "false");
      }
      abort = null;
      setBusy(false);
      box.focus();
      thread.scrollTop = thread.scrollHeight;
    }
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    ask(box.value);
  });
  box.addEventListener("input", function () {
    resize();
    send.disabled = !box.value.trim();
  });
  box.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" || ev.shiftKey) return;
    ev.preventDefault();
    form.requestSubmit();
  });
  stopBtn.addEventListener("click", function () {
    if (abort) abort.abort();
  });
  document.getElementById("gk-new").addEventListener("click", function () {
    history.length = 0;
    log.replaceChildren();
    log.hidden = true;
    empty.hidden = false;
    lastQ = "";
    lastA = "";
    document.title = TITLE;
    document.body.classList.remove("gk-busy");
    box.focus();
  });
  function openAbout(on) {
    modal.hidden = !on;
  }
  document.getElementById("gk-about").addEventListener("click", function () {
    openAbout(true);
  });
  document.getElementById("gk-modal-x").addEventListener("click", function () {
    openAbout(false);
  });
  modal.addEventListener("click", function (ev) {
    if (ev.target === modal) openAbout(false);
  });
  if (chips) {
    chips.addEventListener("click", function (ev) {
      const b = ev.target.closest("button");
      if (!b) return;
      ask(b.textContent);
    });
  }
  send.disabled = true;
  probe();
  box.focus();
})();
