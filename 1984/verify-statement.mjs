/** Check one bank statement. No key. No address is printed.
 *  npm install once in 1984/statement-kit, then:
 *  node 1984/verify-statement.mjs --file <statement.json>
 *  node 1984/verify-statement.mjs --url <GET /api/1984/statement>
 */
import fs from "node:fs";
import { verifyRecord } from "./statement.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}

const file = arg("--file");
const url = arg("--url");
const base = arg("--base") || "https://api-tn10.kaspa.org";

let record;
if (file) record = JSON.parse(fs.readFileSync(file, "utf8"));
else if (url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.log("fail fetch");
    process.exit(1);
  }
  record = await res.json();
} else {
  console.log("fail usage");
  process.exit(2);
}

const checked = await verifyRecord(record, { fetch, base, goneMustBeSpent: false });
if (!checked.ok) {
  console.log("fail " + checked.errors.join(" "));
  process.exit(1);
}
console.log("ok " + record.day + " " + record.statement);
