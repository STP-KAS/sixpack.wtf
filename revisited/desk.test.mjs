import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRevisited, dispatch } from "./desk.mjs";

const A = "kaspatest:qzffl5xy9np46gkttyuftqnv2w04pr8g3wsp7c3vv8se3txtelx6q7c0v0ldx";
const B = "kaspatest:qrwae7eef8hsntzp39wkc68393ztjranqsgm8s7qqxjadk8dwh50g2eywhun0";
const KAS = 100_000_000n;

function harness(balance = 20n * KAS) {
  let quote = 1_000_000n;
  const pays = [];
  const froms = [];
  const sessions = { aaa: A, bbb: B };
  const guests = {
    async view({ token, address }) {
      if (sessions[token] !== address) throw new Error("This test tab has already been dropped. Open a new one.");
      return { address, funded: "0" };
    },
    async payTo(input) {
      pays.push(input);
      return { ok: true, txid: "11".repeat(32), sompi: String(input.sompi) };
    },
    async payFromAddress(input) {
      froms.push(input);
      return { ok: true, txid: "22".repeat(32), sompi: String(input.sompi) };
    },
  };
  const desk = createRevisited({
    load: () => null,
    save() {},
    guests,
    balanceOf: async () => balance,
    priceOf: async () => quote,
    now: () => 1,
  });
  return {
    desk,
    pays,
    froms,
    setQuote(next) { quote = next; },
    setBalance(next) { balance = next; },
  };
}

async function sendJson(res, status, body) {
  res.status = status;
  res.body = body;
}

test("mint locks 150% and refuses the cushion", async () => {
  const box = harness(250_000_000n);
  const minted = await box.desk.call({ action: "mint", token: "aaa", address: A, amount: "1.00" });
  assert.equal(minted.body.calm, "1.00");
  assert.equal(minted.body.debt, "1.00");
  assert.equal(minted.body.lockedSompi, "150000000");
  assert.equal(minted.body.ratio, "150.00%");
  assert.equal(minted.body.key, undefined);
  await assert.rejects(
    () => box.desk.call({ action: "mint", token: "aaa", address: A, amount: "0.01" }),
    /One tKAS stays for the miner fee/
  );
  const tight = harness(KAS);
  await assert.rejects(
    () => tight.desk.call({ action: "mint", token: "aaa", address: A, amount: "0.01" }),
    /One tKAS stays for the miner fee/
  );
});

test("water spend moves calm and leaves the debt", async () => {
  const box = harness();
  await box.desk.call({ action: "mint", token: "aaa", address: A, amount: "1.00" });
  const paid = await box.desk.call({ action: "spend", token: "aaa", address: A, id: "water" });
  assert.equal(paid.body.calm, "0.90");
  assert.equal(paid.body.debt, "1.00");
  assert.match(paid.body.receipt, /Paid Water 0\.10/);
  assert.equal(box.froms.length, 0);
  assert.equal(box.pays.length, 0);
});

test("a higher quote lets surplus out and keeps 150%", async () => {
  const box = harness();
  await box.desk.call({ action: "mint", token: "aaa", address: A, amount: "1.00" });
  box.setQuote(2_000_000n);
  const freed = await box.desk.call({ action: "surplus", token: "aaa", address: A });
  assert.equal(freed.body.lockedSompi, "75000000");
  assert.equal(freed.body.ratio, "150.00%");
  assert.match(freed.body.receipt, /Took back/);
});

test("a tKAS send stays inside the spendable sleeve", async () => {
  const box = harness(20n * KAS);
  await box.desk.call({ action: "mint", token: "aaa", address: A, amount: "1.00" });
  await assert.rejects(
    () => box.desk.call({ action: "kas", token: "aaa", address: A, to: B, amount: "17.50000001" }),
    /miner cushion/
  );
  assert.equal(box.pays.length, 0);
  const sent = await box.desk.call({ action: "kas", token: "aaa", address: A, to: B, amount: "17.5" });
  assert.equal(box.pays.length, 1);
  assert.equal(box.pays[0].to, B);
  assert.equal(box.pays[0].sompi, "1750000000");
  assert.equal(box.pays[0].token, "aaa");
  assert.match(sent.body.receipt, /Sent 17\.5 tKAS/);
  assert.equal(sent.body.privateKey, undefined);
});

test("repay unlocks in place and a received redeem pays from the minter", async () => {
  const box = harness();
  await box.desk.call({ action: "mint", token: "aaa", address: A, amount: "1.00" });
  const repaid = await box.desk.call({ action: "repay", token: "aaa", address: A, amount: "1.00" });
  assert.equal(repaid.body.calm, "0.00");
  assert.equal(repaid.body.debt, "0.00");
  assert.equal(repaid.body.lockedSompi, "0");
  assert.equal(box.froms.length, 0);

  await box.desk.call({ action: "mint", token: "aaa", address: A, amount: "1.00" });
  await box.desk.call({ action: "send", token: "aaa", address: A, to: B, amount: "0.40", note: "lunch" });
  const redeemed = await box.desk.call({ action: "redeem", token: "bbb", address: B, amount: "0.40" });
  assert.equal(redeemed.body.calm, "0.00");
  assert.equal(box.froms.length, 1);
  assert.equal(box.froms[0].address, A);
  assert.equal(box.froms[0].to, B);
  assert.equal(box.froms[0].sompi, "40000000");
  const home = await box.desk.call({ action: "picture", token: "aaa", address: A });
  assert.equal(home.body.debt, "0.60");
  assert.equal(home.body.calm, "0.60");
});

test("a low quote blocks mint and surplus and says the lock cannot cover the repay", async () => {
  const box = harness();
  await box.desk.call({ action: "mint", token: "aaa", address: A, amount: "1.00" });
  box.setQuote(10_000n);
  const picture = await box.desk.picture({ token: "aaa", address: A });
  assert.equal(picture.mintDisabled, true);
  assert.match(picture.line, /under 150%/);
  await assert.rejects(
    () => box.desk.call({ action: "mint", token: "aaa", address: A, amount: "0.01" }),
    /under 150%/
  );
  await assert.rejects(
    () => box.desk.call({ action: "surplus", token: "aaa", address: A }),
    /under 150%/
  );
  await assert.rejects(
    () => box.desk.call({ action: "repay", token: "aaa", address: A, amount: "1.00" }),
    /The locked tKAS does not cover this repay at the current price/
  );
});

test("a bad token is refused and freeze is missing", async () => {
  const box = harness();
  await assert.rejects(
    () => box.desk.picture({ token: "nope", address: A }),
    /dropped/
  );
  const res = { status: 0, body: null };
  await dispatch(box.desk, { method: "GET" }, res, new URL("http://127.0.0.1:4020/api/revisited?address=" + A + "&token=nope"), {
    sendJson,
    readBody: async () => "",
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /dropped/);
  assert.equal(JSON.stringify(res.body).includes("privateKey"), false);
  const frozen = { status: 0, body: null };
  await dispatch(box.desk, { method: "POST", headers: {} }, frozen, new URL("http://127.0.0.1:4020/api/revisited/freeze"), {
    sendJson,
    readBody: async () => "{\"action\":\"freeze\"}",
  });
  assert.equal(frozen.status, 404);
  const opted = { status: 0, body: null };
  await dispatch(box.desk, { method: "OPTIONS", headers: {} }, opted, new URL("http://127.0.0.1:4020/api/revisited"), {
    sendJson,
    readBody: async () => "",
  });
  assert.equal(opted.status, 204);
});

test("a missing quote still returns the picture and blocks mint", async () => {
  const box = harness();
  box.setQuote(0n);
  const picture = await box.desk.picture({ token: "aaa", address: A });
  assert.equal(picture.quote, "");
  assert.equal(picture.mintDisabled, true);
  await assert.rejects(
    () => box.desk.call({ action: "mint", token: "aaa", address: A, amount: "1.00" }),
    /price oracle/
  );
});

test("the page says this is 1984 revisited and the nav points at it", () => {
  const html = readFileSync(new URL("../revisited.html", import.meta.url), "utf8");
  const client = readFileSync(new URL("./client.js", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../nav.js", import.meta.url), "utf8");
  const square = readFileSync(new URL("../1984.html", import.meta.url), "utf8");
  const squareClient = readFileSync(new URL("../1984/client.mjs", import.meta.url), "utf8");
  assert.match(html, /This is 1984 revisited\. The weird content from STP is not on this page\./);
  assert.match(html, /The launch, the town, and the political lines are not on this page\./);
  assert.match(html, /id="use-guest">Use a funded test address<\/button>/);
  assert.match(html, /Intentions are good\. The thought process is questionable\./);
  assert.match(client, /Opening the funded wallet/);
  assert.match(client, /pointerdown/);
  assert.match(client, /revisited-browser-v1/);
  assert.doesNotMatch(client, /1984-browser-v1/);
  assert.doesNotMatch(html + client, /confirm\(/);
  assert.doesNotMatch(html, /SpaceX|Gulf of America|IRGC/);
  assert.doesNotMatch(html, /crap/i);
  assert.doesNotMatch(html, /LUMBRIDGE/);
  const town = square.match(/window\.TOWN_API = "([^"]+)"/);
  assert.ok(town);
  assert.match(html, new RegExp(town[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const tunnel = squareClient.match(/const TUNNEL = "([^"]+)"/);
  assert.ok(tunnel);
  assert.match(client, new RegExp(tunnel[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const revisitedAt = nav.indexOf('label: "1984 revisited"');
  const squareAt = nav.indexOf('label: "1984"');
  assert.ok(squareAt >= 0 && revisitedAt > squareAt);
  assert.match(nav, /revisited\.html/);
  assert.match(html, /nav\.js\?v=70/);
});
