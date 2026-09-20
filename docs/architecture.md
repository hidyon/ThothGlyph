# アーキテクチャ

> **更新のタイミング**: 構成、変換の順序、状態の持ち方、依存のいずれかが変わったとき。
> 画面や操作が変わっただけなら [機能仕様](functional-spec.md) を直す。

## 1. 全体像

ブラウザだけで動く単一ページのアプリ。サーバ側の処理はない。

```
[ textarea ]  --source-->  [ App の state ]  --deferred-->  [ renderMarkdown ]  --html-->  [ プレビュー ]
      ^                          |
      |                          +--600msのデバウンス--> [ localStorage ]
      +--挿入-- [ 記号パレット ]

[ 数式の描画エンジン（KaTeX・marked・DOMPurify） ] は別チャンク。起動と同時に
取りに行き、届くまではプレビューが「準備中…」、パレットのラベルはLaTeXのソース。
```

状態は `App.tsx` の `source`（Markdownソース文字列）1つに集約する。
コンポーネントは自分で状態を持たない。例外はUIの一時的な状態だけ
（パレットの選択タブ、パレットの検索クエリ、コピーの結果表示）。
検索の絞り込みそのものは `lib/search.ts` の純粋関数で、コンポーネントは
結果を並べるだけ。

### 依存

| 依存 | チャンク | 役割 | 選んだ理由 |
|---|---|---|---|
| React 19 | 初期 | 画面 | `useDeferredValue` で重い描画を入力から切り離している |
| Vite 8 | — | 開発・ビルド | 設定を1つに保てる（Vitestと共有） |
| KaTeX 0.18 | 遅延 | 数式の描画 | 同期API。MathJaxより速く、依存が軽い |
| marked 18 | 遅延 | Markdownの変換 | 同期API、GFM対応 |
| DOMPurify 3 | 遅延 | サニタイズ | markedの出力を通す |
| Vitest 5 | — | 単体テスト | Viteの設定を共有できる |
| playwright-core 1.63 | — | 実機検証 | Chromiumはコンテナに焼いてある |

**状態管理ライブラリもUIフレームワークも入れない。** この規模ではReactの状態と
素のCSSで足りる。`@types/katex` は入れない（katex 0.18 が型定義を同梱していて衝突する）。

**TypeScriptは `strict` で通す。** `tsconfig.app.json`（`src/`）と
`tsconfig.node.json`（`vite.config.ts`）の両方で有効にしている
（[0026](specs/0026-typescript-strict.md)）。`null` の扱いを規律ではなく型で
縛るためで、`textarea?.selectionStart ?? source.length` のような防御は
この前提の上に立っている。

## 2. ディレクトリの役割

| 場所 | 役割 |
|---|---|
| `src/App.tsx` | 状態の集約。保存・挿入・復元の配線 |
| `src/components/` | 描画と配線だけ。ロジックを持たない |
| `src/lib/` | 純粋関数。テストはこの隣に置く |
| `src/lib/previewEngine.ts` / `engine.ts` | 数式の描画エンジンの遅延読み込み（下の「7. 読み込みの分割」） |
| `src/lib/expression.ts` / `graphBlock.ts` / `renderGraph.ts` | グラフ（式の評価・ブロックの解析・SVGの生成）（[0037](specs/0037-graph.md)） |
| `src/lib/findMatches.ts` | 文書内の検索・置換（一致の列挙と置換後の全文）（[0043](specs/0043-find-replace.md)） |
| `src/lib/highlightRanges.ts` | 検索の一致を塗る層に入れるHTML（[0043](specs/0043-find-replace.md)） |
| `src/lib/i18n.ts` / `messages.ts` | 2言語の文字列の型と、画面の文言 |
| `public/` | そのまま配られる静的ファイル。アイコンとmanifest |
| `scripts/verify-ui.mjs` | ヘッドレスChromiumでの実機検証 |
| `scripts/measure-load.mjs` | 本番ビルドの大きさと読み込み時間の実測 |
| `scripts/make-icons.mjs` | `favicon.svg` からPNGを書き出す |
| `docs/` | 要求・アーキテクチャ・機能・テストの4文書と、issue／issue仕様／振り返り |

コンポーネントに条件分岐やデータ加工を書かない。`lib/` の純粋関数に出して、
テストで固定できる形にする。

## 3. 変換パイプライン（`lib/renderMarkdown.ts`）

Markdownソースから表示用HTMLまでの順序。**この順序は変えない。**
このファイルは遅延チャンク側にある（「7. 読み込みの分割」）。

```
source
  │
  ├─1─ コード領域を切り分ける       splitByCode()
  │      フェンス（```/~~~）は行単位で走査、インラインコードは
  │      開き閉じのバッククォートの個数を合わせて判定
  │
  ├─2─ graphフェンスを退避           maskGraph()
  │      情報文字列が graph ちょうどのものだけ。退避先は
  │      %%MATHEDITOR_GRAPH_n%%（```graphql は対象外）
  │
  ├─3─ コードの外側だけ数式を退避     extractBlocks()
  │      $$...$$ を $...$ より先に見る。退避先は
  │      %%MATHEDITOR_MATH_n%% というプレースホルダ
  │
  ├─4─ Markdownを変換               marked.parse(gfm, breaks)
  │
  ├─5─ サニタイズ                   DOMPurify.sanitize()
  │
  ├─6─ グラフを差し戻す              restoreGraphs() → renderGraph
  │      生成したSVGは1つずつDOMPurifyを通してから入れる
  │
  └─7─ 数式を差し戻す                restoreFormulas() → KaTeX
         プレースホルダをKaTeXの出力HTMLで置き換える
```

順序に理由がある箇所:

- **3が4より先**: markedは `_` `*` `\` をMarkdown記法として解釈する。
  先に退避しないとLaTeXが壊れる。
- **2が3より先**: グラフのブロックの中の `$` を数式にしないため
  （コードの中の `$` を数式にしないのと同じ理由。[0037](specs/0037-graph.md)）。
- **1が2より先**: コードの中の `$` を数式にしないため（[0006](specs/0006-math-in-code.md)）。
  コード自体はプレースホルダへ逃がさず、そのままmarkedへ渡す。
  コードの解釈はmarkedに任せるほうが安全。
- **7が5より後**: KaTeXの出力にはMathMLの要素が含まれ、DOMPurifyを通すと
  描画に必要な要素が落ちる。KaTeXの出力は信頼できる（入力LaTeXはKaTeX側で
  エスケープされる）ので、サニタイズの後に差し戻す。
- **6のSVGはサニタイズを迂回しない**: グラフのSVGは `path` `line` `text` だけで、
  DOMPurifyのsvgプロファイルを通しても何も落ちないことを実測した（0037）。
  抜け道は5のKaTeXだけに保つ。

### KaTeXの呼び方

`throwOnError: false` で呼ぶ。入力途中の壊れた数式でプレビューが消えると編集
できないため、赤字（`#dc2626`）で見せる。`strict: false`。

### グラフの描画（[0037](specs/0037-graph.md)）

`lib/expression.ts`（式 → 関数）・`lib/graphBlock.ts`（ブロック → 関数と範囲）・
`lib/renderGraph.ts`（→ SVG文字列）の3つに分ける。いずれも純粋関数で、
`renderMarkdown.ts` からしか呼ばれないので**遅延チャンク側に入る**。

- **式の評価に `eval` と `new Function` を使わない。** 外から読み込んだ `.md`
  （[0012](specs/0012-file-load.md)）がそのままコードとして走る経路を作らない。
  トークナイザ → 逆ポーランド → 評価の3段で書く。
- **色と文字の大きさはSVGの属性に書かず、CSSで当てる**（`.graph__line--1` など）。
  ダークモードとメディアクエリで切り替えるため。SVG内の文字は図と一緒に縮むので、
  幅480px以下ではユーザー単位を上げて実寸を戻している。
- **`clipPath` を使わない。** `id` が文書内で衝突する。範囲外の点を打たないことで
  代用でき、その規則は漸近線（`1/x` `tan(x)`）の処理としても必要だった。
- 描画結果はブロック本文と表示言語をキーにキャッシュする（上限100件）。

**`renderMarkdown` は表示言語を受け取る**（`renderMarkdown(source, lang)`）。
グラフのエラー文言と `aria-label` が言語で変わるため。数式だけだった頃は
言語に依存しなかったので、`Engine` の型と `App` の `useMemo` の依存も変わっている。

### 数式の描画キャッシュ

LaTeX文字列と `displayMode` の組をキーに、KaTeXの出力をモジュールスコープの
`Map` に持つ（上限500件、超えたら挿入順に捨てる）。1文字打つたびに全体を描き
直すが、そのとき文書中の数式はほとんどが前回と同一であり、KaTeXの呼び出しが
描画コストの大半を占めるため。同じ入力からは同じ出力が返るので、
`renderMarkdown` は純粋関数のままである。

## 4. サニタイズの境界

信頼できない入力は「利用者が書いたMarkdown」と「貼り付けたHTML」。
これらは **5** のDOMPurifyを必ず通る。プロファイルは `html` / `mathMl` / `svg`。

**7** で差し戻すKaTeXの出力だけがサニタイズを迂回する。ここが唯一の抜け道なので、
KaTeXに渡す前のLaTeXを加工しない（加工するとエスケープの前提が崩れる）。
**6** のグラフのSVGは迂回しない（差し戻す前に1つずつDOMPurifyを通す。0037）。

`dangerouslySetInnerHTML` を使う箇所は**2つだけ**で、どちらも入口が決まっている。

1. `Preview` — 渡ってくるHTMLが上のパイプラインを通っていることが前提。
   他の経路からHTMLを渡さない。
2. `Editor` の検索の塗り層（[0043](specs/0043-find-replace.md)） —
   `lib/highlightRanges.ts` の `highlightHtml` が作った文字列だけを渡す。
   この関数は `mark` 以外の要素を作らず、`&` `<` `>` をエスケープする
   （単体テストで固定）。要素を並べる形をやめたのは速さのため（400件で
   1文字60ms → 38.9ms）。**他の文字列をこの層へ渡さない。**

## 5. 状態と永続化

### 画面の状態

`App.tsx` が持つのは `source`・保存状態（`saveState`）・テーマ（`theme`）・
表示言語（`lang`）。テーマと言語は木の下まで props で配る（コンテキストを置くほどの
深さでも件数でもない）。
プレビューへ渡す値は `useDeferredValue(source)` を通す。入力（textareaの更新）を
優先し、重い再描画をReactに後回しにさせるため。固定のデバウンス時間を置かないので、
端末の速さに応じて待ち時間が決まる。

表示中のHTMLが古い間（`deferredSource !== source`）は、プレビューのヘッダに
「更新中…」を出す。

### パレットからの挿入（[0021](specs/0021-undo.md)）

**挿入だけは、stateではなくDOMを先に変える。** `document.execCommand('insertText')`
でtextareaに入れ、そこで出る `input` イベントを `Editor` の `onChange` が拾って
`source` が更新される。ブラウザのUndo履歴に乗せる方法が他にないため
（`setRangeText` は履歴に乗らないことを実測した）。`execCommand` は非推奨APIなので、
**失敗したら `setSource` で全文を差し替える経路へ落ちる**（Undoは効かなくなるが、
挿入そのものは動く）。

`insertSnippet` は挿入後の全文に加えて「置き換える範囲と入れる文字列」を返す。
`App.tsx` の `insertIntoTextarea` が、その範囲を `setSelectionRange` で選んでから
`execCommand` を呼ぶ。**挿入の前後で選択を置き直すのはUndo単位を切るため**で、
省くとChromiumが打鍵と挿入をまとめ、「打つ→挿入→打つ」がCtrl+Z 1回で全部消える。

### 文書内の検索・置換（[0043](specs/0043-find-replace.md)）

**バーの開閉・検索語・置換語・何件目かは `Editor` / `FindBar` が持つ**
（パレットの検索クエリと同じ、UIの一時的な状態）。保存もしない。

**textareaを触る操作は `App.tsx` に置く。** `textareaRef` を持っているのが
`App` で、置換は挿入と同じ `insertIntoTextarea` を通す必要があるため（0021）。
`FindBar` は「この範囲を選びたい」「この範囲をこう置き換えたい」を渡すだけ。

- **一致を選ぶときフォーカスを奪わない。** 奪うと検索欄で打てなくなる。
  `setSelectionRange` はフォーカス無しでも効くので、スクロールだけ
  行の高さから計算して自分で寄せる。
- **一致は裏の層に塗る。** フォーカスの無いtextareaの選択はChromiumが
  描画しないため（実測）。層は `.editor` と**同じ書式でなければならない**
  （padding・font・line-height・折り返し）。末尾に改行を1つ足し、
  縦スクロールバーのぶん右を詰めて、折り返しを揃えている。
  塗るのはバーを開いていて一致があるときだけで、閉じている間は層を作らない。
- **すべて置換は全文を1回で差し替える**（`lib/findMatches.ts` の `replaceAll` が
  `start: 0, end: source.length` の形で返す）。1件ずつ置き換えると、
  Undoの回数が件数ぶんになる。

### 保存形式（`lib/documentStorage.ts`）

localStorageに1件だけ持つ。

```
キー: matheditor:document:v1
値:   { "version": 1, "source": "...", "savedAt": "2026-09-19T12:34:56.789Z" }
```

- キーの命名は `matheditor:<名前>:v<版>`。複数文書（[0004](issues/0004-multi-document.md)）へ
  移るときは名前と版を変える。
- 読み込み時に `version !== 1` や `source` が文字列でない場合は「保存なし」として扱う。
  壊れたデータで起動を壊さない。
- localStorageへのアクセスは例外を投げうる（プライベートウィンドウ、容量超過）。
  読み書きはすべて `try/catch` で囲み、**例外を呼び出し側に出さない**。
  `saveDocument` は成否を `boolean` で返す。

### テーマの保存

同じくlocalStorageに1件。キーは `matheditor:theme:v1`、値は
`{ "version": 1, "theme": "system" | "light" | "dark" }`。
読めない・知らない値なら `system`（OS追従）に落とす。

テーマは `<html>` の `data-theme` 属性で当てる。`system` のときは属性を外し、
CSSの `prefers-color-scheme` に任せる。

**`index.html` にインラインスクリプトが1つある。** 本体の読み込み前に
`data-theme` を当てないと、OSがライトで手動ダークを選んでいる場合に白が
一瞬見えるため（本番ビルドで実測20ms）。テーマの扱いがReactの外にも出る
唯一の箇所で、保存キーと値の形が `lib/themeStorage.ts` と重複している。
片方を変えるときは両方直す。

### 表示言語（`lib/i18n.ts` / `lib/langStorage.ts`）

言語は `ja` / `en` の2状態。テーマの `system` にあたる「自動」を持たないのは、
追従する相手（使用中に変わる設定）がないため。保存がないときの既定を
`navigator.language` から決めるだけにしてある（`detectLang()`）。

保存はlocalStorageに1件。キーは `matheditor:lang:v1`、値は
`{ "version": 1, "lang": "ja" | "en" }`。読めない・知らない値なら `detectLang()` に落とす。

**翻訳は元の文字列の隣に書く。** 辞書ファイルを別に持たない。

```ts
type Text = { ja: string; en: string }
{ label: '\\sqrt{x}', snippet: …, title: t('平方根', 'Square root') }
```

記号や公式を1件足すときに触るファイルを1つに保つため（パレットはデータ駆動、
という約束）。画面の枠の文言だけは `lib/messages.ts` にまとめてある。

**語順が言語で変わる文は関数にする。** `平方根（選択範囲を囲む）` と
`Square root (wraps selection)` は、名前と説明を連結しては作れない。
`messages.wrapsSelection(name)` のように、文ごと2言語で書く。

`<html lang>` は表示中の言語に合わせる。テーマと同じく `index.html` の
インラインスクリプトで先に当て（Reactのマウントを待つと読み上げや翻訳判定が
一瞬ずれる）、Reactからも更新する。ここも保存キーと既定の決め方が
`lib/langStorage.ts` と重複している。片方を変えるときは両方直す。

### アイコン（`public/`）

`public/favicon.svg` が**唯一の原本**。PNG4件（32 / 180 / 192 / 512）は
`scripts/make-icons.mjs` がヘッドレスChromiumで書き出す。

**PNGを手で作らない。** 手で作るとSVGを直したときPNGだけ古くなる。
**ビルド時にも生成しない。** devcontainerの外でもChromiumが要ることになる。
生成物はコミットし、作り直しは手で流す（`node scripts/make-icons.mjs`）。

ツールバーにも同じ記号を出すが、**パスを書き写さない**。
`Toolbar.tsx` は `<img src="/favicon.svg">` で原本を参照する（書き写すと
favicon を直したときに片方だけ古くなる）。アイコンが自前の地を持つので、
文字色を継がせる必要がなく `<img>` で足りる。

記号は直線3本のパスで描き、`<text>` を使わない（見る側のフォントに依存して
字形が変わるか消える）。地は不透明な角丸正方形にしてあり、
ライト／ダークの判定をブラウザに任せない。`apple-touch-icon.png` だけは
角丸を落として書き出す（iOSが自分で丸めるため、付けると角が二重に落ちる）。

### 保存のタイミング

- `source` が変わってから600ms入力が止まったら保存する（localStorageは同期APIなので
  1文字ごとには書かない）。
- `beforeunload` で、デバウンス待ちの内容を書き切る。
- 復元した内容（初回訪問ならサンプル文書）をそのまま保存し直さない。判定は
  「最後に保存した内容」との比較で行う。「初回レンダリングか」で判定すると
  React StrictModeの二重マウントで破れる。

### ファイルの読み込み（`lib/loadMarkdownFile.ts`、[0012](specs/0012-file-load.md)）

外から来たテキストが `source` に入る唯一の経路。順番は
**判定 → 確認 → 読み取り → 正規化 → `setSource`** で固定する。

- 判定（`checkFile`）は名前と大きさだけで決める。読む前に断れるものを
  読んでから断らない。MIMEタイプを見ないのは、OSによって `.md` のtypeが空になるため。
- 確認（`window.confirm`）は読み取りの前に出す。断られたファイルを読む理由がない。
- 正規化（`normalizeText`）でBOMと改行を落としてから `setSource` に渡す。
  ここを通さずに `setSource` を呼ぶ経路を作らない（CRLFのまま入ると、
  保存・復元でカーソル位置がずれる）。
- 読み取り（`File.text()`）だけがブラウザのAPIで、`App.tsx` に置く。
  判定と正規化は純粋関数として `lib/` に出し、単体テストで確かめる。

読み込みは自動保存の特別扱いをしない。`setSource` した後は、通常の入力と同じ
デバウンスに乗って保存される。

### ファイルの書き出し（`lib/downloadName.ts`、[0034](specs/0034-file-save.md)）

読み込みと同じ切り分けで、**名前と中身を決める純粋関数**（`fileNameFor` /
`contentFor` / `isEmptySource`）を `lib/` に置き、Blobと `<a download>` を使う
部分だけ `App.tsx` に残す。

- File System Access API を使わないのは、Safari・Firefoxが対応していないため。
- `URL.revokeObjectURL` はクリックの直後ではなく次のタスクで呼ぶ
  （早すぎるとダウンロードが始まらないブラウザがある）。
- 書き出した `.md` は、そのまま読み込み（0012）に通る形にしておく。
  この往復は検証の区分 `file-save` の1件で確かめている。

## 6. 開発環境

devcontainer内で開発する（`.devcontainer/`）。Node 22 と検証用Chromiumをイメージに
焼いてあり、ホストに何が入っているかに依存しない。Viteの `server.host` は消さない
（コンテナ内で 0.0.0.0 にバインドしないとホストのブラウザから届かない）。
検証スクリプトに `executablePath` を書かない（`PLAYWRIGHT_BROWSERS_PATH` から
playwright-coreが自力で見つける）。

## 7. 読み込みの分割（[0024](specs/0024-bundle-size.md)）

JSを2つに分けている。

```
初期チャンク : React + アプリ本体（Toolbar / Editor / SymbolPalette の骨組み）+ アプリのCSS
遅延チャンク : KaTeX + marked + DOMPurify + renderMarkdown + グラフの描画 + KaTeXのCSS
```

`lib/engine.ts` が遅延チャンクの入口で、**ここから静的にたどれるものが遅延側に入る**。
`lib/previewEngine.ts` の `loadEngine()` が `import('./engine')` を1回だけ走らせ、
結果を使い回す。`App` が受け取って `Preview` と `SymbolPalette` へ props で配る。

**取得は利用者の操作を待たず、`main.tsx` でReactのマウント前に始める。**
「必要になってから読む」にすると、初期チャンクの評価 → 遅延チャンクの取得が
直列になり、プレビューが出るまでが分割前より遅くなる。

届くまでの間:

- エディタ・自動保存・テーマ・言語は初期チャンクだけで動く。
- プレビューは本文が空で、ヘッダに `準備中…`。
- パレットのラベルはLaTeXのソース（`.palette__source`）。押せば挿入は効く。
  **幅は描画後のボタンに合わせて詰めてある**（40px、溢れは省略記号）。
  そのまま出すとボタンが広がって段数が増え、届いた瞬間にパレットが縮む。

エンジンの取得に失敗しても**エディタは使えたままにする**（書いたものを失わせない）。
`loadEngine()` は失敗したPromiseを捨てるので、次に呼ばれたらもう一度試せる。

実装前後（`node scripts/measure-load.mjs`）:

| | 初期JS | 初期CSS | textareaまで（Fast 3G + CPU 4倍） | 数式まで |
|---|---|---|---|---|
| 分割前 | 579.98 kB（gzip 180.50） | 36.09 kB | 1964 ms | 2021 ms |
| 分割後 | 243.20 kB（gzip 76.82） | 6.32 kB | 1085 ms | 1939 ms |

## 関連

- [要求仕様](requirements.md) — なぜこの構成なのか
- [機能仕様](functional-spec.md) — この構成の上で何ができるか
- [テスト仕様](test-spec.md) — どこをテストで、どこを実機で守るか
