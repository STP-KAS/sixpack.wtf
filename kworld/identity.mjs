/** Browser identity. A test tab never writes the saved wallet. */

export const SAVED_KEY = "kworld-id-v1";
export const GUEST_KEY = "kworld-guest-v1";

function parse(raw) {
  try {
    return JSON.parse(raw || "null");
  } catch {
    return null;
  }
}

export function readIdentity(storage) {
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

/** Guest writes session only. A recurring wallet writes local and clears the test tab. */
export function writeIdentity(storage, next) {
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
