/* app.js — 画面描画・操作・アニメーション */
(function (global) {
  "use strict";

  var S = global.OKStorage;
  var L = global.OKLogic;
  var Snd = global.OKSound;

  var state = S.load();

  // ---------- ユーティリティ ----------
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function yen(n) { return "¥" + Number(n).toLocaleString("ja-JP"); }
  function num(n) { return Number(n).toLocaleString("ja-JP"); }

  function persist() { S.save(state); }

  function showView(id) {
    $all(".view").forEach(function (v) { v.classList.toggle("is-active", v.id === id); });
    window.scrollTo(0, 0);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  // ---------- 残高アニメーション ----------
  function animateBalance(from, to) {
    var el = $("#balance-value");
    var card = $("#balance-card");
    var dur = 600;
    var start = null;
    card.classList.remove("pulse-up", "pulse-down");
    void card.offsetWidth; // reflow でアニメ再起動
    card.classList.add(to >= from ? "pulse-up" : "pulse-down");

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(from + (to - from) * eased);
      el.textContent = num(val);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = num(to);
    }
    requestAnimationFrame(step);
  }

  function spawnCoins(direction, count) {
    var layer = $("#coin-layer");
    var emoji = direction === "in" ? "🪙" : "🪙";
    for (var i = 0; i < (count || 6); i++) {
      (function (i) {
        setTimeout(function () {
          var c = document.createElement("span");
          c.className = "coin coin--" + direction;
          c.textContent = emoji;
          var dx = (Math.random() * 200 - 100) + "%";
          c.style.setProperty("--dx", dx);
          layer.appendChild(c);
          setTimeout(function () { c.remove(); }, 950);
        }, i * 70);
      })(i);
    }
  }

  function confetti() {
    var layer = $("#confetti");
    var emojis = ["🎉", "✨", "⭐", "🎊", "💖", "🪙"];
    for (var i = 0; i < 28; i++) {
      var s = document.createElement("span");
      s.textContent = emojis[i % emojis.length];
      s.style.left = Math.random() * 100 + "vw";
      s.style.animationDuration = (1.4 + Math.random() * 1.4) + "s";
      s.style.animationDelay = (Math.random() * 0.3) + "s";
      layer.appendChild(s);
      (function (node) { setTimeout(function () { node.remove(); }, 3200); })(s);
    }
  }

  // ---------- 履歴描画 ----------
  function txMeta(tx) {
    if (tx.type === "spend") {
      var cat = L.categoryById(tx.category);
      return { icon: cat.icon, label: cat.label, sign: "minus", amount: "-" + yen(tx.amount),
        sub: (tx.method === "card" ? "カード（おうちのひと）" : "げんきん") };
    }
    if (tx.type === "allowance") return { icon: "🗓️", label: "おこづかい", sign: "plus", amount: "+" + yen(tx.amount), sub: "じどう" };
    if (tx.type === "add") return { icon: "🎁", label: "おこづかい", sign: "plus", amount: "+" + yen(tx.amount), sub: tx.note || "ついか" };
    if (tx.type === "collect") return { icon: "🧮", label: "げんきん かいしゅう", sign: "", amount: yen(tx.amount), sub: "たてかえの せいさん" };
    return { icon: "•", label: "", sign: "", amount: yen(tx.amount), sub: "" };
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  function renderHistoryMain() {
    var ul = $("#history-list-main");
    ul.innerHTML = "";
    var items = state.transactions.slice(0, 6);
    if (items.length === 0) {
      ul.innerHTML = '<li class="hist-empty">まだ きろくが ないよ</li>';
      return;
    }
    items.forEach(function (tx) {
      var m = txMeta(tx);
      var li = document.createElement("li");
      li.className = "hist-item";
      li.innerHTML =
        '<span class="hist-item__icon">' + m.icon + '</span>' +
        '<span class="hist-item__body">' +
          '<span class="hist-item__label">' + m.label + '</span>' +
          '<span class="hist-item__sub">' + fmtDate(tx.date) + ' ・ ' + m.sub + '</span>' +
        '</span>' +
        '<span class="hist-item__amount ' + m.sign + '">' + m.amount + '</span>';
      ul.appendChild(li);
    });
  }

  function renderHistoryAdmin() {
    var ul = $("#history-list-admin");
    ul.innerHTML = "";
    if (state.transactions.length === 0) {
      ul.innerHTML = '<li class="hist-empty">まだ きろくが ないよ</li>';
      return;
    }
    state.transactions.slice(0, 50).forEach(function (tx) {
      var m = txMeta(tx);
      var li = document.createElement("li");
      li.className = "hist-item";
      li.innerHTML =
        '<span class="hist-item__icon">' + m.icon + '</span>' +
        '<span class="hist-item__body">' +
          '<span class="hist-item__label">' + m.label + '</span>' +
          '<span class="hist-item__sub">' + fmtDate(tx.date) + ' ・ ' + m.sub + '</span>' +
        '</span>' +
        '<span class="hist-item__amount ' + m.sign + '">' + m.amount + '</span>' +
        '<button class="hist-del" data-id="' + tx.id + '">けす</button>';
      ul.appendChild(li);
    });
    $all("#history-list-admin .hist-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("この きろくを けしますか？")) return;
        L.removeTransaction(state, btn.getAttribute("data-id"));
        persist();
        renderAll();
        toast("けしました");
      });
    });
  }

  // ---------- 全体描画 ----------
  function renderMain() {
    $("#main-greeting").textContent = state.childName ? (state.childName + "の おこづかい") : "おこづかい";
    $("#balance-value").textContent = num(state.balance);
    renderHistoryMain();
  }

  function renderAdvance() {
    $("#advance-value").textContent = yen(state.advanceOwed);
  }

  function renderAll() {
    renderMain();
    renderAdvance();
  }

  // ---------- つかうフロー ----------
  var spend = { amount: 0, category: null, method: null };

  function resetSpend() {
    spend = { amount: 0, category: null, method: null };
    $("#spend-amount-value").textContent = "0";
    $all("#cat-grid .cat").forEach(function (c) { c.classList.remove("selected"); });
    $all(".method").forEach(function (m) { m.classList.remove("selected"); });
    updateConfirm();
  }

  function updateConfirm() {
    var ok = spend.amount > 0 && spend.category && spend.method;
    $("#btn-spend-confirm").disabled = !ok;
  }

  function buildCategoryGrid() {
    var grid = $("#cat-grid");
    grid.innerHTML = "";
    L.CATEGORIES.forEach(function (cat) {
      var b = document.createElement("button");
      b.className = "cat";
      b.setAttribute("data-cat", cat.id);
      b.innerHTML = '<div class="cat__icon">' + cat.icon + '</div><div class="cat__label">' + cat.label + '</div>';
      b.addEventListener("click", function () {
        Snd.tap();
        $all("#cat-grid .cat").forEach(function (c) { c.classList.remove("selected"); });
        b.classList.add("selected");
        spend.category = cat.id;
        updateConfirm();
      });
      grid.appendChild(b);
    });
  }

  function bindKeypad() {
    $("#keypad").addEventListener("click", function (e) {
      var btn = e.target.closest(".key");
      if (!btn) return;
      Snd.tap();
      var k = btn.getAttribute("data-key");
      var cur = String(spend.amount);
      if (k === "del") {
        cur = cur.length > 1 ? cur.slice(0, -1) : "0";
      } else {
        if (cur === "0") cur = "";
        cur = (cur + k).slice(0, 7); // 上限 999万円台
      }
      spend.amount = parseInt(cur, 10) || 0;
      $("#spend-amount-value").textContent = num(spend.amount);
      updateConfirm();
    });
  }

  function bindMethods() {
    $all(".method").forEach(function (m) {
      m.addEventListener("click", function () {
        Snd.tap();
        $all(".method").forEach(function (x) { x.classList.remove("selected"); });
        m.classList.add("selected");
        spend.method = m.getAttribute("data-method");
        updateConfirm();
      });
    });
  }

  function confirmSpend() {
    if (spend.amount <= 0 || !spend.category || !spend.method) return;
    if (spend.amount > state.balance) {
      if (!confirm("おこづかいが たりないよ（のこり " + yen(state.balance) + "）。それでも つかう？")) return;
    }
    var cat = L.categoryById(spend.category);
    var before = state.balance;
    L.addTransaction(state, {
      type: "spend",
      amount: spend.amount,
      category: cat.id,
      icon: cat.icon,
      method: spend.method
    });
    persist();
    showView("view-main");
    renderAll();
    Snd.spend();
    spawnCoins("out", 7);
    animateBalance(before, state.balance);
    toast(cat.icon + " " + yen(spend.amount) + " つかったよ");
  }

  // ---------- おとなメニュー ----------
  function addMoney() {
    var v = parseInt($("#add-amount").value, 10);
    if (!v || v <= 0) { toast("きんがくを いれてね"); return; }
    var before = state.balance;
    L.addTransaction(state, { type: "add", amount: v, icon: "🎁", note: "ついか" });
    persist();
    $("#add-amount").value = "";
    renderAll();
    showView("view-main");
    Snd.cheer();
    confetti();
    spawnCoins("in", 7);
    animateBalance(before, state.balance);
    toast("+" + yen(v) + " ふえたよ！");
  }

  function collectCash() {
    var v = parseInt($("#collect-amount").value, 10);
    if (!v || v <= 0) { toast("きんがくを いれてね"); return; }
    L.addTransaction(state, { type: "collect", amount: v, icon: "🧮", note: "げんきんかいしゅう" });
    persist();
    $("#collect-amount").value = "";
    renderAdvance();
    renderHistoryAdmin();
    Snd.add();
    toast("たてかえ " + yen(v) + " せいさん");
  }

  function saveAllowance() {
    var amount = parseInt($("#allow-amount").value, 10) || 0;
    var interval = (document.querySelector('input[name="allow-interval"]:checked') || {}).value || "weekly";
    var weekday = parseInt($("#allow-weekday").value, 10);
    var monthday = parseInt($("#allow-monthday").value, 10);
    L.setAllowance(state, { amount: amount, interval: interval, weekday: weekday, monthday: monthday });
    persist();
    toast(amount > 0 ? "じどうおこづかいを ほぞんしました" : "じどうおこづかいを オフにしました");
  }

  function saveName() {
    state.childName = ($("#child-name").value || "").trim();
    persist();
    renderMain();
    toast("ほぞんしました");
  }

  function fillAllowanceForm() {
    var a = state.allowance;
    $("#allow-amount").value = a.amount || "";
    $all('input[name="allow-interval"]').forEach(function (r) { r.checked = (r.value === a.interval); });
    $("#allow-weekday").value = String(a.weekday);
    var msel = $("#allow-monthday");
    if (!msel.options.length) {
      for (var d = 1; d <= 28; d++) {
        var o = document.createElement("option");
        o.value = String(d); o.textContent = String(d);
        msel.appendChild(o);
      }
    }
    msel.value = String(a.monthday);
    toggleIntervalFields();
    $("#child-name").value = state.childName || "";
  }

  function toggleIntervalFields() {
    var weekly = (document.querySelector('input[name="allow-interval"]:checked') || {}).value !== "monthly";
    $("#weekday-wrap").hidden = !weekly;
    $("#monthday-wrap").hidden = weekly;
  }

  // ---------- おとなゲート ----------
  var gateAnswer = 0;
  function openGate() {
    var a = 2 + Math.floor(Math.random() * 7);
    var b = 2 + Math.floor(Math.random() * 7);
    gateAnswer = a + b;
    $("#gate-q").textContent = a + " ＋ " + b;
    $("#gate-input").value = "";
    $("#gate-err").hidden = true;
    $("#gate").hidden = false;
    setTimeout(function () { $("#gate-input").focus(); }, 50);
  }
  function closeGate() { $("#gate").hidden = true; }
  function checkGate() {
    if (parseInt($("#gate-input").value, 10) === gateAnswer) {
      closeGate();
      fillAllowanceForm();
      renderHistoryAdmin();
      renderAdvance();
      showView("view-adult");
    } else {
      $("#gate-err").hidden = false;
      $("#gate-input").value = "";
      $("#gate-input").focus();
    }
  }

  // ---------- バックアップ ----------
  function doExport() { S.exportToFile(state); toast("かきだしました"); }
  function doImport(file) {
    S.importFromFile(file)
      .then(function (imported) {
        if (!confirm("いまの データを よみこんだ ものに おきかえます。よろしいですか？")) return;
        state = imported;
        L.recompute(state);
        persist();
        renderAll();
        fillAllowanceForm();
        renderHistoryAdmin();
        toast("ふくげんしました");
      })
      .catch(function () { toast("ファイルを よみこめませんでした"); });
  }

  // ---------- 初期化・イベント結線 ----------
  function bindEvents() {
    $("#btn-spend").addEventListener("click", function () { Snd.unlock(); resetSpend(); showView("view-spend"); });
    $("#btn-spend-back").addEventListener("click", function () { showView("view-main"); });
    $("#btn-spend-confirm").addEventListener("click", confirmSpend);

    $("#btn-adult").addEventListener("click", function () { Snd.unlock(); openGate(); });
    $("#btn-adult-back").addEventListener("click", function () { showView("view-main"); });

    $("#gate-ok").addEventListener("click", checkGate);
    $("#gate-cancel").addEventListener("click", closeGate);
    $("#gate-input").addEventListener("keydown", function (e) { if (e.key === "Enter") checkGate(); });

    $("#btn-add-money").addEventListener("click", addMoney);
    $("#btn-collect").addEventListener("click", collectCash);
    $("#btn-save-allowance").addEventListener("click", saveAllowance);
    $("#btn-save-name").addEventListener("click", saveName);
    $all('input[name="allow-interval"]').forEach(function (r) {
      r.addEventListener("change", toggleIntervalFields);
    });

    $("#btn-export").addEventListener("click", doExport);
    $("#btn-import").addEventListener("click", function () { $("#import-file").click(); });
    $("#import-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) doImport(e.target.files[0]);
      e.target.value = "";
    });

    bindKeypad();
    bindMethods();
  }

  function init() {
    buildCategoryGrid();
    bindEvents();

    // 起動時：たまっている自動おこづかいを付与
    var granted = L.grantDueAllowance(state, new Date());
    persist();
    renderAll();

    if (granted > 0) {
      var total = granted * state.allowance.amount;
      setTimeout(function () {
        Snd.cheer();
        confetti();
        toast("🗓️ おこづかい " + yen(total) + " が はいったよ！");
      }, 400);
    }

    // PWA: サービスワーカー（http/https でのみ動作。file:// では無視）
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
