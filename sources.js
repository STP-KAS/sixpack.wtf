(function () {
  const host = document.querySelector("[data-sources]");
  if (!host) return;
  host.innerHTML =
    '<h2>Interesting links</h2>' +
    '<div class="box source-high">' +
    '<p class="eyebrow">High-value credible source</p>' +
    '<p><a class="name" href="https://kaspaexplained.com/">kaspaexplained.com</a> — Kaspa Explained. Use this first. Source: <a href="https://github.com/parker2017code/kaspa-explained">parker2017code/kaspa-explained</a>.</p>' +
    "<p>Independent education, not an exchange or a fundraise. Explained labels claims <em>Live</em>, <em>Testnet only</em>, <em>Roadmap</em>, <em>Research</em>, or <em>Wrong</em>, each row tracing to rusty-kaspa, a KIP, or a dated API snapshot. It keeps KIP (consensus) apart from KCC (optional convention). It already said Toccata was live while the official domain did not. That is why it sits first.</p>" +
    '<p class="meta"><a href="https://kaspaexplained.com/status">status</a> · <a href="https://kaspaexplained.com/crypto-from-scratch">new to crypto</a> · <a href="https://kaspaexplained.com/what-is-kaspa">already know crypto</a> · <a href="https://kaspaexplained.com/sources">sources</a></p>' +
    "</div>" +
    '<div class="box">' +
    '<p class="eyebrow">Satire, same maintainer</p>' +
    '<p><a class="name" href="https://100bps.wtf/">100bps.wtf</a> — Parker’s intern expo. Jokes, booths, listing theater. Same person as kaspaexplained. Satire only.</p>' +
    "<p>The domain is a joke about 100 blocks per second. Kaspa does not run at 100 BPS. Field notes: <a href=\"https://100bps.wtf/archive\">100bps.wtf/archive</a>. Never cite the expo as an activation proof.</p>" +
    "</div>" +
    "<h3>Protocol, research, live data</h3>" +
    '<ul class="keep">' +
    '<li><a class="name" href="https://docs.kaspa.org">docs.kaspa.org</a><span class="desc">Official operator and protocol docs. Start here before a chat question.</span></li>' +
    '<li><a class="name" href="https://github.com/kaspanet/rusty-kaspa">rusty-kaspa</a><span class="desc">The node. Releases and tags beat slogans.</span></li>' +
    '<li><a class="name" href="https://github.com/kaspanet/kips">kaspanet/kips</a><span class="desc">Consensus proposals. Active is law. Proposed is not.</span></li>' +
    '<li><a class="name" href="https://research.kas.pa/">research.kas.pa</a><span class="desc">Kaspa research write-ups. Not marketing.</span></li>' +
    '<li><a class="name" href="https://hashd.ag/">hashd.ag</a><span class="desc">Yonatan Sompolinsky’s research notes (GHOSTDAG / RTD). Design, not a product page.</span></li>' +
    '<li><a class="name" href="https://wiki.kaspa.org/en/tokenomics">wiki.kaspa.org tokenomics</a><span class="desc">Emission schedule. Recheck against rusty-kaspa coinbase.rs.</span></li>' +
    '<li><a class="name" href="https://explorer.kaspa.org/">explorer.kaspa.org</a><span class="desc">Mainnet explorer. Live ledger, not a pitch.</span></li>' +
    '<li><a class="name" href="https://kaspa.stream/">kaspa.stream</a><span class="desc">Live blockDAG view. Data, not a token page.</span></li>' +
    "</ul>" +
    "<h3>Help rooms</h3>" +
    '<ul class="keep">' +
    '<li><a class="name" href="grok.html">Grok.SPCXAI.KAS</a><span class="desc">Feed-trained Kaspa help desk. Not grok.com. No price. Never a seed.</span></li>' +
    '<li><a class="name" href="help.html">Help on this site</a><span class="desc">Discord path. How to ask. Never a seed.</span></li>' +
    '<li><a class="name" href="https://discord.gg/kaspa">discord.gg/kaspa</a><span class="desc">Dedicated topic rooms. Browse, then ask.</span></li>' +
    '<li><a class="name" href="https://qa.kas.pa/">qa.kas.pa</a><span class="desc">Written questions. Not law.</span></li>' +
    "</ul>" +
    "<h3>This clown page</h3>" +
    '<ul class="keep">' +
    '<li><a class="name" href="farce.html">Farce</a><span class="desc">Yonatan declined Binance’s Dubai invite. Three classes: commercial, casino, cypherpunk. This desk agrees.</span></li>' +
    '<li><a class="name" href="eulogy.html">Proof of work, a eulogy</a><span class="desc">They kept the vocabulary. They outsourced the work. 15s satire.</span></li>' +
    '<li><a class="name" href="aigen.html">ai gen</a><span class="desc">grok build clips.</span></li>' +
    '<li><a class="name" href="https://x.com/hashdag/status/1986497449557446774">hashdag · 6 Nov 2025</a><span class="desc">The post. Let them win or count me out.</span></li>' +
    "</ul>" +
    "<h3>Grok Bot — run a node</h3>" +
    '<ul class="keep">' +
    '<li><a class="name" href="https://github.com/STP-KAS/Xai.Kaspa.node">STP-KAS/Xai.Kaspa.node</a><span class="desc">Archival Kaspa node on the Grok Bot Linux sandbox — not your phone, not Windows. This sandbox: 1 mainnet node, 1 TN10 node, 150 TN10 miners. Paste START.md into kaspa bot. TN10 mining is tn10 bot. Experimental; not Kaspa core.</span></li>' +
    '<li><a class="name" href="https://github.com/STP-KAS/Xai.Kaspa.node/blob/main/START.md">START.md</a><span class="desc">The one paste. New Bot → name kaspa bot → send. Do not paste TN10 into kaspa bot.</span></li>' +
    "</ul>" +
    "<h3>Testnet toys</h3>" +
    '<ul class="keep">' +
    '<li><a class="name" href="faucet.html">Grok bot sandbox faucet</a><span class="desc">Pays from one locked address. Miners rotate randomly; top up when main is under 1M tKAS. Never a seed.</span></li>' +
    '<li><a class="name" href="https://faucet-tn10.kaspanet.io/">faucet-tn10.kaspanet.io</a><span class="desc">Official TN10 faucet. Often 403.</span></li>' +
    '<li><a class="name" href="https://explorer-tn10.kaspa.org/">explorer-tn10.kaspa.org</a><span class="desc">Testnet-10 explorer. Toy/test coins.</span></li>' +
    "</ul>" +
    '<div class="box"><p><strong>Experimental only. Not a product.</strong> There is no spendable L1 stable on Kaspa, and no credible alternative on the horizon. Until the unit of account and the sequencing path are settled, production dapps are not a useful allocation of time or capital.</p><p>Someone posts a Kaspa GitHub link and says it shipped. Open the link. Does it show a proposal, a development branch, a release, or an activation announcement? Then check the software you use. If the feature needs wallet support, a node release alone will not put it in your wallet.</p><p>Do not use wallet integrations on this GitHub. STP remains a clown. This is a delusional desk, not a wallet kit. Kasware, Kastle, and any in-page inject here are withdrawn. Never a seed.</p></div>' +
    '<p class="clown meta">stp is a professional clown · <a href="https://x.com/StppStp">x.com/StppStp</a> · <a href="https://github.com/STP-KAS">github.com/STP-KAS</a></p>';
})();
