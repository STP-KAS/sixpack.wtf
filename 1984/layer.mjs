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

const ACCENTS = new Set(["stone", "gold", "green", "blue"]);

function accentOf(raw) {
  const value = String(raw || "stone").toLowerCase().trim();
  return ACCENTS.has(value) ? value : "stone";
}

function cleanLink(labelRaw, urlRaw) {
  const label = clip(labelRaw, 32);
  const url = clip(urlRaw, 180);
  if (!label && !url) return { label: "", url: "" };
  if (!label || !url) throw new Error("A link needs a label and an https address.");
  if (!/^https:\/\/\S+$/.test(url) || url.length < 12) throw new Error("A link starts with https://.");
  return { label, url };
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
        tagline: row.tagline || "",
        about: row.about || "",
        welcome: row.welcome || "",
        accent: accentOf(row.accent),
        linkLabel: row.linkLabel || "",
        linkUrl: row.linkUrl || "",
        kns: row.kns === "tn10" ? "tn10" : "square",
        showName: row.showName === true,
        inscribed: row.inscribed === true,
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
  if (input.kns !== "tn10") {
    throw new Error("Own this name on the KNS testnet index before you customize it. The KNS app registers it. This desk does not.");
  }
  const next = clone(state);
  const sites = book(next);
  const existing = sites[name];
  if (!existing) {
    sites[name] = {
      owner: address,
      title: name,
      tagline: "",
      about: "",
      welcome: "",
      accent: "stone",
      linkLabel: "",
      linkUrl: "",
      offers: [],
      kns: "tn10",
    };
  } else {
    existing.owner = address;
    existing.kns = "tn10";
  }
  const account = next.accounts && next.accounts[address.toLowerCase()];
  if (account && account.knsName === name) sites[name].inscribed = true;
  return {
    state: next,
    result: {
      ok: true,
      site: publicSites(next).find((row) => row.name === name),
      sites: publicSites(next),
      note: "This address owns " + name + ".kas on the KNS testnet index. This desk did not register it.",
      at: now,
    },
  };
}

export function applyInscribed(state, input, now) {
  const address = assertTestnet(input.address);
  const name = normalizeLabel(input.name);
  const id = String(input.inscriptionId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}i0$/.test(id)) throw new Error("The inscription id did not come back.");
  const next = clone(state);
  const account = ensure(next, address);
  if (account.knsName && account.knsName !== name) {
    throw new Error("This address already inscribed one name. A layer has one.");
  }
  account.knsName = name;
  const row = book(next)[name];
  if (row && row.owner.toLowerCase() === address.toLowerCase()) row.inscribed = true;
  return {
    state: next,
    result: {
      ok: true,
      name,
      inscriptionId: id,
      note: "Inscribed " + name + ".kas on the KNS testnet index. One name. No covenant was deployed. Open it again once the index lists this address.",
      at: now,
    },
  };
}

export function applyDisplay(state, input, now) {
  const address = assertTestnet(input.address);
  const name = normalizeLabel(input.name);
  const show = input.show === true;
  const next = clone(state);
  const sites = book(next);
  const row = sites[name];
  if (!row || row.kns !== "tn10") {
    throw new Error("Own this name on the KNS testnet index before you show it.");
  }
  if (row.owner.toLowerCase() !== address.toLowerCase()) {
    throw new Error("Only the owner of this name on the KNS testnet index can show it.");
  }
  for (const key of Object.keys(sites)) {
    if (sites[key].owner && sites[key].owner.toLowerCase() === address.toLowerCase()) sites[key].showName = false;
  }
  row.showName = show;
  const account = ensure(next, address);
  account.displayName = show ? name : "";
  return {
    state: next,
    result: {
      ok: true,
      site: publicSites(next).find((item) => item.name === name),
      sites: publicSites(next),
      displayName: account.displayName,
      note: show
        ? "This square shows " + name + ".kas instead of the tKAS address."
        : "This square shows the tKAS address.",
      at: now,
    },
  };
}

export function applySite(state, input, now) {
  const address = assertTestnet(input.address);
  const name = normalizeLabel(input.name);
  const next = clone(state);
  const row = book(next)[name];
  if (!row || row.kns !== "tn10") {
    throw new Error("Own this name on the KNS testnet index before you customize it. The KNS app registers it. This desk does not.");
  }
  if (row.owner.toLowerCase() !== address.toLowerCase()) {
    throw new Error("Only the owner of this name on the KNS testnet index can change the page.");
  }
  const link = cleanLink(input.linkLabel, input.linkUrl);
  row.title = clip(input.title, 48) || name;
  row.tagline = clip(input.tagline, 80);
  row.about = clip(input.about, 280);
  row.welcome = clip(input.welcome, 400);
  row.accent = accentOf(input.accent);
  row.linkLabel = link.label;
  row.linkUrl = link.url;
  row.offers = cleanOffers(input.offers);
  return {
    state: next,
    result: {
      ok: true,
      site: publicSites(next).find((item) => item.name === name),
      sites: publicSites(next),
      note: "Published " + name + ".kas. Visitors can open the page. Only this owner can change it. No covenant is deployed.",
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
