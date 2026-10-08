/** Layer-Kaspa. A site book on this square's ledger. Not Tor, not a KNS registration, not a new chain. */

import { assertTestnet, railName } from "./money.mjs";

const RESERVED = new Set(["kas", "tkas", "kns", "layer", "kachat", "poc", "kusdt", "pocencept", "kaspa", "1984"]);

export function normalizeLabel(value) {
  let text = String(value || "").trim().toLowerCase();
  if (text.endsWith(".kas")) text = text.slice(0, -4);
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(text) || text.endsWith("-")) {
    throw new Error("A Layer-Kaspa name is 1 to 32 letters, digits, and hyphens, and it starts with a letter.");
  }
  if (RESERVED.has(text)) throw new Error("That name is reserved on Layer-Kaspa.");
  return text;
}

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

function book(state) {
  if (!state.sites) state.sites = {};
  return state.sites;
}

function clip(value, max) {
  return String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function cleanOffers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 8) throw new Error("A site can list 8 offers.");
  return list.map((row, index) => {
    const name = clip(row && row.name, 40);
    if (!name) throw new Error("Name the offer.");
    const dollars = String(row && row.cents != null ? row.cents : "").trim();
    if (!/^[0-9]+$/.test(dollars)) throw new Error("An offer price is a whole number of cents.");
    const cents = BigInt(dollars);
    if (cents <= 0n || cents > 10_000_000n) throw new Error("An offer price is from 1 cent to 100000.00.");
    const kind = row && row.kind === "service" ? "service" : "product";
    return { id: String(index + 1), name, cents: String(cents), kind };
  });
}

export function publicSites(state) {
  const sites = (state && state.sites) || {};
  return Object.keys(sites)
    .map((name) => {
      const row = sites[name];
      return {
        name,
        host: name + ".kas",
        owner: row.owner,
        title: row.title || name,
        about: row.about || "",
        kns: row.kns === "tn10" ? "tn10" : "square",
        offers: (row.offers || []).map((item) => ({
          id: item.id,
          name: item.name,
          cents: String(item.cents),
          kind: item.kind === "service" ? "service" : "product",
        })),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function receipt(state, account, note, rail, cents, now) {
  state.seq = String(bi(state.seq) + 1n);
  if (!state.receipts) state.receipts = [];
  const row = {
    id: state.seq,
    at: now,
    address: account.address,
    kind: "spend",
    shop: "layer",
    sku: "",
    rail,
    cents: String(cents),
    sompi: "0",
    txid: "",
    seq: state.seq,
    kusdtSeq: account.seq || "0",
    note,
  };
  state.receipts.push(row);
  if (state.receipts.length > 400) state.receipts.splice(0, state.receipts.length - 400);
  return row;
}

export function applyClaim(state, input, now) {
  const address = assertTestnet(input.address);
  const name = normalizeLabel(input.name);
  const next = clone(state);
  const sites = book(next);
  const existing = sites[name];
  if (existing && existing.owner.toLowerCase() !== address.toLowerCase()) {
    throw new Error("That Layer-Kaspa name is already taken.");
  }
  const kns = input.kns === "tn10" ? "tn10" : "square";
  if (!existing) {
    sites[name] = { owner: address, title: name, about: "", offers: [], kns };
  } else {
    existing.kns = kns;
  }
  const where = kns === "tn10"
    ? " This address already owns " + name + ".kas on the KNS testnet index."
    : " This name is on Layer-Kaspa. It is not a registration at the KNS index. The KNS app does that.";
  return {
    state: next,
    result: {
      ok: true,
      site: publicSites(next).find((row) => row.name === name),
      sites: publicSites(next),
      note: "Claimed " + name + ".kas on Layer-Kaspa." + where,
      at: now,
    },
  };
}

export function applySite(state, input, now) {
  const address = assertTestnet(input.address);
  const name = normalizeLabel(input.name);
  const next = clone(state);
  const row = book(next)[name];
  if (!row || row.owner.toLowerCase() !== address.toLowerCase()) {
    throw new Error("Claim that name before you build on it.");
  }
  row.title = clip(input.title, 48) || name;
  row.about = clip(input.about, 280);
  row.offers = cleanOffers(input.offers);
  return {
    state: next,
    result: {
      ok: true,
      site: publicSites(next).find((item) => item.name === name),
      sites: publicSites(next),
      note: "Published " + name + ".kas on Layer-Kaspa.",
      at: now,
    },
  };
}

function take(account, rail, cents) {
  const field = rail === "poc" ? "poc" : "kusdt";
  const backedField = rail === "poc" ? "pocBacked" : "kusdtBacked";
  const have = bi(account[field]);
  if (have < cents) throw new Error("Not enough " + railName(rail) + ". The bank swaps tKAS into it.");
  const backed = bi(account[backedField]);
  const practice = have - backed;
  const fromPractice = practice >= cents ? cents : practice;
  account[field] = String(have - cents);
  account[backedField] = String(backed - (cents - fromPractice));
}

function give(account, rail, cents) {
  const field = rail === "poc" ? "poc" : "kusdt";
  account[field] = String(bi(account[field]) + cents);
}

export function applyOfferBuy(state, input, now) {
  const address = assertTestnet(input.address);
  const name = normalizeLabel(input.name);
  const rail = input.rail === "kusdt" ? "kusdt" : input.rail === "poc" ? "poc" : "";
  if (!rail) throw new Error("Pay an offer with POCencept or KUSDT. tKAS swaps at the bank first.");
  const next = clone(state);
  const row = book(next)[name];
  if (!row) throw new Error("That site is not on Layer-Kaspa.");
  if (row.owner.toLowerCase() === address.toLowerCase()) throw new Error("That offer is already yours.");
  const offer = (row.offers || []).find((item) => item.id === String(input.offer || ""));
  if (!offer) throw new Error("That offer is not on this site.");
  const buyer = ensure(next, address);
  const seller = ensure(next, row.owner);
  if (rail === "kusdt" && buyer.kusdtFrozen) {
    throw new Error("KUSDT is frozen on this address. POCencept still moves.");
  }
  const cents = bi(offer.cents);
  take(buyer, rail, cents);
  give(seller, rail, cents);
  const slip = receipt(next, buyer, name + ".kas · " + offer.name, rail, cents, now);
  return {
    state: next,
    result: {
      ok: true,
      receipt: slip,
      sites: publicSites(next),
      note: "Bought " + offer.name + " on " + name + ".kas. The tag moved on this ledger.",
    },
  };
}
