import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIRST_TX_DEADLINE_MS, firstTxAllowed, lookupFirstTxMs, requireOldAddress, tooNewError } from "./age.mjs";

describe("faucet address age", () => {
  it("allows first tx on 18 Jul 2026 UTC, refuses 19 Jul", () => {
    assert.equal(firstTxAllowed(Date.UTC(2026, 6, 18, 23, 59, 59)), true);
    assert.equal(firstTxAllowed(Date.UTC(2026, 6, 19, 0, 0, 0)), false);
    assert.equal(firstTxAllowed(Date.UTC(2026, 8, 18, 16, 36, 0)), false);
    assert.equal(firstTxAllowed(0), false);
    assert.equal(firstTxAllowed(null), false);
  });

  it("deadline is 19 Jul 2026 00:00 UTC", () => {
    assert.equal(FIRST_TX_DEADLINE_MS, Date.UTC(2026, 6, 19));
  });

  it("too-new error is AGE", () => {
    assert.equal(tooNewError().code, "AGE");
  });

  it("lookupFirstTxMs uses oldest page (offset total-1)", async () => {
    const calls = [];
    const fake = async (url) => {
      calls.push(url);
      if (url.includes("transactions-count")) {
        return { ok: true, json: async () => ({ total: 41 }) };
      }
      return {
        ok: true,
        json: async () => [{ block_time: Date.UTC(2026, 6, 18, 12, 0, 0), transaction_id: "abc" }],
      };
    };
    const ms = await lookupFirstTxMs("kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0lda", fake);
    assert.equal(ms, Date.UTC(2026, 6, 18, 12, 0, 0));
    assert.match(calls[1], /offset=40/);
  });

  it("empty or missing history is too new (fail closed)", async () => {
    const empty = async (url) => {
      if (url.includes("transactions-count")) return { ok: true, json: async () => ({ total: 0 }) };
      return { ok: true, json: async () => [] };
    };
    await assert.rejects(() => lookupFirstTxMs("kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0lda", empty), /too new/);
    await assert.rejects(
      () =>
        requireOldAddress("kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0lda", {
          fetchImpl: async () => ({
            ok: true,
            json: async () => [{ block_time: Date.UTC(2026, 8, 18) }],
          }),
        }),
      /too new/
    );
  });
});
