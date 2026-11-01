import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const sixpackRoot = path.join(here, "..");
export const grokRepo = process.env.GROK_DESK_REPO || path.join(os.homedir(), "Grok.SPCXAI.KAS");
export const masterRoot = process.env.KASPA_MASTER || path.join(os.homedir(), "kaspa-master-file-git");

const FEED_FILES = ["system.md", "feed.md", "catalog.md"];

const PAGE_PATCHES = [
  {
    file: "pins.html",
    re: /Node: rusty-kaspa <strong>v\d+\.\d+\.\d+<\/strong>/,
    to: (pin) => "Node: rusty-kaspa <strong>v" + pin.version + "</strong>",
  },
  {
    file: "explained.html",
    re: /rusty v\d+\.\d+\.\d+/,
    to: (pin) => "rusty v" + pin.version,
  },
  {
    file: "node.html",
    re: /Pin: rusty-kaspa v\d+\.\d+\.\d+\./,
    to: (pin) => "Pin: rusty-kaspa v" + pin.version + ".",
  },
];

export function masterHead(root = masterRoot) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const when = execFileSync("git", ["log", "-1", "--format=%cI"], { cwd: root, encoding: "utf8" }).trim();
  return { sha, when };
}

export function loadNowSection(root = masterRoot) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, "master.json"), "utf8"));
  const section = (raw.sections || []).find((s) => s.id === "now");
  if (!section) throw new Error("master.json has no section now");
  return { updated: raw.updated || "", disclaimer: raw.disclaimer || "", section };
}

export function releasePin(section) {
  const live = (section.rows || []).find((row) => row.name === "Live");
  const note = live?.note || "";
  const match = note.match(/GitHub release v(\d+\.\d+\.\d+) is commit ([0-9a-f]{7,})/i);
  if (!match) return null;
  return { version: match[1], commit: match[2] };
}

export function renderNow({ head, pack }) {
  const lines = [
    "# Now — kaspa-master-file",
    "",
    "Generated from `master.json` section `now`. Commit `" + head.sha + "` (" + head.when + ").",
    "Canonical board: https://github.com/STP-KAS/kaspa-master-file#now-read-this-first",
    "Same board on the desk: https://sixpack.wtf/grok/now.md",
    "",
    "This block wins. If `catalog.md`, `feed.md`, or the status list above names a different release, tip, Final flag, or demo pin, ignore that earlier line and use this block.",
    "Not Kaspa core. Not an audit. Not an oracle. A merged Active KIP or a release tag outranks a site or a post.",
    "",
  ];
  for (const row of pack.section.rows || []) {
    const chip = row.chip ? " [" + row.chip + "]" : "";
    lines.push("## " + row.name + chip);
    if (row.url) lines.push(row.url);
    if (row.note) lines.push(String(row.note).trim());
    lines.push("");
  }
  return lines.join("\n");
}

export function applyRelease(html, pin, spec) {
  if (!pin || !spec.re.test(html)) return html;
  return html.replace(spec.re, spec.to(pin));
}

function writeIfChanged(file, text) {
  let prev = null;
  try {
    prev = fs.readFileSync(file, "utf8");
  } catch {
    prev = null;
  }
  if (prev === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return true;
}

function stampSources(file, head) {
  const src = JSON.parse(fs.readFileSync(file, "utf8"));
  src.updated = String(head.when).slice(0, 10);
  src.master_commit = head.sha;
  src.master_at = head.when;
  const text = JSON.stringify(src, null, 2) + "\n";
  return writeIfChanged(file, text);
}

export function ensureMasterFeed(opts = {}) {
  const master = opts.masterRoot || masterRoot;
  const six = opts.sixpackRoot || sixpackRoot;
  const desk = opts.grokRepo || grokRepo;
  const head = masterHead(master);
  const nowPath = path.join(six, "grok", "now.md");
  let current = "";
  try {
    current = fs.readFileSync(nowPath, "utf8");
  } catch {
    current = "";
  }
  const marker = "Commit `" + head.sha + "`";
  if (!opts.force && current.includes(marker)) {
    return { changed: false, sha: head.sha, when: head.when, files: [] };
  }
  const pack = loadNowSection(master);
  const text = renderNow({ head, pack });
  const files = [];
  if (writeIfChanged(nowPath, text)) files.push("grok/now.md");
  const deskFeed = path.join(desk, "feed");
  fs.mkdirSync(deskFeed, { recursive: true });
  if (writeIfChanged(path.join(deskFeed, "now.md"), text)) files.push("desk:feed/now.md");
  for (const name of FEED_FILES) {
    const from = path.join(six, "grok", name);
    if (!fs.existsSync(from)) continue;
    const body = fs.readFileSync(from);
    const dest = path.join(deskFeed, name);
    let same = false;
    try {
      same = fs.readFileSync(dest).equals(body);
    } catch {
      same = false;
    }
    if (!same) {
      fs.writeFileSync(dest, body);
      files.push("desk:feed/" + name);
    }
  }
  if (stampSources(path.join(six, "grok", "sources.json"), head)) files.push("grok/sources.json");
  if (stampSources(path.join(deskFeed, "sources.json"), head)) files.push("desk:feed/sources.json");
  const pin = releasePin(pack.section);
  for (const spec of PAGE_PATCHES) {
    const file = path.join(six, spec.file);
    const before = fs.readFileSync(file, "utf8");
    const after = applyRelease(before, pin, spec);
    if (after !== before) {
      fs.writeFileSync(file, after);
      files.push(spec.file);
    }
  }
  return { changed: files.length > 0, sha: head.sha, when: head.when, pin, files };
}

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function commitPaths(repo, paths, message) {
  const present = paths.filter((rel) => fs.existsSync(path.join(repo, rel)));
  if (!present.length) return false;
  git(repo, ["add", "--", ...present]);
  const staged = git(repo, ["diff", "--cached", "--name-only"]).trim();
  if (!staged) return false;
  const msgFile = path.join(process.env.TEMP || process.env.TMP || sixpackRoot, "grok-master-sync-msg.txt");
  fs.writeFileSync(msgFile, message);
  try {
    git(repo, ["commit", "-F", msgFile]);
    git(repo, ["pull", "--rebase", "--autostash", "origin", "main"]);
    git(repo, ["push", "origin", "main"]);
  } finally {
    try {
      fs.unlinkSync(msgFile);
    } catch {
      /* already gone */
    }
  }
  return true;
}

export function publishMasterFeed(result) {
  const sha = result.sha.slice(0, 7);
  const sixpackPaths = result.files.filter((rel) => !rel.startsWith("desk:"));
  const deskPaths = result.files.filter((rel) => rel.startsWith("desk:")).map((rel) => rel.slice(5));
  const pushed = [];
  if (sixpackPaths.length && commitPaths(sixpackRoot, sixpackPaths, "Sync the desk board from kaspa-master-file " + sha + ".\n")) {
    pushed.push("sixpack.wtf");
  }
  if (deskPaths.length && commitPaths(grokRepo, deskPaths, "Sync the feed from kaspa-master-file " + sha + ".\n")) {
    pushed.push("Grok.SPCXAI.KAS");
  }
  return pushed;
}

function watchLoop() {
  const logDir = path.join(process.env.USERPROFILE || "", ".grok", "long-running-background-tasks");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "watch_master_feed.log");
  const log = (line) => fs.appendFileSync(logFile, new Date().toISOString() + " " + line + "\n");
  log("watching " + masterRoot);
  const tick = () => {
    try {
      const result = ensureMasterFeed();
      if (!result.changed) return;
      const pushed = publishMasterFeed(result);
      log("synced " + result.sha + " pushed " + (pushed.join(",") || "nothing"));
    } catch (err) {
      log("error " + (err && err.message ? err.message : err));
      console.log("ACTION_REQUIRED: master feed sync failed: " + (err && err.message ? err.message : err));
    }
  };
  tick();
  setInterval(tick, 60_000);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const result = ensureMasterFeed({ force: process.argv.includes("--force") });
  if (process.argv.includes("--push")) {
    const pushed = publishMasterFeed(result);
    console.log(JSON.stringify({ ...result, pushed }));
  } else if (process.argv.includes("--watch")) {
    watchLoop();
  } else {
    console.log(JSON.stringify(result));
  }
}
