import { grokHealth, handleGrokChat, handleGrokError, recordGrokFeedback } from "./chat.mjs";
import { normalizeIp } from "./policy.mjs";

export function grokCors(req) {
  const origin = req.headers.origin;
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
    "cache-control": "no-store",
  };
  if (allow) {
    headers["access-control-allow-origin"] = allow;
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type, bypass-tunnel-reminder";
    headers.vary = "Origin";
  }
  return headers;
}

export async function handleGrokRequest(req, res, url, { readBody, clientIp }) {
  const headers = grokCors(req);
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }
  if (url.pathname === "/api/grok" && req.method === "GET") {
    const body = JSON.stringify(grokHealth());
    res.writeHead(200, { ...headers, "content-type": "application/json; charset=utf-8" });
    res.end(body);
    return;
  }
  if (url.pathname === "/api/grok/feedback" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const out = recordGrokFeedback(body);
      const data = JSON.stringify(out);
      res.writeHead(200, { ...headers, "content-type": "application/json; charset=utf-8" });
      res.end(data);
    } catch (err) {
      handleGrokError(res, err, headers);
    }
    return;
  }
  if (url.pathname === "/api/grok" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const ip = clientIp(req) || normalizeIp(req.socket?.remoteAddress);
      await handleGrokChat(req, res, body, ip, headers);
    } catch (err) {
      if (!res.headersSent) handleGrokError(res, err, headers);
    }
    return;
  }
  res.writeHead(404, { ...headers, "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "not found" }));
}
