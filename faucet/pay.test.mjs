import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isMatureEntry, rpcConnectPlan } from "./pay.mjs";

describe("faucet coinbase maturity", () => {
  it("spends ordinary coins and waits out fresh mining rewards", () => {
    const tip = 580312944n;
    assert.equal(isMatureEntry({ isCoinbase: false, blockDaaScore: tip }, tip), true);
    assert.equal(isMatureEntry({ isCoinbase: true, blockDaaScore: tip - 925n }, tip), false);
    assert.equal(isMatureEntry({ isCoinbase: true, blockDaaScore: tip - 1000n }, tip), true);
  });
});

describe("a tKAS send skips a dead local node", () => {
  it("uses a public node after the desk node has missed", () => {
    assert.equal(rpcConnectPlan(1_000, 5_000), "public");
    assert.equal(rpcConnectPlan(6_000, 5_000), "local");
    const source = readFileSync(new URL("./pay.mjs", import.meta.url), "utf8");
    assert.match(source, /LOCAL_WAIT_MS = 400/);
    assert.match(source, /FEE_WAIT_MS = 400/);
    assert.doesNotMatch(source, /RPC_URL, 2500/);
    assert.doesNotMatch(source, /getFeeEstimate\(\{\}\), 8000/);
  });
});
