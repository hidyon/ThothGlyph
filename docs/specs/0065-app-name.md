# 0065: アプリの名前を ThothGlyph にする

- 対応issue: [0065](../issues/0065-app-name.md)
- 状態: implemented
- 作成日: 2026-09-21

## 目的

このアプリは `matheditor` と名乗っている。これは名前ではなく種別の説明で、
同じ説明が当てはまる道具はいくつもある。**名前は `ThothGlyph`（トトグリフ）に
決まった**（由来は [README](../../README.md#名前)、表記規則は
[要求仕様 1](../requirements.md#1-誰のための道具か)）。

利用者から見て変わるのは、タブのタイトル・ツールバーの表示・インストール時の
名前が `ThothGlyph` になること。**書いたもの、テーマ、言語、領域の幅は、名前が
変わっても今までどおり残る**（localStorageのキーは変えるが、古いキーから
読み継ぐ）。

## 仕様

### 1. 表記

**`ThothGlyph`。`T` と `G` を大文字にし、他は小文字。** 日本語表記は
「トトグリフ」だが、**画面にはラテン文字の `ThothGlyph` だけを出す**
（日本語表示でもカタカナにしない。固有名詞を言語ごとに分けると `i18n` 区分の
「文言の全件が日英の両方を持つ」に名前まで乗るため）。

**小文字だけにするのは、大文字を使えない2か所**に限る。

| 用途 | 表記 | 理由 |
|---|---|---|
| 画面・`<title>`・manifest・文書 | `ThothGlyph` | 固有名詞として読ませる |
| npm のパッケージ名 | `thothglyph` | npmが大文字を許さない |
| localStorage のキー接頭辞 | `thothglyph:` | パッケージ名と揃える |

### 2. 画面とメタデータ

| 場所 | 変更後 |
|---|---|
| `index.html` の `<title>` | `ThothGlyph` |
| `src/components/Toolbar.tsx` の `<h1 className="toolbar__title">` | `ThothGlyph` |
| `package.json` の `name` | `thothglyph` |
| `public/manifest.webmanifest` の `name` / `short_name` | `ThothGlyph` |
| `public/favicon.svg` の `aria-label` / `<title>` | `ThothGlyph` |
| `CLAUDE.md` の見出し | `# ThothGlyph` |

**ツールバーの見た目の変化（実測、2026-09-21）**

測定条件は、幅721px と 1440px × 日本語と英語、**保存状態がいちばん長い
「保存しました 05:47」/「Saved at 05:47」が出ている状態**、
`system-ui` 600 16px。4条件すべてで同じ値になった。

| 文字列 | 幅 × 高さ | matheditor との差 |
|---|---|---|
| `matheditor`（現在） | 102.4 × 19px | — |
| **`ThothGlyph`（変更後）** | **105.8 × 19px** | **+3.4px** |

**名前は3.4px広くなる。** 幅721px（名前が表示される最小の幅）で、
ツールバーもページも横スクロールは出ていない（`scrollWidth` と `clientWidth` が
どちらも721で一致）。

幅720px以下では `h1` は 1 × 1px。`src/index.css:841`（`@media (max-width: 720px)`）が
`clip-path` で視覚的にだけ隠しているためで、**この隠す挙動は変えない**
（隠す理由は0031の実測「幅600pxの余白は19px」に基づく。`ThothGlyph` は
`matheditor` より長いので、出せるようになったわけではない）。

### 3. localStorage のキー

接頭辞を `matheditor:` から **`thothglyph:`** に変える。対象は4つ。

| 旧キー | 新キー |
|---|---|
| `matheditor:document:v1` | `thothglyph:document:v1` |
| `matheditor:theme:v1` | `thothglyph:theme:v1` |
| `matheditor:lang:v1` | `thothglyph:lang:v1` |
| `matheditor:panes:v1` | `thothglyph:panes:v1` |

**版（`v1`）は上げない。** 中身の形は何も変わらないので、版を上げると
「読めない古い版」として捨てる既存の分岐（`documentStorage.test.ts` の
「版違い」）に引っかかり、移行したいデータを自分で捨てることになる。

**読み継ぎ（移行）の規則**

読み出しは次の順で行う。

1. 新キーを読む。読めたらそれを使う（旧キーは見ない）。
2. 新キーがなければ旧キーを読む。読めたら**その値を新キーに書き、旧キーを消す**。
3. どちらもなければ、これまでどおりの既定値。

書き出しは**常に新キーだけ**。移行の読み書きが例外を投げても、外へ出さずに
既定値で続ける（[要求 R3](../requirements.md#r3-書いたものが消えない)：
保存の失敗で編集が止まらない）。

`index.html` の初期化スクリプト（テーマと言語を、画面が描かれる前に読む部分）も
新キー→旧キーの順で読む。**ここでは書き込みと削除をしない**（移行はReactが
起動してから1回で済ませる。描画前のスクリプトに書き込みを足すと、初期表示の
ちらつき（[N6](../requirements.md#3-非機能要求)）を測る対象が増える）。

### 対象ファイル

| ファイル | すること |
|---|---|
| `index.html` | `<title>`。初期化スクリプトのキーを新旧2段読みにする |
| `src/components/Toolbar.tsx` | `<h1>` の文字列とコメント |
| `package.json` / `package-lock.json` | `name`（lockは `npm install` で追従させる） |
| `public/manifest.webmanifest` | `name` / `short_name` |
| `public/favicon.svg` | `aria-label` / `<title>` |
| `src/lib/documentStorage.ts` | キー定数と、読み継ぎ |
| `src/lib/themeStorage.ts` | 同上 |
| `src/lib/langStorage.ts` | 同上 |
| `src/lib/paneSizes.ts` | 同上 |
| `src/lib/*.test.ts`（上の4つ） | キー定数の更新と、読み継ぎのテスト追加 |
| `scripts/verify-ui.mjs` | キー定数の更新と、`name` 区分の追加 |
| `scripts/make-screenshots.mjs` | キー定数の更新 |
| `.devcontainer/devcontainer.json` | コンテナ名とボリューム名（下の「devcontainer」） |
| `CLAUDE.md` | 見出し |
| `docs/functional-spec.md` | ツールバーの図（14・33行目）、名前が隠れる説明（46行目）、`panes` のキー（29行目） |
| `docs/architecture.md` | localStorageのキー4か所（276・280・290・309行目） |
| `README.md` のスクリーンショット3枚 | `node scripts/make-screenshots.mjs` で撮り直す（ツールバーに名前が写るため） |

**過去の仕様（`docs/specs/` の他のファイル）と過去のissue（`docs/issues/`）は
書き換えない。** これらは「そのとき何を決めたか」の記録で、現在の姿を書いた
4文書とは役割が違う（[CLAUDE.md](../../CLAUDE.md) の「4文書は現在の姿、
issue仕様は変更の単位」）。`matheditor` が出てくるのは、当時そう呼んでいた
という事実のまま残す。

### devcontainer

`.devcontainer/devcontainer.json` には2か所ある。

| 行 | 現在 | 変更後 | 影響 |
|---|---|---|---|
| 2 | `"name": "matheditor"` | `"ThothGlyph"` | VSCodeに出るコンテナ名が変わるだけ |
| 21 | `source=matheditor-node-modules` | `source=thothglyph-node-modules` | **別のボリュームになるので、次のリビルドで `node_modules` が空から入り直す** |

ボリューム名も変える。名前を一貫させるのが目的の issue で、ここだけ旧名を
残す理由がない。**代償はリビルド1回ぶんの `npm install` の時間**で、
利用者には影響しない（開発環境のみ）。古いボリューム
`matheditor-node-modules` は残るので、手元で不要になったら消す。

## 未確認の前提

- **`public/favicon.svg` の `<title>` を変えてもアイコンの描画は変わらない**
  （`<title>` は読み上げ用で、[0019](../specs/0019-app-icon.md) が測っている
  白インク量・実効線幅には効かない）と考えているが、確かめていない。
  実装後に `icon` 区分（14件）を流して確かめる。
- **`package.json` の `name` を変えても `npm run dev` / `build` に影響しない**
  と考えているが、確かめていない。`package-lock.json` の1行目と8行目にも
  同じ名前が入っているので、`npm install` で追従させる必要がある。
- **ボリューム名を変えると次のリビルドで `node_modules` が空になる**と
  考えているが、実際にリビルドして確かめてはいない。

## 受け入れ基準

**単体テスト（`npm test`）** — 4つのストレージの読み継ぎ

- [x] 新キーだけがあるとき、その値が読まれる（4ファイルそれぞれ）
- [x] 旧キーだけがあるとき、その値が読まれ、**新キーに書かれ、旧キーが消える**
- [x] 新旧の両方があるとき、**新キーの値が読まれ、旧キーは見られない**
- [x] 旧キーの値が壊れているとき、既定値になる（例外を投げない）
- [x] `localStorage` が例外を投げる環境でも、移行が例外を外に出さない

**実機検証（`node scripts/verify-ui.mjs name`）** — 新しい `name` 区分

- [x] `<title>` が `ThothGlyph` になっている
- [x] 幅1440pxでツールバーの `h1` の文字列が `ThothGlyph`、幅が100〜110px（実測105.8px）
- [x] 幅721pxで横スクロールが出ない（保存状態「保存しました hh:mm」が出ている状態で、日英とも）
- [x] 幅720pxで `h1` が 1×1px のまま（隠す挙動が変わっていない）
- [x] 幅360px・600pxでページの横スクロールが出ない
- [x] `manifest.webmanifest` の `name` と `short_name` が `ThothGlyph`
- [x] **旧キー `matheditor:document:v1` に文書を置いて開くと、その文書が出る**
- [x] そのリロード後、`thothglyph:document:v1` に値があり、`matheditor:document:v1` が消えている
- [x] 旧キーにダークを置いて開くと、ダークで表示され、**初期表示でライトがちらつかない**
- [x] 旧キーに英語を置いて開くと、英語で表示される
- [x] 旧キーにペイン幅を置いて開くと、その幅で表示される
- [x] 移行後に文書を編集すると `thothglyph:document:v1` が更新され、リロードで復元する

**回帰（既存の区分をすべて流す）**

- [x] `node scripts/verify-ui.mjs` が全377件OK（キー定数を変えた影響で落ちない）
- [x] `icon` 区分14件がOK（favicon の `<title>` 変更が描画に効いていない）

**文書と成果物（残ったもので判定する）**

- [x] `grep -rn matheditor docs/requirements.md docs/architecture.md docs/functional-spec.md docs/test-spec.md`
      が、種別の説明としての言及（要求仕様）以外に何も出さない
- [x] `node scripts/make-screenshots.mjs` で撮り直した3枚のツールバーに
      `ThothGlyph` と写っている（幅1440pxのライト・ダークの2枚。幅360pxの1枚は
      名前が隠れるので、隠れたままであることを見る）
- [ ] devcontainerをリビルドしても `npm run dev` が起動する
      → **未確認。** 実装はコンテナの中で行っており、自分が入っているコンテナを
      建て直せない。次にリビルドする人が確かめる。`node_modules` が空から
      入り直すぶん、初回は時間がかかる。

**目視**

- [ ] 手元のブラウザでタブに `ThothGlyph` と出る（faviconのタブ表示はDOMの外なので、
      [0019](../specs/0019-app-icon.md) と同じくここだけ目で見ると決める）
      → **未確認。** ヘッドレスChromiumからはタブを見られない。`<title>` が
      `ThothGlyph` であることは `name` 区分で確認済み。

**前提**

- [x] `npm run build` と `npm run lint` が通る

## 実装で分かったこと

**`icon` 区分のチェックが `manifest.name === 'matheditor'` を判定条件に含んでいた**
（`scripts/verify-ui.mjs`、ラベルは「manifestが192と512のアイコンを宣言している」）。
名前を変えた時点でここが落ちた。**自分の変更が起こした回帰なので、その場で
`'ThothGlyph'` に更新した。** チェック自体は消していない（名前の判定は `name` 区分にも
あるが、「前回までのチェックは消さない」に従って両方に残す）。

**言語の読み継ぎは、英語ではなく日本語で確かめないと意味がない。** 仕様を書いた
時点では「旧キーに英語を置いて開くと英語で表示される」としていたが、
**ヘッドレスChromiumの `navigator.language` は英語なので、読み継ぎが効かなくても
英語になる**。基準を「旧キーに `ja` を置いて日本語で表示される」に変えた
（既定が英語だから、日本語が出れば移行が効いた証拠になる）。

**読み継ぎの検証には専用のブラウザコンテキストが要る。** `verify-ui.mjs` は
表示言語を固定するために `addInitScript` で**新キーに `ja` を置く**ので、共有の
ページでは「旧キーだけがある」状態を作れない。`name` 区分の移行チェックだけ
`browser.newContext()` で別のコンテキストを作っている。そのコンテキストには
言語固定がないため英語表示になり、保存状態の待ち受けは
`/保存しました|Saved at/` の形にした。

**テストのスタブに `removeItem` が要る。** 既存の `window.localStorage` スタブは
`getItem` / `setItem` の2つだけだった。読み継ぎが旧キーを消すので、4つの
テストファイルすべてに `removeItem` を足した（なくても例外は外に出ないが、
旧キーが消えず「写したあと旧キーが消えている」が確かめられない）。

## 検討したが採らなかった案

**画面でも全部小文字の `thothglyph` にする。** npmのパッケージ名やキーと表記が
完全に揃う。採らなかったのは、`thothglyph` と続けて書くと **Thoth と glyph の
切れ目が見えず、神の名が入っていることが読み取れない**ため。名前の由来が
読めないなら、この名前を選んだ意味が薄れる。

**localStorageのキーを `matheditor:` のまま据え置く。** 変更の量は最も小さく、
移行のコードも要らない。採らなかったのは、[要求仕様 1](../requirements.md#1-誰のための道具か)
に「すべてでこの表記に従う」と書いた直後にキーだけ旧名が残ると、次に誰かが
見たときに**どちらが正しいのか判断できない**ため。移行は読み出し1か所の分岐で済む。

**旧キーを消さずに残す。** 読み継いだあとも旧キーを残せば、古い版に戻したときに
データが見える。採らなかったのは、同じデータが2か所にあると、以後どちらが新しいか
分からなくなるため。移行は「新キーに書いてから旧キーを消す」順で行い、
書けなかったときは消さない。

**版を `v2` に上げる。** 中身の形が変わっていないので上げる理由がなく、
上げると既存の「版違いは捨てる」分岐に自分で引っかかる。

**日本語表示のときだけ「トトグリフ」と出す。** 固有名詞を翻訳対象にすることになり、
`i18n` 区分の「文言の全件が日英の両方を持つ」という検査に名前まで乗る。
日本語表記は文書の中だけで使う。

## スコープ外

- **アイコンの図柄**（[0019](../specs/0019-app-icon.md) で決めた白インク量・
  実効線幅の基準がある）。名前が変わっても図柄は変えない。トキ（トトの化身）や
  グリフを図柄に取り込む案は、やるなら別issueで基準から引き直す。
- **ドメインの取得と公開。**
