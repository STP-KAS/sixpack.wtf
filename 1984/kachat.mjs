/** Kachat on this square. Messages and a handshake. The fee is 0.01 POCencept. Not the KaChat chain app. */

import { assertTestnet } from "./money.mjs";

export const CHAT_FEE = 1n;

function clone(state) {
  return structuredClone(state);
}

function bi(value) {
  return BigInt(value || 0);
}

function ensure(state, address) {
  if (!state.accounts) state.accounts = {};
  const key = address.toLowerCase();
  if (!state.accounts[key]) {
    state.accounts[key] = {
      address,
      poc: "0",
      kusdt: "0",
      pocBacked: "0",
      kusdtBacked: "0",
      liability: "0",
      kusdtFrozen: false,
      practice: false,
      roadster: false,
      rules: { dailyCapCents: 0, shops: [], rails: [], confirmOverCents: 0 },
      spentDay: "",
      spentCents: "0",
      seq: "0",
    };
  }
  return state.accounts[key];
}

function hands(state) {
  if (!state.hands) state.hands = [];
  return state.hands;
}

function notes(state) {
  if (!state.notes) state.notes = [];
  return state.notes;
}

function pair(a, b) {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("|");
}

function takeFee(account) {
  const have = bi(account.poc);
  if (have < CHAT_FEE) {
    throw new Error("This costs 0.01 POCencept. Swap tKAS at the bank, or take the practice purse.");
  }
  const backed = bi(account.pocBacked);
  const practice = have - backed;
  const fromPractice = practice >= CHAT_FEE ? CHAT_FEE : practice;
  account.poc = String(have - CHAT_FEE);
  account.pocBacked = String(backed - (CHAT_FEE - fromPractice));
}

function samePair(row, a, b) {
  return pair(row.from, row.to) === pair(a, b);
}

function connected(state, a, b) {
  return hands(state).some((row) => row.status === "done" && samePair(row, a, b));
}

export function publicChat(state, address) {
  const me = assertTestnet(address).toLowerCase();
  const mine = (row) => row.from.toLowerCase() === me || row.to.toLowerCase() === me;
  return {
    hands: hands(state).filter(mine).slice(-40),
    notes: notes(state).filter(mine).slice(-40),
    feeCents: "1",
  };
}

export function applyHandshake(state, input, now) {
  const from = assertTestnet(input.address);
  const to = assertTestnet(input.to);
  if (from.toLowerCase() === to.toLowerCase()) throw new Error("A handshake goes to another address.");
  const next = clone(state);
  if (connected(next, from, to)) throw new Error("You are already connected. Send a message.");
  const open = hands(next).find((row) => row.status === "open" && samePair(row, from, to));
  if (open) {
    if (open.from.toLowerCase() === from.toLowerCase()) throw new Error("That handshake is waiting for them.");
    throw new Error("They already offered a handshake. Accept it.");
  }
  const account = ensure(next, from);
  takeFee(account);
  hands(next).push({ id: String(hands(next).length + 1), from, to, status: "open", at: now });
  if (hands(next).length > 200) hands(next).splice(0, hands(next).length - 200);
  return {
    state: next,
    result: { ok: true, ...publicChat(next, from), note: "Handshake sent. They accept it in Kachat. The fee was 0.01 POCencept." },
  };
}

export function applyAccept(state, input, now) {
  const me = assertTestnet(input.address);
  const from = assertTestnet(input.from);
  const next = clone(state);
  const open = hands(next).find((row) => row.status === "open" && row.to.toLowerCase() === me.toLowerCase() && row.from.toLowerCase() === from.toLowerCase());
  if (!open) throw new Error("There is no handshake from that address.");
  const account = ensure(next, me);
  takeFee(account);
  open.status = "done";
  open.at = now;
  return {
    state: next,
    result: { ok: true, ...publicChat(next, me), note: "Handshake accepted. You can send messages. The fee was 0.01 POCencept." },
  };
}

export function applyMessage(state, input, now) {
  const from = assertTestnet(input.address);
  const to = assertTestnet(input.to);
  const text = String(input.text || "").replace(/[\u0000-\u001f]/g, "").trim();
  if (!text) throw new Error("Type a message.");
  if (text.length > 240) throw new Error("A message is at most 240 characters.");
  const next = clone(state);
  if (!connected(next, from, to)) throw new Error("Send a handshake first. They accept it, then messages move.");
  const account = ensure(next, from);
  takeFee(account);
  notes(next).push({ id: String(notes(next).length + 1), from, to, text, at: now });
  if (notes(next).length > 400) notes(next).splice(0, notes(next).length - 400);
  return {
    state: next,
    result: { ok: true, ...publicChat(next, from), note: "Message sent. The fee was 0.01 POCencept." },
  };
}
