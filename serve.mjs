#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
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
    console.log(`http://${HOST}:${PORT}/till.html`);
    console.log(`http://${HOST}:${PORT}/x402.html`);
  });
