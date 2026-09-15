(function () {
  const payCopy = [
    "Signed and on the network. Sending is not settling.",
    "A miner put it in a block. Inclusion is not done.",
    "Accepted in the current history. The recipient may still wait before treating it as settled.",
    "The recipient chooses a wait. A coffee and a house sale are different policies. Kaspa does not pick that for them.",
  ];
  const spendCopy = {
    alice: "Alice’s payment consumes the output. Bob’s attempt is already spent. Keeping both blocks does not make both payments valid.",
    bob: "Bob’s payment consumes the output. Alice’s attempt is already spent. Order first, then the UTXO check.",
  };
  const vault = {
    early: { pass: [false, true, true], say: "Rejected. The waiting rule still fails." },
    large: { pass: [true, false, true], say: "Rejected. 3,000 is over the 2,000 cap." },
    wrong: { pass: [true, true, false], say: "Rejected. Wrong destination." },
    valid: { pass: [true, true, true], say: "Allowed. Remainder keeps the spending rule." },
  };

  function showDoor(id) {
    const n = String(id);
    document.querySelectorAll("[data-door]").forEach(function (el) {
      el.classList.toggle("hide", el.getAttribute("data-door") !== n);
    });
    document.querySelectorAll("[data-who]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-who") === n);
    });
    try {
      history.replaceState(null, "", "#" + n);
    } catch (_) {}
  }

  function paintPay(stage) {
    document.querySelectorAll("[data-pay]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-pay") === String(stage));
    });
    const say = document.querySelector("[data-pay-say]");
    if (say) say.textContent = payCopy[stage] || payCopy[2];
  }

  function paintSpend(who) {
    document.querySelectorAll("[data-spend]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-spend") === who);
    });
    const say = document.querySelector("[data-spend-say]");
    if (say) say.textContent = spendCopy[who] || spendCopy.alice;
  }

  function paintVault(key) {
    const row = vault[key] || vault.early;
    document.querySelectorAll("[data-vault-checks] [data-c]").forEach(function (el) {
      const i = Number(el.getAttribute("data-c"));
      el.classList.toggle("ok", row.pass[i]);
      el.classList.toggle("no", !row.pass[i]);
    });
    const say = document.querySelector("[data-vault-say]");
    if (say) say.textContent = row.say;
  }

  document.addEventListener("click", function (e) {
    const who = e.target.closest("[data-who]");
    if (who) {
      showDoor(who.getAttribute("data-who"));
      return;
    }
    const pay = e.target.closest("[data-pay]");
    if (pay) {
      paintPay(Number(pay.getAttribute("data-pay")));
      return;
    }
    const spend = e.target.closest("[data-spend]");
    if (spend) {
      paintSpend(spend.getAttribute("data-spend"));
    }
  });

  const sel = document.querySelector("[data-vault]");
  if (sel) {
    sel.addEventListener("change", function () {
      paintVault(sel.value);
    });
    paintVault(sel.value);
  }

  const hash = (location.hash || "#1").replace("#", "");
  showDoor(/^[1-4]$/.test(hash) ? hash : "1");
  paintPay(2);
  paintSpend("alice");
})();
