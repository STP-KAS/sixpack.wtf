# sixpack.wtf

Live: **https://sixpack.wtf** (GitHub Pages)

One picture. GitHub and X at the bottom.

- GitHub: https://github.com/STP-KAS
- X: https://x.com/StppStp

## DNS (Namecheap BasicDNS)

Nameservers are already authoritative:

- `dns1.registrar-servers.com`
- `dns2.registrar-servers.com`

Open **Advanced DNS**:
https://ap.www.namecheap.com/domains/domaincontrolpanel/sixpack.wtf/advancedns

Delete the parking records (`192.64.119.35` and `parkingpage.namecheap.com`). Then add:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `stp-kas.github.io.` |

TTL: Automatic. Turn off URL redirect / parking on the Domain tab. Save. GitHub then issues HTTPS for `sixpack.wtf` and `www.sixpack.wtf`.
