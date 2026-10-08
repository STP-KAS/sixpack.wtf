/** Browser identity. A test tab never writes the saved wallet. */

export const SAVED_KEY = "1984-id-v1";
export const GUEST_KEY = "1984-guest-v1";
export const BROWSER_KEY = "1984-browser-v1";
const OLD_SAVED_KEY = "kworld-id-v1";
const OLD_GUEST_KEY = "kworld-guest-v1";

function migrate(storage, box, key, oldKey) {
  const previous = storage[box].getItem(oldKey);
  if (!previous) return;
  if (!storage[box].getItem(key)) storage[box].setItem(key, previous);
  storage[box].removeItem(oldKey);
}

function migrateAll(storage) {
  migrate(storage, "session", GUEST_KEY, OLD_GUEST_KEY);
  migrate(storage, "local", SAVED_KEY, OLD_SAVED_KEY);
}

function parse(raw) {
  try {
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
}

export function readIdentity(storage) {
  migrateAll(storage);
  const guest = parse(storage.session.getItem(GUEST_KEY));
  if (guest && guest.address && guest.token && guest.kind !== "saved") {
    return { address: guest.address, label: "test tab", kind: "guest", token: guest.token };
  }
  const saved = parse(storage.local.getItem(SAVED_KEY));
  if (saved && saved.address && saved.kind !== "guest" && !saved.token) {
    return { address: saved.address, label: saved.label || "", kind: saved.kind || "address" };
  }
  return { address: "", label: "", kind: "" };
}

/** A random id for this browser. It is not a key. Storage that refuses the write cannot be matched later. */
export function browserMarker(storage) {
  migrateAll(storage);
  try {
    const current = String(storage.local.getItem(BROWSER_KEY) || "");
    if (/^[0-9a-f]{32}$/.test(current)) return current;
    const cryptoObj = globalThis.crypto;
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") return "";
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    const id = [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
    storage.local.setItem(BROWSER_KEY, id);
    return id;
  } catch {
    return "";
  }
}

/** Guest writes session only. A recurring wallet writes local and clears the test tab. */
export function writeIdentity(storage, next) {
  migrateAll(storage);
  if (!next || !next.address) throw new Error("Choose an address first.");
  if (next.kind === "guest") {
    if (!next.token) throw new Error("This test tab has no login.");
    storage.session.setItem(GUEST_KEY, JSON.stringify({ address: next.address, token: next.token }));
    return;
  }
  storage.session.removeItem(GUEST_KEY);
  storage.local.setItem(
    SAVED_KEY,
    JSON.stringify({ address: next.address, label: next.label || next.address, kind: next.kind || "address" })
  );
}

/** This visit ends. A test tab closes. The saved wallet stays for Returning. */
export function clearGuest(storage) {
  migrateAll(storage);
  storage.session.removeItem(GUEST_KEY);
}

/** Drop the saved wallet and the test tab. */
export function clearIdentity(storage) {
  migrateAll(storage);
  storage.session.removeItem(GUEST_KEY);
  storage.local.removeItem(SAVED_KEY);
}
