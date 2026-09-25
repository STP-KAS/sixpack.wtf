#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planClaim, sompiToTkas, FROM, remainingInWindow, requireTestnetAddress, EXPLORER_HOME, normalizeIp, DRIP_SOMPI, CAP_SOMPI, WINDOW_HOURS } from "./faucet/policy.mjs";
import { listClaims, recordClaim } from "./faucet/ledger.mjs";
import { payTn10 } from "./faucet/pay.mjs";
import { handleGrokRequest } from "./grok/http.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4020);
const HOST = process.env.HOST ?? "127.0.0.1";
const ISHUM = process.env.ISHUM ?? "http://127.0.0.1:8090";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, body, req) {
  const origin = req && req.headers && req.headers.origin;
  const allow =
    origin === "http://127.0.0.1:4020" ||
    origin === "http://127.0.0.1:4021" ||
    origin === "http://localhost:4020" ||
    origin === "http://localhost:4021" ||
    origin === "https://sixpack.wtf" ||
    origin === "https://www.sixpack.wtf" ||
    (typeof origin === "string" && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) ||
    (typeof origin === "string" && /^https:\/\/[a-z0-9-]+\.loca\.lt$/.test(origin)) ||
    (typeof origin === "string" && /^https:\/\/[a-z0-9]+\.lhr\.life$/.test(origin))
      ? origin
      : "";
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (allow) {
    headers["access-control-allow-origin"] = allow;
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type, bypass-tunnel-reminder";
    headers.vary = "Origin";
  }
  const data = JSON.stringify(body);
  res.writeHead(status, headers);
  res.end(data);
}

function clientIp(req) {
  const x = req.headers["x-forwarded-for"];
  if (typeof x === "string" && x.trim()) return normalizeIp(x.split(",")[0]);
  return normalizeIp(req.socket?.remoteAddress || "unknown");
}

async function gateAddress(address) {
  return requireTestnetAddress(address);
}

function faucetErrStatus(err) {
  if (err?.code === "RATE" || err?.code === "POOL") return 429;
  if (/synced|UTXO|secret|node/i.test(err?.message || "")) return 503;
  return 400;
}

function faucetErrBody(err, extra) {
  return {
    ok: false,
    pending: false,
    status: "error",
    error: err?.message || String(err),
    code: err?.code || "",
    remainingTkas: err?.remainingTkas || "0",
    retryAfter: err?.retryAfter || "",
    retryAfterMs: err?.retryAfterMs || 0,
    restHours: err?.restHours || 0,
    windowHours: WINDOW_HOURS,
    ...extra,
  };
}

let faucetLock = Promise.resolve();
const jobs = new Map();

function rememberJob(id, patch) {
  const cur = jobs.get(id) || { at: Date.now() };
  const next = { ...cur, ...patch };
  jobs.set(id, next);
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, value] of jobs) {
    if (value.at < cutoff) jobs.delete(key);
  }
  return next;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    if (url.pathname === "/api/faucet" && req.method === "GET") {
      (async () => {
        try {
          const jobId = url.searchParams.get("job") || "";
          if (jobId) {
            const job = jobs.get(jobId);
            if (!job) {
              sendJson(res, 404, { ok: false, pending: false, error: "That send expired. Submit again." }, req);
              return;
            }
            sendJson(res, 200, job, req);
            return;
          }
          const address = url.searchParams.get("address") || "";
          const claims = listClaims();
          const ip = clientIp(req);
          if (!address) {
            let faucetBalanceTkas = "";
            try {
              const r = await fetch("https://api-tn10.kaspa.org/addresses/" + FROM + "/balance", {
                headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 sixpack-faucet" },
                signal: AbortSignal.timeout(3000),
              });
              const j = await r.json();
              faucetBalanceTkas = sompiToTkas(j.balance);
            } catch (_) {}
            const recent = [];
            const seen = new Set();
            for (const c of [...claims].reverse()) {
              for (const id of c.txids || []) {
                if (seen.has(id)) continue;
                seen.add(id);
                recent.push({
                  txid: id,
                  at: c.at,
                });
                if (recent.length >= 18) break;
              }
              if (recent.length >= 18) break;
            }
            sendJson(res, 200, {
              network: "testnet-10",
              from: FROM,
              capTkas: sompiToTkas(CAP_SOMPI),
              dripTkas: sompiToTkas(DRIP_SOMPI),
              windowHours: WINDOW_HOURS,
              faucetBalanceTkas,
              explorerHome: EXPLORER_HOME,
              recent,
            }, req);
            return;
          }
          await gateAddress(address);
          const plan = planClaim({ address, ip, claims, enforcePool: false });
          sendJson(res, 200, {
            address: plan.address,
            nextTkas: plan.tkas,
            remainingTkas: plan.unlimited ? "unlimited" : sompiToTkas(plan.sompi + plan.remainingAfter),
            remainingAddrTkas: plan.unlimited ? "unlimited" : sompiToTkas(plan.leftAddr),
            unlimited: !!plan.unlimited,
            windowHours: WINDOW_HOURS,
          }, req);
        } catch (err) {
          const claims = listClaims();
          const address = url.searchParams.get("address") || "";
          let remainingAddrTkas = "";
          try {
            const dest = requireTestnetAddress(address);
            remainingAddrTkas = sompiToTkas(remainingInWindow(claims, "addr:" + dest.toLowerCase()));
          } catch (_) {}
          sendJson(
            res,
            faucetErrStatus(err),
            faucetErrBody(err, {
              remainingAddrTkas: err.remainingTkas || remainingAddrTkas,
              remainingTkas: err.remainingTkas || remainingAddrTkas || "0",
            }),
            req
          );
        }
      })();
      return;
    }
    if (url.pathname === "/api/faucet" && req.method === "OPTIONS") {
      sendJson(res, 204, {}, req);
      return;
    }
    if (url.pathname === "/api/faucet" && req.method === "POST") {
      faucetLock = faucetLock.then(async () => {
        let jobId = "";
        try {
          const body = JSON.parse((await readBody(req)) || "{}");
          const ip = clientIp(req);
          await gateAddress(body.address);
          const plan = planClaim({
            address: body.address,
            ip,
            claims: listClaims(),
            amountTkas: body.amount,
          });
          jobId = crypto.randomBytes(8).toString("hex");
          const started = rememberJob(jobId, {
            ok: false,
            pending: true,
            status: "loading",
            step: "Checking the address",
            job: jobId,
            address: plan.address,
          });
          sendJson(res, 202, started, req);
          const paid = await payTn10(plan.address, plan.sompi, (step) => rememberJob(jobId, { step }));
          const at = Date.now();
          recordClaim({ key: plan.addrKey, address: plan.address, sompi: paid.sompi, txids: paid.txids, at, ip });
          recordClaim({ key: plan.ipKey, address: plan.address, sompi: paid.sompi, txids: paid.txids, at, ip });
          rememberJob(jobId, {
            ok: true,
            pending: false,
            status: "done",
            step: "Broadcasting",
            tkas: sompiToTkas(paid.sompi),
            remainingTkas: plan.unlimited ? "unlimited" : sompiToTkas(plan.remainingAfter),
            remainingAddrTkas: plan.unlimited ? "unlimited" : sompiToTkas(plan.leftAddr - BigInt(paid.sompi)),
            unlimited: !!plan.unlimited,
            address: plan.address,
            explorerHome: EXPLORER_HOME,
            txids: paid.txids,
          });
        } catch (err) {
          const payload = faucetErrBody(err, { step: "Stopped" });
          if (jobId) {
            rememberJob(jobId, payload);
            return;
          }
          sendJson(res, faucetErrStatus(err), payload, req);
        }
      });
      return;
    }
    if (url.pathname === "/api/grok" || url.pathname.startsWith("/api/grok/")) {
      handleGrokRequest(req, res, url, { readBody, clientIp });
      return;
    }
    if (url.pathname === "/ishum" || url.pathname.startsWith("/ishum/")) {
      const target = ISHUM + url.pathname.replace(/^\/ishum/, "") + url.search;
      http
        .get(target, (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        })
        .on("error", () => {
          res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
          res.end("original till not running at " + ISHUM);
        });
      return;
    }
    let filePath = decodeURIComponent(url.pathname);
    if (filePath.endsWith("/")) filePath += "index.html";
    if (filePath === "/") filePath = "/index.html";
    const resolved = path.normalize(path.join(root, filePath));
    if (!resolved.startsWith(root)) {
      res.writeHead(400);
      res.end();
      return;
    }
    fs.readFile(resolved, (err, data) => {
      if (err) {
        const fallback = path.join(root, "404.html");
        fs.readFile(fallback, (e2, body) => {
          res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
          res.end(e2 ? "not found" : body);
        });
        return;
      }
      const type = TYPES[path.extname(resolved)] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(data);
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`http://${HOST}:${PORT}/`);
    console.log(`http://${HOST}:${PORT}/faucet.html`);
    console.log(`http://${HOST}:${PORT}/till.html`);
    console.log(`http://${HOST}:${PORT}/x402.html`);
    console.log(`http://${HOST}:${PORT}/grok.html`);
  });
