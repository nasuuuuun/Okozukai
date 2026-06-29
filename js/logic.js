/* logic.js — 残高の更新ルール、おこづかいの予定/受け取り、カテゴリ定義
   ※ 立替トラッカー・支払い方法(現金/カード)・自動付与は廃止。recompute 内の
     method/collect/advanceOwed は旧バックアップ取込み用の互換処理として残置。 */
(function (global) {
  "use strict";

  var CATEGORIES = [
    { id: "okashi",   icon: "🍬", label: "おかし" },
    { id: "juice",    icon: "🥤", label: "ジュース" },
    { id: "omocha",   icon: "🧸", label: "おもちゃ" },
    { id: "hon",      icon: "📖", label: "ほん" },
    { id: "game",     icon: "🎮", label: "ゲーム" },
    { id: "bunbougu", icon: "✏️", label: "ぶんぼうぐ" },
    { id: "gacha",    icon: "🎰", label: "ガチャ" },
    { id: "other",    icon: "🛍️", label: "そのほか" }
  ];

  function categoryById(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return { id: "other", icon: "🛍️", label: "そのほか" };
  }

  // ---- 日付ヘルパー（時刻を持たない日単位で扱う） ----
  function toDateOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseYMD(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function formatYMD(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  // ---- トランザクション生成 ----
  function makeTx(t) {
    return {
      id: "tx_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      date: (t.date instanceof Date ? t.date : new Date()).toISOString(),
      type: t.type,
      amount: Math.round(Math.abs(t.amount)),
      category: t.category || null,
      icon: t.icon || null,
      method: t.method || null,
      note: t.note || ""
    };
  }

  // ---- 残高・立替を transactions から再計算（唯一の正解は transactions） ----
  function recompute(state) {
    var balance = 0, owed = 0;
    state.transactions.forEach(function (tx) {
      if (tx.type === "add" || tx.type === "allowance") {
        balance += tx.amount;
      } else if (tx.type === "spend") {
        balance -= tx.amount;
        if (tx.method === "card") owed += tx.amount; // 親が立替 → 子が返すべき現金
      } else if (tx.type === "collect") {
        owed -= tx.amount; // 親が現金を回収
      }
    });
    state.balance = balance;
    state.advanceOwed = owed;
    return state;
  }

  // ---- トランザクション追加（新しい順で先頭に） ----
  function addTransaction(state, t) {
    var tx = makeTx(t);
    state.transactions.unshift(tx);
    recompute(state);
    return tx;
  }

  function removeTransaction(state, id) {
    state.transactions = state.transactions.filter(function (tx) { return tx.id !== id; });
    recompute(state);
  }

  // ---- 自動おこづかい：未付与の回数を数える ----
  // (last, today] の範囲で、付与条件に合致する日数を数える
  function countGrants(last, today, a) {
    var count = 0;
    var cur = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    cur.setDate(cur.getDate() + 1);
    var guard = 0;
    while (cur <= today && guard < 3660) {
      if (a.interval === "weekly") {
        if (cur.getDay() === a.weekday) count++;
      } else {
        var md = Math.min(Math.max(a.monthday, 1), 28);
        if (cur.getDate() === md) count++;
      }
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return count;
  }

  // 起動時に呼ぶ。たまっている分をまとめて付与。付与回数を返す。
  function grantDueAllowance(state, now) {
    var a = state.allowance;
    if (!a || a.amount <= 0) return 0;
    var today = toDateOnly(now || new Date());

    if (!a.lastGrantedDate) {
      // 初回は基準日だけ設定し、付与はしない
      a.lastGrantedDate = formatYMD(today);
      return 0;
    }

    var last = parseYMD(a.lastGrantedDate);
    var n = countGrants(last, today, a);
    for (var i = 0; i < n; i++) {
      addTransaction(state, {
        type: "allowance",
        amount: a.amount,
        icon: "🗓️",
        note: "じどうおこづかい"
      });
    }
    if (n > 0) a.lastGrantedDate = formatYMD(today);
    return n;
  }

  // last の次の付与日（today まで）を1つ返す。なければ null。
  function firstPendingDate(last, today, a) {
    var cur = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    cur.setDate(cur.getDate() + 1);
    var guard = 0;
    while (cur <= today && guard < 3660) {
      if (a.interval === "weekly") {
        if (cur.getDay() === a.weekday) return cur;
      } else {
        var md = Math.min(Math.max(a.monthday, 1), 28);
        if (cur.getDate() === md) return cur;
      }
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return null;
  }

  // 未受取の回数（「おこづかいをもらう」ボタンを出すか判定）
  function pendingCount(state, now) {
    var a = state.allowance;
    if (!a || a.amount <= 0 || !a.lastGrantedDate) return 0;
    return countGrants(parseYMD(a.lastGrantedDate), toDateOnly(now || new Date()), a);
  }

  // 1回分だけ受け取る（ボタンタップで呼ぶ）。受け取ったら true。
  function claimOneAllowance(state, now) {
    var a = state.allowance;
    if (!a || a.amount <= 0 || !a.lastGrantedDate) return false;
    var today = toDateOnly(now || new Date());
    var d = firstPendingDate(parseYMD(a.lastGrantedDate), today, a);
    if (!d) return false;
    a.lastGrantedDate = formatYMD(d);
    addTransaction(state, { type: "allowance", amount: a.amount, icon: "🗓️", note: "おこづかい" });
    return true;
  }

  // 基準日が未設定なら今日に（初回オープン時に呼ぶ）。設定したら true。
  function ensureAllowanceBaseline(state, now) {
    var a = state.allowance;
    if (a && a.amount > 0 && !a.lastGrantedDate) {
      a.lastGrantedDate = formatYMD(toDateOnly(now || new Date()));
      return true;
    }
    return false;
  }

  // おこづかいの予定設定を保存（金額>0 で初めて有効化したら基準日を今日に）
  function setAllowance(state, cfg) {
    var a = state.allowance;
    var wasInactive = a.amount <= 0;
    a.amount = Math.max(0, Math.round(cfg.amount || 0));
    a.interval = cfg.interval === "monthly" ? "monthly" : "weekly";
    a.weekday = Math.min(Math.max(cfg.weekday != null ? cfg.weekday : a.weekday, 0), 6);
    a.monthday = Math.min(Math.max(cfg.monthday != null ? cfg.monthday : a.monthday, 1), 28);
    if (a.amount > 0 && (wasInactive || !a.lastGrantedDate)) {
      a.lastGrantedDate = formatYMD(toDateOnly(new Date()));
    }
    if (a.amount <= 0) a.lastGrantedDate = null;
  }

  global.OKLogic = {
    CATEGORIES: CATEGORIES,
    categoryById: categoryById,
    makeTx: makeTx,
    recompute: recompute,
    addTransaction: addTransaction,
    removeTransaction: removeTransaction,
    grantDueAllowance: grantDueAllowance,
    setAllowance: setAllowance,
    countGrants: countGrants,
    pendingCount: pendingCount,
    claimOneAllowance: claimOneAllowance,
    ensureAllowanceBaseline: ensureAllowanceBaseline,
    formatYMD: formatYMD,
    parseYMD: parseYMD
  };
})(window);
