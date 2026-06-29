/* storage.js — localStorage への保存・読込・初期化・バックアップ */
(function (global) {
  "use strict";

  var KEY = "okozukai_state";

  function defaultState() {
    return {
      version: 2,
      childName: "",
      balance: 0,
      // バーチャル財布：お金の種類(セント)ごとの枚数。残高の正解はこれ。
      wallet: { 1000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0 },
      allowance: {
        amount: 0,
        interval: "weekly",
        weekday: 1,
        monthday: 1,
        lastGrantedDate: null
      },
      // ユーザーが追加した費目（つかいみち）。{ id, icon, label }
      categories: [],
      transactions: []
    };
  }

  // 欠けているフィールドを既定値で補う（前バージョン互換）
  function normalize(state) {
    var def = defaultState();
    if (!state || typeof state !== "object") return def;
    var s = Object.assign({}, def, state);
    s.allowance = Object.assign({}, def.allowance, state.allowance || {});
    s.wallet = Object.assign({}, def.wallet, state.wallet || {});
    if (!Array.isArray(s.transactions)) s.transactions = [];
    if (!Array.isArray(s.categories)) s.categories = [];
    return s;
  }

  var OKStorage = {
    load: function () {
      try {
        var raw = global.localStorage.getItem(KEY);
        if (!raw) return defaultState();
        return normalize(JSON.parse(raw));
      } catch (e) {
        console.warn("読込に失敗しました。初期状態を使います。", e);
        return defaultState();
      }
    },

    save: function (state) {
      try {
        global.localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.error("保存に失敗しました。", e);
        return false;
      }
    },

    defaultState: defaultState,
    normalize: normalize,

    // バックアップ（ダウンロード）
    exportToFile: function (state) {
      var data = JSON.stringify(state, null, 2);
      var blob = new Blob([data], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var d = new Date();
      var stamp = d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, "0") +
        String(d.getDate()).padStart(2, "0");
      a.href = url;
      a.download = "okozukai-backup-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },

    // 復元（ファイル読込）：成功時 normalize 済み state を resolve
    importFromFile: function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          try {
            resolve(normalize(JSON.parse(reader.result)));
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsText(file);
      });
    }
  };

  global.OKStorage = OKStorage;
})(window);
