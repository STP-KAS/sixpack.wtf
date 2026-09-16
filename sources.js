(function () {
  const host = document.querySelector("[data-sources]");
  if (!host) return;
  host.innerHTML =
    '<h2>Interesting links</h2>' +
    '<div class="box source-high">' +
    '<p class="eyebrow">High-value credible source</p>' +
    '<p><a class="name" href="https://kaspaexplained.com/">kaspaexplained.com</a> — Kaspa Explained. Use this first. Source: <a href="https://github.com/parker2017code/kaspa-explained">parker2017code/kaspa-explained</a>.</p>' +
    "<p>Independent education, not an exchange or a fundraise. kaspa.org has been stale (Toccata still framed as upcoming after mainnet activation). Explained labels claims <em>Live</em>, <em>Testnet only</em>, <em>Roadmap</em>, <em>Research</em>, or <em>Wrong</em>, each row tracing to rusty-kaspa, a KIP, or a dated API snapshot. It keeps KIP (consensus) apart from KCC (optional convention). That is why it sits first.</p>" +
    '<p class="meta"><a href="https://kaspaexplained.com/status">status</a> · <a href="https://kaspaexplained.com/crypto-from-scratch">new to crypto</a> · <a href="https://kaspaexplained.com/what-is-kaspa">already know crypto</a> · <a href="https://kaspaexplained.com/sources">sources</a></p>' +
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
    '<li><a class="name" href="help.html">Help on this site</a><span class="desc">Discord path. How to ask. Never a seed.</span></li>' +
    '<li><a class="name" href="https://discord.gg/kaspa">discord.gg/kaspa</a><span class="desc">Dedicated topic rooms. Browse, then ask.</span></li>' +
    '<li><a class="name" href="https://qa.kas.pa/">qa.kas.pa</a><span class="desc">Written questions. Not law.</span></li>' +
    "</ul>" +
    "<h3>Testnet toys</h3>" +
    '<ul class="keep">' +
    '<li><a class="name" href="faucet.html">Grok bot sandbox faucet</a><span class="desc">TN10 tKAS, 30k / 48h. Paste kaspatest:.</span></li>' +
    '<li><a class="name" href="https://faucet-tn10.kaspanet.io/">faucet-tn10.kaspanet.io</a><span class="desc">Official TN10 faucet. Often 403.</span></li>' +
    '<li><a class="name" href="https://explorer-tn10.kaspa.org/">explorer-tn10.kaspa.org</a><span class="desc">Testnet-10 explorer. Toy coins.</span></li>' +
    "</ul>" +
    '<p class="clown meta">stp is a professional clown · <a href="https://x.com/StppStp">x.com/StppStp</a> · <a href="https://github.com/STP-KAS">github.com/STP-KAS</a></p>';
})();
