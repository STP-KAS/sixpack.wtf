import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OLAF_DECIMALS, olafExtension } from "./kcc20.mjs";
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
  publicAccount,
  publicMints,
} from "./ledger.mjs";
import { RAILS, RESERVE, centsForSompi, formatCents } from "./money.mjs";
import { OLAF_NOTE, OLAF_PAY_LINE, OLAF_RUN } from "./olaf-note.mjs";
import { changeSompi, createDepositNote, createIdentity, planOlafSend, planOlafSpend, scanNotes } from "./olaf-pool.mjs";
import { create1984Service } from "./service.mjs";

const USER = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const OTHER = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";
const QUOTE = 0.05;

function desk(extra = {}, initial = null) {
  let state = initial;
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

function noteKeys(row) {
  return Object.keys(row).sort().join(",");
}

async function shield(state, identity, sompi, now) {
  const cents = centsForSompi(sompi, QUOTE);
  const note = await createDepositNote(identity, cents, sompi);
  const txid = "ab".repeat(16) + String(now).padStart(16, "0").slice(-16);
  const out = applyOlafBuy(state, {
    address: USER,
    payment: { txid, paid: sompi },
    usdPerKas: QUOTE,
    note,
  }, now);
  return out;
}

test("loading the old public supply deletes it and leaves an empty pool", () => {
  const extension = olafExtension();
  const state = freshState();
  state.mints[extension] = {
    name: "OLAF",
    extension,
    supply: "100000000",
    cap: "100000000",
    sealed: true,
    remaining: "0",
    mintAmount: "100000000",
  };
  state.accounts[USER.toLowerCase()] = { address: USER, tokens: { [extension]: "25" } };
  const first = ensureOlaf(state, 1);
  assert.equal(first.minted, false);
  assert.equal(first.retired, true);
  assert.equal(state.mints[extension], undefined);
  assert.equal(state.accounts[USER.toLowerCase()].tokens[extension], undefined);
  assert.equal(state.olaf.version, 2);
  assert.equal(state.olaf.cents, "0");
  assert.equal(state.olaf.sompi, "0");
  assert.equal(state.olaf.notes.length, 0);
  assert.equal(publicMints(state).some((row) => row.name === "OLAF"), false);
  assert.equal(publicAccount(state, USER).tokens.some((row) => row.name === "OLAF"), false);
  const second = ensureOlaf(state, 2);
  assert.equal(second.retired, false);
  assert.equal(OLAF_DECIMALS, 2);
  assert.equal(formatCents(100n), "1.00");
  assert.deepEqual(RAILS, ["kas", "poc", "kusdt"]);
});

test("the open mint desk cannot mint OLAF", () => {
  const state = freshState();
  ensureOlaf(state, 1);
  for (const option of ["new", "more", "send"]) {
    assert.throws(
      () => applyToken(state, { address: RESERVE, option, name: "OLAF", amount: "1", cap: "1", to: USER }, 2),
      /shielded note/
    );
  }
  assert.throws(
    () => applyToken(state, { address: USER, option: "offer", name: "olaf", amount: "1", recvName: "ASH", recvAmount: "1" }, 3),
    /shielded note/
  );
});

test("tKAS shields a note, the book does not keep the secret, and the same txid does not shield twice", async () => {
  const identity = await createIdentity();
  let state = freshState();
  const sompi = 100_000_000n;
  const bought = await shield(state, identity, sompi, 2);
  state = bought.state;
  assert.equal(bought.result.ok, true);
  assert.equal(bought.result.peg, false);
  assert.equal(bought.result.cents, "5");
  assert.match(bought.result.receipt.note, /Not a covenant/);
  assert.equal(state.olaf.cents, "5");
  assert.equal(state.olaf.sompi, String(sompi));
  assert.equal(state.olaf.notes.length, 1);
  assert.equal(noteKeys(state.olaf.notes[0]), "ciphertext,commitment,ephPub,iv");
  assert.equal(JSON.stringify(state).includes(identity.spendSecret), false);
  const mine = await scanNotes(identity, state.olaf.notes, state.olaf.nullifiers);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].cents, "5");
  assert.equal(publicAccount(state, USER).tokens.some((row) => row.name === "OLAF"), false);
  const again = applyOlafBuy(state, {
    address: USER,
    payment: { txid: bought.result.receipt.txid, paid: sompi },
    usdPerKas: QUOTE,
  }, 3);
  assert.equal(again.state, state);
  assert.equal(state.olaf.notes.length, 1);
  assert.throws(
    () => applyOlafBuy(state, {
      address: OTHER,
      payment: { txid: bought.result.receipt.txid, paid: sompi },
      usdPerKas: QUOTE,
      note: {},
    }, 4),
    /already used/
  );
});

test("a private send hides the amount and a shop burn keeps the spent commitment", async () => {
  const alice = await createIdentity();
  const bob = await createIdentity();
  let state = freshState();
  const sompi = 2_000_000_000n;
  state = (await shield(state, alice, sompi, 2)).state;
  const opened = await scanNotes(alice, state.olaf.notes, state.olaf.nullifiers);
  const plan = await planOlafSend(alice, opened, 40n, bob.code);
  const sent = applyOlafSend(state, { address: USER, inputs: plan.inputs, outputs: plan.outputs }, 3);
  state = sent.state;
  assert.equal(sent.result.private, true);
  assert.equal(sent.result.receipt, undefined);
  assert.equal(state.olaf.cents, "100");
  assert.equal(state.olaf.sompi, String(sompi));
  assert.equal(JSON.stringify(state).includes(alice.spendSecret), false);
  assert.equal(JSON.stringify(state).includes(bob.spendSecret), false);
  const aliceLeft = await scanNotes(alice, state.olaf.notes, state.olaf.nullifiers);
  const bobHas = await scanNotes(bob, state.olaf.notes, state.olaf.nullifiers);
  assert.equal(aliceLeft.reduce((total, note) => total + BigInt(note.cents), 0n), 60n);
  assert.equal(bobHas.reduce((total, note) => total + BigInt(note.cents), 0n), 40n);
  const spent = state.olaf.notes[0].commitment;
  const aliceIncludingSpent = await scanNotes(alice, state.olaf.notes, []);
  assert.equal(aliceIncludingSpent.length, aliceLeft.length + 1);
  assert.equal(aliceIncludingSpent.some((note) => note.commitment === spent), true);
  assert.equal(state.olaf.notes.some((row) => row.commitment === spent), true);
  assert.equal(state.olaf.nullifiers.includes(spent), false);
  const water = await planOlafSpend(bob, bobHas, 10);
  const paid = applySpend(state, {
    address: OTHER,
    shop: "cafe",
    sku: "water",
    rail: "olaf",
    confirmed: true,
    inputs: water.inputs,
    change: water.change,
  }, 4);
  state = paid.state;
  assert.equal(paid.result.ok, true);
  assert.equal(paid.result.receipt.rail, "olaf");
  assert.match(paid.result.receipt.note, /Nia's Cafe · Water/);
  assert.match(paid.result.receipt.note, /Not a covenant/);
  assert.doesNotMatch(paid.result.receipt.note, /zero-knowledge proof is accepted/);
  assert.equal(state.olaf.cents, "90");
  const burned = 40n;
  const change = changeSompi(BigInt(bobHas[0].sompi), 40n, 30n);
  assert.equal(state.olaf.sompi, (sompi - (BigInt(bobHas[0].sompi) - change)).toString());
  assert.equal((await scanNotes(bob, state.olaf.notes, state.olaf.nullifiers)).reduce((total, note) => total + BigInt(note.cents), 0n), burned - 10n);
  const bobNow = await scanNotes(bob, state.olaf.notes, state.olaf.nullifiers);
  await assert.rejects(
    () => planOlafSpend(bob, bobNow, 250),
    /Not enough OLAF/
  );
  const watched = applyStreamBuy(state, {
    address: OTHER,
    id: "clip1",
    title: "Clip",
    cents: 15,
    rail: "olaf",
    confirmed: true,
    ...(await planOlafSpend(bob, bobNow, 15)),
  }, 5);
  state = watched.state;
  assert.equal(state.accounts[OTHER.toLowerCase()].stream.includes("clip1"), true);
  assert.equal(state.olaf.cents, "75");
  assert.match(watched.result.receipt.note, /Not a covenant/);
  void change;
});

test("POCencept still spends, and a spending rule can name OLAF without joining the three rails", async () => {
  const alice = await createIdentity();
  let state = freshState();
  state = (await shield(state, alice, 1_000_000_000n, 2)).state;
  state = applyPractice(state, { address: USER }, 3).state;
  const poc = applySpend(state, { address: USER, shop: "cafe", sku: "water", rail: "poc", confirmed: true }, 4);
  assert.equal(poc.result.ok, true);
  assert.equal(poc.result.receipt.rail, "poc");
  assert.equal(poc.result.receipt.note, "Nia's Cafe · Water");
  assert.equal(poc.state.olaf.cents, "50");
  assert.throws(
    () => applyRules(state, { address: USER, rules: { rails: ["nope"] } }, 5),
    /Unknown rail/
  );
  state = applyRules(state, { address: USER, rules: { rails: ["poc"] } }, 6).state;
  const opened = await scanNotes(alice, state.olaf.notes, state.olaf.nullifiers);
  const blocked = await planOlafSpend(alice, opened, 10);
  assert.throws(
    () => applySpend(state, { address: USER, shop: "cafe", sku: "water", rail: "olaf", confirmed: true, inputs: blocked.inputs, change: blocked.change }, 7),
    /OLAF/
  );
  state = applyRules(state, { address: USER, rules: { rails: ["olaf"] } }, 8).state;
  const olaf = applySpend(state, { address: USER, shop: "cafe", sku: "water", rail: "olaf", confirmed: true, inputs: blocked.inputs, change: blocked.change }, 9);
  assert.equal(olaf.result.ok, true);
  assert.equal(olaf.state.olaf.cents, "40");
  assert.throws(
    () => applySpend(olaf.state, { address: USER, shop: "cafe", sku: "tea", rail: "poc", confirmed: true }, 10),
    /POCencept/
  );
});

test("a later quote does not reprice a note, and a bad send does not move the pool", async () => {
  const alice = await createIdentity();
  let state = freshState();
  state = (await shield(state, alice, 2_000_000_000n, 2)).state;
  const before = JSON.stringify(state.olaf);
  const opened = await scanNotes(alice, state.olaf.notes, state.olaf.nullifiers);
  assert.equal(opened[0].cents, "100");
  const plan = await planOlafSend(alice, opened, 40n, alice.code);
  plan.outputs[0].witness.cents = "41";
  assert.throws(() => applyOlafSend(state, { address: USER, inputs: plan.inputs, outputs: plan.outputs }, 3), /do not balance|does not match/);
  assert.equal(JSON.stringify(state.olaf), before);
  assert.throws(
    () => applyOlafSend(state, { address: "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq", inputs: [], outputs: [] }, 4),
    /Mainnet/
  );
});

test("the note says what this square can and cannot do", () => {
  const text = OLAF_NOTE.lines.join(" ");
  assert.equal(OLAF_NOTE.lines.length, 7);
  assert.match(text, /shielded dollar note/);
  assert.match(text, /100 units are 1\.00 OLAF/);
  assert.match(text, /does not reprice/);
  assert.match(text, /nullifier/);
  assert.match(text, /Kaspa Privacy Initiative/);
  assert.match(text, /not a zero-knowledge proof/);
  assert.match(text, /not Kaspa core/);
  assert.match(text, /Based App/);
  assert.match(text, /1,000,000\.00 supply was deleted/);
  assert.match(text, /no chain payout/);
  assert.match(text, /does not pass through SquarePeg/);
  assert.match(text, /KCC-20 is Final/);
  assert.match(text, /Hunt Hall does not take OLAF/);
  assert.match(OLAF_PAY_LINE, /one dollar/);
  assert.match(OLAF_PAY_LINE, /does not keep the secret/);
  assert.equal(OLAF_RUN[0].includes("1984/olaf.test.mjs"), true);
  assert.doesNotMatch(text, /kaspatest:/);
});

test("the http book shields, sends, and spends without a public balance", async () => {
  const alice = await createIdentity();
  const bob = await createIdentity();
  let state = freshState();
  state = (await shield(state, alice, 2_000_000_000n, 2)).state;
  const { svc, read, pays } = desk({}, state);
  const look = await svc.handle({
    method: "GET",
    pathname: "/api/1984/olaf",
    query: new URLSearchParams(),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(look.status, 200);
  assert.equal(look.body.version, 2);
  assert.equal(look.body.cents, "100");
  assert.equal(look.body.proof, false);
  assert.equal(look.body.zk, false);
  assert.equal(look.body.decimals, 2);
  assert.equal(look.body.experimental, true);
  assert.equal(look.body.supply, undefined);
  const minted = await post(svc, "/api/1984/mint", { address: RESERVE, option: "more", name: "OLAF", amount: "1" });
  assert.equal(minted.status, 400);
  assert.match(minted.body.error, /shielded note/);
  const opened = await scanNotes(alice, read().olaf.notes, read().olaf.nullifiers);
  const plan = await planOlafSend(alice, opened, 25n, bob.code);
  const sent = await post(svc, "/api/1984/olaf/send", { address: USER, inputs: plan.inputs, outputs: plan.outputs });
  assert.equal(sent.status, 200, sent.body && sent.body.error);
  assert.equal(sent.body.private, true);
  assert.equal((sent.body.account.tokens || []).some((row) => row.name === "OLAF"), false);
  assert.equal(read().olaf.cents, "100");
  const bobHas = await scanNotes(bob, read().olaf.notes, read().olaf.nullifiers);
  const water = await planOlafSpend(bob, bobHas, 10);
  const paid = await post(svc, "/api/1984/spend", {
    address: OTHER,
    shop: "cafe",
    sku: "water",
    rail: "olaf",
    confirmed: true,
    inputs: water.inputs,
    change: water.change,
  });
  assert.equal(paid.status, 200, paid.body && paid.body.error);
  assert.equal(paid.body.ok, true);
  assert.equal(paid.body.receipt.rail, "olaf");
  assert.match(paid.body.receipt.note, /Not a covenant/);
  assert.equal(pays(), 0);
  assert.equal(read().olaf.cents, "90");
  const guestSpend = readFileSync(new URL("./service.mjs", import.meta.url), "utf8");
  assert.match(guestSpend, /pathname === "\/api\/1984\/guest\/spend"/);
  assert.match(guestSpend, /rail: "kas"/);
});

test("a closed square still shows the pool and refuses a send", async () => {
  const alice = await createIdentity();
  let initial = freshState();
  initial = (await shield(initial, alice, 100_000_000n, 2)).state;
  const notes = initial.olaf.notes.length;
  const { svc, read } = desk({ squareOpen: false }, initial);
  const look = await svc.handle({
    method: "GET",
    pathname: "/api/1984/olaf",
    query: new URLSearchParams(),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(look.status, 200);
  assert.equal(look.body.version, 2);
  assert.equal(look.body.notes.length, notes);
  const sent = await post(svc, "/api/1984/olaf/send", { address: USER, inputs: [], outputs: [] });
  assert.equal(sent.status, 503);
  assert.match(sent.body.error, /Closed until further notice/);
  assert.equal(read().olaf.notes.length, notes);
  assert.equal(read().olaf.nullifiers.length, 0);
});

test("the first load of an old book is saved once", async () => {
  const extension = olafExtension();
  let saved = 0;
  let state = freshState();
  state.mints[extension] = { name: "OLAF", extension, supply: "100000000", cap: "100000000", sealed: true, remaining: "0" };
  state.accounts[USER.toLowerCase()] = { address: USER, tokens: { [extension]: "100000000" } };
  desk({
    load: () => state,
    save: (next) => {
      saved += 1;
      state = next;
    },
  });
  assert.equal(saved, 1);
  assert.equal(state.olaf.version, 2);
  assert.equal(state.olaf.cents, "0");
  assert.equal(state.mints[extension], undefined);
  assert.equal(state.accounts[USER.toLowerCase()].tokens[extension], undefined);
  desk({
    load: () => state,
    save: () => {
      saved += 1;
    },
  });
  assert.equal(saved, 1);
});
