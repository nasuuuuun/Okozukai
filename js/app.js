/* app.js — 画面描画・操作・アニメーション
   金額は内部ではすべて「セント単位の整数」で保持し、表示時に $X.XX に整形する。 */
(function (global) {
  "use strict";

  var S = global.OKStorage;
  var L = global.OKLogic;
  var Snd = global.OKSound;

  // 設定画面に入る前の計算ゲート。今は無効（子どもには触らせない運用のため）。
  // 今後オンにしたい場合は true にするだけでよい。
  var GATE_ENABLED = false;

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
  // 通貨つきフル表記："$1,234.50" / "-$3.00"
  function money(cents) { return (cents < 0 ? "-" : "") + "$" + fmtAmt(cents); }
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
      return { icon: cat.icon, label: cat.label, sign: "minus", amount: "-" + money(tx.amount), sub: "" };
    }
    if (tx.type === "allowance") return { icon: "🗓️", label: "おこづかい", sign: "plus", amount: "+" + money(tx.amount), sub: "じどう" };
    if (tx.type === "add") return { icon: "🎁", label: "おこづかい", sign: "plus", amount: "+" + money(tx.amount), sub: tx.note || "ついか" };
    return { icon: "•", label: "", sign: "", amount: money(tx.amount), sub: "" };
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  function historyItemHTML(tx, withDelete) {
    var m = txMeta(tx);
    var subText = m.sub ? (fmtDate(tx.date) + " ・ " + m.sub) : fmtDate(tx.date);
    return '<span class="hist-item__icon">' + m.icon + '</span>' +
      '<span class="hist-item__body">' +
        '<span class="hist-item__label">' + m.label + '</span>' +
        '<span class="hist-item__sub">' + subText + '</span>' +
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
        renderMain();
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
    updateClaimButton();
  }

  // お小遣いの日が来たら「おこづかいをもらう」ボタンを出す（自動では加算しない）
  function updateClaimButton() {
    var btn = $("#btn-claim");
    if (!btn) return;
    btn.hidden = (L.pendingCount(state, new Date()) <= 0);
  }

  function claimAllowance() {
    Snd.unlock();
    var before = state.balance;
    if (!L.claimOneAllowance(state, new Date())) { updateClaimButton(); return; }
    persist();
    renderMain();
    Snd.cheer();
    confetti();
    spawnCoins("in", 8);
    animateBalance(before, state.balance);
    toast("🎉 おこづかい " + money(state.allowance.amount) + " を もらったよ！");
  }

  // ---------- つかうフロー（電卓方式：数字→ドル、小数点→セント） ----------
  // entry は表示中の文字列（例 "0" "5" "5." "5.5" "5.50"）。セントに変換して確定する。
  var spend = { entry: "0", category: null };

  function entryToCents(s) {
    if (!s) return 0;
    var parts = s.split(".");
    var dollars = parseInt(parts[0] || "0", 10) || 0;
    var centsStr = (parts[1] || "").slice(0, 2);
    while (centsStr.length < 2) centsStr += "0"; // "5"→"50", ""→"00"
    var cents = parseInt(centsStr, 10) || 0;
    return dollars * 100 + cents;
  }
  function currentCents() { return entryToCents(spend.entry); }

  function resetSpend() {
    spend = { entry: "0", category: null };
    $("#spend-amount-value").textContent = "0";
    $all("#cat-grid .cat").forEach(function (c) { c.classList.remove("selected"); });
    updateConfirm();
  }

  function updateConfirm() {
    $("#btn-spend-confirm").disabled = !(currentCents() > 0 && spend.category);
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

  // 数字＝ドル部分、小数点ボタン＝以後セント部分（最大2桁）
  function pressKey(k) {
    var e = spend.entry;
    if (k === "del") {
      e = e.length > 1 ? e.slice(0, -1) : "0";
      if (e === "") e = "0";
    } else if (k === ".") {
      if (e.indexOf(".") === -1) e = e + ".";
    } else { // 数字
      if (e.indexOf(".") === -1) {
        e = (e === "0") ? k : (e + k);
        if (e.length > 5) return; // ドル部分は最大5桁（$99,999）
      } else {
        var parts = e.split(".");
        if (parts[1].length >= 2) return; // セントは2桁まで
        e = parts[0] + "." + parts[1] + k;
      }
    }
    spend.entry = e;
    $("#spend-amount-value").textContent = e;
    updateConfirm();
  }

  function bindKeypad() {
    $("#keypad").addEventListener("click", function (e) {
      var btn = e.target.closest(".key");
      if (!btn) return;
      Snd.tap();
      pressKey(btn.getAttribute("data-key"));
    });
  }

  function confirmSpend() {
    var cents = currentCents();
    if (cents <= 0 || !spend.category) return;
    if (cents > state.balance) {
      if (!confirm("おこづかいが たりないよ（のこり " + money(state.balance) + "）。それでも つかう？")) return;
    }
    var cat = L.categoryById(spend.category);
    var before = state.balance;
    L.addTransaction(state, { type: "spend", amount: cents, category: cat.id, icon: cat.icon });
    persist();
    showView("view-main");
    renderMain();
    Snd.spend();
    spawnCoins("out", 7);
    animateBalance(before, state.balance);
    toast(cat.icon + " " + money(cents) + " つかったよ");
  }

  // ---------- 設定（保護者向け：金額入力はドル→セント変換） ----------
  function addMoney() {
    var cents = dollarsToCents($("#add-amount").value);
    if (cents <= 0) { toast("金額を入力してください"); return; }
    var before = state.balance;
    L.addTransaction(state, { type: "add", amount: cents, icon: "🎁", note: "ついか" });
    persist();
    $("#add-amount").value = "";
    renderMain();
    showView("view-main");
    Snd.cheer();
    confetti();
    spawnCoins("in", 7);
    animateBalance(before, state.balance);
    toast("+" + money(cents) + " ふえたよ！");
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

  // 設定画面を開く（中身を整えて表示）
  function enterAdult() {
    fillAllowanceForm();
    renderHistoryAdmin();
    showView("view-adult");
  }

  // ---------- 設定ゲート（GATE_ENABLED が true のときのみ使用） ----------
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
      enterAdult();
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
        renderMain();
        fillAllowanceForm();
        renderHistoryAdmin();
        toast("復元しました");
      })
      .catch(function () { toast("ファイルを読み込めませんでした"); });
  }

  // ---------- 初期化・イベント結線 ----------
  function bindEvents() {
    $("#btn-claim").addEventListener("click", claimAllowance);
    $("#btn-spend").addEventListener("click", function () { Snd.unlock(); resetSpend(); showView("view-spend"); });
    $("#btn-spend-back").addEventListener("click", function () { showView("view-main"); });
    $("#btn-spend-confirm").addEventListener("click", confirmSpend);

    $("#btn-adult").addEventListener("click", function () {
      Snd.unlock();
      if (GATE_ENABLED) openGate(); else enterAdult();
    });
    $("#btn-adult-back").addEventListener("click", function () { showView("view-main"); });

    $("#gate-ok").addEventListener("click", checkGate);
    $("#gate-cancel").addEventListener("click", closeGate);
    $("#gate-input").addEventListener("keydown", function (e) { if (e.key === "Enter") checkGate(); });

    $("#btn-add-money").addEventListener("click", addMoney);
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
  }

  function init() {
    buildCategoryGrid();
    bindEvents();

    if (L.ensureAllowanceBaseline(state, new Date())) persist();
    renderMain();

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
