import assert from "node:assert/strict";
import test from "node:test";
import { extractPayment, parseBalance, parseKns, parsePrice } from "./chain.mjs";
import {
  applyConvert,
  applyExchange,
  applyFreeze,
  applyPractice,
  applyRedeem,
  applyRules,
  applySpend,
  freshState,
  publicAccount,
} from "./ledger.mjs";
import { RESERVE, assertTestnet, centsForSompi, lockShare, sompiForCents } from "./money.mjs";
import { LOT_LINE, PARKING_BAYS, ROADSTER_PARK, SHOPS, counterFace, findPath, nearShop, shopVisit, standTile, walkable, world } from "./world.mjs";

const USER = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const USD = 0.05;
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);

function pay(sompi, n = 1) {
  const id = n.toString(16).padStart(64, "a");
  return {
    txid: id,
    paid: BigInt(sompi),
    tx: {
      subnetwork_id: "0000000000000000000000000000000000000000",
      transaction_id: id,
      is_accepted: true,
      inputs: [{ previous_outpoint_address: USER, previous_outpoint_amount: sompi }],
      outputs: [{ script_public_key_address: RESERVE, amount: sompi }],
    },
  };
}

test("a building opens when you stand at the door, and the fountain is outside that reach", () => {
  const map = world();
  for (const b of map.buildings) {
    assert.equal(nearShop(map, b.door.x, b.door.y, b.shop), true, b.id);
    assert.equal(nearShop(map, b.npc.x, b.npc.y, b.shop), true, b.id);
    assert.equal(nearShop(map, b.x + 1, b.y + 1, b.shop), true, b.id);
    assert.equal(nearShop(map, map.spawn.x, map.spawn.y, b.shop), false, b.id);
  }
  assert.equal(nearShop(map, 8, 11, "cafe"), true);
  assert.equal(nearShop(map, 8, 12, "cafe"), false);
  assert.equal(nearShop(map, 20, 20, "missing"), false);
});

test("the roadster parks on the lot in front of Pike", () => {
  const map = world();
  const shop = map.buildings.find((item) => item.id === "roadster");
  assert.equal(PARKING_BAYS.length, 3);
  assert.deepEqual(ROADSTER_PARK, PARKING_BAYS[1]);
  for (const bay of PARKING_BAYS) {
    const tile = map.grid[bay.y][bay.x];
    assert.equal(walkable(tile), true);
    assert.notEqual(tile, "i");
    assert.notEqual(tile, "w");
    assert.ok(bay.y < shop.y);
    assert.notEqual(bay.x, shop.door.x);
  }
  assert.ok(ROADSTER_PARK.x < shop.npc.x);
  const beside = map.grid[ROADSTER_PARK.y + 1][ROADSTER_PARK.x];
  assert.equal(walkable(beside), true);
  assert.notEqual(beside, "i");
  assert.equal(nearShop(map, shop.door.x, shop.door.y, "roadster"), true);
  assert.equal(nearShop(map, shop.npc.x, shop.npc.y, "roadster"), true);
  const path = findPath(map.grid, map.spawn, ROADSTER_PARK);
  assert.ok(path && path.length > 1);
});

test("the cinema is a dark building west of the lot, and the fountain is still water", () => {
  const map = world();
  const cinema = map.buildings.find((item) => item.id === "cinema");
  assert.ok(cinema);
  assert.equal(map.grid[cinema.door.y][cinema.door.x], "d");
  assert.equal(walkable(map.grid[cinema.npc.y][cinema.npc.x]), true);
  assert.equal(nearShop(map, map.spawn.x, map.spawn.y, "cinema"), false);
  const path = findPath(map.grid, map.spawn, cinema.npc);
  assert.ok(path && path.length > 1);
  assert.equal(path.at(-1).x, cinema.npc.x);
  assert.equal(path.at(-1).y, cinema.npc.y);
  for (let y = 15; y <= 17; y += 1) {
    for (let x = 19; x <= 22; x += 1) assert.equal(map.grid[y][x], "w", x + "," + y);
  }
  for (const bay of PARKING_BAYS) assert.equal(map.grid[bay.y][bay.x], "c");
  const shop = SHOPS.find((item) => item.id === "cinema");
  const price = Object.fromEntries(shop.items.map((item) => [item.sku, item.cents]));
  assert.deepEqual(price, {
    reel: 500,
    popcorn: 150,
    beer: 200,
    vodka: 350,
    cocaine: 600,
    xanax: 400,
  });
  assert.equal(SHOPS.find((item) => item.id === "cafe").items.find((item) => item.sku === "coffee").cents, 250);
  assert.equal(SHOPS.find((item) => item.id === "restaurant").items.find((item) => item.sku === "supper").cents, 1400);
  assert.equal(LOT_LINE, "Buy a roadster. See what happens.");
  const roadster = SHOPS.find((item) => item.id === "roadster");
  assert.match(roadster.line, /Buy a roadster\. See what happens\./);
  assert.match(roadster.line, /Launch into space/);
  assert.equal(roadster.items.find((item) => item.sku === "keys").cents, 100);
});

test("every shop door can be walked from the fountain", () => {
  const map = world();
  assert.equal(map.grid[map.spawn.y][map.spawn.x] !== "w", true);
  for (const npc of map.npcs) {
    const path = findPath(map.grid, map.spawn, npc);
    assert.ok(path && path.length > 1, npc.name);
    assert.equal(path.at(-1).x, npc.x);
    assert.equal(path.at(-1).y, npc.y);
  }
});

test("a dollar of tKAS at five cents is twenty coins", () => {
  assert.equal(sompiForCents(100, USD), 2_000_000_000n);
  assert.equal(centsForSompi(100_000_000n, USD), 5n);
  assert.equal(parsePrice({ price: 0.0459 }), 0.0459);
  assert.equal(parseBalance({ balance: 496357584051804 }).toString(), "496357584051804");
});

test("mainnet names and coinbase are refused", () => {
  assert.throws(() => parseKns({ success: true, data: { owner: "kaspa:q" + "q".repeat(60), asset: "a.kas" } }, "a.kas"));
  assert.equal(parseKns({ success: false }, "a.kas"), null);
  const coinbase = {
    subnetwork_id: "0100000000000000000000000000000000000000",
    transaction_id: "b".repeat(64),
    is_accepted: true,
    inputs: [],
    outputs: [{ script_public_key_address: RESERVE, amount: 100 }],
  };
  assert.throws(() => extractPayment(coinbase, { from: USER, to: RESERVE, need: 1n }));
  const good = pay(50_000_000n);
  assert.equal(extractPayment(good.tx, { from: USER, to: RESERVE, need: 50_000_000n }).txid, good.txid);
});

test("practice spends in the shop and does not redeem", () => {
  let state = freshState();
  state = applyPractice(state, { address: USER }, NOW).state;
  assert.equal(state.accounts[USER].poc, "2000");
  state = applySpend(state, { address: USER, shop: "cafe", sku: "coffee", rail: "poc" }, NOW).state;
  assert.equal(state.accounts[USER].poc, "1750");
  assert.throws(() => applyRedeem(state, { address: USER, rail: "poc", cents: 100n, usdPerKas: USD }, NOW));
});

test("a locked redeem burns backed coins, not the practice purse", () => {
  let state = freshState();
  state = applyPractice(state, { address: USER }, NOW).state;
  const locked = pay(2_000_000_000n, 2);
  state = applyConvert(state, { address: USER, rail: "poc", payment: locked, usdPerKas: USD }, NOW).state;
  assert.equal(state.accounts[USER].poc, "2100");
  assert.equal(state.accounts[USER].pocBacked, "100");
  state = applyRedeem(state, { address: USER, rail: "poc", cents: 100n, usdPerKas: USD }, NOW).state;
  assert.equal(state.accounts[USER].poc, "2000");
  assert.equal(state.accounts[USER].pocBacked, "0");
  assert.equal(state.accounts[USER].liability, "0");
  assert.throws(() => applyRedeem(state, { address: USER, rail: "poc", cents: 100n, usdPerKas: USD }, NOW));
});

test("a redeem returns the locked tKAS after the quote moves", () => {
  let state = freshState();
  const locked = pay(2_000_000_000n, 21);
  state = applyConvert(state, { address: USER, rail: "poc", payment: locked, usdPerKas: USD }, NOW).state;
  assert.equal(state.accounts[USER].pocLiability, "2000000000");
  const dear = applyRedeem(state, { address: USER, rail: "poc", cents: 50n, usdPerKas: 0.2 }, NOW);
  assert.equal(dear.sompi, 1_000_000_000n);
  assert.equal(dear.state.accounts[USER].pocLiability, "1000000000");
  const cheap = applyRedeem(dear.state, { address: USER, rail: "poc", cents: 50n, usdPerKas: 0.01 }, NOW);
  assert.equal(cheap.sompi, 1_000_000_000n);
  assert.equal(cheap.state.accounts[USER].liability, "0");
  assert.equal(lockShare(2_000_000_001n, 100n, 100n), 2_000_000_001n);
});

test("frozen KUSDT still redeems the lock and does not spend the tag", () => {
  let state = freshState();
  const locked = pay(2_000_000_000n, 22);
  state = applyConvert(state, { address: USER, rail: "kusdt", payment: locked, usdPerKas: USD }, NOW).state;
  state = applyFreeze(state, { address: USER, frozen: true }, NOW).state;
  assert.throws(() => applySpend(state, { address: USER, shop: "roadster", sku: "keys", rail: "kusdt" }, NOW));
  const back = applyRedeem(state, { address: USER, rail: "kusdt", cents: 100n, usdPerKas: 0.01 }, NOW);
  assert.equal(back.sompi, 2_000_000_000n);
  assert.equal(back.state.accounts[USER].kusdt, "0");
  assert.equal(back.state.accounts[USER].kusdtLiability, "0");
});

test("spending locked tags extinguishes that share of the lock", () => {
  let state = freshState();
  const locked = pay(2_000_000_000n, 23);
  state = applyConvert(state, { address: USER, rail: "poc", payment: locked, usdPerKas: USD }, NOW).state;
  state = applySpend(state, { address: USER, shop: "roadster", sku: "keys", rail: "poc" }, NOW).state;
  assert.equal(state.accounts[USER].poc, "0");
  assert.equal(state.accounts[USER].pocBacked, "0");
  assert.equal(state.accounts[USER].liability, "0");
  assert.throws(() => applyRedeem(state, { address: USER, rail: "poc", cents: 100n, usdPerKas: USD }, NOW));
});

test("an older single lock pool splits across the two tags", () => {
  const state = freshState();
  state.accounts[USER] = {
    address: USER,
    poc: "100",
    kusdt: "100",
    pocBacked: "100",
    kusdtBacked: "100",
    liability: "2000000000",
  };
  const out = applyRedeem(state, { address: USER, rail: "poc", cents: 100n }, NOW);
  assert.equal(out.sompi, 1_000_000_000n);
  assert.equal(out.state.accounts[USER].kusdtLiability, "1000000000");
  assert.equal(out.state.accounts[USER].pocLiability, "0");
});

test("a purse swap keeps locked cents locked and purse cents in the purse", () => {
  let state = freshState();
  state = applyPractice(state, { address: USER }, NOW).state;
  const locked = pay(2_000_000_000n, 4);
  state = applyConvert(state, { address: USER, rail: "poc", payment: locked, usdPerKas: USD }, NOW).state;
  const liability = state.accounts[USER].liability;
  assert.equal(state.accounts[USER].pocBacked, "100");
  state = applyExchange(state, { address: USER, from: "poc", to: "kusdt", cents: 50n }, NOW).state;
  assert.equal(state.accounts[USER].poc, "2050");
  assert.equal(state.accounts[USER].pocBacked, "100");
  assert.equal(state.accounts[USER].kusdt, "2050");
  assert.equal(state.accounts[USER].kusdtBacked, "0");
  assert.equal(state.accounts[USER].liability, liability);
  state = applyExchange(state, { address: USER, from: "poc", to: "kusdt", cents: 2000n }, NOW).state;
  assert.equal(state.accounts[USER].poc, "50");
  assert.equal(state.accounts[USER].pocBacked, "50");
  assert.equal(state.accounts[USER].kusdt, "4050");
  assert.equal(state.accounts[USER].kusdtBacked, "50");
  assert.equal(state.accounts[USER].liability, liability);
  state = applyFreeze(state, { address: USER, frozen: true }, NOW).state;
  assert.throws(() => applyExchange(state, { address: USER, from: "kusdt", to: "poc", cents: 50n }, NOW));
  assert.throws(() => applyExchange(state, { address: USER, from: "poc", to: "kusdt", cents: 50n }, NOW));
  state = applyFreeze(state, { address: USER, frozen: false }, NOW).state;
  state = applyRedeem(state, { address: USER, rail: "poc", cents: 50n, usdPerKas: USD }, NOW).state;
  assert.equal(state.accounts[USER].poc, "0");
  assert.equal(state.accounts[USER].pocBacked, "0");
  assert.throws(() => applyRedeem(state, { address: USER, rail: "kusdt", cents: 100n, usdPerKas: USD }, NOW));
  state = applyRedeem(state, { address: USER, rail: "kusdt", cents: 50n, usdPerKas: USD }, NOW).state;
  assert.equal(state.accounts[USER].kusdt, "4000");
  assert.equal(state.accounts[USER].kusdtBacked, "0");
  assert.throws(() => applyRedeem(state, { address: USER, rail: "kusdt", cents: 50n, usdPerKas: USD }, NOW));
});

test("freeze blocks KUSDT only, and a short tKAS payment is refused", () => {
  let state = freshState();
  state = applyPractice(state, { address: USER }, NOW).state;
  state = applyFreeze(state, { address: USER, frozen: true }, NOW).state;
  assert.throws(() => applySpend(state, { address: USER, shop: "groceries", sku: "steam-5", rail: "kusdt" }, NOW));
  state = applySpend(state, { address: USER, shop: "groceries", sku: "steam-5", rail: "poc" }, NOW).state;
  assert.equal(state.accounts[USER].poc, "1500");
  const tiny = pay(1n, 3);
  assert.throws(() =>
    applySpend(state, { address: USER, shop: "groceries", sku: "steam-5", rail: "kas", payment: tiny, usdPerKas: USD }, NOW)
  );
});

test("spending rules can block a shop and ask for a confirm", () => {
  let state = freshState();
  state = applyPractice(state, { address: USER }, NOW).state;
  state = applyRules(
    state,
    { address: USER, rules: { dailyCapCents: 0, shops: ["cafe"], rails: [], confirmOverCents: 100 } },
    NOW
  ).state;
  assert.throws(() => applySpend(state, { address: USER, shop: "restaurant", sku: "soup", rail: "poc" }, NOW));
  const ask = applySpend(state, { address: USER, shop: "cafe", sku: "coffee", rail: "poc" }, NOW);
  assert.equal(ask.result.needsConfirm, true);
  assert.equal(ask.state, state);
  const paid = applySpend(state, { address: USER, shop: "cafe", sku: "coffee", rail: "poc", confirmed: true }, NOW);
  assert.equal(paid.result.ok, true);
});

test("the roadster costs one ledger unit and another buy charges again", () => {
  let state = freshState();
  state = applyPractice(state, { address: USER }, NOW).state;
  const extra = pay(2_000_000_000n, 9);
  state = applyConvert(state, { address: USER, rail: "poc", payment: extra, usdPerKas: USD }, NOW).state;
  assert.equal(state.accounts[USER].poc, "2100");
  const bought = applySpend(state, { address: USER, shop: "roadster", sku: "keys", rail: "poc" }, NOW);
  assert.equal(bought.result.ok, true);
  assert.equal(bought.state.accounts[USER].poc, "2000");
  assert.equal(bought.state.accounts[USER].roadster, true);
  assert.equal(bought.result.account.roadster, true);
  const again = applySpend(bought.state, { address: USER, shop: "roadster", sku: "keys", rail: "poc" }, NOW);
  assert.equal(again.result.ok, true);
  assert.equal(again.state.accounts[USER].roadster, true);
  assert.equal(again.state.accounts[USER].poc, "1900");
  const bare = freshState();
  bare.accounts[USER] = { address: USER, poc: "5", kusdt: "0", pocBacked: "0", kusdtBacked: "0", liability: "0" };
  assert.equal(publicAccount(bare, USER).roadster, false);
});

test("the roadster stops on a path and never indoors", () => {
  const map = world();
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const stand = standTile(map, x, y);
      const got = map.grid[stand.y][stand.x];
      assert.equal(walkable(got) && got !== "i", true, x + "," + y + " -> " + got);
    }
  }
});

test("a shop or the bank is the indoor room, and the rules are not", () => {
  assert.equal(shopVisit("cafe"), true);
  assert.equal(shopVisit("mint"), true);
  assert.equal(shopVisit("restaurant"), false);
  const mint = world().buildings.find((item) => item.shop === "mint");
  assert.equal(mint.sign, "Mint");
  assert.equal(mint.x, 28);
  assert.equal(mint.y, 2);
  assert.equal(shopVisit("groceries"), true);
  assert.equal(shopVisit("roadster"), true);
  assert.equal(shopVisit("bank"), true);
  assert.equal(shopVisit("cinema"), true);
  assert.equal(shopVisit("orbit"), false);
  assert.equal(shopVisit("world"), false);
  assert.equal(shopVisit("rules"), false);
  assert.equal(shopVisit("bench"), false);
  assert.equal(shopVisit("guide"), false);
});

test("a payment redraws the open counter and leaves the square alone", () => {
  assert.equal(counterFace("cafe"), "shop");
  assert.equal(counterFace("mint"), "mint");
  assert.equal(counterFace("restaurant"), "");
  assert.equal(counterFace("groceries"), "shop");
  assert.equal(counterFace("roadster"), "shop");
  assert.equal(counterFace("bank"), "bank");
  assert.equal(counterFace("world"), "");
  assert.equal(counterFace("rules"), "");
  assert.equal(counterFace("bench"), "");
  assert.equal(counterFace("guide"), "");
});

test("the same transaction cannot mint twice", () => {
  let state = freshState();
  const locked = pay(100_000_000n, 4);
  state = applyConvert(state, { address: USER, rail: "kusdt", payment: locked, usdPerKas: USD }, NOW).state;
  assert.throws(() => applyConvert(state, { address: USER, rail: "poc", payment: locked, usdPerKas: USD }, NOW));
  assert.throws(() => applyPractice(state, { address: "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" }, NOW));
});

test("the same accepted tKAS purchase returns its receipt", () => {
  const other = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";
  let state = freshState();
  const coffee = sompiForCents(250, USD);
  const payment = pay(coffee, 11);
  const first = applySpend(
    state,
    { address: USER, shop: "cafe", sku: "coffee", rail: "kas", payment, usdPerKas: USD },
    NOW
  );
  assert.equal(first.result.ok, true);
  assert.equal(first.result.receipt.note, "Nia's Cafe · Coffee");
  assert.equal(first.state.receipts.length, 1);
  assert.deepEqual(first.state.txids[payment.txid], {
    address: USER,
    kind: "spend",
    shop: "cafe",
    sku: "coffee",
    rail: "kas",
    receiptId: first.result.receipt.id,
  });
  const again = applySpend(
    first.state,
    { address: USER, shop: "cafe", sku: "coffee", rail: "kas", payment, usdPerKas: USD },
    NOW
  );
  assert.equal(again.result.ok, true);
  assert.equal(again.result.receipt.id, first.result.receipt.id);
  assert.equal(again.state, first.state);
  assert.equal(again.state.seq, first.state.seq);
  assert.equal(again.state.receipts.length, 1);
  assert.equal(again.state.accounts[USER].poc, first.state.accounts[USER].poc);
  assert.equal(again.state.accounts[USER].liability, first.state.accounts[USER].liability);
  assert.equal(again.state.accounts[USER].spentCents, "250");
  assert.throws(
    () => applySpend(first.state, { address: USER, shop: "cafe", sku: "tea", rail: "kas", payment, usdPerKas: USD }, NOW),
    /That transaction was already used/
  );
  assert.equal(first.state.receipts.length, 1);
  assert.throws(
    () => applySpend(first.state, { address: other, shop: "cafe", sku: "coffee", rail: "kas", payment, usdPerKas: USD }, NOW),
    /That transaction was already used/
  );
  assert.equal(first.state.accounts[other], undefined);
  const tiny = pay(1n, 12);
  assert.throws(
    () => applySpend(first.state, { address: USER, shop: "cafe", sku: "coffee", rail: "kas", payment: tiny, usdPerKas: USD }, NOW),
    /The payment is smaller than the quote/
  );
  assert.equal(first.state.txids[tiny.txid], undefined);
  const second = pay(coffee, 13);
  const more = applySpend(
    first.state,
    { address: USER, shop: "cafe", sku: "coffee", rail: "kas", payment: second, usdPerKas: USD },
    NOW
  );
  assert.equal(more.result.ok, true);
  assert.equal(more.state.receipts.length, 2);
  assert.equal(more.state.accounts[USER].spentCents, "500");
  assert.notEqual(more.result.receipt.id, first.result.receipt.id);

  const keys = pay(sompiForCents(100, USD), 15);
  const bought = applySpend(
    more.state,
    { address: USER, shop: "roadster", sku: "keys", rail: "kas", payment: keys, usdPerKas: USD },
    NOW
  );
  assert.equal(bought.state.accounts[USER].roadster, true);
  const replayKeys = applySpend(
    bought.state,
    { address: USER, shop: "roadster", sku: "keys", rail: "kas", payment: keys, usdPerKas: USD },
    NOW
  );
  assert.equal(replayKeys.state, bought.state);
  assert.equal(replayKeys.state.accounts[USER].roadster, true);
  assert.equal(replayKeys.state.receipts.length, bought.state.receipts.length);

  const lock = pay(coffee, 14);
  const minted = applyConvert(bought.state, { address: USER, rail: "poc", payment: lock, usdPerKas: USD }, NOW);
  const liability = minted.state.accounts[USER].liability;
  const poc = minted.state.accounts[USER].poc;
  const replayLock = applyConvert(minted.state, { address: USER, rail: "poc", payment: lock, usdPerKas: USD }, NOW);
  assert.equal(replayLock.result.ok, true);
  assert.equal(replayLock.result.receipt.id, minted.result.receipt.id);
  assert.equal(replayLock.state, minted.state);
  assert.equal(replayLock.state.accounts[USER].liability, liability);
  assert.equal(replayLock.state.accounts[USER].poc, poc);
  assert.throws(
    () => applySpend(minted.state, { address: USER, shop: "cafe", sku: "coffee", rail: "kas", payment: lock, usdPerKas: USD }, NOW),
    /That transaction was already used/
  );
  assert.throws(
    () => applyConvert(minted.state, { address: USER, rail: "kusdt", payment: second, usdPerKas: USD }, NOW),
    /That transaction was already used/
  );
  assert.equal(minted.state.accounts[USER].kusdt, "0");

  const aged = minted.state;
  aged.txids[payment.txid] = { address: USER, kind: "spend" };
  const agedReplay = applySpend(
    aged,
    { address: USER, shop: "cafe", sku: "coffee", rail: "kas", payment, usdPerKas: USD },
    NOW
  );
  assert.equal(agedReplay.result.ok, true);
  assert.equal(agedReplay.result.receipt.id, first.result.receipt.id);
  assert.equal(agedReplay.state, aged);
  aged.txids[lock.txid] = { address: USER, kind: "convert" };
  const agedLock = applyConvert(aged, { address: USER, rail: "poc", payment: lock, usdPerKas: USD }, NOW);
  assert.equal(agedLock.result.receipt.id, minted.result.receipt.id);
  assert.throws(
    () => applyConvert(aged, { address: USER, rail: "kusdt", payment: lock, usdPerKas: USD }, NOW),
    /That transaction was already used/
  );

  let capped = aged;
  for (let i = 0; i < 400; i += 1) {
    capped = applyRules(capped, { address: USER, rules: { dailyCapCents: 0, shops: [], rails: [], confirmOverCents: 0 } }, NOW).state;
  }
  assert.equal(capped.receipts.some((row) => row.txid === payment.txid), false);
  assert.equal(capped.txids[second.txid].shop, "cafe");
  const keptId = capped.txids[second.txid].receiptId;
  const seq = capped.seq;
  const spent = capped.accounts[USER].spentCents;
  const dropped = applySpend(
    capped,
    { address: USER, shop: "cafe", sku: "coffee", rail: "kas", payment: second, usdPerKas: USD },
    NOW
  );
  assert.equal(dropped.result.ok, true);
  assert.equal(dropped.result.receipt.id, keptId);
  assert.equal(dropped.result.receipt.note, "Nia's Cafe · Coffee");
  assert.equal(dropped.state, capped);
  assert.equal(dropped.state.seq, seq);
  assert.equal(dropped.state.accounts[USER].spentCents, spent);
  assert.equal(dropped.state.receipts.length, capped.receipts.length);

  const bare = freshState();
  const orphan = pay(coffee, 31);
  bare.txids[orphan.txid] = { address: USER, kind: "spend" };
  assert.throws(
    () => applySpend(bare, { address: USER, shop: "cafe", sku: "coffee", rail: "kas", payment: orphan, usdPerKas: USD }, NOW),
    /That transaction was already used/
  );
  assert.equal(bare.seq, "0");
  assert.equal(bare.receipts.length, 0);
  assert.equal(Object.keys(bare.accounts).length, 0);
});

test("a pasted kaspatest address is the address that stays", () => {
  const body = "q".repeat(61);
  const clean = "kaspatest:" + body;
  assert.equal(assertTestnet(clean), clean);
  assert.equal(assertTestnet("kaspatest:" + body.slice(0, 20) + " " + body.slice(20) + "\n"), clean);
  assert.equal(assertTestnet("kaspatest:" + body.slice(0, 30) + "\n" + body.slice(30)), clean);
  assert.equal(assertTestnet("see " + clean + " thanks"), clean);
  assert.equal(assertTestnet(body), clean);
  assert.equal(assertTestnet("kaspatest" + body), clean);
  assert.equal(assertTestnet("kaspatest " + body), clean);
  const mixed = "Q" + "q".repeat(60);
  assert.equal(assertTestnet("KaspaTest:" + mixed), "kaspatest:" + mixed);
  assert.equal(assertTestnet("kaspatest :" + mixed), "kaspatest:" + mixed);
  assert.equal(assertTestnet(clean.slice(0, 15) + "\u200b" + clean.slice(15)), clean);
  assert.throws(() => assertTestnet("kaspa:" + body), /Mainnet/);
  assert.throws(() => assertTestnet("https://example.test/kaspa:" + body), /Mainnet/);
  assert.throws(() => assertTestnet("kaspatest:qq"), /Testnet-10/);
});
