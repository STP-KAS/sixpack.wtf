import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clipHistory, gateUserText, priceReply, statusFor } from "./policy.mjs";
import { appendLog, lessonsBlock, loadLessons, recordFeedback } from "./learn.mjs";
import { resolveApiKey, upstreamErrorMessage } from "./keys.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const XAI = "https://api.x.ai/v1";
const MODEL = process.env.GROK_MODEL || "grok-4.6";

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

function toolsFor(jail) {
  if (jail) return [];
  const handles = (sources().x_handles || []).slice(0, 20);
  return [
    { type: "web_search" },
    { type: "x_search", allowed_x_handles: handles },
  ];
}

async function streamXai({ question, history, jail, onDelta, onStatus, signal }) {
  const key = resolveApiKey();
  if (!key) {
    const err = new Error("The desk has not loaded a SpaceXAI key. The sloths are on break.");
    err.code = "NOKEY";
    throw err;
  }
  const input = clipHistory(history).concat([{ role: "user", content: question }]);
  const body = {
    model: MODEL,
    stream: true,
    instructions: systemPrompt(),
    input,
    tools: toolsFor(jail),
  };
  onStatus("Reading the Kaspa feed…");
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
      if (type === "response.output_text.delta" && ev.delta) {
        out += ev.delta;
        onDelta(ev.delta);
      } else if (ev.choices?.[0]?.delta?.content) {
        const t = ev.choices[0].delta.content;
        out += t;
        onDelta(t);
      } else if (type === "response.output_text.done" && ev.text && !out) {
        out = ev.text;
        onDelta(ev.text);
      } else if (type.includes("web_search") || type.includes("x_search") || type.includes("in_progress")) {
        if (/search/i.test(type)) onStatus("Checking primary sources…");
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
  const ac = new AbortController();
  req.on("close", () => ac.abort());
  try {
    const gated = gateUserText(body?.q ?? body?.question ?? "", ip);
    if (gated.price) {
      const text = priceReply();
      sse(res, { type: "delta", text });
      sse(res, { type: "done", local: true, reason: "price" });
      appendLog({ ip, kind: "price", q: gated.question, a: text, reason: "price" });
      res.end();
      return;
    }
    const history = clipHistory(body?.history);
    const result = await streamXai({
      question: gated.question,
      history,
      jail: gated.jail,
      signal: ac.signal,
      onDelta: (text) => sse(res, { type: "delta", text }),
      onStatus: (text) => sse(res, { type: "status", text }),
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
    res.end();
  } catch (err) {
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
