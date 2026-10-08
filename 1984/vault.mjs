/** Classroom vault on this square. A note plus a reader list and an open time. Not encrypted. No covenant is deployed. */

import { assertTestnet } from "./money.mjs";

export const VAULT_DESK =
  "This desk stores the note. It is not encrypted, so this desk can read it. No covenant is deployed. A real secret does not belong here.";

const PURPOSES = new Set(["note", "nda", "enterprise", "other"]);
const BASES = new Set(["desk", "covenant"]);
const MAX_BOOK = 80;
const MAX_EACH = 12;
const MAX_READERS = 8;
const MAX_TITLE = 80;
const MAX_NOTE = 2000;
const MAX_OPEN = 4_102_444_800_000;

function clone(state) {
  return structuredClone(state);
}

function readBook(state) {
  const raw = state && state.vaults;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

function ensureBook(state) {
  if (!state.vaults || typeof state.vaults !== "object" || Array.isArray(state.vaults)) state.vaults = {};
  return state.vaults;
}

function cleanText(value, max, label) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, "").trim();
  if (!text) throw new Error("Type a " + label + ".");
  if (text.length > max) throw new Error("A " + label + " is at most " + max + " characters.");
  return text;
}

function purposeOf(raw) {
  const purpose = String(raw || "note").toLowerCase().trim();
  if (!PURPOSES.has(purpose)) throw new Error("Purpose is note, nda, enterprise, or other.");
  return purpose;
}

function basisOf(raw) {
  const basis = String(raw || "desk").toLowerCase().trim();
  if (!BASES.has(basis)) throw new Error("A rule is desk or covenant. A covenant mark is a label. No covenant is deployed.");
  return basis;
}

function openAtOf(raw) {
  if (raw == null || raw === "" || raw === 0 || raw === "0") return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_OPEN) {
    throw new Error("Open time is a whole number of milliseconds, or leave it empty.");
  }
  return n;
}

function readersOf(raw, owner) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(/[\s,]+/);
  const out = [];
  const seen = new Set();
  const mine = owner.toLowerCase();
  for (const item of list) {
    const piece = String(item || "").trim();
    if (!piece) continue;
    const addr = assertTestnet(piece);
    const key = addr.toLowerCase();
    if (key === mine || seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
    if (out.length > MAX_READERS) throw new Error("A vault lists at most 8 readers.");
  }
  return out;
}

function nextId(book) {
  let n = Object.keys(book).length + 1;
  let id = "v" + n;
  while (book[id]) {
    n += 1;
    id = "v" + n;
  }
  return id;
}

function findOwned(book, owner, id) {
  const row = book[String(id || "")];
  if (!row || row.owner.toLowerCase() !== owner.toLowerCase()) {
    throw new Error("That vault is not on this address.");
  }
  return row;
}

function canRead(row, address, now) {
  if (row.owner.toLowerCase() === address.toLowerCase()) return true;
  const listed = (row.readers || []).some((addr) => addr.toLowerCase() === address.toLowerCase());
  if (!listed) return false;
  return Number(now) >= Number(row.openAt || 0);
}

function publicRow(row, address, now) {
  const allowed = canRead(row, address, now);
  const view = {
    id: row.id,
    owner: row.owner,
    purpose: row.purpose,
    basis: row.basis,
    readers: (row.readers || []).slice(),
    openAt: row.openAt || 0,
    sealed: !!row.sealed,
    at: row.at || 0,
    readable: allowed,
  };
  if (allowed) {
    view.title = row.title;
    view.body = row.body;
  }
  return view;
}

export function publicVaults(state, address, now) {
  const me = assertTestnet(address);
  const clock = Number(now) || 0;
  const rows = Object.values(readBook(state)).filter((row) => {
    if (!row || !row.owner) return false;
    if (row.owner.toLowerCase() === me.toLowerCase()) return true;
    return (row.readers || []).some((addr) => addr.toLowerCase() === me.toLowerCase());
  });
  rows.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  return {
    vaults: rows.slice(0, 40).map((row) => publicRow(row, me, clock)),
    desk: VAULT_DESK,
  };
}

function savedNote(basis) {
  if (basis === "covenant") {
    return "Saved on this desk. The covenant mark is a label. No covenant is deployed. This page still checks the readers and the time.";
  }
  return "Saved on this desk. This page checks the readers and the time. No covenant is deployed.";
}

export function applyVaultSave(state, input, now) {
  const owner = assertTestnet(input.address);
  const title = cleanText(input.title, MAX_TITLE, "title");
  const text = cleanText(input.body, MAX_NOTE, "note");
  const readers = readersOf(input.readers, owner);
  const openAt = openAtOf(input.openAt);
  const purpose = purposeOf(input.purpose);
  const basis = basisOf(input.basis);
  const next = clone(state || {});
  const book = ensureBook(next);
  const id = String((input && input.id) || "").trim();
  let row = null;
  if (id) {
    row = findOwned(book, owner, id);
    if (row.sealed) throw new Error("This vault is sealed. The note and the rule stay.");
  } else {
    const owned = Object.values(book).filter((item) => item.owner && item.owner.toLowerCase() === owner.toLowerCase()).length;
    if (owned >= MAX_EACH) throw new Error("This address already has 12 vault notes.");
    if (Object.keys(book).length >= MAX_BOOK) throw new Error("The vault book on this square is full.");
    const made = nextId(book);
    row = { id: made, owner };
    book[made] = row;
  }
  row.title = title;
  row.body = text;
  row.readers = readers;
  row.openAt = openAt;
  row.purpose = purpose;
  row.basis = basis;
  row.sealed = false;
  row.at = now;
  return {
    state: next,
    result: {
      ok: true,
      ...publicVaults(next, owner, now),
      focus: row.id,
      note: savedNote(basis),
    },
  };
}

export function applyVaultSeal(state, input, now) {
  const owner = assertTestnet(input.address);
  const next = clone(state || {});
  const book = ensureBook(next);
  const row = findOwned(book, owner, input && input.id);
  if (row.sealed) throw new Error("This vault is already sealed.");
  row.sealed = true;
  row.at = now;
  return {
    state: next,
    result: {
      ok: true,
      ...publicVaults(next, owner, now),
      focus: row.id,
      note: "Sealed. The note and the rule stay. This page still checks who may read it. No covenant is deployed.",
    },
  };
}
