> **Experimental only. Not a product.**
>
> Do not use wallet integrations on this GitHub. STP remains a clown. [DISCLAIMER.md](DISCLAIMER.md)

# sixpack.wtf

Public: **https://sixpack.wtf**

Landing video popup on every tab. Tabs: **Home · Rails · Farce · Eulogy · Random · Faucet · SI helpdesk · Help**. Kaspa Explained is the high-value source ([parker2017code/kaspa-explained](https://github.com/parker2017code/kaspa-explained)). Same interesting-links list on every tab except the chat desk. No wallet login.

Not Kaspa core. Not a wallet. Never a seed.

```
node serve.mjs
```

http://127.0.0.1:4020/

| Path | What |
| --- | --- |
| `/` | Home. Popup. Pointer to rails. Shared links. |
| `/rails.html` | 1984 raw idea. The platform, the shelf, and the four payments. The bill is a car, an SI service, a game purchase, or a rented service. |
| `/rails-why.html` | Rails. What tKAS, POCencept, KUSDT, and OLAF each are, and why they stay apart. |
| `/farce.html` | Yonatan’s Binance letter. This desk agrees. |
| `/eulogy.html` | Proof of work, a eulogy. 15s satire + still. |
| `/random.html` | Pile of clips. Shuffle / prev / next. |
| `/faucet.html` | Grok bot faucet. Closed. Mine your own tKAS. |
| `/grok.html` | SI helpdesk — feed-trained Kaspa help desk. Not grok.com. Project: [STP-KAS/Grok.SPCXAI.KAS](https://github.com/STP-KAS/Grok.SPCXAI.KAS). |
| `/help.html` | Discord rooms. How to ask. Same links. |

## KCC-20 Final, 21 Oct 2026

The checker in `1984/kcc20.mjs` follows kaspanet/kccs main `1ed87aef` (KCC-1 Final). KCC-20 Final is the parent `9dec4a04`. From Last Call `3fbec524` to that Final commit, `kcc-0020.md`, `kcc-0001.md`, and `kcc-0002.md` change only the Status line. KCC-23 on that same main is still Draft (`kcc-0023.md`). The master-file snapshot `67ef3c8` (16:10 CEST) was written before those 16:50 CEST merges and still says Last Call. This repo does not edit the master file.

Prompt adaptations:

- The pin is main `1ed87aef`, which contains KCC-20 Final `9dec4a04`. The prompt's "or main tip" is that commit.
- `blake3Hex` already hashes one chunk up to 1024 bytes. The copied conformance file's hash-chain values match it, including the 64-byte links.
- Placeholder signatures are not checked here. `signatureVerified` is an explicit input. A covenant verifies the signature. The vectors say no vector asserts a signature.
- `borrowedReceive` checks one borrowed state, which is what `kcc-0020/vectors/conformance.json` lists. The funding inputs are not in those cases. `familyTotal` is the rule that the family's amount stays the same. A borrowed receive cannot mint.
- `holderMint` and `requireIncrease` are square rules. They are not borrowed receives. KCC-20 does not define them. Section 4 allows a covenant-specific entrypoint.
- A square ledger row that omits `ownerScheme` is not a full KCC20State. The owner-scheme check runs when the field is present, so the live SquarePeg ledger keeps working.
- This checker enforces the section 2 MAY cap of `2^63 - 1`.
- Mint authority is covenant-specific. The reference `PublicMint` stays permissionless. `1984/covenant/authority_mint.ag` requires a Schnorr signature, and it can rotate or renounce. The supply cap is the minter's `remaining` at genesis.
- POCencept cap, chosen here: 100000000 base units, 2 decimals, displayed 1000000.00. That is the cent scale the square already uses for a price. It is not the off-chain ledger and not a dollar. Genesis holds the minter and the seed only. Every balance starts at 0.
- Recipients on this rail start with borrow scheme disabled. Amount-threshold 0 lets any party change the outpoint (`kcc-0020.md` Security Considerations). A wallet that needs a stable outpoint should stay disabled, or use hash-chain when it is ready to release one link.
- OLAF is not minted by this desk. tKAS is the native coin, not a token. The name LUMBRIDGE stays.
- The published extension constants are used as opaque 32-byte values. The prompt asked for BLAKE3 of the tick. Those constants are not that hash for the names that were tried, and the preimage was not recovered. `1984/covenant/poc/kcc20.json` and `1984/covenant/kusdt/kcc20.json` say so. This repo does not document a false preimage.
- Borrowed-receive schemes 0x01, 0x02, and two successive 0x03 links were not broadcast. `rotate` and `renounce` were not broadcast. The KCC-23 Rust verifier was not run. Node acceptance plus the payload shape is the metadata evidence.
- The pages name the two covenant ids. The shop, the bank, and an open-name mint stay on the square ledger and on SquarePeg locks. The static site does not read the private node. A browser read of covenant state would need a public RPC, and moving the shop onto these covenants would strand locks that already exist.

## Testnet-10 rails, 21 Oct 2026

Network testnet-10. Transaction version 1. Fee rate 100 sompi per gram, the node’s ordinary bucket. Each genesis starts at zero token balances. The cap is 100000000 base units, 2 decimals, displayed 1000000.00. The per-mint limit equals the cap, so a later mint of the whole cap fails on the remaining supply. Two mints of 1 left 99999998. The rejected mint asked for 100000001.

POCencept. Launch path `launch::pocencept-1984`. Covenant `7b52b945abaa17bc6b5cb12f2860e471726f01cb30354fd2d14ac89a608c6b7d`. Extension `3e42b04d79af7dad33a257e74b37cc6e51f8164660c60028dba71f781ac41745`.

| Step | Transaction | Fee (sompi) | Storage mass | Result |
| --- | --- | --- | --- | --- |
| KCC-23 prep | `2d3a085c5d27b5799849ae3bafe893ffeba2aebc0bd4b579d892b15f6fe2d84e` | 2000000 | 1666 | accepted |
| Genesis | `37069251116fd98ccc4412fea8d212e32be4542aac1c1c64391cc844749afc49` | 8088500 | 80885 | accepted |
| Mint 1 | `039623100ac19113028d748ebe012889864779ce00c43a7833fe83bb286c6baf` | 6520900 | 65209 | accepted |
| Mint 2 | `2bc6c69ae081b92c5c0b2bf5176ee46900c7f2955592d6b4da6a63c81e37e7cc` | 6222900 | 62229 | accepted |
| Transfer | `0ae58aad42aa4a3d3ea30ca3f61504bda1f29ac62772b1e572a7b4a8a54f6ecc` | 2000000 | 19714 | accepted |
| Mint above the cap | `19b2c31a07b2d4a7700534785567f1d5425dfebb407d044cfad8530f7dce4e71` | 6161400 | 61614 | rejected |

KUSDT. Launch path `launch::kusdt-1984`. Covenant `4d916665551d11c90765831c6afefb047c6c473a9cbe3e20cf262f9ed3a425d6`. Liquid extension `70ebf3f244d85e42bab5375e47d5be22038d1281c47f8b137aa36b5c9b9bb63e`. Frozen extension `9570434600bd7f269e2f58087be669f3c34679bacdceee2f7fe551f24101de96`, a second authority output in the same genesis, live 0, remaining 0, not minted. `kcc-0020.md` §2 keeps the extension on a standard transfer. §4 is what allows that second authority. The KCC20 actor was not edited.

| Step | Transaction | Fee (sompi) | Storage mass | Result |
| --- | --- | --- | --- | --- |
| KCC-23 prep | `c67638e9cac36a7b30cf7658efc35902ea095674742ee15d106006afd24b16c0` | 2000000 | 1250 | accepted |
| Genesis | `00da1d330d09b87d7b97b7678023e0c09c8dae07780649aaba58352c6353b946` | 12079900 | 120799 | accepted |
| Mint 1 | `492d11ca437addb638e999b04e453ad0359015269c45af427dc3377efcb0611e` | 6731700 | 67317 | accepted |
| Mint 2 | `4e782ebab7d6888e704ca024008da5769419108d653ea297ba2ac97e0bc01832` | 6493800 | 64938 | accepted |
| Transfer | `7717f5662d74004df803b4aa4aa77cf335f0ff3357184af1d2832f824ab17adf` | 3101600 | 31016 | accepted |
| Mint above the cap | `1ebda187138fd22a02129382649b4c8abc4f83a68ef103006df82c79ecb22e53` | 6182600 | 61826 | rejected |

Both rejections say the script ran and verification failed. The node text does not name the cap check. The local builder refused the same mint before those bytes were submitted. OLAF has no genesis. tKAS is the native coin. The tick 1984 was not issued. LUMBRIDGE stays. The longer note is [REPORT-1984-kcc20-2026-10-21.md](REPORT-1984-kcc20-2026-10-21.md).

stp is a professional clown · [x.com/StppStp](https://x.com/StppStp) · [github.com/STP-KAS](https://github.com/STP-KAS)

---

> **Standard disclaimer.** This GitHub, not the topic above.
>
> Intentions are good; thought process is questionable. STP remains delusional. Si vis pacem, para bellum.
>
> Intern at https://sixpack.wtf/  
> X: https://x.com/StppStp · GitHub: https://github.com/STP-KAS
