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
  function hdr() {
    return { "Bypass-Tunnel-Reminder": "true", Accept: "application/json", "Content-Type": "application/json" };
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
    wrap.append(md, actions, cites);
    log.append(wrap);
    return { md, copy, up, down, cites, wrap, actions };
  }
  function setBusy(on) {
    send.hidden = on;
    stopBtn.hidden = !on;
    box.disabled = false;
    send.disabled = !box.value.trim() && !on;
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
    setBusy(true);
    sayStatus("Asking the feed…", true);
    abort = new AbortController();
    try {
      if (!apiBase) await probe();
      const res = await fetch((apiBase || "") + "/api/grok", {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ q: q, history: history.slice(-16) }),
        signal: abort.signal,
      });
      if (!res.ok && !String(res.headers.get("content-type") || "").includes("event-stream")) {
        const j = await res.json().catch(function () {
          return {};
        });
        throw new Error(j.error || "Desk HTTP " + res.status);
      }
      await readSSE(res, function (ev) {
        if (ev.type === "status") sayStatus(ev.text, true);
        if (ev.type === "delta" && ev.text) {
          acc += ev.text;
          ui.md.classList.add("streaming");
          ui.md.innerHTML = renderMd(acc);
          thread.scrollTop = thread.scrollHeight;
        }
        if (ev.type === "error") throw new Error(ev.text || "Desk error");
        if (ev.type === "done") {
          lastA = acc;
          if (ev.citations && ev.citations.length) {
            ui.cites.innerHTML = ev.citations
              .slice(0, 6)
              .map(function (u) {
                var host = u;
                try {
                  host = new URL(u).hostname.replace(/^www\./, "");
                } catch (_) {}
                return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(host) + "</a>";
              })
              .join(" · ");
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
      } else {
        ui.md.innerHTML = renderMd(err.message || "Desk failed.");
      }
      if (acc) ui.actions.hidden = false;
    } finally {
      ui.md.classList.remove("streaming");
      abort = null;
      setBusy(false);
      sayStatus("", false);
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
