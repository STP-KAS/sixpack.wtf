#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMockDirectModeEnvironment } from "../src/kaspa-x402/examples/lib/mock-direct-mode.mjs";

const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";
const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4020);
const HOST = process.env.HOST ?? "127.0.0.1";
const { server: x402 } = createMockDirectModeEnvironment();
const blankPage = fs.readFileSync(path.join(root, "index.html"));

const ROUTES = {
  "/download": {
    scheme: "exact",
    amount: "100000",
    description: "Fixed-price native KAS file",
    mimeType: "application/octet-stream",
    body: { ok: true, route: "download" },
  },
  "/metered": {
    scheme: "batch-settlement",
    amount: "50000",
    description: "Repeated metered call",
    mimeType: "application/json",
    body: { ok: true, route: "metered" },
  },
};

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    applyCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(blankPage);
      return;
    }
    if (req.method === "GET" && url.pathname === "/convo") {
      const convoFile = path.join(root, "convo.html");
      if (!fs.existsSync(convoFile)) {
        json(res, 404, { error: "not_found" });
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(convoFile));
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, {
        ok: true,
        host: `${HOST}:${PORT}`,
        network: "kaspa:testnet-10",
        x402Version: 2,
        asset: "KAS",
        mode: "mock-direct",
        release: "local-blank",
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/supported") {
      json(res, 200, {
        ok: true,
        enabled: true,
        kinds: [
          {
            x402Version: 2,
            scheme: "exact",
            network: "kaspa:testnet-10",
            extra: {
              asset: "KAS",
              binding: "kaspa-exact-v2",
              profile: "standard-native",
              modes: ["verify", "settle"],
            },
          },
          {
            x402Version: 2,
            scheme: "batch-settlement",
            network: "kaspa:testnet-10",
            extra: {
              asset: "KAS",
              binding: "kaspa-escrow-v3",
              templateId: "kaspa-x402-escrow-v4",
              modes: ["verify", "settle"],
            },
          },
        ],
      });
      return;
    }
    const route = ROUTES[url.pathname];
    if (route && (req.method === "GET" || req.method === "POST")) {
      const resourceUrl = `${url.origin}${url.pathname}`;
      const paid = await x402.handlePaidRequest(
        {
          method: req.method,
          url: resourceUrl,
          headers: req.headers,
          resource: {
            url: resourceUrl,
            description: route.description,
            mimeType: route.mimeType,
          },
          paymentAmount: route.amount,
          paymentScheme: route.scheme,
        },
        async () => ({
          status: 200,
          body: route.body,
          chargedAmount: route.amount,
        }),
      );
      writePaid(res, paid);
      return;
    }
    json(res, 404, { error: "not_found" });
  } catch (error) {
    json(res, 500, {
      error: "server_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

httpServer.listen(PORT, HOST, () => {
  const origin = `http://${HOST}:${PORT}`;
  console.log(
    JSON.stringify(
      {
        ok: true,
        origin,
        blank: `${origin}/`,
        health: `${origin}/health`,
        supported: `${origin}/supported`,
        exact: `${origin}/download`,
        batch: `${origin}/metered`,
        note: "GET /download without PAYMENT-SIGNATURE returns HTTP 402",
      },
      null,
      2,
    ),
  );
});

function applyCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    `${PAYMENT_REQUIRED_HEADER}, ${PAYMENT_SIGNATURE_HEADER}, ${PAYMENT_RESPONSE_HEADER}, content-type`,
  );
  res.setHeader(
    "access-control-expose-headers",
    `${PAYMENT_REQUIRED_HEADER}, ${PAYMENT_SIGNATURE_HEADER}, ${PAYMENT_RESPONSE_HEADER}`,
  );
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function writePaid(res, paid) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  for (const [key, value] of Object.entries(paid.headers ?? {})) {
    if (value != null) headers[key] = String(value);
  }
  res.writeHead(paid.status, headers);
  const body = paid.body;
  res.end(
    typeof body === "string" ? body : `${JSON.stringify(body ?? {}, null, 2)}\n`,
  );
}
