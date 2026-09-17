#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planClaim, sompiToTkas, FROM } from "./faucet/policy.mjs";
import { listClaims, recordClaim } from "./faucet/ledger.mjs";
import { payTn10 } from "./faucet/pay.mjs";

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
    (typeof origin === "string" && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin))
      ? origin
      : "";
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (allow) {
    headers["access-control-allow-origin"] = allow;
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
    headers.vary = "Origin";
  }
  const data = JSON.stringify(body);
  res.writeHead(status, headers);
  res.end(data);
}

function clientIp(req) {
  const x = req.headers["x-forwarded-for"];
  if (typeof x === "string" && x.trim()) return x.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

let faucetLock = Promise.resolve();

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    if (url.pathname === "/api/faucet" && req.method === "GET") {
      try {
        const address = url.searchParams.get("address") || "";
        const claims = listClaims();
        const ip = clientIp(req);
        if (!address) {
          sendJson(res, 200, {
            network: "testnet-10",
            from: FROM,
            capTkas: "30000",
            dripTkas: "10000",
            windowHours: 48,
          }, req);
          return;
        }
        const plan = planClaim({ address, ip, claims });
        sendJson(res, 200, {
          address: plan.address,
          nextTkas: plan.tkas,
          remainingTkas: sompiToTkas(plan.sompi + plan.remainingAfter),
        }, req);
      } catch (err) {
        sendJson(res, err.code === "RATE" ? 429 : 400, { error: err.message || String(err) }, req);
      }
      return;
    }
    if (url.pathname === "/api/faucet" && req.method === "OPTIONS") {
      sendJson(res, 204, {}, req);
      return;
    }
    if (url.pathname === "/api/faucet" && req.method === "POST") {
      faucetLock = faucetLock.then(async () => {
        try {
          const body = JSON.parse((await readBody(req)) || "{}");
          const plan = planClaim({ address: body.address, ip: clientIp(req), claims: listClaims() });
          const paid = await payTn10(plan.address, plan.sompi);
          const at = Date.now();
          recordClaim({ key: plan.addrKey, address: plan.address, sompi: paid.sompi, txids: paid.txids, at, ip: clientIp(req) });
          recordClaim({ key: plan.ipKey, address: plan.address, sompi: paid.sompi, txids: paid.txids, at, ip: clientIp(req) });
          sendJson(res, 200, {
            ok: true,
            tkas: sompiToTkas(paid.sompi),
            remainingTkas: sompiToTkas(plan.remainingAfter),
            txids: paid.txids,
            explorer: paid.txids.map((id) => "https://tn10.kaspa.stream/txs/" + id),
          }, req);
        } catch (err) {
          const status = err.code === "RATE" ? 429 : /synced|UTXO|secret|node/i.test(err.message || "") ? 503 : 400;
          sendJson(res, status, { error: err.message || String(err) }, req);
        }
      });
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
  });
