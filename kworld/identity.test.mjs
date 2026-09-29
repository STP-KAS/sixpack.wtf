import assert from "node:assert/strict";
import test from "node:test";
import { GUEST_KEY, SAVED_KEY, readIdentity, writeIdentity } from "./identity.mjs";

function mem() {
  const local = new Map();
  const session = new Map();
  const box = (map) => ({
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  });
  return { local: box(local), session: box(session), raw: { local, session } };
}

const WALLET = "kaspatest:" + "q".repeat(61);
const GUEST = "kaspatest:" + "p".repeat(61);

test("a test tab does not replace the saved Testnet wallet", () => {
  const storage = mem();
  writeIdentity(storage, { address: WALLET, label: "kasware", kind: "kasware" });
  writeIdentity(storage, { address: GUEST, label: "test tab", kind: "guest", token: "tab-token" });
  const during = readIdentity(storage);
  assert.equal(during.kind, "guest");
  assert.equal(during.token, "tab-token");
  assert.equal(during.address, GUEST);
  const saved = JSON.parse(storage.raw.local.get(SAVED_KEY));
  assert.equal(saved.address, WALLET);
  assert.equal(saved.kind, "kasware");
  assert.equal(saved.token, undefined);
  assert.equal(storage.raw.session.get(GUEST_KEY).includes(WALLET), false);
  storage.session.removeItem(GUEST_KEY);
  const after = readIdentity(storage);
  assert.equal(after.kind, "kasware");
  assert.equal(after.address, WALLET);
  assert.equal(after.token, undefined);
});

test("choosing a wallet again clears the test tab and keeps the new history", () => {
  const storage = mem();
  writeIdentity(storage, { address: WALLET, label: WALLET, kind: "address" });
  writeIdentity(storage, { address: GUEST, kind: "guest", token: "tab-token" });
  writeIdentity(storage, { address: WALLET, label: "kastle", kind: "kastle" });
  const id = readIdentity(storage);
  assert.equal(id.kind, "kastle");
  assert.equal(id.address, WALLET);
  assert.equal(storage.raw.session.has(GUEST_KEY), false);
  assert.equal(JSON.parse(storage.raw.local.get(SAVED_KEY)).token, undefined);
});
