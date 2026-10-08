import assert from "node:assert/strict";
import test from "node:test";
import { applyAccept, applyHandshake, applyMessage, publicChat } from "./kachat.mjs";
import { applyClaim, applyOfferBuy, applySite, publicSites } from "./layer.mjs";

const A = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const B = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

test("a funded address claims a Layer-Kaspa name, publishes an offer, and another address buys it", () => {
  let state = { accounts: {}, receipts: [], seq: "0", sites: {} };
  state.accounts[A.toLowerCase()] = { address: A, poc: "0", kusdt: "0", pocBacked: "0", kusdtBacked: "0" };
  state.accounts[B.toLowerCase()] = { address: B, poc: "500", kusdt: "0", pocBacked: "0", kusdtBacked: "0" };
  const claimed = applyClaim(state, { address: A, name: "Lumbridge.kas", kns: "square" }, 1);
  assert.match(claimed.result.note, /not a registration at the KNS index/);
  assert.equal(claimed.result.site.host, "lumbridge.kas");
  state = claimed.state;
  const published = applySite(state, {
    address: A,
    name: "lumbridge",
    title: "Loaves",
    about: "Bread on the square.",
    offers: [{ name: "Loaf", cents: "150", kind: "product" }],
  }, 2);
  state = published.state;
  assert.equal(publicSites(state)[0].offers[0].cents, "150");
  const bought = applyOfferBuy(state, { address: B, name: "lumbridge", offer: "1", rail: "poc" }, 3);
  assert.equal(bought.state.accounts[B.toLowerCase()].poc, "350");
  assert.equal(bought.state.accounts[A.toLowerCase()].poc, "150");
  assert.throws(() => applyClaim(bought.state, { address: B, name: "lumbridge" }, 4), /already taken/);
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
