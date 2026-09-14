# sixpack.wtf

Blank page. Public: **https://sixpack.wtf**

Local kaspa-x402 mock (Node):

```
node serve.mjs
```

Then open http://127.0.0.1:4020/

GitHub Pages serves the blank HTML only. `/download` and `/metered` 402 need the local Node host.

| URL | What |
| --- | --- |
| `/` | blank HTML |
| `/health` | JSON |
| `/supported` | x402 v2 kinds, `kaspa:testnet-10`, asset `KAS` |
| `/download` | exact. Unpaid → **402** + `PAYMENT-REQUIRED`. Paid → **200** + `PAYMENT-RESPONSE` |
| `/metered` | batch-settlement. Same headers. |

Mock direct mode. No TN10 wallet. No broadcast.
