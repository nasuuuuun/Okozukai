/* logic.js — 残高（バーチャル財布）・お金の両替/支払い・おこづかいの予定・カテゴリ
   残高の唯一の正解は「財布の中身（硬貨・紙幣の枚数）」。balance = 財布の合計。
   金額はすべてセント単位の整数。硬貨は5¢が最小なので金額は5¢単位に丸める。 */
(function (global) {
  "use strict";

  // 組み込みの費目（先頭〜「そのほか」の手前まで）。ユーザー費目はこの間に差し込む。
  var CATEGORIES = [
    { id: "okashi",   icon: "🍬", label: "おかし" },
    { id: "juice",    icon: "🥤", label: "ジュース" },
    { id: "omocha",   icon: "🧸", label: "おもちゃ" },
    { id: "hon",      icon: "📖", label: "ほん" },
    { id: "yuugu",    icon: "🎠", label: "ゆうぐ" },
    { id: "other",    icon: "🛍️", label: "そのほか" }
  ];
  var OTHER_CATEGORY = { id: "other", icon: "🛍️", label: "そのほか" };

  // 組み込み＋ユーザー費目（「そのほか」を必ず末尾に）
  function allCategories(state) {
    var builtin = CATEGORIES.slice(0, CATEGORIES.length - 1);
    var custom = (state && Array.isArray(state.categories)) ? state.categories : [];
    return builtin.concat(custom).concat([OTHER_CATEGORY]);
  }
  // id から費目を引く。組み込み→ユーザー費目の順。見つからなければ「そのほか」。
  function categoryById(id, state) {
    var i;
    for (i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    if (state && Array.isArray(state.categories)) {
      for (i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i];
    }
    return OTHER_CATEGORY;
  }
  // ユーザー費目の追加・削除
  function addCategory(state, icon, label) {
    if (!Array.isArray(state.categories)) state.categories = [];
    label = String(label || "").trim().slice(0, 6);
    if (!label) return null;
    var cat = {
      id: "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      icon: icon || "🛍️",
      label: label
    };
    state.categories.push(cat);
    return cat;
  }
  function removeCategory(state, id) {
    if (!Array.isArray(state.categories)) return;
    state.categories = state.categories.filter(function (c) { return c.id !== id; });
  }

  // ---- お金の種類（セント・大きい順） ----
  var DENOMS = [5000, 1000, 500, 200, 100, 50, 20, 10, 5];
  var DENOM_META = {
    5000: { cents: 5000, label: "$50",  type: "note" },
    1000: { cents: 1000, label: "$10",  type: "note" },
    500:  { cents: 500,  label: "$5",   type: "note" },
    200:  { cents: 200,  label: "$2",   type: "note" },
    100:  { cents: 100,  label: "$1",   type: "coin" },
    50:   { cents: 50,   label: "50¢",  type: "coin" },
    20:   { cents: 20,   label: "20¢",  type: "coin" },
    10:   { cents: 10,   label: "10¢",  type: "coin" },
    5:    { cents: 5,    label: "5¢",   type: "coin" }
  };

  function emptyWallet() { var w = {}; DENOMS.forEach(function (d) { w[d] = 0; }); return w; }
  function roundTo5(cents) { return Math.round(cents / 5) * 5; }
  function walletBalance(w) { var s = 0; DENOMS.forEach(function (d) { s += d * (w[d] || 0); }); return s; }

  // 金額を硬貨・紙幣に両替（大きい順の貪欲法。5¢単位前提）
  function denomsBreakdown(cents) {
    cents = roundTo5(cents);
    var out = {};
    DENOMS.forEach(function (d) {
      var n = Math.floor(cents / d);
      out[d] = n;
      cents -= n * d;
    });
    return out;
  }
  function walletAdd(w, cents) {
    var b = denomsBreakdown(cents);
    DENOMS.forEach(function (d) { w[d] = (w[d] || 0) + b[d]; });
    return b;
  }

  // ---- 日付ヘルパー（日単位） ----
  function toDateOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseYMD(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function formatYMD(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // ---- トランザクション（履歴ログ。残高は財布から算出するので履歴は表示用） ----
  function makeTx(t) {
    return {
      id: "tx_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      date: (t.date instanceof Date ? t.date : new Date()).toISOString(),
      type: t.type,
      amount: Math.round(Math.abs(t.amount)),
      category: t.category || null,
      icon: t.icon || null,
      catLabel: t.catLabel || "", // 費目名を履歴に焼き込む（費目を後で消しても表示が壊れないように）
      note: t.note || "",
      coins: t.coins || null,      // この取引で動いた硬貨・紙幣の内訳（入金=入った枚数 / 支払=払った枚数）
      change: Math.round(t.change || 0) // 支払い時のおつり（セント）。逆戻しでこの分の硬貨を取り消す
    };
  }
  function addTransaction(state, t) { var tx = makeTx(t); state.transactions.unshift(tx); return tx; }
  function removeTransaction(state, id) {
    state.transactions = state.transactions.filter(function (tx) { return tx.id !== id; });
  }

  // 残高を財布から同期
  function syncBalance(state) { state.balance = walletBalance(state.wallet); return state.balance; }

  // 財布から金額を差し引く（残高リセット＋再両替方式）
  function walletSub(w, cents) {
    var cur = walletBalance(w);
    if (cur < cents) return false;
    var remaining = roundTo5(cur - cents);
    DENOMS.forEach(function (d) { w[d] = 0; });
    if (remaining > 0) walletAdd(w, remaining);
    return true;
  }

  // 取引を逆戻しして財布を更新（履歴削除＝取引キャンセルの際に使う）
  // coins が記録されていれば、その取引で実際に動いた硬貨・紙幣をそのまま戻す/取り消す。
  // 古いデータ（coins なし）は金額ベースの貪欲法でフォールバック。
  function reverseTransaction(state, tx) {
    if (tx.type === "spend") {
      if (tx.coins) {
        // 払った硬貨・紙幣をおさいふに戻す
        DENOMS.forEach(function (d) { state.wallet[d] = (state.wallet[d] || 0) + (tx.coins[d] || 0); });
        // 受け取ったおつりの硬貨は取り消す（足りなければ0で止める）
        var ch = denomsBreakdown(tx.change || 0);
        DENOMS.forEach(function (d) { state.wallet[d] = Math.max(0, (state.wallet[d] || 0) - (ch[d] || 0)); });
      } else {
        walletAdd(state.wallet, tx.amount);
      }
    } else if (tx.type === "add" || tx.type === "allowance") {
      if (tx.coins) {
        // 入金で入った硬貨・紙幣を取り消す（足りなければ0で止める）
        DENOMS.forEach(function (d) { state.wallet[d] = Math.max(0, (state.wallet[d] || 0) - (tx.coins[d] || 0)); });
      } else {
        walletSub(state.wallet, tx.amount);
      }
    }
    syncBalance(state);
  }

  // ---- 入金（足す・おこづかい受取）：金額を両替して財布へ＋履歴 ----
  function deposit(state, cents, type, meta) {
    cents = roundTo5(cents);
    if (cents <= 0) return null;
    var added = walletAdd(state.wallet, cents); // 入った硬貨・紙幣の内訳
    var tx = addTransaction(state, { type: type, amount: cents, icon: meta && meta.icon, note: (meta && meta.note) || "", coins: added });
    syncBalance(state);
    return tx;
  }

  // ---- 支払い：payCoins(種類→枚数)を財布から出し、ねだんとの差額をおつりとして戻す ----
  function spend(state, priceCents, payCoins, catId, icon, label) {
    priceCents = roundTo5(priceCents);
    var paid = 0;
    var used = {};
    DENOMS.forEach(function (d) {
      var n = payCoins[d] || 0;
      if (n > 0) used[d] = n; // 実際に払った硬貨・紙幣を記録
      state.wallet[d] = Math.max(0, (state.wallet[d] || 0) - n);
      paid += d * n;
    });
    var change = paid - priceCents;
    if (change > 0) walletAdd(state.wallet, change);
    addTransaction(state, { type: "spend", amount: priceCents, category: catId, icon: icon, catLabel: label || "", coins: used, change: change });
    syncBalance(state);
    return { change: change };
  }

  // ---- おこづかいの予定 ----
  function countGrants(last, today, a) {
    var count = 0;
    var cur = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    cur.setDate(cur.getDate() + 1);
    var guard = 0;
    while (cur <= today && guard < 3660) {
      if (a.interval === "weekly") { if (cur.getDay() === a.weekday) count++; }
      else { if (cur.getDate() === Math.min(Math.max(a.monthday, 1), 28)) count++; }
      cur.setDate(cur.getDate() + 1); guard++;
    }
    return count;
  }
  function firstPendingDate(last, today, a) {
    var cur = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    cur.setDate(cur.getDate() + 1);
    var guard = 0;
    while (cur <= today && guard < 3660) {
      if (a.interval === "weekly") { if (cur.getDay() === a.weekday) return cur; }
      else { if (cur.getDate() === Math.min(Math.max(a.monthday, 1), 28)) return cur; }
      cur.setDate(cur.getDate() + 1); guard++;
    }
    return null;
  }
  function pendingCount(state, now) {
    var a = state.allowance;
    if (!a || a.amount <= 0 || !a.lastGrantedDate) return 0;
    return countGrants(parseYMD(a.lastGrantedDate), toDateOnly(now || new Date()), a);
  }
  function claimOneAllowance(state, now) {
    var a = state.allowance;
    if (!a || a.amount <= 0 || !a.lastGrantedDate) return false;
    var d = firstPendingDate(parseYMD(a.lastGrantedDate), toDateOnly(now || new Date()), a);
    if (!d) return false;
    a.lastGrantedDate = formatYMD(d);
    deposit(state, a.amount, "allowance", { icon: "🗓️", note: "おこづかい" });
    return true;
  }
  function ensureAllowanceBaseline(state, now) {
    var a = state.allowance;
    if (a && a.amount > 0 && !a.lastGrantedDate) {
      a.lastGrantedDate = formatYMD(toDateOnly(now || new Date()));
      return true;
    }
    return false;
  }
  function setAllowance(state, cfg) {
    var a = state.allowance;
    var wasInactive = a.amount <= 0;
    a.amount = Math.max(0, roundTo5(cfg.amount || 0));
    a.interval = cfg.interval === "monthly" ? "monthly" : "weekly";
    a.weekday = Math.min(Math.max(cfg.weekday != null ? cfg.weekday : a.weekday, 0), 6);
    a.monthday = Math.min(Math.max(cfg.monthday != null ? cfg.monthday : a.monthday, 1), 28);
    if (a.amount > 0 && (wasInactive || !a.lastGrantedDate)) a.lastGrantedDate = formatYMD(toDateOnly(new Date()));
    if (a.amount <= 0) a.lastGrantedDate = null;
  }

  // ---- 旧バージョン（財布なし）データの移行：財布が空なら履歴の収支から硬貨を作る ----
  function migrateWalletFromTransactions(state) {
    if (walletBalance(state.wallet) !== 0) return false;
    var legacy = 0;
    state.transactions.forEach(function (t) {
      if (t.type === "add" || t.type === "allowance") legacy += t.amount;
      else if (t.type === "spend") legacy -= t.amount;
    });
    legacy = roundTo5(legacy);
    if (legacy > 0) { walletAdd(state.wallet, legacy); syncBalance(state); return true; }
    return false;
  }

  global.OKLogic = {
    CATEGORIES: CATEGORIES, categoryById: categoryById, allCategories: allCategories,
    addCategory: addCategory, removeCategory: removeCategory,
    DENOMS: DENOMS, DENOM_META: DENOM_META, emptyWallet: emptyWallet,
    roundTo5: roundTo5, walletBalance: walletBalance, denomsBreakdown: denomsBreakdown, walletAdd: walletAdd,
    walletSub: walletSub,
    makeTx: makeTx, addTransaction: addTransaction, removeTransaction: removeTransaction,
    syncBalance: syncBalance, deposit: deposit, spend: spend,
    reverseTransaction: reverseTransaction,
    countGrants: countGrants, pendingCount: pendingCount, claimOneAllowance: claimOneAllowance,
    ensureAllowanceBaseline: ensureAllowanceBaseline, setAllowance: setAllowance,
    migrateWalletFromTransactions: migrateWalletFromTransactions,
    formatYMD: formatYMD, parseYMD: parseYMD
  };
})(window);
