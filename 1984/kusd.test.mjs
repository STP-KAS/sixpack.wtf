import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { freshState } from "./ledger.mjs";
import { kusdHolding, mintKusd, redeemKusd, sendKusd } from "./kusd.mjs";

const A = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const B = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";
const PRICE = 0.05;

function minted() {
  return mintKusd(freshState(), {
    address: A,
    usdPerKas: PRICE,
    payment: { txid: "ab", paid: 200_000_000n },
  });
}

test("KUSD has no freeze", () => {
  const source = readFileSync(new URL("./kusd.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /freeze/i);
});

test("mint locks tKAS and redeem returns that same lock", () => {
  const opened = minted();
  assert.equal(kusdHolding(opened.state, A).kusd, "10");
  assert.equal(kusdHolding(opened.state, A).kusdSompi, "200000000");
  const back = redeemKusd(opened.state, { address: A, cents: 10n });
  assert.equal(back.sompi, 200_000_000n);
  assert.equal(kusdHolding(back.state, A).kusd, "0");
  assert.equal(kusdHolding(back.state, A).kusdSompi, "0");
});

test("a partial redeem keeps the rest of the lock", () => {
  const opened = minted();
  const back = redeemKusd(opened.state, { address: A, cents: 5n });
  assert.equal(back.sompi, 100_000_000n);
  assert.equal(kusdHolding(back.state, A).kusd, "5");
  assert.equal(kusdHolding(back.state, A).kusdSompi, "100000000");
});

test("send moves the claim and the locked share", () => {
  const opened = minted();
  const sent = sendKusd(opened.state, { address: A, to: B, cents: 4n });
  assert.equal(kusdHolding(sent.state, A).kusd, "6");
  assert.equal(kusdHolding(sent.state, A).kusdSompi, "120000000");
  assert.equal(kusdHolding(sent.state, B).kusd, "4");
  assert.equal(kusdHolding(sent.state, B).kusdSompi, "80000000");
  const back = redeemKusd(sent.state, { address: B, cents: 4n });
  assert.equal(back.sompi, 80_000_000n);
});

test("the same transaction does not mint twice", () => {
  const opened = minted();
  assert.throws(() => mintKusd(opened.state, {
    address: A,
    usdPerKas: PRICE,
    payment: { txid: "ab", paid: 200_000_000n },
  }), /already used/);
});
