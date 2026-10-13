import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OLAF_DECIMALS, OLAF_SUPPLY, olafExtension } from "./kcc20.mjs";
import {
  applyOlafBuy,
  applyOlafSend,
  applyPractice,
  applyRules,
  applySpend,
  applyStreamBuy,
  applyToken,
  ensureOlaf,
  freshState,
  publicMints,
} from "./ledger.mjs";
import { RAILS, RESERVE, formatCents } from "./money.mjs";
import { OLAF_NOTE, OLAF_PAY_LINE, OLAF_RUN } from "./olaf-note.mjs";
import { create1984Service } from "./service.mjs";

const USER = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const OTHER = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

function held(state, address) {
  const account = state.accounts[address.toLowerCase()];
  const bag = account && account.tokens;
  return BigInt((bag && bag[olafExtension()]) || 0);
}

function desk(extra = {}) {
  let state = null;
  let pays = 0;
  const svc = create1984Service({
    squareOpen: true,
    load: () => state || { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0", mints: {} },
    save: (next) => {
      state = next;
    },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    now: () => Date.UTC(2026, 9, 13),
    pay: async () => {
      pays += 1;
      throw new Error("no pay");
    },
    guests: {
      async sessionKey({ token, address }) {
        if (token !== "good") throw new Error("This test tab does not match that address.");
        return { key: "22".repeat(32), address };
      },
    },
    ...extra,
  });
  return {
    svc,
    read: () => state,
    pays: () => pays,
  };
}

function post(svc, pathname, body) {
  return svc.handle({
    method: "POST",
    pathname,
    query: new URLSearchParams(),
    body: { network: "testnet-10", token: "good", ...body },
    ip: "127.0.0.1",
  });
}

test("the whole OLAF supply is minted once and a second pass does not mint", () => {
  const state = freshState();
  const first = ensureOlaf(state, 1);
  const second = ensureOlaf(state, 2);
  assert.equal(first.minted, true);
  assert.equal(second.minted, false);
  assert.equal(state.mints[olafExtension()].supply, String(OLAF_SUPPLY));
  assert.equal(state.mints[olafExtension()].cap, String(OLAF_SUPPLY));
  assert.equal(state.mints[olafExtension()].sealed, true);
  assert.equal(held(state, RESERVE), OLAF_SUPPLY);
  assert.equal(state.receipts.filter((row) => row.sku === "OLAF" && row.note.includes("Minted the whole")).length, 1);
  assert.equal(formatCents(OLAF_SUPPLY), "1000000.00");
  assert.equal(OLAF_DECIMALS, 2);
  assert.deepEqual(RAILS, ["kas", "poc", "kusdt"]);
  const row = publicMints(state).find((item) => item.name === "OLAF");
  assert.equal(row.sealed, true);
  assert.equal(row.done, true);
  assert.equal(row.supply, String(OLAF_SUPPLY));
});

test("the open mint desk cannot mint, send, or trade OLAF", () => {
  const state = freshState();
  ensureOlaf(state, 1);
  for (const option of ["new", "more", "send"]) {
    assert.throws(
      () => applyToken(state, { address: RESERVE, option, name: "OLAF", amount: "1", cap: "1", to: USER }, 2),
      /already minted/
    );
  }
  assert.throws(
    () => applyToken(state, { address: USER, option: "offer", name: "olaf", amount: "1", recvName: "ASH", recvAmount: "1" }, 3),
    /already minted/
  );
});

test("tKAS buys OLAF from the sealed supply and the same txid does not buy twice", () => {
  let state = freshState();
  ensureOlaf(state, 1);
  assert.equal(state.mints[olafExtension()].remaining, "0");
  assert.equal(state.mints[olafExtension()].mintAmount, String(OLAF_SUPPLY));
  const txid = "ab".repeat(32);
  const bought = applyOlafBuy(state, {
    address: USER,
    payment: { txid, paid: 100_000_000n },
    usdPerKas: 0.05,
  }, 2);
  state = bought.state;
  assert.equal(bought.result.ok, true);
  assert.equal(bought.result.peg, false);
  assert.equal(bought.result.cents, "5");
  assert.match(bought.result.receipt.note, /standard transfer/);
  assert.equal(held(state, USER), 5n);
  assert.equal(held(state, RESERVE), OLAF_SUPPLY - 5n);
  assert.equal(state.mints[olafExtension()].remaining, "0");
  const again = applyOlafBuy(state, {
    address: USER,
    payment: { txid, paid: 100_000_000n },
    usdPerKas: 0.05,
  }, 3);
  assert.equal(again.state, state);
  assert.equal(held(state, USER), 5n);
  assert.throws(
    () => applyOlafBuy(state, {
      address: OTHER,
      payment: { txid, paid: 100_000_000n },
      usdPerKas: 0.05,
    }, 4),
    /already used/
  );
  assert.equal(held(state, RESERVE), OLAF_SUPPLY - 5n);
});

test("a transfer keeps the supply and a shop pay returns the cents to the reserve", () => {
  let state = freshState();
  ensureOlaf(state, 1);
  const sent = applyOlafSend(state, { address: RESERVE, to: USER, amount: "100" }, 2);
  state = sent.state;
  assert.equal(held(state, USER), 100n);
  assert.equal(held(state, RESERVE), OLAF_SUPPLY - 100n);
  assert.equal(state.mints[olafExtension()].supply, String(OLAF_SUPPLY));
  assert.match(sent.result.receipt.note, /Not a covenant/);
  const paid = applySpend(state, { address: USER, shop: "cafe", sku: "water", rail: "olaf", confirmed: true }, 3);
  state = paid.state;
  assert.equal(paid.result.ok, true);
  assert.equal(held(state, USER), 90n);
  assert.equal(held(state, RESERVE), OLAF_SUPPLY - 90n);
  assert.match(paid.result.receipt.note, /Nia's Cafe · Water/);
  assert.match(paid.result.receipt.note, /Based Apps/);
  assert.match(paid.result.receipt.note, /Not a covenant/);
  assert.equal(paid.result.receipt.rail, "olaf");
  assert.throws(
    () => applySpend(state, { address: USER, shop: "cafe", sku: "coffee", rail: "olaf", confirmed: true }, 4),
    /Not enough OLAF/
  );
  assert.equal(held(state, USER), 90n);
  const watched = applyStreamBuy(state, { address: USER, id: "clip1", title: "Clip", cents: 15, rail: "olaf", confirmed: true }, 5);
  state = watched.state;
  assert.equal(held(state, USER), 75n);
  assert.equal(state.accounts[USER].stream.includes("clip1"), true);
  assert.match(watched.result.receipt.note, /Based Apps/);
});

test("POCencept still spends, and a spending rule can name OLAF without joining the three rails", () => {
  let state = freshState();
  ensureOlaf(state, 1);
  state = applyOlafSend(state, { address: RESERVE, to: USER, amount: "50" }, 2).state;
  state = applyPractice(state, { address: USER }, 3).state;
  const poc = applySpend(state, { address: USER, shop: "cafe", sku: "water", rail: "poc", confirmed: true }, 4);
  assert.equal(poc.result.ok, true);
  assert.equal(poc.result.receipt.rail, "poc");
  assert.equal(poc.result.receipt.note, "Nia's Cafe · Water");
  assert.equal(held(poc.state, USER), 50n);
  assert.throws(
    () => applyRules(state, { address: USER, rules: { rails: ["nope"] } }, 5),
    /Unknown rail/
  );
  state = applyRules(state, { address: USER, rules: { rails: ["poc"] } }, 6).state;
  assert.throws(
    () => applySpend(state, { address: USER, shop: "cafe", sku: "water", rail: "olaf", confirmed: true }, 7),
    /OLAF/
  );
  state = applyRules(state, { address: USER, rules: { rails: ["olaf"] } }, 8).state;
  const olaf = applySpend(state, { address: USER, shop: "cafe", sku: "water", rail: "olaf", confirmed: true }, 9);
  assert.equal(olaf.result.ok, true);
  assert.throws(
    () => applySpend(olaf.state, { address: USER, shop: "cafe", sku: "tea", rail: "poc", confirmed: true }, 10),
    /POCencept/
  );
});

test("mainnet is refused and a send to the same address is refused", () => {
  const state = freshState();
  ensureOlaf(state, 1);
  assert.throws(
    () => applyOlafSend(state, { address: "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", to: USER, amount: "1" }, 2),
    /Mainnet/
  );
  assert.throws(
    () => applyOlafSend(state, { address: RESERVE, to: RESERVE, amount: "1" }, 3),
    /another address/
  );
  assert.equal(held(state, RESERVE), OLAF_SUPPLY);
});

test("the note keeps OLAF beside the three rails", () => {
  const text = OLAF_NOTE.lines.join(" ");
  assert.equal(OLAF_NOTE.lines.length, 7);
  assert.match(text, /minted once/);
  assert.match(text, /1,000,000\.00 OLAF/);
  assert.match(text, /100 OLAF units are 1\.00 OLAF/);
  assert.match(text, /does not lock that tKAS/);
  assert.match(text, /does not pass through SquarePeg/);
  assert.match(text, /Kaspa Privacy Initiative/);
  assert.match(text, /rejects new tokens/);
  assert.match(text, /not Kaspa core/);
  assert.match(text, /Based Apps/);
  assert.match(text, /Last Call, not Final/);
  assert.match(OLAF_PAY_LINE, /Swap tKAS/);
  assert.match(OLAF_PAY_LINE, /does not redeem/);
  assert.match(text, /remaining is 0/);
  assert.equal(OLAF_RUN[0].includes("1984/olaf.test.mjs"), true);
  assert.doesNotMatch(text, /kaspatest:/);
});

test("a guest or pasted tab pays OLAF on the ledger, and the tKAS payer is not called", async () => {
  const { svc, read, pays } = desk();
  const look = await svc.handle({
    method: "GET",
    pathname: "/api/1984/olaf",
    query: new URLSearchParams(),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(look.status, 200);
  assert.equal(look.body.sealed, true);
  assert.equal(look.body.remaining, "0");
  assert.equal(look.body.supply, String(OLAF_SUPPLY));
  assert.equal(look.body.decimals, 2);
  assert.equal(look.body.experimental, true);
  const minted = await post(svc, "/api/1984/mint", { address: RESERVE, option: "more", name: "OLAF", amount: "1" });
  assert.equal(minted.status, 400);
  assert.match(minted.body.error, /already minted/);
  const sent = await post(svc, "/api/1984/olaf/send", { address: RESERVE, to: USER, amount: "25" });
  assert.equal(sent.status, 200, sent.body && sent.body.error);
  assert.equal(sent.body.account.tokens.find((row) => row.name === "OLAF").amount, String(OLAF_SUPPLY - 25n));
  const buyer = await svc.handle({
    method: "GET",
    pathname: "/api/1984/account",
    query: new URLSearchParams({ address: USER }),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(buyer.body.account.tokens.find((row) => row.name === "OLAF").amount, "25");
  const paid = await post(svc, "/api/1984/spend", { address: USER, shop: "cafe", sku: "water", rail: "olaf", confirmed: true });
  assert.equal(paid.status, 200, paid.body && paid.body.error);
  assert.equal(paid.body.ok, true);
  assert.equal(paid.body.receipt.rail, "olaf");
  assert.match(paid.body.receipt.note, /Based Apps/);
  assert.equal(pays(), 0);
  assert.equal(held(read(), USER), 15n);
  assert.equal(held(read(), RESERVE), OLAF_SUPPLY - 15n);
  const again = ensureOlaf(read(), 9);
  assert.equal(again.minted, false);
  const guestSpend = readFileSync(new URL("./service.mjs", import.meta.url), "utf8");
  assert.match(guestSpend, /pathname === "\/api\/1984\/guest\/spend"/);
  assert.match(guestSpend, /rail: "kas"/);
});

test("a closed square still shows OLAF and refuses a transfer", async () => {
  const { svc, read } = desk({ squareOpen: false });
  const look = await svc.handle({
    method: "GET",
    pathname: "/api/1984/olaf",
    query: new URLSearchParams(),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(look.status, 200);
  assert.equal(look.body.supply, String(OLAF_SUPPLY));
  const sent = await post(svc, "/api/1984/olaf/send", { address: RESERVE, to: OTHER, amount: "1" });
  assert.equal(sent.status, 503);
  assert.match(sent.body.error, /Closed until further notice/);
  assert.equal(held(read(), RESERVE), OLAF_SUPPLY);
  assert.equal(held(read(), OTHER), 0n);
});
