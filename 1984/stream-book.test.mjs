import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pipeVideo } from "./stream-file.mjs";
import { applyPractice, applyStreamBuy, freshState, streamOwns } from "./ledger.mjs";
import { create1984Service } from "./service.mjs";
import { RESERVE } from "./money.mjs";
import {
  EXAMPLE_CENTS,
  EXAMPLE_ID,
  addTitle,
  centsFromPrice,
  normalizeShare,
  parseByteRange,
  publicStream,
  publicTitle,
  removeTitle,
  titleById,
} from "./stream-book.mjs";

const USER = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

test("the desk example is a 0.15 short and the public shelf hides the file", () => {
  const row = titleById({ streamTitles: [] }, EXAMPLE_ID);
  assert.equal(row.kind, "short");
  assert.equal(row.cents, EXAMPLE_CENTS);
  assert.equal(row.file, "desk-example.mp4");
  const pub = publicTitle(row, false);
  assert.equal(pub.locked, true);
  assert.equal(pub.cents, 15);
  assert.equal(pub.desk, true);
  assert.equal(Object.hasOwn(pub, "file"), false);
  assert.equal(Object.hasOwn(pub, "src"), false);
  const shelf = JSON.stringify(publicStream({ streamTitles: [] }, []));
  assert.match(shelf, /Example/);
  assert.match(shelf, /Cannae/);
  assert.match(shelf, /Clodyssey I: The Descent/);
  assert.match(shelf, /Gray march/);
  assert.match(shelf, /Life Is Beautiful/);
  assert.match(shelf, /does not sell this film/);
  assert.match(shelf, /1984\/stream\/standard\.jpg/);
  assert.match(shelf, /Short movies/);
  assert.equal(JSON.parse(shelf).titles.some((row) => row.title === "Life Is Beautiful"), false);
  assert.doesNotMatch(shelf, /desk-example\.mp4/);
  assert.doesNotMatch(shelf, /clodyssey\.mp4/);
  assert.doesNotMatch(shelf, /cannae\.mp4/);
  assert.doesNotMatch(shelf, /gray-march\.mp4/);
  assert.doesNotMatch(shelf, /AE575E66/);
});

test("a share is https, a kind, and a price, and 0 is free", () => {
  assert.equal(centsFromPrice("0.15"), 15);
  assert.equal(centsFromPrice("0"), 0);
  assert.throws(() => centsFromPrice("http://x"), /price/);
  const row = normalizeShare(
    { title: "Night market", kind: "series", blurb: "One episode.", price: "0", src: "https://example.com/night.mp4" },
    USER
  );
  assert.equal(row.free, true);
  assert.equal(row.kind, "series");
  assert.match(row.id, /^si/);
  const open = publicTitle(row, false);
  assert.equal(open.locked, false);
  assert.throws(
    () => normalizeShare({ title: "X", kind: "short", price: "1", src: "http://example.com/a.mp4" }, USER),
    /https/
  );
  assert.throws(
    () => normalizeShare({ title: "X", kind: "opera", price: "1", src: "https://example.com/a.mp4" }, USER),
    /series/
  );
  const kept = addTitle({ streamTitles: [] }, row);
  assert.equal(removeTitle(kept, row.id, USER).streamTitles.length, 0);
  assert.throws(() => removeTitle({ streamTitles: [] }, EXAMPLE_ID, USER), /desk films/);
});

test("a byte range stays inside the file", () => {
  assert.deepEqual(parseByteRange("", 10), { start: 0, end: 9, partial: false });
  assert.deepEqual(parseByteRange("bytes=0-3", 10), { start: 0, end: 3, partial: true });
  assert.deepEqual(parseByteRange("bytes=8-", 10), { start: 8, end: 9, partial: true });
  assert.equal(parseByteRange("bytes=20-30", 10).error, 416);
});

test("0.15 POCencept opens the example once", () => {
  const started = applyPractice(freshState(), { address: USER }, 1);
  const bought = applyStreamBuy(
    started.state,
    { address: USER, id: EXAMPLE_ID, title: "Example", cents: 15, rail: "poc", confirmed: true },
    2
  );
  assert.equal(bought.result.ok, true);
  assert.equal(streamOwns(bought.state, USER, EXAMPLE_ID), true);
  assert.equal(bought.result.account.poc, String(BigInt(started.result.account.poc) - 15n));
  const again = applyStreamBuy(
    bought.state,
    { address: USER, id: EXAMPLE_ID, title: "Example", cents: 15, rail: "poc", confirmed: true },
    3
  );
  assert.equal(again.result.already, true);
  assert.equal(again.state, bought.state);
});

test("the shelf route lists the example and a guest buy unlocks it", async () => {
  const txid = "cd".repeat(32);
  let state = null;
  const svc = create1984Service({
    load: () => state || { accounts: {}, txids: {}, receipts: [], redeemedSompi: "0", seq: "0" },
    save: (next) => {
      state = next;
    },
    fetch: async (url) => {
      const u = String(url);
      if (u.includes("info/price")) return { ok: true, json: async () => ({ price: 0.05 }) };
      if (u.includes("/transactions/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            subnetwork_id: "0000000000000000000000000000000000000000",
            transaction_id: txid,
            is_accepted: true,
            inputs: [{ previous_outpoint_address: USER, previous_outpoint_amount: 2_000_000_000 }],
            outputs: [{ script_public_key_address: RESERVE, amount: 2_000_000_000 }],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    now: () => Date.UTC(2026, 9, 10),
    txTries: 1,
    guests: { async pay() { return { txid }; } },
    pay: async () => ({ txids: [] }),
  });
  const shelf = await svc.handle({
    method: "GET",
    pathname: "/api/1984/stream",
    query: new URLSearchParams(),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(shelf.status, 200);
  const example = shelf.body.titles.find((row) => row.id === EXAMPLE_ID);
  assert.equal(example.cents, 15);
  assert.equal(example.locked, true);
  assert.doesNotMatch(JSON.stringify(shelf.body), /desk-example\.mp4/);
  const blocked = await svc.handle({
    method: "GET",
    pathname: "/api/1984/stream/open",
    query: new URLSearchParams({ id: EXAMPLE_ID }),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(blocked.status, 402);
  const shared = await svc.handle({
    method: "POST",
    pathname: "/api/1984/stream/share",
    query: new URLSearchParams(),
    body: {
      address: USER,
      network: "testnet-10",
      title: "A remake",
      kind: "remake",
      blurb: "Free.",
      price: "0",
      src: "https://example.com/remake.mp4",
    },
    ip: "127.0.0.1",
  });
  assert.equal(shared.status, 200, shared.body && shared.body.error);
  const remake = shared.body.titles.find((row) => row.kind === "remake");
  assert.equal(remake.locked, false);
  assert.equal(remake.free, true);
  const opened = await svc.handle({
    method: "GET",
    pathname: "/api/1984/stream/open",
    query: new URLSearchParams({ id: remake.id }),
    body: {},
    ip: "127.0.0.1",
  });
  assert.equal(opened.body.src, "https://example.com/remake.mp4");
  const bought = await svc.handle({
    method: "POST",
    pathname: "/api/1984/guest/stream/buy",
    query: new URLSearchParams(),
    body: { address: USER, network: "testnet-10", token: "tok", id: EXAMPLE_ID, rail: "kas", confirmed: true },
    ip: "127.0.0.1",
  });
  assert.equal(bought.status, 200, bought.body && bought.body.error);
  assert.equal(bought.body.ok, true);
  assert.match(bought.body.src, /^\/api\/1984\/stream\/file\//);
  const ticket = bought.body.src.split("/").pop();
  assert.ok(svc.streamFile(ticket));
});

test("a video range answers 206 and does not send the whole file", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "si-range-"));
  const file = path.join(dir, "clip.mp4");
  writeFileSync(file, Buffer.from("0123456789abcdef"));
  const server = http.createServer((req, res) => pipeVideo(req, res, file, {}));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const res = await fetch("http://127.0.0.1:" + port + "/", { headers: { range: "bytes=0-3" } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 0-3/16");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(await res.text(), "0123");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the square tab is SI stream", () => {
  const client = readFileSync(new URL("./client.mjs", import.meta.url), "utf8");
  const css = readFileSync(new URL("../1984.css", import.meta.url), "utf8");
  const html = readFileSync(new URL("../1984.html", import.meta.url), "utf8");
  assert.match(client, /\["sistream", "SI stream"\]/);
  assert.match(client, /data-si-buy/);
  assert.match(client, /The desk films are 0\.15/);
  assert.match(client, /does not sell that film/);
  assert.match(client, /lecture ahead of the story/);
  assert.match(css, /\.kw-panel\.si-pop \{[\s\S]*left: 8px;[\s\S]*right: 8px;[\s\S]*top: 8px;[\s\S]*bottom: 8px;/);
  assert.match(css, /\.phone-fit \.kw-panel\.si-pop \{[\s\S]*top: 4px;[\s\S]*bottom: 4px;/);
  assert.match(html, /1984\/client\.mjs\?v=139/);
  assert.match(html, /1984\.css\?v=81/);
});
