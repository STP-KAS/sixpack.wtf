import test from "node:test";
import assert from "node:assert/strict";
import { describeStreamEvent, reasoningDelta } from "./trace.mjs";

test("web search events become a searching step", () => {
  const step = describeStreamEvent({ type: "response.web_search_call.in_progress", action: { query: "Toccata Kaspa" } });
  assert.equal(step.id, "web");
  assert.match(step.text, /Searching the web/);
  assert.match(step.text, /Toccata Kaspa/);
  assert.match(step.text, /slow/i);
});

test("x search events stay catalog", () => {
  const step = describeStreamEvent({ type: "response.output_item.added", item: { type: "x_search_call" } });
  assert.equal(step.id, "x");
  assert.match(step.text, /X handles/);
});

test("response.created admits the wait", () => {
  const step = describeStreamEvent({ type: "response.created" });
  assert.equal(step.id, "up");
  assert.match(step.text, /takes a while|chewing/i);
});

test("reasoning deltas are extracted", () => {
  assert.equal(reasoningDelta({ type: "response.reasoning_text.delta", delta: "checking tags" }), "checking tags");
  assert.equal(reasoningDelta({ choices: [{ delta: { reasoning_content: "hmm" } }] }), "hmm");
});
