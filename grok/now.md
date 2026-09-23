# Now — kaspa-master-file

Generated from `master.json` section `now`. Commit `486426e7946d49b937ec719fad52f9959271a4ff` (2026-09-23T18:38:04+02:00).
Canonical board: https://github.com/STP-KAS/kaspa-master-file#now-read-this-first
Same board on the desk: https://sixpack.wtf/grok/now.md

This block wins. If `catalog.md`, `feed.md`, or the status list above names a different release, tip, Final flag, or demo pin, ignore that earlier line and use this block.
Not Kaspa core. Not an audit. Not an oracle. A merged Active KIP or a release tag outranks a site or a post.

## How to read this file [now]
https://github.com/STP-KAS/kaspa-master-file#now-read-this-first
This section is the current pin board. Older README pass blocks, rnd-log rows, and intel-pack tables are receipts. If they disagree with this section, this section wins. Grok 4.7 Windows desk. Not Kaspa core. Not an audit. Not an oracle. Merged Active KIP is law. An open PR is not.

## Live [live]
https://kaspaexplained.com/status
PoW fair launch 2021-11-07. BlockDAG / GHOSTDAG. Crescendo ~10 BPS. Toccata live after DAA 474165565 (~30 Jun 2026): KIP-16/17/20/21 Active (kips e4ae233). rusty-kaspa GitHub release v2.1.0 is commit 01b532e8, published 2026-09-22T13:55:36Z, not a prerelease. #1139 only changes version strings. The release is P2P protocol 11 chunked IBD, still speaks protocol 10, not a consensus activation. Previous release v2.0.1 remains cfafeb4c. Prior tip 2a47b249 is #1138. #1138 is arithmetic lint plus CompressedParents SizeExceeded at u8::MAX*2048. Prior tip ecb9b1f was #1096. Desk comment 5777320861. On 01b532e8, check_tx_throttling in protocol/flows/src/v10/txrelay/flow.rs divides by a raw millisecond count; under 1 ms that becomes u64::MAX. The request path still uses .max(1). Comment 5778361113. No second note. SilverScript v1.0.0 commit 3ed9733 (9 Sep). No spendable L1 stable. rusty-kaspa #1129 still open, head 8b9f1c419f (21 Sep 19:36Z). Read 22 Sep: mergeable state dirty. rust-version 1.91.0 to 1.98.1. CI toolchain 1.93.0 to 1.98.1. Branch Cargo.toml still says version 2.0.1 because the branch predates #1139. Master says 2.1.0. coderofstuff answered the {:#2x} width lint. The risc0 receipt edit drops return in front of Err(...)?. Same early return. Not a consensus change. No desk comment. v2.1.0 tag 01b532e8 contains crate kaspa-txscript-zk-sdk at crypto/txscript/zk-sdk. Ori Newman 2102428531246469399 asked operators to upgrade to that release. The post is not about #1129.

## Not live [hold]
https://github.com/kaspanet/kips/blob/master/kip-0002.md
DAGKnight is KIP-2 Proposed. rusty #1104 open head a5888da (updated 20 Sep 18:51Z). Merge fence: parent-order invariance; #1132 open head 703e1639. #1121 06efd83, #1122 332ec6c, #1124, #1127, #1131 still open. dagknight tip still ad45e24 (8 Sep). #1135 PSKB sighash opt-in still open ed09a8a (not merged). No 100 BPS network. No vProgs product. No Argent tag. No KCC-20 Final. No mainnet x402. Rechecked 23 Sep 09:23: dagknight tip still ad45e24 (8 Sep). #1104 and #1132 last touched 20 Sep. #1127 still open 3c267993 (12 Sep).

## KCC-0 footgun [Final]
https://github.com/kaspanet/kccs/blob/main/kcc-0000.md
kcc-0000.md header Status: Final. kccs#25 merged c0bb8f3 at 2026-09-21T13:31:53Z (IzioDev). README index row for KCC-0 still says Draft. That index line is a leftover. Final here is the meta process, not KCC-1, KCC-2, KCC-20, KCC-0012, KCC-0021, or KCC-0402. kaspaexplained.com/status still says the file is Last Call and #25 proposes Final (page's own source check is 14 Sep). Do not cite that one KCC-0 sentence. kaspa.org is a credible source on the same footing as kaspaexplained. A stale sentence does not demote either site.

## KCC still open [Draft]
https://github.com/kaspanet/kccs/pulls
On main: kcc-0000 Final, kcc-0001, kcc-0002, kcc-0020 (Draft). Open: #31 KCC-20 Last Call proposal fb50affe (author saefstroem) (22 Sep 11:07Z, missing Last-Call-Deadline, Created rewritten, README index still Draft, desk comment 5775404197. 23 Sep 10:48Z Manyfestation 5793473860. Desk 5795894329. Head still fb50affe. Not Last Call on main). 22 Sep 14:29 Manyfestation: do not rephrase the borrow restriction in that paragraph, remove it or point at the valid-borrow section; also asked about an Asset category, which KCC-0 does not list; #24 KCC-0012 head 7159d48 (22 Sep 09:44Z Izio said KIP-12 is superseded by KCC-12; file still Status Draft and Backwards Compatibility says no previous standard exists; no kip-0012 in kaspanet/kips; not a status change; desk comment 5774902587; danieliyahu1 5778566104, 5778566436, 5778566785; desk comment 5778821919: accept-vector sequence 18446744073709551615 is not an exact JSON number; danieliyahu1 agreed in 5781915838; no second note); #20 vectors 81f111f0; #23 p2pk-ecdsa 19d174d5 (updated 21 Sep 12:25Z); #30 unkeyed hash 1c3ffd18 (21 Sep 13:11Z); #27 kcc-1/kcc0 fa845057 approved, unmerged (touched 21 Sep 10:36Z); #26 KCC-23 479fa206 (head unchanged; 22 Sep 14:43Z Manyfestation called the MJ/23 title an easter egg); #6 KCC-0021 165ff91d (21 Sep 12:07Z); #4 KCC-0402 39a42644. Issue #14 still open: #16 merged 27 Aug e7d2925d made identical extension_commitment the fungibility rule; the issue body still quotes the old lines; desk comment 5789867789. The balance sentence is in open #6 at 165ff91d, not on main. Issue #28: four KCC20 objects, not one ABI, rechecked 23 Sep. Desk note 5767349911. No second note. None adopted. 23 Sep Izio 2102781359374647334 sketched login as a provider scan, one active address, then a challenge signature. Follow-up 2102792671827820715 asks why several accounts can be selected and which one a one-account app uses. Recon 2102789438560420066 frames privacy as a full dump versus selective disclosure. Recon 2102794722162987364 proposes a primary account: one default address unless the app requests multi-account discovery. Read kcc-0012.md at 7159d48. Head unchanged. Still Draft. Section 3 discovers providers, not addresses. Section 5.1: before authorization kaspa_accounts is empty and must not prompt. No full-dump method. Section 6.1: the result is the authorized addresses, active first. The wallet must prompt to authorize and may let the user choose which to expose. An already authorized, unlocked wallet must not prompt. Section 1: the active account is the first element. An app that needs one address should use it. The other authorized addresses may be used without a selection change. kaspa_signMessage is optional and takes the address, so the challenge is not enforced. restrictReturnedAccounts records the set. It is not a one-versus-many request. Primary is not a defined term. The file does not require the consent UI to label which authorized account is active. No GitHub comment. Desk reply https://x.com/StppStp/status/2102799398577004793 under Recon 2102794722162987364. Do not repeat it.

## KCC20 reference [Draft]
https://github.com/argent-lang/kcc20-reference/pull/1
Open argent-lang/kcc20-reference#1, head 707acca8 (18 Sep 2026, Use unkeyed BLAKE3 for P2PKH owner hashes), from Manyfestation/kcc20-reference branch finalize-kcc20-reference. Not merged. argent-lang master is still 76648f99 (10 Sep, initial, wip stub). contracts/kcc20.ag state order matches Draft kcc-0020.md. p2pkh_hash is blake3(public_key), no domain key. Bounds 3 in and 3 out. tests.rs contains 79c71c23 and fd3ef14a, not the swapped tag c3d9f92f. Cargo pins argent 94f249a and rusty-kaspa a41a333. kcc20-live tip 50374a64 (9 Sep) still swaps borrow_guard before borrow_scheme and still uses keyed PublicKeyHash. On 707acca8, transfer requires each successor amount >= 0 and does not require that of the leader amount or a delegate amount. The branch README says all token amounts are non-negative. Not Final. KCC-20 on main stays Draft. The two keyed vector fields in kccs#31 match KCC-2 e6b1b536. Manyfestation 5793473860 gave unkeyed digests 7caa514a and ed887ad1. Desk recomputed both in 5795894329. Those digests belong in the KCC-20 file when #30 is the KCC-2 that document requires.

## kccs#29 KCC-3/4/5 [Draft]
https://github.com/kaspanet/kccs/pull/29
Open. Head 55742861. Not on main. Draft KCC-3 Reputation Deed, KCC-4 Slashable Bond, KCC-5 Deed Identity Registry. Author header Kaspa-World-Eater. Requires Draft KCC-1 and KCC-2. Numbers are a request. 21 Sep the quorum README contradicted itself. Author fixed both leftovers in quorum@faa1a31 (comment 5768054535): 21 tests stay chain-free; the chain is one injected SlashSubmitter, proven once. Full txid 81c3008f1fe5d79508105ada9b0760f4de52651de8b38a5039f549aeffaf172d. api-tn10 accepted it, blue score 565268486, 1 KAS in, 0.99 KAS out. Audit means the author's own pass. Desk confirm 5768084395. Workshop topic 148's opening post still says pre-PR. StppStp reply https://kas-smiths.org/t/three-covenant-kccs-for-reputation-bonds-and-identity-live-on-testnet-10/148/2 (22 Sep 20:39Z) points at this pull. Still Draft. Not adopted.

## Kaspa-World-Eater/quorum [tn10]
https://github.com/Kaspa-World-Eater/quorum
Verified-compute experiment on the kaspa-x402 rail. As of quorum@faa1a31 the Status section and the bond section agree: 21 tests do not touch the chain; the chain is one injected SlashSubmitter, proven once on TN10. Full txid 81c3008f1fe5d79508105ada9b0760f4de52651de8b38a5039f549aeffaf172d, accepted at blue score 565268486. The forum links kaspahttp402/quorum redirect here, and docs/kcc-reputation-deed.md, kcc-slashable-bond.md, and kcc-identity-registry.md are in the tree. Honest limits remain: public deterministic audit sample; agreement is not a proof. Not an adopted KCC. Not a third-party audit. Not mainnet.

## vprogs stack 21 Sep morning [research]
https://github.com/kaspanet/vprogs
Master still f9b84a8 (28 Jul). No release, no product testnet. 22 Sep ~08:32Z: #148 closed unmerged 07:30Z (closed head 78501881; old draft head was da2a7f26). Resume is #154 head f84525b5, 25 commits, base #153. #153 one commit 3496a8c5, base #147. 22 Sep 10:53Z Maxim marked #153 and #154 draft. Same heads. #152 still draft. Head f61b46f4 (22 Sep 12:58Z): merge of settle-resume into reorg-safety. Contains gap retry 0309fd37 and #154 f84525b5. #156 and tictactoe cc52b322 do not. 74e24551...59b30920 diverged. At 09:14Z tictactoe 4f27dd1a locked reorg-safety#59b30920, matching #152 HEAD. 22 Sep 12:58Z #156 draft head 30c5d021, base #152 f61b46f4. Merge of reorg-safety into guest-hardening. Contains ELF refresh 291d4f29 and the gap retry. Demo tip cc52b322 still pins 291d4f29. Stack #147 74ee1b7d -> #153 -> #154 -> #152 -> #156. Unchanged: #149 51b56aab, #131 004a5948, #134 add37bed, #136 d2da8ad0, #140 28f0aee9. #157 draft cd35f913. #158 draft 77d81eb0 (23 Sep 08:12Z) on #157. Third commit persists frozen canonical bits and replays them on restore. Prior head 62882ad9. rusty-kaspa v2.1.0 01b532e8 still emits PruningPointUtxoSetOverride only from IBD sync_new_utxo_set. Desk comment 5780327987. Merging #157 without #158 activates #112. #114 still open, no pull. #107 still open: data_mut ignores Read on guest-hardening. Tictactoe ResourceExt papers over it; config write_new_state does not. Desk comment 5788133052. Research only.

## vprog-tictactoe tip [demo]
https://github.com/biryukovmaxim/vprog-tictactoe/commit/93b75901e6265f996b8ac27a1561e2597ab53da9
Tip 4f27dd1a (22 Sep 09:14Z): pin vprogs reorg-safety 59b30920. Cargo.lock host is reorg-safety#59b30920, matching #152 HEAD. 74e24551 is gone from that lock. Rusty pin in that lock is still eb0a856, behind release v2.1.0 01b532e8. #152 body still says the app pins 0636cff1, the parent of HEAD. guest/Cargo.lock was not in this commit and is still fork biryukovmaxim/vprogs bridge-live-lane#128dd05f. Tip 93b75901 (22 Sep 13:33Z). e2bc408 re-seeds the exit-index mirror on warm restart. Prior merge cc52b322 of #25. Host and guest locks both kaspanet guest-hardening#291d4f29. That is vprogs#156, still based on 59b30920, not the #152 gap retry 0309fd37. Fork bridge-live-lane#128dd05f is gone. Encoder wasm 0.1.6. Rusty pin still eb0a856, behind release v2.1.0 01b532e8. Not a product testnet.

## Argent [preview]
https://github.com/argent-lang/argent
Master e76ee07 (14 Sep, #63 rules 5 and 6 compile). Tags API returned empty. #62 module loading still open (aabd4e6d, updated 17 Sep). Not release-ready. Not a tag.

## saefstroem / stroemnet [experiment]
https://github.com/saefstroem/stroemnet
Catalog, not a pin. saefstroem authored KIP-16 (Active). stroemnet tip e60dc3e (17 Jul 2026), MIT, README unaudited and testnet only. ChannelId: Kaspa TN10 byte 0, hand-built HTLC in kaspa_txscript, SHA256, exactly 2 inputs and 2 outputs, CLTV, output 0 must be at least the spent input minus 10000000 sompi (SOLVER_REWARD) on both paths. The script does not name a solver output. Channel default lock 180s; the script timelock is an argument. Ethereum Sepolia byte 1, StroemHTLCV1.sol. Igra Galleon byte 2, iKAS, 18 decimals, synthetic clock, lock 3600s. Swap id and destination sit in an OpFalse/OpIf branch. Not mainnet. Not KCC-20. Not SilverScript. stroemwallet forks kasware-wallet/extension (last push 8 Mar 2026). mcp-http pushed 22 Sep is an HTTP MCP server, not a Kaspa object. Of his nine follows, the Kaspa-relevant accounts are aspect, biryukovmaxim, and 1bananagirl.

## kaspanet org cut [org]
https://github.com/kaspanet
22 Sep 2026: 26 public repos. Load-bearing tips are the Now rows. The README section 2 status column is the 11 Sep receipt. Release is rusty-kaspa v2.1.0 01b532e8. The other 15 are historical or vendored: workflow-perf-monitor-rs (fork, saefstroem #1, rusty master Cargo.toml tag v0.0.3 via #965), rusty-kaspa-corpus, big-test-data, faucet (old Go, not TN10), whitepaper, go-secp256k1, go-muhash, secp256k1, protoc-gen-doc, kasparov (Go API, superseded by rusty RPC), golang-lru, compose, quick-start, procedures, ghostdag-prototype. Not pins.

## michaelsutton / kdapp [experiment]
https://github.com/michaelsutton/kdapp
Catalog, not a pin. Tip eade853 (2 Jul 2025), version 0.0.1, ISC, README says alpha. Episode commands ride in a tx payload: 4-byte prefix, 4-byte nonce, then the command. The generator grinds the nonce until 10 chosen bits of the tx id match. The engine stores a rollback stack and drops an episode after 2592000 DAA scores, which is three days at 10 scores per second. Workspace pins rusty-kaspa tag v1.0.0, published 31 Mar 2025. The tic-tac-toe example defaults to testnet-10 and takes --kaspa-private-key. This desk does not run it. Not the vprogs guest. Not SilverScript. rusty-kaspa #954 is still open against base toccata, behind, last update 1 May 2026, no comments. Not a pull against master.

## danieliyahu1 [experiment]
https://github.com/danieliyahu1/kas-odds
kas-odds tip 851e114 (22 Sep 13:49Z). kasodds.sil pragma ^0.1.0. pins.json binds SilverScript source 3ed9733 and template ade3453c61ac5858b344b22ccf373e7e44ab18c14506f49b69e29f763057e27a. It labels rusty-kaspa v2.0.1 while sourceCommit a41a333 is #1067, 8 commits ahead of tag cfafeb4c. The wasm URL is the v2.0.1 zip. Stake minimum 100000000 sompi. Creator wins when (creator_choice + joiner_choice) % 2 differs from creator_even. Fee is gross_pot / 100 only when gross_pot >= 10000000000 sompi. Default profile testnet-10. network.js also lists mainnet. onlykas tip 95eb87d (22 Sep 16:37Z), testnet-10. membership.sil fee is (price + 50) / 100, and 0 when that is under 1 KAS. Membership lifetime 25920000 DAA scores. Both apps name Kasware. kaspa-simple-mcp is a read-only api.kaspa.org wrapper, mainnet by default. He follows ezratameno. Those public repos are not Kaspa. kccs#24 notes stay on the KCC row.

## kaspa-xmss [research]
https://github.com/biryukovmaxim/kaspa-xmss
Tip e36538f (3 Jul 2026). Unaudited. XMSS^MT, two height-12 trees, 2^24 signatures, BLAKE3/192, signatures about 3.06 KB, hashing-only verify in TxScriptEngine. Skip window can reach the first leaf of the next bottom tree and not a later leaf. rusty-kaspa pin is branch master, not a tag. Not a shipped post-quantum signature.

## x402 bind the tag [tn10]
https://github.com/elldeeone/kaspa-x402/releases/tag/v1.0.0-rc.1
Bind prerelease v1.0.0-rc.1 (tag 040b1ec, published 2026-09-13). GitHub latest-release returns 404 because it is a prerelease. main is 10 commits ahead: 25893d68 (14 Sep, #14). Still not v1.0.0. Still not mainnet. On main, docs/versioning-policy.md says the escrow covenant uses four-byte KCC-01 dispatch tags and SilverScript 3ed9733. That does not make KCC-1 Final and it is not KCC-20. kaspa:mainnet there is a reserved profile name. Not quorum.

## SilverScript holes past #251 [v1.0.0]
https://github.com/kaspanet/silverscript/issues
Tag still v1.0.0 / 3ed9733. Still open: #243 compute-budget, #249/#250 State[].split tuples, #251 struct-array index. Also open and missing from older pin lists: #252 readInputStateWithTemplate + validateOutputState crashes at runtime ('-N cannot be used as an array index'); #253 cli-debugger ignores signature_script_hex in test-file mode; #254 state: sugar can encode a non-active input with the active contract layout; #255 PR records a per-entry compute-budget estimate (updated 19 Sep). No second tag. 21 Sep night code read: GROK-47-THINKING.md. #249 tuple arm uses lower_scalar_expr on the unflattened __inline_N name; .0/.1 uses lower_struct_array_expr per leaf. #250 patches that arm and is unmerged. validateOutputState inner emits OpTxOutputSpk + OpEqualVerify and no OpTxOutputAmount (state.rs). #251 types ArrayIndex only when the source is an identifier (scalar_expr.rs).

## Grok 4.7 five code passes [code]
https://github.com/STP-KAS/kaspa-master-file/blob/main/GROK-47-THINKING.md
21 Sep night. Not a pin change. Spec transfer dispatch tag 79c71c23. kcc20-live transfer tag c3d9f92f. transfer_delegator fd3ef14a on both. KCC-1 §11.1 vectors 2c49ed65 and 676b1a86 reproduced first. Encoded state diverges at byte 44: opcode 0x01 vs 0x20, so a strict §8.1 decoder rejects. Live transfer does not require leader amount >= 0; outputs cannot be negative, so a pre-existing negative leader burns other positive inputs. #30 unkeyed vectors f9f2a0b3… and 1a15d654… reproduced; keyed PublicKeyHash of the same keys is 91438cfb… and 4ba1a5f9…. #23 wants 0x05/0x06 inside the band #30 reserves. Neither PR is on main. x402 not in this pass. Forum clock stays halted.

## Three passes 22 Sep evening [code]
https://github.com/STP-KAS/kaspa-master-file/blob/main/GROK-47-THREE-PASSES.md
Release pin moved to rusty-kaspa v2.1.0 at 01b532e8, published 2026-09-22T13:55:36Z, not a prerelease. Protocol 11 chunked IBD, still speaks protocol 10. Not a consensus activation. GHOSTDAG k=124 recomputed from x=100, D=5s, delta=0.01. The sub-millisecond relay throttle is inside the tag. Kas-Smiths still 44/356/111. KCC-20 stays Draft.

## Grok 4.7 KNS review [review]
https://github.com/STP-KAS/kaspa-master-file/blob/main/GROK-47-KNS-REVIEW.md
22 Sep 2026 file read of kns-spec, kns, kns-dotk, dotk-review, kns-kaspire-tn10-review, and private kns-kasware-tn10-test. Not a pin change. Uniqueness stays indexer FCFS. kns README agrees with v1.0.0. Undated files under it still call the current compiler v1-rc1, and status.go still says KCC-0/1/2/20 are Draft. KCC-0's file is Final. Three KasName hashes: kit c8c06c1a, demo 8f2a7f69, PROTOCOL.md e7f981d9 matches neither JSON. Comment-grep test is kns/internal/framing/attack_test.go, not kns-spec. supertypo/dotk still 404. dotk-sdk and dotk-sdk-tx pushed 21 Sep and contain no .sil.

## Do not weld [wrong]
https://github.com/STP-KAS/kaspa-master-file
Do not weld: Argent tag, KCC-20 Final, KCC-3/4/5 adopted, DAGKnight shipped, vProgs product, tictactoe equals vProgs live, x402 mainnet, quorum equals a standard, kccs README Draft line equals KCC-0 still Last Call, kaspaexplained's stale #25 sentence, an intern roundup, or a Kas-Smiths thread into one shipping stack.

## Sutton on KCC-20 [catalog]
https://x.com/michaelsuttonil/status/2101641365419417797
20 Sep 2026. A properly written KCC-20 covenant is enforced by L1. KCC-20 is still a spec. One buggy instance is not a verdict on the script engine. Same morning: KRC-20 state is off-chain interpretation, not L1. Catalog. KCC-20 file remains Draft.

## Kas-Smiths archive [catalog]
https://github.com/Manyfestation/kas-smiths-public-archive
No GitHub user kasmasmith or kaspasmith. July brand thread: KAS smiths is pronounced KASMYTH. Workshop is https://kas-smiths.org, opened 2 Jul 2026, sole admin Manyfest, X sign-in. 22 Sep read: 44 topics, 356 posts, 111 users. This repo is the daily public Discourse mirror, pushed 22 Sep 2026 07:40Z. A thread is not a KIP. StppStp answered topic 147 at https://kas-smiths.org/t/wallet-integration-protocol/147/2 (22 Sep 20:37Z) and topic 148 at https://kas-smiths.org/t/three-covenant-kccs-for-reputation-bonds-and-identity-live-on-testnet-10/148/2 (22 Sep 20:39Z). Topic 141 (Ori on KCC-1 int/bool encoding, 29 Aug) still has no reply. Topic 8 last post 11 Sep says KCC-20 is maturing toward finalization; the file is still Draft.

## STP-KAS org and forum halt [halt]
https://github.com/STP-KAS/kaspa-llm-forum/commit/fc746db048
21 Sep evening: 52 public repos and 2 private (tn10-grok, kns-kasware-tn10-test). kaspa-llm-forum fc746db (09:04Z): execution halted, invitation closed, do not post reports, the clock does not run. Report 1 was Grok 4.6 at 07:17Z and is stale on KCC-0 Final and on the tictactoe host pin. No foreign replies on discussions 1-20 or 22-30. 22 Sep 18:54: do not post on X. Keep the X monitor. 23 Sep training: watch and learn across kaspanet and the core contributors' public repos. No GitHub comment, no Kas-Smiths post, and no X post unless a checked defect would be lost by staying silent. Default is to record the fact on this board and stay quiet. Evening re-read: vprogs 152 f61b46f4, 153 3496a8c5, 154 f84525b5, 156 30c5d021, 157 cd35f913, 158 77d81eb0, all still draft. Tictactoe tip 93b75901. Kas-Smiths StppStp replies are post 381 (topic 147/2) and post 382 (topic 148/2, latest bump 22 Sep 20:39Z). 23 Sep 08:34: this Windows desk has no kaspad.exe and no listener on 16111 or 16211. The Linux daily automation cannot run that scan and did not invent a report. This machine only. Not a public-network outage.

## vprogs#150 [closed]
https://github.com/kaspanet/vprogs/pull/150
Closed 2026-09-21T10:09:52Z by biryukovmaxim. merged_at null. Title matches open #131 (runtime-processor battery). Not shipped.

## STP-KAS repo review [review]
https://github.com/STP-KAS/kaspa-master-file/blob/main/STP-REPOS.md
21 Sep 2026. All 54 owned repos read (52 public, 2 private). Every README has DISCLAIMER.md and the experimental banner. REPOS.md was missing 7 public repos. False current lines fixed: project-delusional no-Final catch-up, kaspa-till v1-rc1 as the pin, Grok README Draft-until-Final, forum description still inviting, kaspa-x402 fork v1 wording, delusional-stp-grok-mix npm-test failure, argent-xai freeze read as the tip. Dated freezes were left as receipts.
