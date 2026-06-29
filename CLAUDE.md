# Okozukai（おこづかいちょう）プロジェクト固有ルール

子どものお小遣い管理アプリ。**スマホを主対象**にしたプレーンな Web アプリ。

## 技術スタック
- 素の HTML / CSS / JavaScript（**ビルドなし・フレームワークなし・依存パッケージなし**）。
- `index.html` を直接開く方式（Asset_Manager と同様）。`npm` は使わない。
- JS は ES5 互換のグローバル名前空間（`OKStorage` / `OKLogic` / `OKSound`）で分割。
  module ではなく `<script>` 直読みなので、`file://` でも動く。

## データと保存
- 保存先は **localStorage の 1 キー `okozukai_state`**（JSON）。サーバー・ログインなし。
- **通貨はシンガポールドル。記号は `$`。金額はすべて「セント単位の整数」で保存・計算**し、表示時のみ `$X.XX` に整形（`app.js` の `money()`/`fmtAmt()`/`numPart()`、入力は `dollarsToCents()`）。子ども画面の「つかう」テンキーは電卓方式（数字＝ドル、小数点ボタン以降＝セント2桁）。
- **残高 `balance` は `transactions` から都度再計算**（`OKLogic.recompute`）。トランザクションが唯一の正解。直接 balance を書き換えない。

## 残高モデル（最重要・壊さないこと）
- `add`（臨時追加）/ `allowance`（おこづかい受取）：`balance += amount`
- `spend`：`balance -= amount`
- **おこづかいは自動加算しない**。予定日が来たらメインに「もらう」ボタンを出し、タップで1回分を加算（`pendingCount` / `claimOneAllowance`、基準日は `ensureAllowanceBaseline`）。
- ※ 立替トラッカー・支払い方法(現金/カード)・自動付与は廃止済み。`recompute` 内に残る `method`/`collect`/`advanceOwed` の処理は**旧バックアップ取込みのための互換用**。新規には作られない。

## UI 方針
- スマホ縦・大きなタッチ領域。子どもが読める大きな数字＋絵＋アニメ＋効果音。
- 効果音は WebAudio で生成（音声ファイルを持たない）。アイコンは絵文字＋CSS。
- おさいふの紙幣($2/$5/$10)・硬貨($1〜5¢)は自作SVGイラスト（`assets/money/note-*.svg` / `coin-*.svg`）。額面は画像内に描き込み、`.money__val` テキストは非表示、チップには「のこり数」バッジのみ表示（`css/styles.css` の `.denom-*`）。ラスター画像は持たない方針は維持。
- 設定画面は保護者用（子どもには触らせない運用）。計算ゲートは `GATE_ENABLED=false` で無効化中（コードは残置、再有効化可）。トップのアイコンは 👛（おさいふ）。

## 動作確認
- `python -m http.server 8000`（または `npx serve`）で配信してブラウザで確認するのが確実。
  PWA / serviceWorker は http/https でのみ有効（`file://` では自動的に無視される）。

## 共通方針
- ワークスペース全体の方針（git 操作は Claude 側、コミットは節目で提案、日本語可）は
  上位の `Claude_Workspace/CLAUDE.md` に従う。
