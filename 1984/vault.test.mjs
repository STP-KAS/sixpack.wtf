import assert from "node:assert/strict";
import test from "node:test";
import { create1984Service } from "./service.mjs";
import { applyVaultSave, applyVaultSeal, publicVaults } from "./vault.mjs";

const A = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const B = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";
const C = "kaspatest:rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr";
const NOTE = "square-ledger-note";

function empty() {
  return { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0", hunts: {}, mints: {} };
}

test("a vault stays with the owner until a listed reader reaches the open time", () => {
  const bare = empty();
  const quiet = publicVaults(bare, A, 1);
  assert.equal(quiet.vaults.length, 0);
  assert.equal(bare.vaults, undefined);
  assert.match(quiet.desk, /No covenant is deployed/);
  assert.match(quiet.desk, /not encrypted/);
  const later = 5_000;
  const saved = applyVaultSave(bare, {
    address: A,
    title: "Class",
    body: NOTE,
    readers: B,
    openAt: later,
    purpose: "nda",
    basis: "desk",
  }, 1);
  assert.equal(saved.state.vaults[saved.result.focus].purpose, "nda");
  assert.match(saved.result.note, /No covenant is deployed/);
  const owner = publicVaults(saved.state, A, 1);
  assert.equal(owner.vaults[0].body, NOTE);
  assert.equal(owner.vaults[0].readable, true);
  const early = publicVaults(saved.state, B, 1);
  assert.equal(early.vaults.length, 1);
  assert.equal(early.vaults[0].readable, false);
  assert.equal("body" in early.vaults[0], false);
  assert.equal("title" in early.vaults[0], false);
  const opened = publicVaults(saved.state, B, later);
  assert.equal(opened.vaults[0].body, NOTE);
  assert.equal(opened.vaults[0].title, "Class");
  const stranger = publicVaults(saved.state, C, later);
  assert.equal(stranger.vaults.length, 0);
  assert.equal(JSON.stringify(stranger).includes(NOTE), false);
});

test("a covenant mark is stored as a label and a seal keeps the note", () => {
  const marked = applyVaultSave(empty(), {
    address: A,
    title: "Label",
    body: NOTE,
    readers: "",
    purpose: "enterprise",
    basis: "covenant",
  }, 2);
  const id = marked.result.focus;
  assert.equal(marked.state.vaults[id].basis, "covenant");
  assert.equal(marked.state.vaults[id].readers.length, 0);
  assert.match(marked.result.note, /covenant mark is a label/);
  assert.match(marked.result.note, /No covenant is deployed/);
  assert.throws(() => applyVaultSave(marked.state, { address: A, title: "Label", body: NOTE, basis: "script" }, 3), /No covenant is deployed/);
  const sealed = applyVaultSeal(marked.state, { address: A, id }, 4);
  assert.equal(sealed.state.vaults[id].sealed, true);
  assert.equal(sealed.state.vaults[id].body, NOTE);
  assert.throws(() => applyVaultSave(sealed.state, { address: A, id, title: "Label", body: "changed", basis: "covenant" }, 5), /sealed/);
  assert.equal(sealed.state.vaults[id].body, NOTE);
  assert.throws(() => applyVaultSeal(sealed.state, { address: B, id }, 6), /not on this address/);
  assert.throws(() => applyVaultSave(empty(), { address: A, title: "X", body: NOTE, purpose: "intelligence" }, 7), /Purpose is note/);
});

test("the square home does not return a vault note", async () => {
  let state = empty();
  const clock = { t: 1_000 };
  const svc = create1984Service({
    load: () => state,
    save: (next) => {
      state = next;
    },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    now: () => clock.t,
    pay: async () => ({ txids: [] }),
  });
  const posted = await svc.handle({
    method: "POST",
    pathname: "/api/1984/vault/save",
    query: new URLSearchParams(),
    body: {
      address: A,
      network: "testnet-10",
      title: "Class",
      body: NOTE,
      readers: B,
      openAt: 5_000,
      purpose: "other",
      basis: "desk",
    },
    ip: "vault-test",
  });
  assert.equal(posted.status, 200);
  assert.equal(posted.body.vaults[0].body, NOTE);
  const home = await svc.handle({
    method: "GET",
    pathname: "/api/1984",
    query: new URLSearchParams(),
    body: {},
    ip: "vault-test",
  });
  assert.equal(home.body.vaults, undefined);
  assert.equal(JSON.stringify(home.body).includes(NOTE), false);
  const early = await svc.handle({
    method: "GET",
    pathname: "/api/1984/vault",
    query: new URLSearchParams({ address: B }),
    body: {},
    ip: "vault-test",
  });
  assert.equal(early.body.vaults.length, 1);
  assert.equal("body" in early.body.vaults[0], false);
  assert.equal(JSON.stringify(early.body).includes(NOTE), false);
  clock.t = 5_000;
  const late = await svc.handle({
    method: "GET",
    pathname: "/api/1984/vault",
    query: new URLSearchParams({ address: B }),
    body: {},
    ip: "vault-test",
  });
  assert.equal(late.body.vaults[0].body, NOTE);
  const id = posted.body.focus;
  const refused = await svc.handle({
    method: "POST",
    pathname: "/api/1984/vault/seal",
    query: new URLSearchParams(),
    body: { address: C, network: "testnet-10", id },
    ip: "vault-test",
  });
  assert.equal(refused.status, 400);
  assert.equal(state.vaults[id].body, NOTE);
  assert.equal(state.vaults[id].sealed, false);
});
