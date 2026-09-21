import test from "node:test";
import assert from "node:assert/strict";
import { jwtExpUnix, tokenUsable, resolveApiKey, upstreamErrorMessage } from "./keys.mjs";

function fakeJwt(exp) {
  const h = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return h + "." + p + ".sig";
}

test("durable xai- keys are usable", () => {
  assert.equal(tokenUsable("xai-test-key"), true);
});

test("expired session JWTs are rejected", () => {
  const tok = fakeJwt(Math.floor(Date.now() / 1000) - 3600);
  assert.equal(jwtExpUnix(tok) < Date.now() / 1000, true);
  assert.equal(tokenUsable(tok), false);
});

test("fresh session JWTs are usable", () => {
  const tok = fakeJwt(Math.floor(Date.now() / 1000) + 3600);
  assert.equal(tokenUsable(tok), true);
});

test("resolveApiKey skips expired env JWT", () => {
  const expired = fakeJwt(Math.floor(Date.now() / 1000) - 60);
  const got = resolveApiKey({ XAI_API_KEY: expired }, Date.now());
  assert.notEqual(got, expired);
});

test("upstream 403 body is not hidden as HTTP 403", () => {
  const msg = upstreamErrorMessage(403, '{"code":"unauthenticated:bad-credentials","error":"The OAuth2 access token could not be validated."}');
  assert.match(msg, /expired|console\.x\.ai|Sign in/i);
});
