import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMatureEntry } from "./pay.mjs";

describe("faucet coinbase maturity", () => {
  it("spends ordinary coins and waits out fresh mining rewards", () => {
    const tip = 580312944n;
    assert.equal(isMatureEntry({ isCoinbase: false, blockDaaScore: tip }, tip), true);
    assert.equal(isMatureEntry({ isCoinbase: true, blockDaaScore: tip - 925n }, tip), false);
    assert.equal(isMatureEntry({ isCoinbase: true, blockDaaScore: tip - 1000n }, tip), true);
  });
});
