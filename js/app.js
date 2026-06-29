/* app.js — 画面描画・操作・アニメーション
   金額は内部ではすべて「セント単位の整数」で保持し、表示時に S$X.XX に整形する。 */
(function (global) {
  "use strict";

  var S = global.OKStorage;
  var L = global.OKLogic;
  var Snd = global.OKSound;

  var state = S.load();

  // ---------- ユーティリティ ----------
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // セント整数 → "1,234.50"（符号なし・数字部分のみ）
  function fmtAmt(cents) {
    cents = Math.round(Math.abs(cents));
    var d = Math.floor(cents / 100);
    var c = cents % 100;
    return d.toLocaleString("en-US") + "." + String(c).padStart(2, "0");
  }
  // 符号つき数字部分（残高表示など）："-1,234.50"
  function numPart(cents) { return (cents < 0 ? "-" : "") + fmtAmt(cents); }
  // 通貨つきフル表記："S$1,234.50" / "-S$3.00"
  function money(cents) { return (cents < 0 ? "-" : "") + "S$" + fmtAmt(cents); }
  // 入力（ドル文字列）→ セント整数
  function dollarsToCents(v) {
    var f = parseFloat(v);
    if (isNaN(f)) return 0;
    return Math.round(f * 100);
  }

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
  function animateBalance(fromCents, toCents) {
    var el = $("#balance-value");
    var card = $("#balance-card");
    var dur = 600;
    var start = null;
    card.classList.remove("pulse-up", "pulse-down");
    void card.offsetWidth;
    card.classList.add(toCents >= fromCents ? "pulse-up" : "pulse-down");

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = Math.round(fromCents + (toCents - fromCents) * eased);
      el.textContent = numPart(val);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = numPart(toCents);
    }
    requestAnimationFrame(step);
  }

  function spawnCoins(direction, count) {
    var layer = $("#coin-layer");
    for (var i = 0; i < (count || 6); i++) {
      (function (i) {
        setTimeout(function () {
          var c = document.createElement("span");
          c.className = "coin coin--" + direction;
          c.textContent = "🪙";
          c.style.setProperty("--dx", (Math.random() * 200 - 100) + "%");
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
      return { icon: cat.icon, label: cat.label, sign: "minus", amount: "-" + money(tx.amount),
        sub: (tx.method === "card" ? "カード（おうちのひと）" : "げんきん") };
    }
    if (tx.type === "allowance") return { icon: "🗓️", label: "おこづかい", sign: "plus", amount: "+" + money(tx.amount), sub: "じどう" };
    if (tx.type === "add") return { icon: "🎁", label: "おこづかい", sign: "plus", amount: "+" + money(tx.amount), sub: tx.note || "ついか" };
    if (tx.type === "collect") return { icon: "🧮", label: "現金回収", sign: "", amount: money(tx.amount), sub: "立替の精算" };
    return { icon: "•", label: "", sign: "", amount: money(tx.amount), sub: "" };
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  function historyItemHTML(tx, withDelete) {
    var m = txMeta(tx);
    return '<span class="hist-item__icon">' + m.icon + '</span>' +
      '<span class="hist-item__body">' +
        '<span class="hist-item__label">' + m.label + '</span>' +
        '<span class="hist-item__sub">' + fmtDate(tx.date) + ' ・ ' + m.sub + '</span>' +
      '</span>' +
      '<span class="hist-item__amount ' + m.sign + '">' + m.amount + '</span>' +
      (withDelete ? '<button class="hist-del" data-id="' + tx.id + '">削除</button>' : '');
  }

  function renderHistoryMain() {
    var ul = $("#history-list-main");
    ul.innerHTML = "";
    var items = state.transactions.slice(0, 6);
    if (items.length === 0) { ul.innerHTML = '<li class="hist-empty">まだ きろくが ないよ</li>'; return; }
    items.forEach(function (tx) {
      var li = document.createElement("li");
      li.className = "hist-item";
      li.innerHTML = historyItemHTML(tx, false);
      ul.appendChild(li);
    });
  }

  function renderHistoryAdmin() {
    var ul = $("#history-list-admin");
    ul.innerHTML = "";
    if (state.transactions.length === 0) { ul.innerHTML = '<li class="hist-empty">まだ記録がありません</li>'; return; }
    state.transactions.slice(0, 50).forEach(function (tx) {
      var li = document.createElement("li");
      li.className = "hist-item";
      li.innerHTML = historyItemHTML(tx, true);
      ul.appendChild(li);
    });
    $all("#history-list-admin .hist-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("この記録を削除しますか？")) return;
        L.removeTransaction(state, btn.getAttribute("data-id"));
        persist();
        renderAll();
        renderHistoryAdmin();
        toast("削除しました");
      });
    });
  }

  // ---------- 全体描画 ----------
  function renderMain() {
    $("#main-greeting").textContent = state.childName ? (state.childName + "の おこづかい") : "おこづかい";
    $("#balance-value").textContent = numPart(state.balance);
    renderHistoryMain();
  }
  function renderAdvance() { $("#advance-value").textContent = money(state.advanceOwed); }
  function renderAll() { renderMain(); renderAdvance(); }

  // ---------- つかうフロー（金額はセント単位） ----------
  var spend = { amount: 0, category: null, method: null };

  function resetSpend() {
    spend = { amount: 0, category: null, method: null };
    $("#spend-amount-value").textContent = numPart(0);
    $all("#cat-grid .cat").forEach(function (c) { c.classList.remove("selected"); });
    $all(".method").forEach(function (m) { m.classList.remove("selected"); });
    updateConfirm();
  }

  function updateConfirm() {
    $("#btn-spend-confirm").disabled = !(spend.amount > 0 && spend.category && spend.method);
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

  // テンキーはレジ方式：数字を押すとセントとして右から積み上がる（150 → S$1.50）
  function bindKeypad() {
    $("#keypad").addEventListener("click", function (e) {
      var btn = e.target.closest(".key");
      if (!btn) return;
      Snd.tap();
      var k = btn.getAttribute("data-key");
      var cur = String(spend.amount); // セント
      if (k === "del") {
        cur = cur.length > 1 ? cur.slice(0, -1) : "0";
      } else {
        if (cur === "0") cur = "";
        cur = (cur + k).slice(0, 7); // 上限 S$99,999.99
      }
      spend.amount = parseInt(cur, 10) || 0;
      $("#spend-amount-value").textContent = numPart(spend.amount);
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
      if (!confirm("おこづかいが たりないよ（のこり " + money(state.balance) + "）。それでも つかう？")) return;
    }
    var cat = L.categoryById(spend.category);
    var before = state.balance;
    L.addTransaction(state, { type: "spend", amount: spend.amount, category: cat.id, icon: cat.icon, method: spend.method });
    persist();
    showView("view-main");
    renderAll();
    Snd.spend();
    spawnCoins("out", 7);
    animateBalance(before, state.balance);
    toast(cat.icon + " " + money(spend.amount) + " つかったよ");
  }

  // ---------- 設定（保護者向け：金額入力はドル→セント変換） ----------
  function addMoney() {
    var cents = dollarsToCents($("#add-amount").value);
    if (cents <= 0) { toast("金額を入力してください"); return; }
    var before = state.balance;
    L.addTransaction(state, { type: "add", amount: cents, icon: "🎁", note: "ついか" });
    persist();
    $("#add-amount").value = "";
    renderAll();
    showView("view-main");
    Snd.cheer();
    confetti();
    spawnCoins("in", 7);
    animateBalance(before, state.balance);
    toast("+" + money(cents) + " ふえたよ！");
  }

  function collectCash() {
    var cents = dollarsToCents($("#collect-amount").value);
    if (cents <= 0) { toast("金額を入力してください"); return; }
    L.addTransaction(state, { type: "collect", amount: cents, icon: "🧮", note: "現金回収" });
    persist();
    $("#collect-amount").value = "";
    renderAdvance();
    renderHistoryAdmin();
    Snd.add();
    toast("立替 " + money(cents) + " を精算しました");
  }

  function saveAllowance() {
    var cents = dollarsToCents($("#allow-amount").value || "0");
    var interval = (document.querySelector('input[name="allow-interval"]:checked') || {}).value || "weekly";
    var weekday = parseInt($("#allow-weekday").value, 10);
    var monthday = parseInt($("#allow-monthday").value, 10);
    L.setAllowance(state, { amount: cents, interval: interval, weekday: weekday, monthday: monthday });
    persist();
    toast(cents > 0 ? "自動お小遣いを保存しました" : "自動お小遣いをオフにしました");
  }

  function saveName() {
    state.childName = ($("#child-name").value || "").trim();
    persist();
    renderMain();
    toast("保存しました");
  }

  function fillAllowanceForm() {
    var a = state.allowance;
    $("#allow-amount").value = a.amount ? (a.amount / 100) : "";
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

  // ---------- 設定ゲート ----------
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
  function doExport() { S.exportToFile(state); toast("書き出しました"); }
  function doImport(file) {
    S.importFromFile(file)
      .then(function (imported) {
        if (!confirm("現在のデータを、読み込んだ内容で置き換えます。よろしいですか？")) return;
        state = imported;
        L.recompute(state);
        persist();
        renderAll();
        fillAllowanceForm();
        renderHistoryAdmin();
        toast("復元しました");
      })
      .catch(function () { toast("ファイルを読み込めませんでした"); });
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

    var granted = L.grantDueAllowance(state, new Date());
    persist();
    renderAll();

    if (granted > 0) {
      var total = granted * state.allowance.amount;
      setTimeout(function () {
        Snd.cheer();
        confetti();
        toast("🗓️ おこづかい " + money(total) + " が はいったよ！");
      }, 400);
    }

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
