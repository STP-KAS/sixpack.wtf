import assert from "node:assert/strict";
import test from "node:test";
import { create1984Service } from "./service.mjs";
import {
  applyConvert,
  applyFreeze,
  applyPractice,
  applyPromise,
  applySnap,
  applySpend,
  applyWithdrawPromise,
  freshState,
  publicHunts,
} from "./ledger.mjs";
import { sompiForCents } from "./money.mjs";
import { HUNTS, counterFace, findPath, huntById, itemBySku, shopVisit, world } from "./world.mjs";

const A = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const B = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

function purse(state, address, cents) {
  const next = applyPractice(state, { address }, 10).state;
  const account = next.accounts[address.toLowerCase()];
  account.poc = String(cents);
  account.pocBacked = "0";
  account.kusdt = String(cents);
  account.kusdtBacked = "0";
  return next;
}

function promise(state, address, hunt, rail, need) {
  return applyPromise(state, { address, hunt, rail, need, confirmed: true }, 20).state;
}

test("frozen KUSDT blocks a kusdt promise and still takes POCencept", () => {
  let state = purse(freshState(), A, 2000);
  state = applyFreeze(state, { address: A, frozen: true }, 11).state;
  assert.throws(() => applyPromise(state, { address: A, hunt: "model", rail: "kusdt", need: 2, confirmed: true }, 12), /KUSDT is frozen/);
  const poc = applyPromise(state, { address: A, hunt: "model", rail: "poc", need: 2, confirmed: true }, 13);
  assert.equal(poc.result.ok, true);
  assert.equal(poc.result.receipt.kind, "promise");
  assert.equal(poc.state.accounts[A.toLowerCase()].poc, "2000");
});

test("two addresses with need 2 snap and both are charged", () => {
  let state = purse(freshState(), A, 2000);
  state = purse(state, B, 2000);
  state = promise(state, A, "model", "poc", 2);
  state = promise(state, B, "model", "poc", 2);
  const before = publicHunts(state, A);
  const row = before.hunts.find((item) => item.id === "model");
  assert.deepEqual(Object.keys(row).sort(), ["cents", "id", "name", "need", "promise", "rails"]);
  assert.equal(JSON.stringify(before).includes(B), false);
  assert.equal(JSON.stringify(before).includes('"count"'), false);
  const snap = applySnap(state, { address: A, hunt: "model" }, 30);
  assert.equal(snap.result.paid, true);
  assert.equal(snap.result.banner, "Pack paid on this square.");
  assert.equal(snap.result.count, 2);
  assert.equal(snap.state.accounts[A.toLowerCase()].poc, "1500");
  assert.equal(snap.state.accounts[B.toLowerCase()].poc, "1500");
  const notes = snap.state.receipts.filter((item) => item.kind === "snap").map((item) => item.note);
  assert.deepEqual(notes, ["Pack paid on this square.", "Pack paid on this square."]);
  const after = publicHunts(snap.state, B);
  const paid = after.hunts.find((item) => item.id === "model").paid;
  assert.equal(paid.count, 2);
  assert.equal(paid.banner, "Pack paid on this square.");
  assert.equal(JSON.stringify(snap.result).includes("Tesla"), false);
  assert.equal(JSON.stringify(snap.result).includes("Starlink"), false);
  assert.equal(JSON.stringify(snap.result).includes("Netflix"), false);
  assert.equal(JSON.stringify(snap.result).includes("Grok is on"), false);
});

test("a model snap unwinds a stream promise on the same 500 cents", () => {
  let state = purse(freshState(), A, 500);
  state = purse(state, B, 500);
  state = promise(state, A, "model", "poc", 2);
  state = promise(state, A, "stream", "poc", 2);
  state = promise(state, B, "model", "poc", 2);
  const snap = applySnap(state, { address: A, hunt: "model" }, 40);
  assert.equal(snap.state.accounts[A.toLowerCase()].poc, "0");
  assert.equal(snap.state.hunts.stream.intendos.length, 0);
  const note = snap.state.receipts.find((item) => item.kind === "unwound");
  assert.equal(note.note, "First snap took the pile.");
  assert.equal(note.sku, "stream");
});

test("a solo need of 2 does not snap and the body has no pack size", () => {
  let state = purse(freshState(), A, 2000);
  state = promise(state, A, "model", "poc", 2);
  const snap = applySnap(state, { address: A, hunt: "model" }, 50);
  assert.equal(snap.result.paid, false);
  assert.equal(snap.result.error, "No subset clears.");
  assert.equal(snap.result.count, undefined);
  assert.equal(snap.state.accounts[A.toLowerCase()].poc, "2000");
  assert.equal(JSON.stringify(snap.result).includes('"count"'), false);
  assert.equal(snap.state.receipts.some((item) => item.kind === "snap"), false);
});

test("a shop txid is refused as a hunt payment", () => {
  let state = freshState();
  const paid = sompiForCents(500, 0.05);
  const payment = { txid: "d".repeat(64), paid };
  state = applySpend(
    state,
    { address: A, shop: "cafe", sku: "coffee", rail: "kas", payment, usdPerKas: 0.05 },
    20
  ).state;
  state = promise(state, A, "model", "kas", 2);
  assert.throws(
    () => applySnap(state, { address: A, hunt: "model", payment, usdPerKas: 0.05 }, 30),
    /That transaction was already used/
  );
  assert.equal(state.txids[payment.txid].kind, "spend");
  assert.equal(state.receipts.some((row) => row.kind === "snap"), false);
  const huntPay = { txid: "e".repeat(64), paid };
  const held = applySnap(state, { address: A, hunt: "model", payment: huntPay, usdPerKas: 0.05 }, 31);
  assert.equal(held.state.txids[huntPay.txid].kind, "snap-hold");
  assert.throws(
    () => applySpend(held.state, { address: A, shop: "cafe", sku: "coffee", rail: "kas", payment: huntPay, usdPerKas: 0.05 }, 32),
    /That transaction was already used/
  );
  assert.throws(
    () => applyConvert(held.state, { address: A, rail: "poc", payment: huntPay, usdPerKas: 0.05 }, 33),
    /That transaction was already used/
  );
  assert.equal(held.state.accounts[A.toLowerCase()].spentCents, "250");
});

test("a tKAS snap without payment is not Paid", () => {
  let state = freshState();
  state = promise(state, A, "model", "kas", 2);
  state = promise(state, B, "model", "kas", 2);
  const snap = applySnap(state, { address: A, hunt: "model" }, 60);
  assert.notEqual(snap.result.paid, true);
  assert.equal(snap.result.banner, undefined);
  assert.equal(snap.result.error, "No subset clears.");
  assert.equal(snap.state.receipts.some((item) => item.kind === "snap"), false);
});

test("liquidity records the promise and spends nothing", () => {
  for (const rail of ["poc", "kusdt", "kas"]) {
    let state = purse(freshState(), A, 2000);
    state = purse(state, B, 2000);
    state = promise(state, A, "liquidity", rail, 2);
    state = promise(state, B, "liquidity", rail, 2);
    const snap = applySnap(state, { address: A, hunt: "liquidity" }, 70);
    assert.equal(snap.result.paid, true, rail);
    assert.equal(snap.result.banner, "Pack paid on this square.");
    assert.equal(snap.state.accounts[A.toLowerCase()].poc, "2000", rail);
    assert.equal(snap.state.accounts[B.toLowerCase()].kusdt, "2000", rail);
    assert.equal(Object.keys(snap.state.txids).length, 0, rail);
  }
});

test("cars can set the same roadster flag Pike already uses", () => {
  let state = purse(freshState(), A, 2000);
  state = purse(state, B, 2000);
  state = promise(state, A, "cars", "poc", 2);
  state = promise(state, B, "cars", "poc", 2);
  const snap = applySnap(state, { address: B, hunt: "cars" }, 80);
  assert.equal(snap.state.accounts[A.toLowerCase()].roadster, true);
  assert.equal(snap.state.accounts[B.toLowerCase()].roadster, true);
  assert.equal(itemBySku("roadster", "keys").cents, 100);
  assert.equal(snap.state.accounts[A.toLowerCase()].poc, "1900");
});

test("a promise comes off the row until it snaps", () => {
  let state = promise(freshState(), A, "music", "poc", 4);
  const dropped = applyWithdrawPromise(state, { address: A, hunt: "music" }, 90);
  assert.equal(dropped.result.receipt.kind, "withdraw");
  assert.equal(dropped.state.hunts.music.intendos.length, 0);
});

test("an old ledger with no hunts field still opens", () => {
  const bare = { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0" };
  const out = applyPromise(bare, { address: A, hunt: "basket", rail: "poc", need: 2, confirmed: true }, 15);
  assert.equal(out.result.ok, true);
  assert.equal(publicHunts(bare, "").hunts.length, HUNTS.length);
});

test("the hall sits east of the lot and the other buildings stay put", () => {
  const map = world();
  const hunt = map.buildings.find((item) => item.id === "hunt");
  assert.equal(hunt.x, 30);
  assert.equal(hunt.y, 23);
  assert.equal(hunt.w, 10);
  assert.equal(hunt.h, 7);
  assert.equal(hunt.door.x, 30);
  assert.equal(hunt.door.y, 26);
  assert.equal(hunt.roof, "#4a3a28");
  assert.equal(hunt.sign, "Hunt");
  assert.equal(map.grid[26][36] === "t", false);
  assert.equal(map.grid[12][39], "t");
  assert.equal(map.grid[4][16], "t");
  assert.equal(map.grid[5][24], "t");
  assert.equal(map.grid[12][5], "t");
  assert.equal(map.grid[12][36], "t");
  assert.equal(map.grid[16][19], "w");
  assert.equal(map.grid[21][16], "c");
  assert.equal(map.grid[21][18], "c");
  assert.equal(map.grid[21][20], "c");
  assert.equal(map.spawn.x, 20);
  assert.equal(map.spawn.y, 20);
  const reed = map.npcs.find((item) => item.shop === "hunt");
  assert.equal(reed.name, "Reed");
  assert.equal(reed.x, 29);
  assert.equal(reed.y, 26);
  assert.equal(reed.line, "Promise a month if others do. I will not tell you how many already did.");
  assert.ok(findPath(map.grid, { x: 27, y: 21 }, { x: 29, y: 26 }));
  assert.ok(findPath(map.grid, map.spawn, reed));
  for (let i = 0; i < map.buildings.length; i += 1) {
    for (let j = i + 1; j < map.buildings.length; j += 1) {
      const a = map.buildings[i];
      const b = map.buildings[j];
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.equal(apart, true, a.id + " " + b.id);
    }
  }
  assert.equal(shopVisit("hunt"), true);
  assert.equal(counterFace("hunt"), "hunt");
  assert.equal(counterFace("cinema"), "shop");
  for (const row of HUNTS) {
    assert.deepEqual(row.rails, ["poc", "kusdt", "kas"], row.id);
  }
});

test("the hunts route lists the catalog and hides the open pack", async () => {
  let state = null;
  const svc = create1984Service({
    load: () => freshState(),
    save: (next) => {
      state = next;
    },
    fetch: async () => ({ ok: true, json: async () => ({ price: 0.05 }) }),
    now: () => Date.UTC(2026, 8, 30),
    pay: async () => {
      throw new Error("no pay");
    },
  });
  for (const address of [A, B]) {
    const opened = await svc.handle({
      method: "POST",
      pathname: "/api/1984/practice",
      query: new URLSearchParams(),
      body: { address, network: "testnet-10" },
      ip: "127.0.0.1",
    });
    assert.equal(opened.body.ok, true);
    const signed = await svc.handle({
      method: "POST",
      pathname: "/api/1984/hunt/promise",
      query: new URLSearchParams(),
      body: { address, network: "testnet-10", hunt: "model", rail: "poc", need: 2, confirmed: true },
      ip: "127.0.0.1",
    });
    assert.equal(signed.body.ok, true);
  }
  const hidden = await svc.handle({
    method: "GET",
    pathname: "/api/1984/hunts",
    query: new URLSearchParams({ address: A }),
    ip: "127.0.0.1",
  });
  assert.equal(hidden.body.ok, true);
  assert.equal(JSON.stringify(hidden.body).includes(B), false);
  assert.equal(JSON.stringify(hidden.body).includes('"count"'), false);
  assert.equal(JSON.stringify(hidden.body).includes("12%"), false);
  const snap = await svc.handle({
    method: "POST",
    pathname: "/api/1984/hunt/snap",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", hunt: "model" },
    ip: "127.0.0.1",
  });
  assert.equal(snap.body.paid, true);
  assert.equal(snap.body.banner, "Pack paid on this square.");
  assert.equal(snap.body.count, 2);
  assert.equal(state.accounts[A.toLowerCase()].poc, "1500");
  assert.equal(state.accounts[B.toLowerCase()].poc, "1500");
  const home = await svc.handle({
    method: "GET",
    pathname: "/api/1984",
    query: new URLSearchParams(),
    ip: "127.0.0.1",
  });
  assert.equal(home.body.hunts.length, 7);
  assert.equal(JSON.stringify(home.body.hunts).includes('"count"'), false);
});
