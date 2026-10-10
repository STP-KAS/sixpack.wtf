import assert from "node:assert/strict";
import test from "node:test";
import { create1984Service } from "./service.mjs";
import { SEAL_HEADER, SEAL_PAYLOAD_MAX, SEAL_PLAIN_CHAIN, decryptNote, encryptNote } from "./seal.mjs";

const A = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const B = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";
const NOTE = "violet-harbor-note-should-stay-sealed";

test("a short note fits in a 1024-byte payload and a longer one does not", () => {
  assert.equal(SEAL_PLAIN_CHAIN, 988);
  assert.equal(SEAL_PAYLOAD_MAX, 1024);
  const small = encryptNote("a".repeat(988), "unit-test-secret");
  assert.equal(small.onChain, true);
  assert.equal(small.payload.length, 1024);
  assert.equal(small.payload.subarray(0, SEAL_HEADER.length).toString(), SEAL_HEADER);
  assert.equal(decryptNote(small.cipher, "unit-test-secret"), "a".repeat(988));
  const large = encryptNote("a".repeat(989), "unit-test-secret");
  assert.equal(large.onChain, false);
  assert.equal(large.payload, null);
  assert.equal(decryptNote(large.cipher, "unit-test-secret"), "a".repeat(989));
  assert.throws(() => decryptNote(small.cipher, "other-secret"), /did not open/);
});

test("a funded short note goes on chain, a long note and a chosen address stay ciphertext on the desk", async () => {
  let state = { accounts: {}, receipts: [], seq: "0", sites: {} };
  let chain = 0;
  const svc = create1984Service({
    load: () => state,
    save: (next) => {
      state = next;
    },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    now: () => 10,
    pay: async () => ({ txids: [] }),
    guests: {
      async sessionKey({ token, address }) {
        if (token !== "tab" || address !== A) throw new Error("This test tab does not match that address.");
        return { key: "unit-test-secret", address: A };
      },
    },
    sealOnChain: async ({ payload }) => {
      chain += 1;
      assert.ok(Buffer.from(payload).length <= 1024);
      assert.equal(Buffer.from(payload).subarray(0, 8).toString(), SEAL_HEADER);
      return { txid: "ab".repeat(32) };
    },
  });
  const posted = {
    method: "POST",
    query: new URLSearchParams(),
    ip: "layer-seal",
  };
  const small = await svc.handle({
    ...posted,
    pathname: "/api/1984/layer/seal",
    body: { address: A, network: "testnet-10", token: "tab", place: "funded", plain: NOTE },
  });
  assert.equal(small.status, 200);
  assert.equal(chain, 1);
  assert.equal(small.body.seal.where, "chain");
  assert.equal(small.body.seal.deskHoldsKey, true);
  assert.match(small.body.note, /No covenant was deployed/);
  assert.equal(JSON.stringify(state).includes(NOTE), false);
  assert.equal(state.accounts[A.toLowerCase()].seal.plain, undefined);
  const opened = await svc.handle({
    ...posted,
    pathname: "/api/1984/layer/seal/open",
    body: { address: A, network: "testnet-10", token: "tab" },
  });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.plain, NOTE);
  assert.equal(JSON.stringify(state).includes(NOTE), false);
  const longNote = "b".repeat(2000);
  const desk = await svc.handle({
    ...posted,
    pathname: "/api/1984/layer/seal",
    body: { address: A, network: "testnet-10", token: "tab", place: "funded", plain: longNote },
  });
  assert.equal(desk.status, 200);
  assert.equal(chain, 1);
  assert.equal(desk.body.seal.where, "desk");
  assert.equal(JSON.stringify(state).includes(longNote), false);
  const leaked = await svc.handle({
    ...posted,
    pathname: "/api/1984/layer/seal",
    body: { address: A, network: "testnet-10", place: "choice", to: B, plain: NOTE },
  });
  assert.equal(leaked.status, 400);
  assert.match(leaked.body.error, /ciphertext/);
  assert.equal(chain, 1);
  const foreign = encryptNote(NOTE, "browser-pass");
  const chosen = await svc.handle({
    ...posted,
    pathname: "/api/1984/layer/seal",
    body: { address: A, network: "testnet-10", place: "choice", to: B, cipher: foreign.cipher, bytes: foreign.bytes },
  });
  assert.equal(chosen.status, 200);
  assert.equal(chain, 1);
  assert.equal(chosen.body.seal.where, "desk");
  assert.equal(chosen.body.seal.deskHoldsKey, false);
  assert.equal(chosen.body.seal.dest, B);
  assert.equal(JSON.stringify(state).includes(NOTE), false);
  const refused = await svc.handle({
    ...posted,
    pathname: "/api/1984/layer/seal/open",
    body: { address: A, network: "testnet-10", token: "tab" },
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /passphrase/);
});
