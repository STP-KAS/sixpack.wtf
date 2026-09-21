import test from "node:test";
import assert from "node:assert/strict";
import { gateUserText, isPricePrimary, looksLikeSeed, clipHistory } from "./policy.mjs";

test("price-only questions are primary", () => {
  assert.equal(isPricePrimary("what is the kaspa price"), true);
  assert.equal(isPricePrimary("will KAS moon"), true);
  assert.equal(isPricePrimary("price target for next month"), true);
  assert.equal(isPricePrimary("when binance listing"), true);
});

test("protocol questions are not price-primary", () => {
  assert.equal(isPricePrimary("what is GHOSTDAG"), false);
  assert.equal(isPricePrimary("is Toccata live"), false);
  assert.equal(
    isPricePrimary("Explain GHOSTDAG and also will it go to $10 after DAGKnight ships on rusty-kaspa"),
    false
  );
});

test("seeds are blocked and not echoed", () => {
  const phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  assert.equal(looksLikeSeed(phrase), true);
  assert.throws(() => gateUserText(phrase, "127.0.0.1"), /secret|recovery|burned/i);
});

test("empty and huge questions fail", () => {
  assert.throws(() => gateUserText("  ", "1.1.1.1"), /Ask a question/);
  assert.throws(() => gateUserText("x".repeat(5000), "1.1.1.1"), /too long/);
});

test("history clips seeds", () => {
  const h = clipHistory([
    { role: "user", content: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about" },
    { role: "assistant", content: "ok" },
  ]);
  assert.match(h[0].content, /redacted/i);
});
