import assert from "node:assert/strict";
import test from "node:test";
import { applyAccept, applyHandshake, applyMessage, publicChat } from "./kachat.mjs";
import { applyClaim, applyOfferBuy, applySite, publicSites } from "./layer.mjs";
import { create1984Service } from "./service.mjs";

const A = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const B = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

test("only a KNS owner can customize a Layer-Kaspa page, and a visitor can still buy", () => {
  let state = { accounts: {}, receipts: [], seq: "0", sites: {} };
  state.accounts[A.toLowerCase()] = { address: A, poc: "0", kusdt: "0", pocBacked: "0", kusdtBacked: "0" };
  state.accounts[B.toLowerCase()] = { address: B, poc: "500", kusdt: "0", pocBacked: "0", kusdtBacked: "0" };
  assert.throws(() => applyClaim(state, { address: A, name: "Lumbridge.kas", kns: "square" }, 1), /KNS testnet index/);
  const claimed = applyClaim(state, { address: A, name: "Lumbridge.kas", kns: "tn10" }, 1);
  assert.match(claimed.result.note, /did not register it/);
  assert.equal(claimed.result.site.kns, "tn10");
  state = claimed.state;
  assert.throws(() => applySite(state, { address: B, name: "lumbridge", title: "No", about: "No" }, 2), /Only the owner/);
  const published = applySite(state, {
    address: A,
    name: "lumbridge",
    title: "Loaves",
    tagline: "Warm bread",
    about: "Bread on the square.",
    welcome: "Come in.",
    accent: "gold",
    linkLabel: "KNS",
    linkUrl: "https://app.knsdomains.org",
    offers: [{ name: "Loaf", cents: "150", kind: "product" }],
  }, 2);
  state = published.state;
  assert.equal(publicSites(state)[0].offers[0].cents, "150");
  assert.equal(publicSites(state)[0].accent, "gold");
  assert.equal(publicSites(state)[0].tagline, "Warm bread");
  const bought = applyOfferBuy(state, { address: B, name: "lumbridge", offer: "1", rail: "poc" }, 3);
  assert.equal(bought.state.accounts[B.toLowerCase()].poc, "350");
  assert.equal(bought.state.accounts[A.toLowerCase()].poc, "150");
  const taken = applyClaim(bought.state, { address: B, name: "lumbridge", kns: "tn10" }, 4);
  assert.equal(taken.state.sites.lumbridge.owner, B);
  assert.equal(taken.state.sites.lumbridge.title, "Loaves");
  assert.throws(() => applySite(taken.state, { address: A, name: "lumbridge", title: "Mine" }, 5), /Only the owner/);
  assert.throws(() => applySite(taken.state, {
    address: B,
    name: "lumbridge",
    title: "Loaves",
    linkLabel: "Bad",
    linkUrl: "http://example.com",
  }, 6), /https:\/\//);
});

test("the layer save route refuses a name this address does not own", async () => {
  let state = { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0", hunts: {}, mints: {} };
  let mode = "none";
  const svc = create1984Service({
    load: () => state,
    save: (next) => {
      state = next;
    },
    fetch: async (url) => {
      const u = String(url);
      if (!u.includes("/owner")) return { ok: false, status: 404, json: async () => ({}) };
      if (mode === "none") return { ok: false, status: 404, json: async () => ({}) };
      const owner = mode === "other" ? B : A;
      return { ok: true, status: 200, json: async () => ({ success: true, data: { owner, asset: "lumbridge.kas" } }) };
    },
    now: () => 10,
    pay: async () => ({ txids: [] }),
  });
  const refused = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/save",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "lumbridge", title: "Loaves", about: "Bread" },
    ip: "layer-test",
  });
  assert.equal(refused.status, 400);
  assert.equal(state.sites, undefined);
  mode = "other";
  const stranger = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/save",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "lumbridge", title: "Loaves" },
    ip: "layer-test",
  });
  assert.equal(stranger.status, 400);
  assert.match(stranger.body.error, /another address/);
  assert.equal(state.sites, undefined);
  mode = "owner";
  const saved = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/save",
    query: new URLSearchParams(),
    body: {
      address: A,
      network: "testnet-10",
      name: "lumbridge",
      title: "Loaves",
      tagline: "Warm bread",
      about: "Bread",
      welcome: "Come in.",
      accent: "green",
      linkLabel: "KNS",
      linkUrl: "https://tn10.knsdomains.org",
      offers: [{ name: "Loaf", cents: "150", kind: "product" }],
    },
    ip: "layer-test",
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.site.kns, "tn10");
  assert.equal(saved.body.site.accent, "green");
  assert.equal(state.sites.lumbridge.owner, A);
});

test("a quiet KNS index does not let an address customize", async () => {
  let state = { accounts: {}, receipts: [], seq: "0" };
  const svc = create1984Service({
    load: () => state,
    save: (next) => {
      state = next;
    },
    fetch: async () => {
      throw new Error("down");
    },
    now: () => 10,
    pay: async () => ({ txids: [] }),
  });
  const refused = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/save",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "lumbridge", title: "Loaves" },
    ip: "layer-quiet",
  });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /did not confirm/);
  assert.equal(state.sites, undefined);
});

test("Kachat takes a handshake before a message, and each step costs 0.01 POCencept", () => {
  let state = { accounts: {}, seq: "0" };
  state.accounts[A.toLowerCase()] = { address: A, poc: "5", pocBacked: "0" };
  state.accounts[B.toLowerCase()] = { address: B, poc: "5", pocBacked: "0" };
  assert.throws(() => applyMessage(state, { address: A, to: B, text: "hello" }, 1), /handshake/);
  const offered = applyHandshake(state, { address: A, to: B }, 2);
  assert.equal(offered.state.accounts[A.toLowerCase()].poc, "4");
  assert.throws(() => applyMessage(offered.state, { address: A, to: B, text: "hello" }, 3), /accept/);
  const accepted = applyAccept(offered.state, { address: B, from: A }, 4);
  assert.equal(accepted.state.accounts[B.toLowerCase()].poc, "4");
  const sent = applyMessage(accepted.state, { address: A, to: B, text: "hello" }, 5);
  assert.equal(sent.result.notes.length, 1);
  assert.equal(sent.result.notes[0].text, "hello");
  assert.equal(sent.state.accounts[A.toLowerCase()].poc, "3");
  const quiet = publicChat(sent.state, B);
  assert.equal(quiet.notes.length, 1);
  assert.equal(quiet.notes[0].text, "hello");
});
