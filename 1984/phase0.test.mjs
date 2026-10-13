import assert from "node:assert/strict";
import test from "node:test";
import { create1984Service } from "./service.mjs";

const USER = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const OTHER = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

function supplyOf(book, name) {
  const row = Object.values(book || {}).find((item) => item && item.name === name);
  return row ? row.supply : undefined;
}

function desk(extra = {}) {
  let state = null;
  const opened = [];
  const guests = extra.guests || {
    async sessionKey({ token, address }) {
      if (token !== "good" || address !== USER) throw new Error("This test tab does not match that address.");
      return { key: "22".repeat(32), address };
    },
    async open() {
      opened.push("open");
      return { ok: true, address: USER, token: "good", sompi: "0" };
    },
  };
  const rest = { ...extra };
  delete rest.guests;
  const svc = create1984Service({
    squareOpen: true,
    load: () => state || { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0", mints: {}, vaults: {} },
    save: (next) => {
      state = next;
    },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    now: () => Date.UTC(2026, 9, 13),
    pay: async () => {
      throw new Error("no pay");
    },
    ...rest,
    guests,
  });
  return { svc, read: () => state, opened };
}

function post(svc, pathname, body) {
  return svc.handle({
    method: "POST",
    pathname,
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", ...body },
    ip: "127.0.0.1",
  });
}

test("a ledger write without the test-tab token is refused and the books stay", async () => {
  const { svc, read } = desk();
  const minted = await post(svc, "/api/1984/mint", { token: "good", option: "new", name: "ash", amount: "4", cap: "10" });
  assert.equal(minted.status, 200);
  assert.equal(supplyOf(read().mints, "ASH"), "4");
  const sent = await post(svc, "/api/1984/mint", { option: "send", name: "ASH", amount: "1", to: OTHER });
  assert.equal(sent.status, 401);
  assert.match(sent.body.error, /does not match/);
  assert.equal(read().accounts[USER].tokens[Object.keys(read().accounts[USER].tokens)[0]], "4");

  const purse = await post(svc, "/api/1984/practice", { token: "good" });
  assert.equal(purse.status, 200);
  const poc = read().accounts[USER].poc;
  const spent = await post(svc, "/api/1984/spend", { shop: "cafe", sku: "water", rail: "poc", confirmed: true });
  assert.equal(spent.status, 401);
  assert.equal(read().accounts[USER].poc, poc);

  const rules = await post(svc, "/api/1984/rules", { rules: { confirmOverCents: 5 } });
  assert.equal(rules.status, 401);
  const vault = await post(svc, "/api/1984/vault/save", { title: "Note", body: "hello", purpose: "note", basis: "desk" });
  assert.equal(vault.status, 401);
  assert.equal(JSON.stringify(read()).includes("hello"), false);

  const wrong = await post(svc, "/api/1984/mint", { token: "nope", option: "more", name: "ASH", amount: "1" });
  assert.equal(wrong.status, 401);
  assert.equal(supplyOf(read().mints, "ASH"), "4");
});

test("only the opener can mint more, and reserved names stay closed", async () => {
  const { svc, read } = desk({
    guests: {
      async sessionKey({ token, address }) {
        if (token !== "good") throw new Error("This test tab does not match that address.");
        return { key: "22".repeat(32), address };
      },
    },
  });
  const opened = await post(svc, "/api/1984/mint", { token: "good", option: "new", name: "ash", amount: "2", cap: "9" });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.mints[0].opener, USER);
  const more = await post(svc, "/api/1984/mint", { token: "good", address: OTHER, option: "more", name: "ASH", amount: "1" });
  assert.equal(more.status, 400);
  assert.match(more.body.error, /Only the address that opened/);
  assert.equal(supplyOf(read().mints, "ASH"), "2");
  for (const name of ["KAS", "USDT"]) {
    const reserved = await post(svc, "/api/1984/mint", { token: "good", option: "new", name, amount: "1", cap: "1" });
    assert.equal(reserved.status, 400, name);
    assert.match(reserved.body.error, /already a rail/);
  }
  const year = await post(svc, "/api/1984/mint", { token: "good", option: "new", name: "1984", amount: "1", cap: "1" });
  assert.equal(year.status, 400);
  assert.match(year.body.error, /starts with a letter/);
});

test("a closed square refuses a new test wallet and a ledger write, and a read still answers", async () => {
  const { svc, read, opened } = desk({ squareOpen: false });
  const guest = await post(svc, "/api/1984/guest", {});
  assert.equal(guest.status, 503);
  assert.match(guest.body.error, /Closed until further notice/);
  assert.equal(opened.length, 0);
  const before = JSON.stringify(read());
  const write = await post(svc, "/api/1984/practice", { token: "good" });
  assert.equal(write.status, 503);
  assert.equal(JSON.stringify(read()), before);
  assert.equal(read().accounts[USER], undefined);
  const look = await svc.handle({
    method: "GET",
    pathname: "/api/1984/account",
    query: new URLSearchParams({ address: USER }),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(look.status, 200);
  assert.equal(look.body.ok, true);
});

test("an unset square flag stays open, and SQUARE_OPEN=0 closes it", async () => {
  const prev = process.env.SQUARE_OPEN;
  delete process.env.SQUARE_OPEN;
  try {
    const open = desk({ squareOpen: undefined });
    const guest = await post(open.svc, "/api/1984/guest", {});
    assert.equal(guest.status, 200);
    assert.equal(open.opened.length, 1);
    process.env.SQUARE_OPEN = "0";
    const shut = desk({ squareOpen: undefined });
    const third = await post(shut.svc, "/api/1984/guest", {});
    assert.equal(third.status, 503);
    assert.match(third.body.error, /Closed until further notice/);
    assert.equal(shut.opened.length, 0);
  } finally {
    if (prev == null) delete process.env.SQUARE_OPEN;
    else process.env.SQUARE_OPEN = prev;
  }
});
