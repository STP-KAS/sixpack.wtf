import assert from "node:assert/strict";
import test from "node:test";
import { lookupSquareName, publicKnsIndex, recordSquareName } from "./kns-index.mjs";

const A = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const B = "kaspatest:qpppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";
const ID = "ab".repeat(32) + "i0";

test("the first recorded owner keeps the name on this square's index", () => {
  let state = { accounts: {} };
  const first = recordSquareName(state, { name: "Lumbridge.kas", owner: A, inscriptionId: ID, source: "square" }, 4);
  state = first.state;
  assert.equal(first.conflict, false);
  assert.equal(first.row.name, "lumbridge");
  assert.equal(first.row.owner, A);
  assert.equal(first.row.source, "square");
  const again = recordSquareName(state, { name: "lumbridge", owner: A, source: "kns" }, 5);
  assert.equal(again.already, true);
  assert.equal(again.conflict, false);
  assert.equal(again.row.inscriptionId, ID);
  assert.equal(again.row.source, "square");
  const other = recordSquareName(state, { name: "lumbridge", owner: B, inscriptionId: "cd".repeat(32) + "i0", source: "square" }, 6);
  assert.equal(other.conflict, true);
  assert.equal(other.row.owner, A);
  assert.equal(lookupSquareName(other.state, "lumbridge").owner, A);
  const listed = publicKnsIndex(state);
  assert.equal(listed.length, 1);
  assert.deepEqual(Object.keys(listed[0]).sort(), ["at", "inscriptionId", "name", "owner", "source"]);
  const dumped = JSON.stringify(listed);
  assert.doesNotMatch(dumped, /mnemonic|privHex|privateKey|seed|wallet\.secret/i);
  assert.throws(() => recordSquareName(state, { name: "lumbridge", owner: A, inscriptionId: "nope" }, 7), /inscription id/);
});
