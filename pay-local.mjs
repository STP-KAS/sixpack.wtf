import { encodePaymentSignatureHeader } from "../src/kaspa-x402/packages/core/dist/index.js";
import { createMockDirectModeEnvironment } from "../src/kaspa-x402/examples/lib/mock-direct-mode.mjs";

const origin = process.env.ORIGIN ?? "http://127.0.0.1:4020";
const url = `${origin}/download`;
const { client } = createMockDirectModeEnvironment();

const unpaid = await fetch(url);
const required = unpaid.headers.get("payment-required");
if (unpaid.status !== 402 || !required) {
  throw new Error(`expected 402 + PAYMENT-REQUIRED, got ${unpaid.status}`);
}

const payment = await client.createPayment(required, {
  url,
  paymentIdentifier: "http_exact_download_1",
});
const paid = await fetch(url, {
  headers: {
    "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payment.paymentPayload),
  },
});
const responseHeader = paid.headers.get("payment-response");
const body = await paid.text();

console.log(
  JSON.stringify(
    {
      unpaid: unpaid.status,
      paid: paid.status,
      scheme: payment.scheme,
      hasPaymentResponse: Boolean(responseHeader),
      body,
    },
    null,
    2,
  ),
);

if (paid.status !== 200 || !responseHeader) {
  process.exitCode = 1;
}
