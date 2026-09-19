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
```

状態は `App.tsx` の `source`（Markdownソース文字列）1つに集約する。
コンポーネントは自分で状態を持たない。例外はUIの一時的な状態だけ
（パレットの選択タブ、コピーの結果表示）。

### 依存

| 依存 | 役割 | 選んだ理由 |
|---|---|---|
| React 19 | 画面 | `useDeferredValue` で重い描画を入力から切り離している |
| Vite 8 | 開発・ビルド | 設定を1つに保てる（Vitestと共有） |
| KaTeX 0.18 | 数式の描画 | 同期API。MathJaxより速く、依存が軽い |
| marked 18 | Markdownの変換 | 同期API、GFM対応 |
| DOMPurify 3 | サニタイズ | markedの出力を通す |
| Vitest 5 | 単体テスト | Viteの設定を共有できる |
| playwright-core 1.63 | 実機検証 | Chromiumはコンテナに焼いてある |

**状態管理ライブラリもUIフレームワークも入れない。** この規模ではReactの状態と
素のCSSで足りる。`@types/katex` は入れない（katex 0.18 が型定義を同梱していて衝突する）。

## 2. ディレクトリの役割

| 場所 | 役割 |
|---|---|
| `src/App.tsx` | 状態の集約。保存・挿入・復元の配線 |
| `src/components/` | 描画と配線だけ。ロジックを持たない |
| `src/lib/` | 純粋関数。テストはこの隣に置く |
| `scripts/verify-ui.mjs` | ヘッドレスChromiumでの実機検証 |
| `docs/` | 要求・アーキテクチャ・機能・テストの4文書と、issue／issue仕様／振り返り |

コンポーネントに条件分岐やデータ加工を書かない。`lib/` の純粋関数に出して、
テストで固定できる形にする。

## 3. 変換パイプライン（`lib/renderMarkdown.ts`）

Markdownソースから表示用HTMLまでの順序。**この順序は変えない。**

```
source
  │
  ├─1─ コード領域を切り分ける       splitByCode()
  │      フェンス（```/~~~）は行単位で走査、インラインコードは
  │      開き閉じのバッククォートの個数を合わせて判定
  │
  ├─2─ コードの外側だけ数式を退避     extractFormulas()
  │      $$...$$ を $...$ より先に見る。退避先は
  │      %%MATHEDITOR_MATH_n%% というプレースホルダ
  │
  ├─3─ Markdownを変換               marked.parse(gfm, breaks)
  │
  ├─4─ サニタイズ                   DOMPurify.sanitize()
  │
  └─5─ 数式を差し戻す                restoreFormulas() → KaTeX
         プレースホルダをKaTeXの出力HTMLで置き換える
```

順序に理由がある箇所:

- **2が3より先**: markedは `_` `*` `\` をMarkdown記法として解釈する。
  先に退避しないとLaTeXが壊れる。
- **1が2より先**: コードの中の `$` を数式にしないため（[0006](specs/0006-math-in-code.md)）。
  コード自体はプレースホルダへ逃がさず、そのままmarkedへ渡す。
  コードの解釈はmarkedに任せるほうが安全。
- **5が4より後**: KaTeXの出力にはMathMLの要素が含まれ、DOMPurifyを通すと
  描画に必要な要素が落ちる。KaTeXの出力は信頼できる（入力LaTeXはKaTeX側で
  エスケープされる）ので、サニタイズの後に差し戻す。

### KaTeXの呼び方

`throwOnError: false` で呼ぶ。入力途中の壊れた数式でプレビューが消えると編集
できないため、赤字（`#dc2626`）で見せる。`strict: false`。

### 数式の描画キャッシュ

LaTeX文字列と `displayMode` の組をキーに、KaTeXの出力をモジュールスコープの
`Map` に持つ（上限500件、超えたら挿入順に捨てる）。1文字打つたびに全体を描き
直すが、そのとき文書中の数式はほとんどが前回と同一であり、KaTeXの呼び出しが
描画コストの大半を占めるため。同じ入力からは同じ出力が返るので、
`renderMarkdown` は純粋関数のままである。

## 4. サニタイズの境界

信頼できない入力は「利用者が書いたMarkdown」と「貼り付けたHTML」。
これらは **4** のDOMPurifyを必ず通る。プロファイルは `html` / `mathMl` / `svg`。

**5** で差し戻すKaTeXの出力だけがサニタイズを迂回する。ここが唯一の抜け道なので、
KaTeXに渡す前のLaTeXを加工しない（加工するとエスケープの前提が崩れる）。

`Preview` は `dangerouslySetInnerHTML` を使う。渡ってくるHTMLが上のパイプラインを
通っていることが前提であり、他の経路からHTMLを渡さない。

## 5. 状態と永続化

### 画面の状態

`App.tsx` が持つのは `source` と保存状態（`saveState`）の2つ。
プレビューへ渡す値は `useDeferredValue(source)` を通す。入力（textareaの更新）を
優先し、重い再描画をReactに後回しにさせるため。固定のデバウンス時間を置かないので、
端末の速さに応じて待ち時間が決まる。

表示中のHTMLが古い間（`deferredSource !== source`）は、プレビューのヘッダに
「更新中…」を出す。

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

### 保存のタイミング

- `source` が変わってから600ms入力が止まったら保存する（localStorageは同期APIなので
  1文字ごとには書かない）。
- `beforeunload` で、デバウンス待ちの内容を書き切る。
- 復元した内容（初回訪問ならサンプル文書）をそのまま保存し直さない。判定は
  「最後に保存した内容」との比較で行う。「初回レンダリングか」で判定すると
  React StrictModeの二重マウントで破れる。

## 6. 開発環境

devcontainer内で開発する（`.devcontainer/`）。Node 22 と検証用Chromiumをイメージに
焼いてあり、ホストに何が入っているかに依存しない。Viteの `server.host` は消さない
（コンテナ内で 0.0.0.0 にバインドしないとホストのブラウザから届かない）。
検証スクリプトに `executablePath` を書かない（`PLAYWRIGHT_BROWSERS_PATH` から
playwright-coreが自力で見つける）。

## 関連

- [要求仕様](requirements.md) — なぜこの構成なのか
- [機能仕様](functional-spec.md) — この構成の上で何ができるか
- [テスト仕様](test-spec.md) — どこをテストで、どこを実機で守るか
