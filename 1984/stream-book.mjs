/** SI stream catalog. Titles people share. A price stays off the play link until it is paid. */

export const STREAM_KINDS = Object.freeze([
  { id: "series", label: "Series" },
  { id: "remake", label: "Remakes" },
  { id: "documentary", label: "Documentaries" },
  { id: "short", label: "Short movies" },
]);

const KIND_IDS = new Set(STREAM_KINDS.map((row) => row.id));

export const EXAMPLE_ID = "desk-example";
export const EXAMPLE_CENTS = 15;

export const SEED = Object.freeze([
  Object.freeze({
    id: EXAMPLE_ID,
    kind: "short",
    title: "Example",
    blurb: "A short movie from this desk. 0.15 on tKAS, POCencept, or KUSDT.",
    cents: EXAMPLE_CENTS,
    free: false,
    owner: "desk",
    file: "desk-example.mp4",
    src: "",
  }),
]);

export function catalog(state) {
  const extra = Array.isArray(state && state.streamTitles) ? state.streamTitles : [];
  return SEED.concat(extra);
}

export function titleById(state, id) {
  const key = String(id || "");
  return catalog(state).find((row) => row.id === key) || null;
}

export function publicTitle(row, unlocked) {
  const cents = Number(row.cents) || 0;
  const free = !!row.free || cents <= 0;
  const open = free || !!unlocked;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    blurb: row.blurb || "",
    cents,
    free,
    locked: !open,
    owner: row.owner || "",
    desk: row.owner === "desk",
  };
}

export function publicStream(state, ownedIds) {
  const owned = new Set(ownedIds || []);
  return {
    ok: true,
    kinds: STREAM_KINDS.map((row) => ({ id: row.id, label: row.label })),
    titles: catalog(state).map((row) => publicTitle(row, owned.has(row.id))),
  };
}

export function mediaName(file) {
  const name = String(file || "");
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return "";
  if (!/^[\w.-]+\.mp4$/.test(name)) return "";
  return name;
}

/** Byte range for a video file. An empty header is the whole file. */
export function parseByteRange(header, size) {
  const total = Number(size);
  if (!Number.isInteger(total) || total <= 0) return { error: 416 };
  if (header == null || header === "") return { start: 0, end: total - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (match[1] === "" && match[2] === "")) return { error: 416 };
  let start;
  let end;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return { error: 416 };
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? total - 1 : Number(match[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= total || end < start) {
      return { error: 416 };
    }
    if (end >= total) end = total - 1;
  }
  return { start, end, partial: true };
}

function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function centsFromPrice(text) {
  const s = String(text == null ? "" : text).trim();
  if (s === "" || s === "0" || s === "0.0" || s === "0.00") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Type a price like 0.15, or 0 for free.");
  const [w, f = ""] = s.split(".");
  const cents = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  if (cents > 100000n) throw new Error("The price stays at 1000.00 or less.");
  return Number(cents);
}

export function normalizeShare(input, address) {
  const title = cleanText(input && input.title, 80);
  if (title.length < 1) throw new Error("Type a title.");
  const kind = String((input && input.kind) || "");
  if (!KIND_IDS.has(kind)) throw new Error("Pick series, remake, documentary, or short.");
  const blurb = cleanText(input && input.blurb, 280);
  const cents = centsFromPrice(input && input.price);
  const src = String((input && input.src) || "").trim();
  let parsed;
  try {
    parsed = new URL(src);
  } catch {
    throw new Error("Paste an https link to the video.");
  }
  if (parsed.protocol !== "https:") throw new Error("The video link has to be https.");
  if (src.length > 500) throw new Error("That video link is too long.");
  const id = "si" + Math.random().toString(16).slice(2, 10);
  return {
    id,
    kind,
    title,
    blurb,
    cents,
    free: cents === 0,
    owner: address,
    file: "",
    src,
    at: 0,
  };
}

export function addTitle(state, row) {
  const next = { ...state, streamTitles: Array.isArray(state.streamTitles) ? state.streamTitles.slice() : [] };
  const mine = next.streamTitles.filter((item) => String(item.owner || "").toLowerCase() === String(row.owner).toLowerCase());
  if (mine.length >= 40) throw new Error("This address already has 40 titles on SI stream.");
  if (next.streamTitles.length >= 400) throw new Error("SI stream is full on this desk.");
  next.streamTitles.push(row);
  return next;
}

export function removeTitle(state, id, address) {
  const key = String(id || "");
  if (SEED.some((row) => row.id === key)) throw new Error("The desk example stays.");
  const list = Array.isArray(state.streamTitles) ? state.streamTitles : [];
  const row = list.find((item) => item.id === key);
  if (!row) throw new Error("That title is not on SI stream.");
  if (String(row.owner || "").toLowerCase() !== String(address || "").toLowerCase()) {
    throw new Error("Only the address that shared this title can take it down.");
  }
  return { ...state, streamTitles: list.filter((item) => item.id !== key) };
}
