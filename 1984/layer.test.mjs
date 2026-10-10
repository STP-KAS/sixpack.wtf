import assert from "node:assert/strict";
import test from "node:test";
import { applyAccept, applyHandshake, applyMessage, publicChat } from "./kachat.mjs";
import { applyClaim, applyDefault, applyDisplay, applyInscribed, applyOfferBuy, applySite, publicSites } from "./layer.mjs";
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

test("this square's index opens a name it inscribed when the KNS testnet index is quiet", async () => {
  let state = { accounts: {}, receipts: [], seq: "0", sites: {} };
  let mode = "miss";
  const id = "ab".repeat(32) + "i0";
  const svc = create1984Service({
    load: () => state,
    save: (next) => {
      state = next;
    },
    fetch: async (url) => {
      const u = String(url);
      if (!u.includes("/owner")) return { ok: false, status: 404, json: async () => ({}) };
      if (mode === "down") throw new Error("down");
      if (mode === "other") {
        return { ok: true, status: 200, json: async () => ({ success: true, data: { owner: B, asset: "lumbridge.kas" } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    now: () => 10,
    pay: async () => ({ txids: [] }),
    inscribe: async () => ({ inscriptionId: id, feeKas: 35, revealId: "ab".repeat(32) }),
  });
  const inscribed = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/inscribe",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", token: "tab", name: "lumbridge" },
    ip: "layer-own-index",
  });
  assert.equal(inscribed.status, 200, inscribed.body && inscribed.body.error);
  assert.equal(inscribed.body.kns.length, 1);
  assert.equal(state.knsIndex[0].owner, A);
  assert.equal(state.knsIndex[0].inscriptionId, id);
  assert.equal(state.knsIndex[0].source, "square");
  assert.match(inscribed.body.note, /this square's index/i);
  assert.match(inscribed.body.note, /No covenant was deployed/);
  mode = "down";
  const saved = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/save",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "lumbridge", title: "Loaves", about: "Bread" },
    ip: "layer-own-index",
  });
  assert.equal(saved.status, 200, saved.body && saved.body.error);
  assert.match(saved.body.note, /this square's index/);
  assert.match(saved.body.note, /network record/);
  assert.equal(state.sites.lumbridge.owner, A);
  const stranger = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/save",
    query: new URLSearchParams(),
    body: { address: B, network: "testnet-10", name: "lumbridge", title: "No" },
    ip: "layer-own-index",
  });
  assert.equal(stranger.status, 400);
  assert.match(stranger.body.error, /this square's index/);
  assert.equal(state.sites.lumbridge.owner, A);
  const listed = await svc.handle({
    method: "GET",
    pathname: "/api/1984/kns",
    query: new URLSearchParams(),
    body: {},
    ip: "layer-own-index",
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.index, "square");
  assert.equal(listed.body.names.length, 1);
  assert.equal(listed.body.names[0].name, "lumbridge");
  assert.doesNotMatch(JSON.stringify(listed.body), /mnemonic|privHex|privateKey|seed|wallet\.secret/i);
  const resolved = await svc.handle({
    method: "GET",
    pathname: "/api/1984/resolve",
    query: new URLSearchParams({ name: "lumbridge" }),
    body: {},
    ip: "layer-own-index",
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.found.address, A);
  assert.equal(resolved.body.found.index, "square");
  mode = "other";
  const beaten = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/save",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "lumbridge", title: "Mine" },
    ip: "layer-own-index",
  });
  assert.equal(beaten.status, 400);
  assert.match(beaten.body.error, /another address/);
  assert.equal(state.knsIndex[0].owner, A);
  const official = await svc.handle({
    method: "GET",
    pathname: "/api/1984/resolve",
    query: new URLSearchParams({ name: "lumbridge" }),
    body: {},
    ip: "layer-own-index",
  });
  assert.equal(official.status, 200);
  assert.equal(official.body.found.address, B);
  assert.equal(official.body.found.index, "kns");
  mode = "down";
  const quietMiss = await svc.handle({
    method: "GET",
    pathname: "/api/1984/resolve",
    query: new URLSearchParams({ name: "missingname" }),
    body: {},
    ip: "layer-own-index",
  });
  assert.equal(quietMiss.status, 400);
  assert.match(quietMiss.body.error, /did not answer/);
});

test("one address can inscribe more than one name, and the bar default is the first until it is changed", async () => {
  let state = { accounts: {}, receipts: [], seq: "0", sites: {} };
  let calls = 0;
  let owned = false;
  const svc = create1984Service({
    load: () => state,
    save: (next) => {
      state = next;
    },
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("/owner")) {
        if (!owned) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ success: true, data: { owner: A, asset: "lumbridge.kas" } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    now: () => 10,
    pay: async () => ({ txids: [] }),
    inscribe: async () => {
      calls += 1;
      return { inscriptionId: "ab".repeat(32) + "i0", feeKas: 35, revealId: "ab".repeat(32) };
    },
  });
  const missing = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/inscribe",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "lumbridge" },
    ip: "layer-kns",
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /KNS app/);
  assert.equal(calls, 0);
  const inscribed = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/inscribe",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", token: "tab", name: "lumbridge" },
    ip: "layer-kns",
  });
  assert.equal(inscribed.status, 200);
  assert.equal(calls, 1);
  assert.match(inscribed.body.note, /No covenant was deployed/);
  assert.equal(state.accounts[A.toLowerCase()].knsName, "lumbridge");
  assert.equal(state.accounts[A.toLowerCase()].displayName, "lumbridge");
  const again = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/inscribe",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", token: "tab", name: "othername" },
    ip: "layer-kns",
  });
  assert.equal(again.status, 200);
  assert.equal(calls, 2);
  assert.equal(state.accounts[A.toLowerCase()].knsName, "lumbridge");
  assert.deepEqual(state.accounts[A.toLowerCase()].knsNames, ["lumbridge", "othername"]);
  assert.equal(state.knsIndex.length, 2);
  assert.equal(state.knsIndex[0].source, "square");
  assert.equal(state.knsIndex[1].name, "othername");
  const repeat = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/inscribe",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", token: "tab", name: "lumbridge" },
    ip: "layer-kns",
  });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.already, true);
  assert.equal(calls, 2);
  const picked = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/default",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "othername" },
    ip: "layer-kns",
  });
  assert.equal(picked.status, 200);
  assert.equal(picked.body.displayName, "othername");
  assert.equal(picked.body.account.knsName, "othername");
  const back = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/default",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "" },
    ip: "layer-kns",
  });
  assert.equal(back.status, 200);
  assert.equal(back.body.displayName, "");
  assert.equal(back.body.account.knsNames.length, 2);
  owned = true;
  const shown = await svc.handle({
    method: "POST",
    pathname: "/api/1984/layer/display",
    query: new URLSearchParams(),
    body: { address: A, network: "testnet-10", name: "lumbridge", show: true },
    ip: "layer-kns",
  });
  assert.equal(shown.status, 200);
  assert.equal(shown.body.displayName, "lumbridge");
  assert.equal(shown.body.account.displayName, "lumbridge");
  assert.equal(publicSites(state)[0].showName, true);
  assert.equal(publicSites(state)[0].inscribed, true);
  const local = applyDisplay(state, { address: A, name: "lumbridge", show: false }, 11);
  assert.equal(local.result.displayName, "");
  const added = applyInscribed(local.state, { address: A, name: "thirdname", inscriptionId: "cd".repeat(32) + "i0" }, 12);
  assert.equal(added.result.displayName, "");
  assert.deepEqual(added.state.accounts[A.toLowerCase()].knsNames, ["lumbridge", "othername", "thirdname"]);
  const chosen = applyDefault(added.state, { address: A, name: "thirdname" }, 13);
  assert.equal(chosen.result.displayName, "thirdname");
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
