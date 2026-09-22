import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clipHistory, gateUserText, priceReply, statusFor } from "./policy.mjs";
import { appendLog, lessonsBlock, loadLessons, recordFeedback } from "./learn.mjs";
import { resolveApiKey, upstreamErrorMessage } from "./keys.mjs";
import { describeStreamEvent, reasoningDelta } from "./trace.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const XAI = "https://api.x.ai/v1";
const MODEL = process.env.GROK_MODEL || "grok-4.6";
const JOKE_BOOTHS = [
  ["Block Permit Office", "/dmv", "Two arrivals, two records."],
  ["Queue Jump Arcade", "/arcade", "Queue order, payout variance, an issuance schedule."],
  ["Chain Workshop", "/workshop", "Build a rule and watch its limit."],
  ["Matchmaking Bureau", "/dating", "Ask every chain the same requirement."],
  ["Claims Court", "/court", "A claim has to show its work."],
  ["Gift Shop", "/souvenirs", "A harmless explanation you can take home."],
  ["Industry back hall", "/industry", "A drawer, a coat check, a yield that brought its assumptions."],
];

export function pickJokeBooth(question) {
  const q = String(question || "");
  if (!/\bjoke\b|100bps|roast|make me laugh/i.test(q)) return null;
  return JOKE_BOOTHS[Math.floor(Math.random() * JOKE_BOOTHS.length)];
}

function jokeNote(booth) {
  if (!booth) return "";
  const [name, boothPath, bit] = booth;
  return (
    "\n\n# This turn's 100bps joke\n" +
    "Rolled now. Tell one fresh intern joke from **" + name + "** only. " + bit + "\n" +
    "Link [100bps.wtf](https://100bps.wtf/) and [" + name + "](https://100bps.wtf" + boothPath + ").\n" +
    "Do not copy a learned joke. Do not reuse a booth from an earlier turn. Satire only. Kaspa is not 100 blocks per second.\n"
  );
}

loadDotenv(path.join(root, ".env"));

let promptCache = { at: 0, text: "" };

function loadDotenv(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

function read(name) {
  return fs.readFileSync(path.join(here, name), "utf8");
}

export function systemPrompt() {
  const now = Date.now();
  if (promptCache.text && now - promptCache.at < 8000) return promptCache.text;
  const parts = [read("system.md"), "", read("feed.md"), "", lessonsBlock(), "", read("catalog.md")];
  promptCache = { at: now, text: parts.join("\n") };
  return promptCache.text;
}

function sources() {
  try {
    return JSON.parse(fs.readFileSync(path.join(here, "sources.json"), "utf8"));
  } catch {
    return { x_handles: [] };
  }
}

export function grokHealth() {
  return {
    ok: Boolean(resolveApiKey()),
    name: "Grok.SPCXAI.KAS",
    engine: "spacexai-feed",
    model: MODEL,
    not: "grok.com",
    lessons: loadLessons().length,
    updated: "2026-09-21",
  };
}

export function recordGrokFeedback(body) {
  return recordFeedback({
    up: Boolean(body?.up),
    q: body?.q,
    a: body?.a,
  });
}

function sse(res, obj) {
  res.write("data: " + JSON.stringify(obj) + "\n\n");
}

function openStream(res) {
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  try {
    res.socket?.setNoDelay(true);
  } catch {
    /* optional */
  }
  res.write(":" + " ".repeat(2048) + "\n\n");
}

function toolsFor(jail) {
  if (jail) return [];
  const handles = (sources().x_handles || []).slice(0, 20);
  return [
    { type: "web_search" },
    { type: "x_search", allowed_x_handles: handles },
  ];
}

async function streamXai({ question, history, jail, onDelta, onStatus, onThink, signal }) {
  const key = resolveApiKey();
  if (!key) {
    const err = new Error("The desk has not loaded a SpaceXAI key. The sloths are on break.");
    err.code = "NOKEY";
    throw err;
  }
  const input = clipHistory(history).concat([{ role: "user", content: question }]);
  let lastStatusId = "";
  function pushStatus(id, text) {
    if (!text) return;
    if (id && id === lastStatusId) return;
    lastStatusId = id || lastStatusId;
    onStatus(text, id);
  }
  pushStatus("feed", "Opening the Kaspa feed. Slow: the catalog is a brick.");
  const body = {
    model: MODEL,
    stream: true,
    instructions: systemPrompt() + jokeNote(pickJokeBooth(question)),
    input,
    tools: toolsFor(jail),
  };
  pushStatus("up", "SpaceXAI is chewing the feed. Admit it: this takes a while.");
  const res = await fetch(XAI + "/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(upstreamErrorMessage(res.status, text));
    err.code = "UPSTREAM";
    throw err;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  const citations = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      buf += dec.decode();
      if (buf.trim()) buf += "\n\n";
    } else {
      buf += dec.decode(value, { stream: true });
    }
    const chunks = buf.split("\n\n");
    buf = chunks.pop() || "";
    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") continue;
      let ev;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      const type = ev.type || "";
      const step = describeStreamEvent(ev);
      if (step) pushStatus(step.id, step.text);
      const thought = reasoningDelta(ev);
      if (thought && onThink) onThink(thought);
      if (type === "response.output_text.delta" && ev.delta) {
        if (!out) pushStatus("write", "Writing the answer. Still not fast.");
        out += ev.delta;
        onDelta(ev.delta);
      } else if (ev.choices?.[0]?.delta?.content) {
        const t = ev.choices[0].delta.content;
        if (!out) pushStatus("write", "Writing the answer. Still not fast.");
        out += t;
        onDelta(t);
      } else if (type === "response.output_text.done" && ev.text && !out) {
        pushStatus("write", "Writing the answer. Still not fast.");
        out = ev.text;
        onDelta(ev.text);
      }
      const cites = ev.citations || ev.response?.citations || [];
      if (Array.isArray(cites)) {
        for (const c of cites) {
          const url = typeof c === "string" ? c : c.url || c.href;
          if (url && !citations.includes(url)) citations.push(url);
        }
      }
    }
    if (done) break;
  }
  return { text: out.trim(), citations };
}

export async function handleGrokChat(req, res, body, ip, headers) {
  res.writeHead(200, {
    ...headers,
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  openStream(res);
  const ac = new AbortController();
  const beat = setInterval(() => {
    try {
      res.write(": beat\n\n");
    } catch {
      clearInterval(beat);
    }
  }, 8000);
  const stopBeat = () => clearInterval(beat);
  req.on("close", () => {
    ac.abort();
    stopBeat();
  });
  try {
    const gated = gateUserText(body?.q ?? body?.question ?? "", ip);
    if (gated.price) {
      const text = priceReply();
      sse(res, { type: "status", id: "price", text: "Price question. No search, no forecast. One dry decline." });
      sse(res, { type: "delta", text });
      sse(res, { type: "done", local: true, reason: "price" });
      appendLog({ ip, kind: "price", q: gated.question, a: text, reason: "price" });
      stopBeat();
      res.end();
      return;
    }
    sse(res, { type: "status", id: "feed", text: "Opening the Kaspa feed. Slow: the catalog is a brick." });
    const history = clipHistory(body?.history);
    const result = await streamXai({
      question: gated.question,
      history,
      jail: gated.jail,
      signal: ac.signal,
      onDelta: (text) => sse(res, { type: "delta", text }),
      onStatus: (text, id) => sse(res, { type: "status", text, id: id || "" }),
      onThink: (text) => sse(res, { type: "think", text }),
    });
    if (!result.text) {
      sse(res, {
        type: "delta",
        text: "The feed returned empty. Try again, or read kaspaexplained.com/start-here.",
      });
    }
    sse(res, { type: "done", citations: result.citations || [] });
    appendLog({
      ip,
      kind: "turn",
      q: gated.question,
      a: result.text,
      model: MODEL,
    });
    stopBeat();
    res.end();
  } catch (err) {
    stopBeat();
    if (err?.name === "AbortError") {
      res.end();
      return;
    }
    const code = err.code || "ERR";
    const text = err.message || String(err);
    sse(res, { type: "error", code, text, status: statusFor(code) });
    appendLog({ ip, kind: "error", q: String(body?.q || ""), a: text, reason: code });
    res.end();
  }
}

export function handleGrokError(res, err, headers) {
  const code = err.code || "ERR";
  const status = code === "NOKEY" ? 503 : statusFor(code);
  const body = JSON.stringify({ error: err.message || String(err), code });
  res.writeHead(status, { ...headers, "content-type": "application/json; charset=utf-8" });
  res.end(body);
}
