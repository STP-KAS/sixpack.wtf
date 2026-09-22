import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { looksLikeSeed } from "./policy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(here, "logs");
const lessonsPath = path.join(here, "lessons.json");
const MAX_LESSONS = 80;
const MAX_LOG_BYTES = 8 * 1024 * 1024;

function ensureLogs() {
  fs.mkdirSync(logsDir, { recursive: true });
}

function safeText(value, n = 800) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  if (looksLikeSeed(s)) return "[redacted]";
  return s.slice(0, n);
}

export function loadLessons() {
  try {
    const raw = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.slice(-MAX_LESSONS);
  } catch {
    return [];
  }
}

function isJokeLesson(row) {
  return /\bjoke\b|100bps|roast me|make me laugh/i.test(String(row?.q || ""));
}

export function lessonsBlock() {
  const rows = loadLessons().filter((x) => Number(x.up || 0) >= Number(x.down || 0) && !isJokeLesson(x));
  if (!rows.length) return "";
  const lines = ["# Learned from this desk (thumbs, no PII)", ""];
  for (const row of rows.slice(-24)) {
    lines.push(`Q: ${safeText(row.q, 240)}`);
    lines.push(`A: ${safeText(row.a, 400)}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function appendLog(event) {
  try {
    ensureLogs();
    const file = path.join(logsDir, "chat.jsonl");
    const st = fs.existsSync(file) ? fs.statSync(file) : null;
    if (st && st.size > MAX_LOG_BYTES) {
      fs.renameSync(file, path.join(logsDir, `chat-${Date.now()}.jsonl`));
    }
    const line = JSON.stringify({
      at: new Date().toISOString(),
      ip: event.ip ? String(event.ip).slice(0, 64) : "",
      kind: event.kind || "turn",
      q: safeText(event.q, 500),
      a: safeText(event.a, 800),
      reason: event.reason || "",
      model: event.model || "",
    });
    fs.appendFileSync(file, line + "\n");
  } catch {
    /* desk logs are best-effort */
  }
}

export function recordFeedback({ up, q, a }) {
  const lessons = loadLessons();
  const question = safeText(q, 240);
  const answer = safeText(a, 400);
  if (!question || !answer || question === "[redacted]") return { ok: false };
  const existing = lessons.find((x) => x.q === question);
  if (existing) {
    if (up) existing.up = Number(existing.up || 0) + 1;
    else existing.down = Number(existing.down || 0) + 1;
  } else if (up) {
    lessons.push({
      id: "u-" + Date.now().toString(36),
      q: question,
      a: answer,
      up: 1,
      down: 0,
    });
  } else {
    lessons.push({
      id: "d-" + Date.now().toString(36),
      q: question,
      a: answer,
      up: 0,
      down: 1,
    });
  }
  const kept = lessons.slice(-MAX_LESSONS);
  fs.writeFileSync(lessonsPath, JSON.stringify(kept, null, 2) + "\n");
  appendLog({ kind: up ? "up" : "down", q: question, a: answer });
  return { ok: true };
}
