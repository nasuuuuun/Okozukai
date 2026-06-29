# Okozukai（おこづかいちょう）プロジェクト固有ルール

子どものお小遣い管理アプリ。**スマホを主対象**にしたプレーンな Web アプリ。

## 技術スタック
- 素の HTML / CSS / JavaScript（**ビルドなし・フレームワークなし・依存パッケージなし**）。
- `index.html` を直接開く方式（Asset_Manager と同様）。`npm` は使わない。
- JS は ES5 互換のグローバル名前空間（`OKStorage` / `OKLogic` / `OKSound`）で分割。
  module ではなく `<script>` 直読みなので、`file://` でも動く。

## データと保存
- 保存先は **localStorage の 1 キー `okozukai_state`**（JSON）。サーバー・ログインなし。
- **通貨はシンガポールドル（SGD）。金額はすべて「セント単位の整数」で保存・計算**し、表示時のみ `S$X.XX` に整形（`app.js` の `money()`/`fmtAmt()`/`numPart()`、入力は `dollarsToCents()`）。子ども画面のテンキーはレジ方式（押した数字がセントとして積み上がる）。
- **残高 `balance` と立替残 `advanceOwed` は `transactions` から都度再計算する**のが原則
  （`OKLogic.recompute`）。トランザクションが唯一の正解。直接 balance を書き換えない。

## 立替モデル（最重要・壊さないこと）
- `add` / `allowance`：`balance += amount`
- `spend` + `method="cash"`：`balance -= amount`（立替は不変）
- `spend` + `method="card"`：`balance -= amount` かつ `advanceOwed += amount`
- `collect`：`advanceOwed -= amount`（**balance は変えない**）

## UI 方針
- スマホ縦・大きなタッチ領域。子どもが読める大きな数字＋絵＋アニメ＋効果音。
- 効果音は WebAudio で生成（音声ファイルを持たない）。アイコンは絵文字＋CSS（画像を持たない）。
- おとなメニューは簡単な計算ゲートで保護。

## 動作確認
- `python -m http.server 8000`（または `npx serve`）で配信してブラウザで確認するのが確実。
  PWA / serviceWorker は http/https でのみ有効（`file://` では自動的に無視される）。

## 共通方針
- ワークスペース全体の方針（git 操作は Claude 側、コミットは節目で提案、日本語可）は
  上位の `Claude_Workspace/CLAUDE.md` に従う。
