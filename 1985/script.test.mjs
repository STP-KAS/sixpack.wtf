import assert from "node:assert/strict";
import test from "node:test";
import {
  GIFT_SOMPI,
  WALLET_COUNT,
  allowDesk,
  coinbaseFee,
  coinbaseRewards,
  formatKas,
  groupInt,
  isDevnetAddress,
  parseKas,
  parseStpLock,
  splitScript,
} from "./script.mjs";

const STP_HEX = "0000045354503108aa8e6b57000000004c22202419b169b370f104f50dca6bdb55dae917dbbb6b4acaba02e193c60ed0d4a20eac00";

test("the coinbase lock stores a face and ends in OP_FALSE", () => {
  const parsed = parseStpLock(STP_HEX);
  assert.ok(parsed);
  assert.equal(parsed.face, 1466666666n);
  assert.equal(parsed.owner.length, 34);
  assert.equal(parsed.owner[0], 0x20);
  assert.equal(parsed.owner[parsed.owner.length - 1], 0xac);
  assert.equal(splitScript(STP_HEX).script[splitScript(STP_HEX).script.length - 1], 0x00);
});

test("a pay-to-pubkey script is not an STP lock", () => {
  const hex = "0000" + "20" + "11".repeat(32) + "ac";
  assert.equal(parseStpLock(hex), null);
  assert.equal(splitScript(hex).script.length, 34);
});

test("half-split fees are the free output minus the locked output", () => {
  assert.equal(coinbaseFee(2208393000n, 2200000000n), 8393000n);
  assert.equal(coinbaseFee(2200000000n, 2200000000n), 0n);
  assert.equal(coinbaseFee(100n, 0n), null);
  const row = coinbaseRewards([
    { value: 2208393000n, scriptPublicKey: "000020" + "ab".repeat(32) + "ac" },
    { value: 2200000000n, scriptPublicKey: STP_HEX },
  ]);
  assert.equal(row.free, 2208393000n);
  assert.equal(row.locked, 2200000000n);
  assert.equal(row.face, 1466666666n);
  assert.equal(row.fees, 8393000n);
  assert.ok(row.minerScript);
});

test("Kaspa amounts stay in sompi", () => {
  assert.equal(formatKas(GIFT_SOMPI), "22");
  assert.equal(formatKas(2208393000n), "22.08393");
  assert.equal(parseKas("22"), GIFT_SOMPI);
  assert.equal(parseKas("0.01"), 1_000_000n);
  assert.equal(parseKas("1.123456789"), null);
  assert.equal(parseKas("kaspadev:qq"), null);
  assert.equal(groupInt(1466666666n), "1,466,666,666");
});

test("the desk API stays on this computer", () => {
  assert.equal(allowDesk("127.0.0.1:4020", ""), true);
  assert.equal(allowDesk("localhost:4020", "http://127.0.0.1:4020"), true);
  assert.equal(allowDesk("sixpack.wtf", ""), false);
  assert.equal(allowDesk("127.0.0.1:4020", "https://sixpack.wtf"), false);
  assert.equal(allowDesk("schools-portrait-dealtime-forestry.trycloudflare.com", ""), false);
  assert.equal(isDevnetAddress("kaspadev:qp6zjhkx4z4j9tnqjttsg9ylhwwnmn2snu4re6pynxyyzwlpmf7uwsgjlwp8l"), true);
  assert.equal(isDevnetAddress("kaspatest:qp6zjhkx4z4j9tnqjttsg9ylhwwnmn2snu4re6pynxyyzwlpmf7uwsgjlwp8l"), false);
  assert.equal(WALLET_COUNT >= 20, true);
});
