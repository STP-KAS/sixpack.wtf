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
import { RESERVE, centsForSompi, sompiForCents } from "./money.mjs";
import { ROADSTER_PARK, findPath, nearShop, shopVisit, standTile, walkable, world } from "./world.mjs";

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

test("the roadster parks on open ground in front of Pike", () => {
  const map = world();
  const tile = map.grid[ROADSTER_PARK.y][ROADSTER_PARK.x];
  const shop = map.buildings.find((item) => item.id === "roadster");
  assert.equal(walkable(tile), true);
  assert.notEqual(tile, "i");
  assert.ok(ROADSTER_PARK.y < shop.y);
  assert.ok(ROADSTER_PARK.x < shop.npc.x);
  assert.equal(nearShop(map, shop.door.x, shop.door.y, "roadster"), true);
  assert.equal(nearShop(map, shop.npc.x, shop.npc.y, "roadster"), true);
  const path = findPath(map.grid, map.spawn, ROADSTER_PARK);
  assert.ok(path && path.length > 1);
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

test("a toy swap keeps locked cents locked and purse cents in the purse", () => {
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
  assert.throws(() => applySpend(state, { address: USER, shop: "groceries", sku: "pebble", rail: "kusdt" }, NOW));
  state = applySpend(state, { address: USER, shop: "groceries", sku: "pebble", rail: "poc" }, NOW).state;
  assert.equal(state.accounts[USER].poc, "1999");
  const tiny = pay(1n, 3);
  assert.throws(() =>
    applySpend(state, { address: USER, shop: "groceries", sku: "pebble", rail: "kas", payment: tiny, usdPerKas: USD }, NOW)
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

test("the roadster costs one toy dollar and a second buy does not charge", () => {
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
  assert.throws(
    () => applySpend(bought.state, { address: USER, shop: "roadster", sku: "keys", rail: "poc" }, NOW),
    /already/
  );
  assert.equal(bought.state.accounts[USER].poc, "2000");
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
  assert.equal(shopVisit("restaurant"), true);
  assert.equal(shopVisit("groceries"), true);
  assert.equal(shopVisit("roadster"), true);
  assert.equal(shopVisit("bank"), true);
  assert.equal(shopVisit("world"), false);
  assert.equal(shopVisit("rules"), false);
  assert.equal(shopVisit("bench"), false);
  assert.equal(shopVisit("guide"), false);
});

test("the same transaction cannot mint twice", () => {
  let state = freshState();
  const locked = pay(100_000_000n, 4);
  state = applyConvert(state, { address: USER, rail: "kusdt", payment: locked, usdPerKas: USD }, NOW).state;
  assert.throws(() => applyConvert(state, { address: USER, rail: "poc", payment: locked, usdPerKas: USD }, NOW));
  assert.throws(() => applyPractice(state, { address: "kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" }, NOW));
});
