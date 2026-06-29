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
- おさいふのお金は**本物のシンガポール通貨写真**を使用：紙幣 $2/$5/$10/$50（`assets/money/note-{2,5,10}.jpeg` / `note-50.png`）、硬貨 $1/50¢/20¢/10¢/5¢（`assets/money/coin-*.jpg`）。`.money__val` テキストは非表示で額面は写真に内蔵（`css/styles.css` の `.denom-*`）。denom種別は `logic.js` の `DENOMS`/`DENOM_META`（$50=5000セント）。
- 支払い画面（`view-pay`）は2ゾーン方式：上が「だす おかね」トレイ（`#pay-tray`、初期は空）、下が「おさいふ」（`#wallet-pay`）。おさいふの実物をタップするとトレイへ、トレイの実物をタップするとおさいふへ、`flyTile`（FLIP）でスッとスライドする（`app.js` の `renderPay`/`renderPayZone`/`makePayTile`/`movePayCoin`/`flyTile`）。1種類が `STACK_MAX`(=12)枚を超える時だけ1枚＋枚数バッジにまとめる。サマリーは「だす おかね」（=トレイ合計。まだ未払い）。実際の支払いは「けってい」で `OKLogic.spend` を呼んで確定。
- 残高カード（`#balance-card`）はタップでフリップ（`rotateY(180deg)`）し、裏面に財布の中身を支払い画面と同じ実物イラストで枚数ぶん並べる（`renderWalletView`）。枚数が多いと裏面の高さに合わせてカードが伸びる（`cardShowFront`/`cardShowBack`/`cardSyncHeight`、`.balance-card__inner` の height トランジション）。
- 「なにに つかった？」の費目は組み込み（おかし/ジュース/おもちゃ/ほん/ゆうぐ/そのほか）＋ユーザー追加分。ユーザー費目は設定の「🏷️ 費目（つかいみち）の追加」で絵文字を選び名前（maxlength 6）を入力して追加（`OKLogic.addCategory`/`removeCategory`、`state.categories` に保存、`allCategories` で「そのほか」を末尾に並べる）。支払い時に費目名・アイコンを取引へ焼き込む（`tx.catLabel`/`tx.icon`）ので、費目を後で削除しても履歴表示は壊れない（`txMeta` が焼き込み値を優先）。ユーザー入力は `esc()` でエスケープして表示。
- メインの主ボタンは「おかいもの」、履歴見出しは「さいきんの おかいもの」。支払い前画面（`view-spend`）の見出しは「いくら つかう？」。
- 設定画面は保護者用（子どもには触らせない運用、表記は通常の日本語）。「財布の中身」は誤操作防止のため設定内のボタンから別画面 `view-wallet` に遷移して編集する。「履歴の訂正」は各行の「削除」で取引をキャンセルできる（`OKLogic.reverseTransaction`：取引で動いた硬貨・紙幣〔`tx.coins`〕とおつり〔`tx.change`〕を使って、買い物なら使った現金を財布に戻し、入金なら受け取った現金を取り消す。残高も連動して変わる）。
- 計算ゲートは `GATE_ENABLED=false` で無効化中（コードは残置、再有効化可）。トップのアイコンは 👛（おさいふ）。

## 動作確認
- `python -m http.server 8000`（または `npx serve`）で配信してブラウザで確認するのが確実。
  PWA / serviceWorker は http/https でのみ有効（`file://` では自動的に無視される）。

## 共通方針
- ワークスペース全体の方針（git 操作は Claude 側、コミットは節目で提案、日本語可）は
  上位の `Claude_Workspace/CLAUDE.md` に従う。
