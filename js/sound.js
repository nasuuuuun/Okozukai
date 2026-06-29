/* sound.js — WebAudio で効果音を生成（音ファイル不要） */
(function (global) {
  "use strict";

  let ctx = null;
  let enabled = true;

  function ac() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) { enabled = false; return null; }
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) {
      enabled = false;
      return null;
    }
  }

  // 1音を鳴らす
  function tone(freq, start, dur, type, gainPeak) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak || 0.18, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const OKSound = {
    // ユーザー操作時に1度呼んでおくと、その後の自動再生が安定する
    unlock: function () { ac(); },
    setEnabled: function (v) { enabled = !!v; },

    // お金が減る（つかう）：下降コインチャリン
    spend: function () {
      tone(880, 0, 0.12, "triangle", 0.16);
      tone(587, 0.08, 0.18, "triangle", 0.14);
    },

    // お金が増える（たす）：上昇キラッ
    add: function () {
      tone(659, 0, 0.12, "triangle", 0.16);
      tone(988, 0.09, 0.18, "triangle", 0.15);
    },

    // お祝い（自動おこづかい・入金など）：明るいアルペジオ
    cheer: function () {
      const notes = [523, 659, 784, 1047];
      notes.forEach(function (f, i) { tone(f, i * 0.1, 0.22, "triangle", 0.15); });
    },

    // 軽いタップ音
    tap: function () { tone(660, 0, 0.05, "sine", 0.08); }
  };

  global.OKSound = OKSound;
})(window);
