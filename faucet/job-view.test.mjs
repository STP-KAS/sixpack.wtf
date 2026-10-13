import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classifyFaucetJob } from "./job-view.mjs";

describe("faucet popup leaves Loading when the job finishes", () => {
  it("shows success when the payout is done", () => {
    const kind = classifyFaucetJob({
      ok: true,
      pending: false,
      status: "done",
      step: "Broadcasting",
      txids: ["abc"],
    });
    assert.equal(kind.kind, "success");
    assert.deepEqual(kind.txids, ["abc"]);
  });

  it("shows success after the HTTP status overwrites the job word", () => {
    const kind = classifyFaucetJob({
      ok: true,
      pending: false,
      status: 200,
      step: "Broadcasting",
      txids: ["abc"],
    });
    assert.equal(kind.kind, "success");
  });

  it("shows the error instead of spinning after the last step", () => {
    const kind = classifyFaucetJob({
      ok: true,
      pending: false,
      status: 200,
      step: "Stopped",
      error: "The Testnet-10 node did not take the send.",
    });
    assert.equal(kind.kind, "error");
    assert.match(kind.error, /did not take the send/);
  });

  it("keeps Loading while the last step is still in progress", () => {
    const kind = classifyFaucetJob({
      ok: false,
      pending: true,
      status: "loading",
      step: "Broadcasting",
    });
    assert.equal(kind.kind, "wait");
  });

  it("does not let the page parser replace the job status", () => {
    const source = readFileSync(new URL("../faucet.js", import.meta.url), "utf8");
    assert.match(source, /charAt\(0\) === "</);
    assert.doesNotMatch(source, /j\.status = res\.status/);
    assert.match(source, /if \(typeof j\.ok !== "boolean"\) j\.ok = res\.ok/);
    assert.match(source, /AbortSignal\.timeout\(8000\)/);
  });

  it("a closed faucet refuses a payout and does not write the ledger", () => {
    const serve = readFileSync(new URL("../serve.mjs", import.meta.url), "utf8");
    const postAt = serve.indexOf('url.pathname === "/api/faucet" && req.method === "POST"');
    assert.ok(postAt > 0);
    const window = serve.slice(postAt, postAt + 280);
    assert.match(window, /sendJson\(res, 403/);
    assert.match(window, /Closed\. Mine your own tKAS\./);
    assert.equal(serve.includes("recordClaim("), false);
  });
});
