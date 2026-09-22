# アーキテクチャ

> **更新のタイミング**: 構成、変換の順序、状態の持ち方、依存のいずれかが変わったとき。
> 画面や操作が変わっただけなら [機能仕様](functional-spec.md) を直す。

## 1. 全体像

ブラウザだけで動く単一ページのアプリ。サーバ側の処理はない。

```
[ textarea ]  --source-->  [ App の state ]  --deferred-->  [ renderMarkdown ]  --html-->  [ プレビュー ]
      ^                          |
      |                          +--600msのデバウンス--> [ localStorage ]
      +--挿入-- [ 記号パレット ]（幅1200px以上では左の縦帯。0054）

[ 数式の描画エンジン（KaTeX・marked・DOMPurify） ] は別チャンク。起動と同時に
取りに行き、届くまではプレビューが「準備中…」、パレットのラベルはLaTeXのソース。
```

状態は `App.tsx` の `source`（Markdownソース文字列）1つに集約する。
コンポーネントは自分で状態を持たない。例外はUIの一時的な状態だけ
（パレットの選択タブ、パレットの検索クエリ、コピーの結果表示）。
**保存する設定**（テーマ・表示言語・領域の分け方（[0057](specs/0057-resizable-panes.md)））は
別の系統で、それぞれ `lib/` に読み書きの純粋関数を持ち、`App.tsx` が state として抱える。
文書の内容ではないので `source` には混ぜない。
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
  ├─3─ コードの外側だけ数式と参照を退避 extractBlocks()
  │      $$...$$ を $...$ より先に見る。退避先は
  │      %%MATHEDITOR_MATH_n%% というプレースホルダ。
  │      式への参照（[(1)](#eq-ラベル)）も %%MATHEDITOR_REF_n%% へ（0044）
  │
  ├─4─ Markdownを変換               parseWithLines() → marked
  │      トークンに分けて1つずつ解析し、トップレベルのブロックに
  │      data-line（元ソースの行番号）を差し込む（0010）
  │
  ├─4.5 参照を差し戻す               restoreRefs()
  │      ラベルから番号を引いてリンクを作る（0044）。5を通す
  │
  ├─5─ サニタイズ                   DOMPurify.sanitize()
  │
  └─6─ グラフと数式を差し戻す         restoreBlocks() → renderGraph / KaTeX
         プレースホルダをKaTeXの出力HTMLとSVGで置き換え、数式は
         .math-anchor で包んで元ソースの位置を持たせる（0020）。
         SVGは入れる前に1つずつDOMPurifyを通す
```

順序に理由がある箇所:

- **3が4より先**: markedは `_` `*` `\` をMarkdown記法として解釈する。
  先に退避しないとLaTeXが壊れる。
- **2が3より先**: グラフのブロックの中の `$` を数式にしないため
  （コードの中の `$` を数式にしないのと同じ理由。[0037](specs/0037-graph.md)）。
- **1が2より先**: コードの中の `$` を数式にしないため（[0006](specs/0006-math-in-code.md)）。
  コード自体はプレースホルダへ逃がさず、そのままmarkedへ渡す。
  コードの解釈はmarkedに任せるほうが安全。
- **6のKaTeXが5より後**: KaTeXの出力にはMathMLの要素が含まれ、DOMPurifyを通すと
  描画に必要な要素が落ちる。KaTeXの出力は信頼できる（入力LaTeXはKaTeX側で
  エスケープされる）ので、サニタイズの後に差し戻す。
- **6のSVGはサニタイズを迂回しない**: グラフのSVGは `path` `line` `text` だけで、
  DOMPurifyのsvgプロファイルを通しても何も落ちないことを実測した（0037）。
  抜け道は5のKaTeXだけに保つ。
- **4.5の参照は5より前**: 作るのは `<a href="#eq-1">(1)</a>` だけなので、
  他のHTMLと一緒に5を1回通せば足りる。**1件ずつ `sanitize` を呼ぶと重い**
  （参照100件の文書で1文字52.4ms。N1の50msを超えた）。
- **6は1度の走査でまとめて差し戻す**。1件ずつ `replaceAll` を呼ぶと、1件に
  つきHTML全体を1回走査することになり件数に比例して重くなる。
  置換をコールバックで書くことで、置換文字列の `$&` の特別扱いも避けている。

### 行番号の埋め込み（[0010](specs/0010-scroll-sync.md)）

4でトップレベルのブロックに `data-line="N"`（元ソースの行番号、1始まり）を付ける。
スクロールの同期が、出力のどこがソースの何行目かを知るための目印。

- `marked.lexer()` でトークンに分け、**トークンごとに `marked.parser([token])`**
  して先頭の開始タグへ属性を差し込む。トークンの `raw` を連結すると入力と
  完全に一致するので、足し上げた長さがそのトークンの開始位置になる。
  参照リンクの定義はlexerの状態（`tokens.links`）に載るので、1件ずつ渡すときも
  持たせる。
- **行番号は2と3の退避より前のソースで数える。** プレースホルダは元より短く、
  `$$...$$` は複数行を1行に畳む。`extractBlocks` が「退避後の位置 ↔ 元の位置」の
  対応表（`lib/lineMap.ts` の `OffsetMap`）を返し、そこから元の行番号へ引き直す。
- 付けるのは**トップレベルのブロックだけ**。`li` や `td` には付けない
  （アンカーが数千件になると計測のコストが入力の体感に出る）。
- 属性は5のサニタイズを通っても残る（DOMPurifyは `data-*` を落とさない）。
  6・7で差し戻すKaTeXとSVGには付かない。

### 数式の位置の埋め込み（[0020](specs/0020-preview-click-to-edit.md)）

7で差し戻すKaTeXの出力を `<span class="math-anchor">` で包み、**元ソース上の
「中身の範囲」**を `data-math-start` / `data-math-end` に持たせる。
`source.slice(start, end)` がKaTeXへ渡したLaTeXそのものになる（デリミタの
内側で、前後の空白を除いた範囲）。プレビューのクリックからソースの位置を
指すための目印。

- **`data-line` では足りない。** 1行に数式が2つある場合に区別できない。
- 位置は退避のときに数える。`extractBlocks` は元ソースの位置を既に追っている
  （`offsets` のため）ので、そこからデリミタのぶん内側へ入り、`trim` で
  落ちた空白を詰める。
- **包むのは描画キャッシュの外側。** キャッシュのキーはLaTeXと `displayMode`
  のままで、同じ式が別の位置にあっても効く。
- 属性に入るのは自前で数えた整数2つだけで、利用者の入力は入らない。
  サニタイズを迂回する経路（4節）を広げていない。
- ブロック数式のラッパには `math-anchor--block` が付き、CSSで `display: block`
  になる。中の `.katex-display` は中央寄せのブロックなので、inline のまま
  包むと輪郭が行ボックスに沿って引かれ、式とずれた位置に出る。
- ラッパは `display: inline-block`。**inline のままだと当たり判定が狭く**、
  数式の隙間のクリックが段落に取られる（Playwrightのhit-target checkで検出）。
  行の高さぶんに広がるだけで、段落の位置もプレビューの高さも変わらないことを
  実測した（幅1440pxでプレビュー1016px、段落の上端すべて同じ）。

### 式の番号と参照（[0044](specs/0044-equation-numbers.md)）

**`\tag{ラベル}` を書いたブロック数式だけ**を、文書順に1から採番する。
採番する式では `\tag{…}` を**LaTeXから外して**KaTeXへ渡し、番号は
`<span class="eq-number">(1)</span>` としてラッパの中に出す。

- **KaTeXの `\tag` に描かせない。** `\tag` は `mtable width="100%"` を作るので、
  幅が足りないと式と番号が重なる（幅360pxで実測）。外しておけば、ラッパを
  flexにして「式のほうをブロック内で横スクロールさせ、番号は右端に残す」
  ことができる。
- **採番しないもの**: インライン数式（KaTeXが
  `\tag works only in display equations` を返す）、`\tag` が2つ以上ある式
  （`Multiple \tag`）、中身が空の `\tag{}`。**どれもLaTeXを加工せず、
  KaTeXの見せ方に任せる**（黙って直すと誤りが見えなくなる）。
- アンカーは `id="eq-<番号>"`。**HTMLに入るのは自前で数えた数字だけで、
  ラベル（利用者の入力）は入らない。** 0020のデータ属性と同じで、
  サニタイズを迂回する経路（4節）を広げない。
  markedがリンク先をpercent-encodeする（`#eq-解の公式` → `#eq-%E8%A7%A3…`）
  ことへの対処も要らなくなる。
- 参照（`[(1)](#eq-ラベル)`）は、リンク先を `#eq-<番号>` に、文字列が
  `(数字)` ちょうどならその数字を現在の番号に差し替える。**ラベルが
  見つからないときは何もしない**（書いたまま残り、押しても飛ばない）。
- **番号はラッパ側に出るので、描画キャッシュのキーは `\tag` を外した
  LaTeXでよい。** 同じ式に別のラベルを付けた2件はKaTeXの出力を共有できる。
- ラベル→番号は文書を最後まで見ないと決まらない（前方参照がある）ので、
  退避のときは中身を控えるだけにし、差し戻しのときに引く。

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
表示言語（`lang`）と、プレビューで選んだ数式（`activeMath`。0020。印を出す先で
保存しない）。テーマと言語は木の下まで props で配る（コンテキストを置くほどの
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

### 参照をたどる（[0044](specs/0044-equation-numbers.md)）

プレビューの中で `#eq-` で始まるリンクを押すと、**プレビューの中でその式へ
寄せ、式に0020の印を出す**。ブラウザのハッシュ遷移は起こさない（URLを変えず、
戻る先も作らない）。

**ソースのカーソルと選択範囲には触らない。** 読み返している最中に編集位置を
失わないため（スクロールの同期と同じ線）。数式そのもののクリック（0020）は
ソースを選ぶが、参照はたどるだけ、と役割を分けている。

### プレビューからの編集（[0020](specs/0020-preview-click-to-edit.md)）

プレビューの数式をクリックすると、ソースのその中身が選ばれる。
`Preview` はクリックを `.math-anchor` へ引き当てて範囲を渡すだけで、
**textareaを触る操作は `App` に置く**（検索・置換と同じ切り分け）。

- **ここではフォーカスを奪う。** 0043の検索とは逆で、打ち込む先を横取り
  しないうえ、フォーカスが無いとChromiumは選択を描画せず、選ばれたことが
  画面で分からない。
- **見えている位置なら寄せない。** 寄せるとエディタのscrollが上の同期を
  動かし、いま見ていた数式がプレビューの中で逃げる。寄せの計算は検索と
  共通（`scrollToOffset`）。
- 選んだ数式の印（`math-anchor--active`）は `App` が state で持ち、
  `Preview` がレンダリングのたびにDOMへ当て直す（HTMLは文字列で流し込むので、
  描き直すと class が落ちる）。
- **印は `source` が変わったら消す。** 消す場所は `updateSource`
  （`setSource` を包む唯一の入口）で、効果ではなく変更のイベント側に置く。
  編集すると位置がずれ、印がどこを指していたのかが意味を失う。

### スクロールの同期（[0010](specs/0010-scroll-sync.md)）

ソースとプレビューが連動して動く。**双方向**で、逆方向で動かすのは
スクロール位置だけ（カーソルと選択範囲には触れない）。

```
プレビューの [data-line]        ミラーの span[data-line]
   ↓ 行番号と y 座標              ↓ 行番号と y 座標
        pairAnchors() ──→ 「y座標どうしの対応表」
                              ↓ mapScroll()
                      相手の scrollTop
```

- **行番号は突き合わせの鍵にしか使わない。** 対応表にしてしまえば、逆方向は
  `from` と `to` を入れ替えるだけで同じ `mapScroll` が使える。
  補間の計算は `lib/scrollMap.ts` に1つだけある。
- **`<textarea>` は行の座標を返さない**ので、同じ書式の要素（`.editor-mirror`）を
  裏に置いて測る。書式は `.editor` と同じCSSルールにまとめてあり、
  **1文字ぶんも違えてはならない**（0043の塗る層と同じ制約）。
  中身はReactではなく計測のときに `innerHTML` で入れる
  （31 kBの文字列を打鍵のたびに描き直さないため）。
- **測るのはスクロールが来たときだけ。** 内容や大きさが変わったら印を立てるに
  留め、次のスクロールで測り直す（400節で約20msかかる）。
- **ループは「自分が書いた値を覚えておく」ことで止める。** 相手の `scrollTop` に
  書いたあと**読み戻した値**を控え、返ってきた `scroll` がその値なら無視する。
  読み戻すのは、端で丸められたときに要求値と食い違わないようにするため。
  フラグを `requestAnimationFrame` で下ろす形は、`scroll` とrAFの前後関係が
  1フレーム内で保証されないので採っていない。
- 端どうしは必ず合う。`mapScroll` は**スクロールで届かないアンカー**
  （最後の画面に入るブロック）を落としてから終端の組を足す。
  落とさないと最下端にしても手前に留まる（実測で50px）。

### 保存形式（`lib/documentStorage.ts`）

localStorageに1件だけ持つ。

```
キー: thothglyph:document:v1
値:   { "version": 1, "source": "...", "savedAt": "2026-09-19T12:34:56.789Z" }
```

- キーの命名は `thothglyph:<名前>:v<版>`。複数文書（[0004](issues/0004-multi-document.md)）へ
  移るときは名前と版を変える。
- 読み込み時に `version !== 1` や `source` が文字列でない場合は「保存なし」として扱う。
  壊れたデータで起動を壊さない。
- localStorageへのアクセスは例外を投げうる（プライベートウィンドウ、容量超過）。
  読み書きはすべて `try/catch` で囲み、**例外を呼び出し側に出さない**。
  `saveDocument` は成否を `boolean` で返す。

### テーマの保存

同じくlocalStorageに1件。キーは `thothglyph:theme:v1`、値は
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

保存はlocalStorageに1件。キーは `thothglyph:lang:v1`、値は
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

## 8. ビルドの出力は2つある（[0074](specs/0074-file-protocol.md)）

| コマンド | 出力 | 形 | 配り方 |
|---|---|---|---|
| `npm run build` | `dist/` | ESモジュール。上の分割のまま（初期268.85 kB + 遅延340.62 kB） | HTTPで配る |
| `npm run build:file` | `dist-file/` | **1本のIIFE**（app.js 602.8 kB）。CSSも1つ | `index.html` を直接開く |

**`file://` ではESモジュールが使えない。** パスの問題ではなく、origin が `null`
になるためモジュールの取得そのものがCORSで拒否される（`--base=./` でも同じ）。
そこで `vite.config.file.ts` では次の3つをしている。

1. `format: 'iife'` + `inlineDynamicImports` で1本にまとめる
   （動的importも `file://` では同じ理由で止まるため）
2. `base: './'` で隣を指す
3. HTMLの `<script type="module" crossorigin>` を `<script defer>` に書き換える。
   **`defer` は必須** —— classic script はモジュールと違って defer されないので、
   付けないと `#root` より先に走って React が落ちる

**分割（第7節）を捨てていない**のは、`準備中…`（エンジンが届く前でも打てる）と
要求仕様N10（初期JSは300 kB以下）がその上に乗っているため。`file://` は
ローカルディスクから読むので回線の話にならず（数式まで301ms。HTTPの分割版は273ms）、
**配り方ごとに出力を分けるほうが安い**という判断。

`dist-file/` の確認は `node scripts/verify-file-build.mjs`。`verify-ui.mjs` は
開発サーバに向いているので分けてある。

**`dist-file/` はリポジトリで追跡している**（`dist/` は追跡しない）。
GitHubから落としてそのまま `index.html` を開けるようにするため。
出力のファイル名にハッシュを付けていない（`app.js` 固定）ので差分は中身だけだが、
**ソースを変えたら `npm run build:file` して commit し直すこと。**
忘れると古い出力が配られる。

## 関連

- [要求仕様](requirements.md) — なぜこの構成なのか
- [機能仕様](functional-spec.md) — この構成の上で何ができるか
- [テスト仕様](test-spec.md) — どこをテストで、どこを実機で守るか
