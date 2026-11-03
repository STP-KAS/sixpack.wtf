import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDesk } from "./desk.mjs";
import { GIFT_SOMPI } from "./script.mjs";

const ONE = "kaspadev:qp6zjhkx4z4j9tnqjttsg9ylhwwnmn2snu4re6pynxyyzwlpmf7uwsgjlwp8l";
const TWO = "kaspadev:qpnayvcujj42uh8ct0kz6npqrh9rekudmre22cw473l8aguqq7wxcaeg0ju52";

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk1985-"));
  const poolFile = path.join(dir, "guest-pool.json");
  const sessionFile = path.join(dir, "sessions.json");
  fs.writeFileSync(poolFile, JSON.stringify({
    miner: ONE,
    eachSompi: GIFT_SOMPI.toString(),
    wallets: [
      { address: ONE, key: "ab".repeat(32), sompi: GIFT_SOMPI.toString(), ready: true },
      { address: TWO, key: "cd".repeat(32), sompi: GIFT_SOMPI.toString(), ready: true },
    ],
  }));
  const calls = [];
  const desk = createDesk({
    poolFile,
    sessionFile,
    now: () => 1,
    validAddress: (address) => address === ONE || address === TWO,
    async balance() {
      return { spendable: GIFT_SOMPI.toString(), immature: "0", locked: "0", face: "0", kas: "22", immatureKas: "0", lockedKas: "0", faceText: "0", mined: null };
    },
    async transfer(spec) {
      calls.push({ from: spec.from, to: spec.to, sompi: spec.sompi.toString(), leaked: spec.key });
      return "11".repeat(32);
    },
  });
  return { desk, calls, poolFile };
}

test("a browser gets one prepaid wallet and the key stays on the desk", async () => {
  const { desk } = harness();
  const marker = "a".repeat(32);
  const opened = await desk.open(marker);
  assert.equal(opened.address, ONE);
  assert.equal(opened.same, false);
  assert.equal(opened.gift, "22");
  assert.equal(Object.hasOwn(opened, "key"), false);
  const again = await desk.open(marker);
  assert.equal(again.address, ONE);
  assert.equal(again.same, true);
  assert.equal(again.token, opened.token);
  const other = await desk.open("b".repeat(32));
  assert.equal(other.address, TWO);
  await assert.rejects(() => desk.open("c".repeat(32)), /all in use/);
  await assert.rejects(() => desk.open(""), /cannot tell this browser/);
});

test("a send pays Kaspa and does not return the key", async () => {
  const { desk, calls } = harness();
  const opened = await desk.open("d".repeat(32));
  const sent = await desk.send({ token: opened.token, to: TWO, amount: "1" });
  assert.equal(sent.ok, true);
  assert.equal(sent.txid, "11".repeat(32));
  assert.equal(Object.hasOwn(sent, "key"), false);
  assert.equal(calls[0].to, TWO);
  assert.equal(calls[0].sompi, "100000000");
  assert.equal(calls[0].leaked.length, 64);
  await assert.rejects(() => desk.send({ token: opened.token, to: "kaspatest:qq", amount: "1" }), /kaspadev/);
  await assert.rejects(() => desk.send({ token: opened.token, to: TWO, amount: "22" }), /does not cover/);
});

test("the page is a humble DevNet desk and the 1984 tab stays", () => {
  const html = fs.readFileSync(new URL("../1985.html", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("./client.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./desk.css", import.meta.url), "utf8");
  const nav = fs.readFileSync(new URL("../nav.js", import.meta.url), "utf8");
  const home = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const square = fs.readFileSync(new URL("../1984.html", import.meta.url), "utf8");
  assert.match(html, /Experimental research on this desk/);
  assert.match(html, /It is not a product\. It is not a stablecoin\. It is not Kaspa core\./);
  assert.match(html, /The 1984 tab is unchanged/);
  assert.match(html, /You cannot send STP/);
  assert.match(html, /Intentions are good\. The thought process is questionable\./);
  assert.match(html, /id="use-guest">Use a funded desk wallet/);
  assert.match(html, /nav\.js\?v=72/);
  assert.match(client, /Opening the funded wallet/);
  assert.match(client, /pointerdown/);
  assert.match(client, /1985-browser-v1/);
  assert.doesNotMatch(client, /1984-browser-v1/);
  assert.doesNotMatch(client, /trycloudflare/);
  assert.doesNotMatch(html + client, /confirm\(/);
  assert.doesNotMatch(html + client, /kaspatest:/);
  assert.doesNotMatch(html + client, /LUMBRIDGE|IRGC|Gulf of America/);
  assert.match(css, /\.d85-card/);
  assert.match(nav, /href: "1985\.html"/);
  assert.match(nav, /label: "1985"/);
  const squareAt = nav.indexOf('label: "1984"');
  const revisitedAt = nav.indexOf('label: "1984 revisited"');
  const nextAt = nav.indexOf('label: "1985"');
  assert.ok(squareAt >= 0 && revisitedAt > squareAt && nextAt > revisitedAt);
  assert.match(square, /1984\.html/);
  assert.match(home, /1985\.html/);
  assert.match(home, /Experimental research/);
});
