import assert from "node:assert/strict";
import test from "node:test";
import { kasSpendAction } from "./kas-spend.mjs";

test("a guest shop payment stays on the server, which asks before the key signs", () => {
  assert.equal(kasSpendAction({ kind: "guest", txid: "", needsConfirm: true, ready: false }), "guest");
});

test("a wallet shop payment asks before it signs, then signs, and a pasted txid is only claimed", () => {
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: true, ready: false }), "ask");
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: false, ready: true }), "sign");
  assert.equal(kasSpendAction({ kind: "kastle", txid: "ab", needsConfirm: false, ready: false }), "credit");
  assert.equal(kasSpendAction({ kind: "kasware", txid: "", needsConfirm: false, ready: false }), "stop");
});
