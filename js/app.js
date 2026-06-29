/* app.js — 画面描画・操作・アニメーション（バーチャル財布版）
   金額は内部ではすべて「セント単位の整数」。残高は財布(state.wallet)の合計。 */
(function (global) {
  "use strict";

  var S = global.OKStorage;
  var L = global.OKLogic;
  var Snd = global.OKSound;

  // 設定画面に入る前の計算ゲート。今は無効（子どもには触らせない運用）。
  var GATE_ENABLED = false;

  var state = S.load();

  // ---------- ユーティリティ ----------
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function fmtAmt(cents) {
    cents = Math.round(Math.abs(cents));
    return Math.floor(cents / 100).toLocaleString("en-US") + "." + String(cents % 100).padStart(2, "0");
  }
  function numPart(cents) { return (cents < 0 ? "-" : "") + fmtAmt(cents); }
  function money(cents) { return (cents < 0 ? "-" : "") + "$" + fmtAmt(cents); }
  function dollarsToCents(v) { var f = parseFloat(v); return isNaN(f) ? 0 : Math.round(f * 100); }

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
    toastTimer = setTimeout(function () { el.hidden = true; }, 2400);
  }

  // ---------- 残高アニメーション・演出 ----------
  function animateBalance(fromCents, toCents) {
    var el = $("#balance-value");
    var card = $("#balance-card");
    var dur = 600, start = null;
    card.classList.remove("pulse-up", "pulse-down");
    void card.offsetWidth;
    card.classList.add(toCents >= fromCents ? "pulse-up" : "pulse-down");
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var v = Math.round(fromCents + (toCents - fromCents) * (1 - Math.pow(1 - p, 3)));
      el.textContent = numPart(v);
      if (p < 1) requestAnimationFrame(step); else el.textContent = numPart(toCents);
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

  // ---------- 履歴 ----------
  function txMeta(tx) {
    if (tx.type === "spend") {
      var cat = L.categoryById(tx.category);
      return { icon: cat.icon, label: cat.label, sign: "minus", amount: "-" + money(tx.amount), sub: "" };
    }
    if (tx.type === "allowance") return { icon: "🗓️", label: "おこづかい", sign: "plus", amount: "+" + money(tx.amount), sub: "じどう" };
    if (tx.type === "add") return { icon: "🎁", label: "おこづかい", sign: "plus", amount: "+" + money(tx.amount), sub: tx.note || "ついか" };
    return { icon: "•", label: "", sign: "", amount: money(tx.amount), sub: "" };
  }
  function fmtDate(iso) { var d = new Date(iso); return (d.getMonth() + 1) + "/" + d.getDate(); }
  function historyItemHTML(tx) {
    var m = txMeta(tx);
    var sub = m.sub ? (fmtDate(tx.date) + " ・ " + m.sub) : fmtDate(tx.date);
    return '<span class="hist-item__icon">' + m.icon + '</span>' +
      '<span class="hist-item__body"><span class="hist-item__label">' + m.label + '</span>' +
      '<span class="hist-item__sub">' + sub + '</span></span>' +
      '<span class="hist-item__amount ' + m.sign + '">' + m.amount + '</span>';
  }
  function renderHistoryInto(ul, limit, emptyMsg) {
    ul.innerHTML = "";
    var items = state.transactions.slice(0, limit);
    if (items.length === 0) { ul.innerHTML = '<li class="hist-empty">' + emptyMsg + '</li>'; return; }
    items.forEach(function (tx) {
      var li = document.createElement("li");
      li.className = "hist-item";
      li.innerHTML = historyItemHTML(tx);
      ul.appendChild(li);
    });
  }
  function renderHistoryMain() { renderHistoryInto($("#history-list-main"), 6, "まだ きろくが ないよ"); }
  function renderHistoryAdmin() {
    var ul = $("#history-list-admin");
    ul.innerHTML = "";
    var items = state.transactions.slice(0, 50);
    if (items.length === 0) { ul.innerHTML = '<li class="hist-empty">まだ記録がありません</li>'; return; }
    items.forEach(function (tx) {
      var li = document.createElement("li");
      li.className = "hist-item";
      li.innerHTML = historyItemHTML(tx) + '<button class="hist-del" type="button" aria-label="削除">削除</button>';
      li.querySelector(".hist-del").addEventListener("click", function () {
        if (!confirm("この記録を削除します。よろしいですか？\n（お金〔残高〕は変わりません。残高を直すときは「おさいふの中身を修正」を使ってください）")) return;
        L.removeTransaction(state, tx.id);
        persist();
        renderHistoryAdmin();
        renderMain();
      });
      ul.appendChild(li);
    });
  }

  // ---------- メイン ----------
  function renderMain() {
    $("#main-greeting").textContent = state.childName ? (state.childName + "の おこづかい") : "おこづかい";
    $("#balance-value").textContent = numPart(state.balance);
    renderHistoryMain();
    updateClaimButton();
  }
  function updateClaimButton() {
    var btn = $("#btn-claim");
    if (btn) btn.hidden = (L.pendingCount(state, new Date()) <= 0);
  }
  function claimAllowance() {
    Snd.unlock();
    var before = state.balance;
    if (!L.claimOneAllowance(state, new Date())) { updateClaimButton(); return; }
    persist();
    renderMain();
    renderWalletEdit();
    Snd.cheer(); confetti(); spawnCoins("in", 8);
    animateBalance(before, state.balance);
    toast("🎉 おこづかい " + money(state.allowance.amount) + " を もらったよ！");
  }

  // ---------- つかう step1：ねだん入力＋カテゴリ ----------
  var spend = { entry: "0", category: null };
  function entryToCents(s) {
    if (!s) return 0;
    var parts = s.split(".");
    var dollars = parseInt(parts[0] || "0", 10) || 0;
    var c = (parts[1] || "").slice(0, 2);
    while (c.length < 2) c += "0";
    return dollars * 100 + (parseInt(c, 10) || 0);
  }
  function currentCents() { return entryToCents(spend.entry); }
  function resetSpend() {
    spend = { entry: "0", category: null };
    $("#spend-amount-value").textContent = "0";
    $all("#cat-grid .cat").forEach(function (c) { c.classList.remove("selected"); });
    updateNext();
  }
  function updateNext() { $("#btn-spend-next").disabled = !(currentCents() > 0 && spend.category); }
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
        updateNext();
      });
      grid.appendChild(b);
    });
  }
  function pressKey(k) {
    var e = spend.entry;
    if (k === "del") { e = e.length > 1 ? e.slice(0, -1) : "0"; if (e === "") e = "0"; }
    else if (k === ".") { if (e.indexOf(".") === -1) e = e + "."; }
    else {
      if (e.indexOf(".") === -1) { e = (e === "0") ? k : (e + k); if (e.length > 5) return; }
      else { var p = e.split("."); if (p[1].length >= 2) return; e = p[0] + "." + p[1] + k; }
    }
    spend.entry = e;
    $("#spend-amount-value").textContent = e;
    updateNext();
  }
  function bindKeypad() {
    $("#keypad").addEventListener("click", function (e) {
      var btn = e.target.closest(".key");
      if (!btn) return;
      Snd.tap();
      pressKey(btn.getAttribute("data-key"));
    });
  }
  function goToPay() {
    var price = L.roundTo5(currentCents());
    if (price <= 0 || !spend.category) return;
    if (price > state.balance) { alert("おこづかいが たりないよ（のこり " + money(state.balance) + "）"); return; }
    payState = { price: price, coins: {} };
    showView("view-pay");
    renderPay();
  }

  // ---------- つかう step2：財布のお金をタップして払う ----------
  var payState = { price: 0, coins: {} };
  function paidTotal() {
    var t = 0;
    L.DENOMS.forEach(function (d) { t += d * (payState.coins[d] || 0); });
    return t;
  }
  function renderPay() {
    $("#pay-price").textContent = money(payState.price);
    var paid = paidTotal();
    $("#pay-paid").textContent = money(paid);
    var changeEl = $("#pay-change");
    if (paid >= payState.price && payState.price > 0) {
      var ch = paid - payState.price;
      changeEl.hidden = false;
      changeEl.textContent = ch > 0 ? ("おつり " + money(ch)) : "ぴったり！";
      changeEl.className = "pay-change" + (ch > 0 ? " is-change" : " is-exact");
    } else {
      changeEl.hidden = true;
    }
    $("#btn-pay-confirm").disabled = !(paid >= payState.price);

    var wrap = $("#wallet-pay");
    wrap.innerHTML = "";
    var any = false;
    var STACK_MAX = 12; // これを超える枚数は、実物を並べず1枚＋「のこりN」にする
    L.DENOMS.forEach(function (d) {
      var owned = state.wallet[d] || 0;
      if (owned <= 0) return;
      any = true;
      var avail = owned - (payState.coins[d] || 0);
      if (avail <= 0) return; // 全部はらい終えた種類は出さない
      var m = L.DENOM_META[d];
      if (avail > STACK_MAX) {
        var stack = makePayTile(d, m);
        stack.classList.add("is-stack");
        stack.innerHTML = '<span class="money__cnt">のこり ' + avail + '</span>';
        wrap.appendChild(stack);
      } else {
        for (var i = 0; i < avail; i++) wrap.appendChild(makePayTile(d, m));
      }
    });
    if (!any) wrap.innerHTML = '<p class="hist-empty">おさいふが からっぽだよ</p>';
  }
  // 支払いパレットの1枚（硬貨/紙幣の実物イラスト）。タップで1枚はらう。
  function makePayTile(d, m) {
    var btn = document.createElement("button");
    btn.className = "money money--" + m.type + " denom-" + d + " paytile";
    btn.setAttribute("aria-label", m.label);
    btn.addEventListener("click", function () {
      if ((state.wallet[d] || 0) - (payState.coins[d] || 0) <= 0) return;
      payState.coins[d] = (payState.coins[d] || 0) + 1;
      Snd.tap();
      renderPay();
    });
    return btn;
  }
  function clearPay() { payState.coins = {}; Snd.tap(); renderPay(); }
  function confirmPay() {
    var paid = paidTotal();
    if (paid < payState.price) return;
    var cat = L.categoryById(spend.category);
    var before = state.balance;
    var res = L.spend(state, payState.price, payState.coins, cat.id, cat.icon);
    persist();
    showView("view-main");
    renderMain();
    renderWalletEdit();
    Snd.spend(); spawnCoins("out", 7);
    animateBalance(before, state.balance);
    var msg = cat.icon + " " + money(payState.price) + " つかったよ";
    if (res.change > 0) msg += "／おつり " + money(res.change);
    toast(msg);
  }

  // ---------- 設定：お小遣いを足す ----------
  function addMoney() {
    var cents = L.roundTo5(dollarsToCents($("#add-amount").value));
    if (cents <= 0) { toast("金額を入力してください"); return; }
    var before = state.balance;
    L.deposit(state, cents, "add", { icon: "🎁", note: "ついか" });
    persist();
    $("#add-amount").value = "";
    renderMain(); renderWalletEdit();
    showView("view-main");
    Snd.cheer(); confetti(); spawnCoins("in", 7);
    animateBalance(before, state.balance);
    toast("+" + money(cents) + " ふえたよ！");
  }

  // ---------- 設定：おさいふの中身エディタ ----------
  function renderWalletEdit() {
    var wrap = $("#wallet-edit");
    if (!wrap) return;
    wrap.innerHTML = "";
    L.DENOMS.forEach(function (d) {
      var m = L.DENOM_META[d];
      var row = document.createElement("div");
      row.className = "wallet-row";
      row.innerHTML =
        '<span class="money money--' + m.type + ' money--sm denom-' + d + '"><span class="money__val">' + m.label + '</span></span>' +
        '<div class="wallet-row__ctrl">' +
          '<button class="stepbtn" data-d="' + d + '" data-op="-">−</button>' +
          '<span class="wallet-row__cnt" id="wcnt-' + d + '">' + (state.wallet[d] || 0) + '</span>' +
          '<button class="stepbtn" data-d="' + d + '" data-op="+">＋</button>' +
        '</div>';
      wrap.appendChild(row);
    });
    $all("#wallet-edit .stepbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = parseInt(b.getAttribute("data-d"), 10);
        var op = b.getAttribute("data-op");
        state.wallet[d] = Math.max(0, (state.wallet[d] || 0) + (op === "+" ? 1 : -1));
        L.syncBalance(state);
        persist();
        $("#wcnt-" + d).textContent = state.wallet[d];
        renderMain();
      });
    });
  }

  // ---------- 設定：おこづかいの予定 ----------
  function saveAllowance() {
    var cents = L.roundTo5(dollarsToCents($("#allow-amount").value || "0"));
    var interval = (document.querySelector('input[name="allow-interval"]:checked') || {}).value || "weekly";
    L.setAllowance(state, { amount: cents, interval: interval, weekday: parseInt($("#allow-weekday").value, 10), monthday: parseInt($("#allow-monthday").value, 10) });
    persist();
    toast(cents > 0 ? "おこづかいの予定を保存しました" : "おこづかいの予定をオフにしました");
  }
  function simulateAllowanceDay() {
    var a = state.allowance;
    if (!a || a.amount <= 0) { toast("先に金額を設定して保存してください"); return; }
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var lastDue = new Date(today), guard = 0;
    while (guard < 40) {
      if (a.interval === "weekly") { if (lastDue.getDay() === a.weekday) break; }
      else { if (lastDue.getDate() === Math.min(Math.max(a.monthday, 1), 28)) break; }
      lastDue.setDate(lastDue.getDate() - 1); guard++;
    }
    var prev = new Date(lastDue);
    if (a.interval === "weekly") prev.setDate(prev.getDate() - 7); else prev.setMonth(prev.getMonth() - 1);
    a.lastGrantedDate = L.formatYMD(prev);
    persist();
    showView("view-main");
    renderMain();
    toast("（テスト）お小遣い日が来た状態にしました");
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
      for (var d = 1; d <= 28; d++) { var o = document.createElement("option"); o.value = String(d); o.textContent = String(d); msel.appendChild(o); }
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

  function enterAdult() {
    fillAllowanceForm();
    renderWalletEdit();
    renderHistoryAdmin();
    showView("view-adult");
  }

  // ---------- 設定ゲート（GATE_ENABLED が true のときのみ） ----------
  var gateAnswer = 0;
  function openGate() {
    var a = 2 + Math.floor(Math.random() * 7), b = 2 + Math.floor(Math.random() * 7);
    gateAnswer = a + b;
    $("#gate-q").textContent = a + " ＋ " + b;
    $("#gate-input").value = "";
    $("#gate-err").hidden = true;
    $("#gate").hidden = false;
    setTimeout(function () { $("#gate-input").focus(); }, 50);
  }
  function closeGate() { $("#gate").hidden = true; }
  function checkGate() {
    if (parseInt($("#gate-input").value, 10) === gateAnswer) { closeGate(); enterAdult(); }
    else { $("#gate-err").hidden = false; $("#gate-input").value = ""; $("#gate-input").focus(); }
  }

  // ---------- バックアップ ----------
  function doExport() { S.exportToFile(state); toast("書き出しました"); }
  function doImport(file) {
    S.importFromFile(file)
      .then(function (imported) {
        if (!confirm("現在のデータを、読み込んだ内容で置き換えます。よろしいですか？")) return;
        state = imported;
        L.migrateWalletFromTransactions(state);
        L.syncBalance(state);
        persist();
        renderMain(); fillAllowanceForm(); renderWalletEdit(); renderHistoryAdmin();
        toast("復元しました");
      })
      .catch(function () { toast("ファイルを読み込めませんでした"); });
  }

  // ---------- 初期化 ----------
  function bindEvents() {
    $("#btn-claim").addEventListener("click", claimAllowance);
    $("#btn-spend").addEventListener("click", function () { Snd.unlock(); resetSpend(); showView("view-spend"); });
    $("#btn-spend-back").addEventListener("click", function () { showView("view-main"); });
    $("#btn-spend-next").addEventListener("click", goToPay);

    $("#btn-pay-back").addEventListener("click", function () { showView("view-spend"); });
    $("#btn-pay-clear").addEventListener("click", clearPay);
    $("#btn-pay-confirm").addEventListener("click", confirmPay);

    $("#btn-adult").addEventListener("click", function () { Snd.unlock(); if (GATE_ENABLED) openGate(); else enterAdult(); });
    $("#btn-adult-back").addEventListener("click", function () { showView("view-main"); });
    $("#btn-open-wallet").addEventListener("click", function () { renderWalletEdit(); showView("view-wallet"); });
    $("#btn-wallet-back").addEventListener("click", function () { showView("view-adult"); });

    $("#gate-ok").addEventListener("click", checkGate);
    $("#gate-cancel").addEventListener("click", closeGate);
    $("#gate-input").addEventListener("keydown", function (e) { if (e.key === "Enter") checkGate(); });

    $("#btn-add-money").addEventListener("click", addMoney);
    $("#btn-save-allowance").addEventListener("click", saveAllowance);
    $("#btn-test-due").addEventListener("click", simulateAllowanceDay);
    $("#btn-save-name").addEventListener("click", saveName);
    $all('input[name="allow-interval"]').forEach(function (r) { r.addEventListener("change", toggleIntervalFields); });

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

    var changed = false;
    if (L.migrateWalletFromTransactions(state)) changed = true;
    if (L.ensureAllowanceBaseline(state, new Date())) changed = true;
    L.syncBalance(state);
    if (changed) persist();

    renderMain();
    renderWalletEdit();

    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
