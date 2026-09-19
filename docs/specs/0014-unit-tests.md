# 0014: 単体テストの土台を入れる

- 対応issue: [0014](../issues/0014-unit-tests.md)
- 状態: implemented
- 作成日: 2026-09-19

## 目的

`lib/` の純粋関数に回帰を防ぐ網をかける。直後に [0006](0006-math-in-code.md) で
`renderMarkdown.ts` の数式抽出（入り組んだ正規表現）に手を入れるため、いま
正しく動いているケース——通貨表記、`\$` のエスケープ、`$$` と `$` の優先、
改行を跨ぐ式——を先に固定する。固定しないまま触ると、直したつもりで別のものを壊す。

あわせて「何をテストで、何を実機検証で確かめるか」をCLAUDE.mdに書き、
以後の受け入れ基準の書き分けを揃える。

## 仕様

### 1. テストランナー

Vitestを devDependency に入れる。理由はViteの解決設定をそのまま共有できること
（別のバンドラ設定を持たずに済む）。`package.json` に次を足す。

```json
"test": "vitest run",
"test:watch": "vitest"
```

- 環境は既定の `node` を使う。`documentStorage` のテストは `localStorage` を
  スタブする（差し替えたいのは2メソッドだけ）。

  **実装時に変えた点**: `renderMarkdown` のテストだけは jsdom が要る。DOMPurifyの
  `sanitize` が `window` を要求し、node環境では `sanitize is not a function` になる。
  当該ファイルの先頭に `// @vitest-environment jsdom` を書き、jsdomを
  devDependencyに足した。
- 設定ファイルは `vitest.config.ts` を作らず、`vite.config.ts` に `test` を足す形。
  設定の置き場所を増やさない。

### 2. テストの置き場所と書き方

テスト対象の隣に `*.test.ts` を置く（`src/lib/insertSnippet.test.ts` など）。
`tests/` ディレクトリを別に切らない。対象と一緒に動かすほうが追随しやすい。

`it()` の説明は日本語で、「何が起きるか」を書く。

### 3. 書くテスト

**`insertSnippet.test.ts`**
- カーソル位置に挿入され、返るカーソル位置が `%CURSOR%` の位置になる
- `%CURSOR%` を含まないスニペットでは、挿入文字列の末尾にカーソルが来る
- 選択範囲があるとき、選択が置き換わる（**現在の挙動**。[0009](../issues/0009-wrap-selection.md)
  で変える予定なので、変えるときにこのテストを一緒に直すことになる）
- 空文書の末尾への挿入

**`renderMarkdown.test.ts`**（0006で触る前の挙動の固定）
- `$x^2$` がインライン数式として描画される（`.katex` を含み、`displayMode` でない）
- `$$...$$` がブロック数式になる
- `$$` が `$` より先に解釈される
- `$100 から $200` が数式にならない
- `\$` が数式の開始にならない
- `_` や `*` を含むLaTeX（`x_i`、`a*b`）が、Markdownの強調に壊されずに残る
- 壊れたLaTeX（`\frac{`）で例外が飛ばず、エラー色のHTMLが返る
- `<script>` を含む入力がサニタイズされる
- **いまの不具合も「現状」として書き、`it.fails()` で失敗を期待する**:
  インラインコード内・コードフェンス内の `$x$` が数式になる。0006で直したら
  `it.fails()` を普通の `it()` に裏返す。放置された不具合が一覧に見えるようにする。

**`documentStorage.test.ts`**
- 保存した内容が読み戻せる
- キーがないとき `null`
- 壊れたJSON、`version` 違い、`source` が文字列でないときに `null`
- `getItem` / `setItem` が例外を投げる環境で、例外を外に出さない（`saveDocument` は `false`）

### 4. CLAUDE.mdの更新

「実機検証」の節の前に、使い分けを1段落で足す:

> `lib/` の純粋関数は `npm test`（Vitest）で確かめる。入出力の網羅はこちらが速い。
> UIの振る舞い——描画、操作、保存の往復——はヘッドレスChromiumで確かめる。
> 受け入れ基準を書くときに、どちらで検証するかを項目ごとに決める。

「コマンド」の表に `npm test` を足す。

### 対象ファイル

| ファイル | 変更内容 |
|---|---|
| `package.json` | vitest を devDependency に。`test` / `test:watch` スクリプト |
| `vite.config.ts` | `test` 設定（`include` のみ。環境は既定） |
| `src/lib/insertSnippet.test.ts` | 新規 |
| `src/lib/renderMarkdown.test.ts` | 新規 |
| `src/lib/documentStorage.test.ts` | 新規 |
| `CLAUDE.md` | 検証の使い分けとコマンド表 |

## 受け入れ基準

- [x] `npm test` が走り、全テストが通る（`it.fails()` の2件は「失敗が期待通り」として通る）
- [x] `renderMarkdown.test.ts` に、通貨・`\$`・`$$`優先・`_`を含むLaTeX・壊れたLaTeX・
      サニタイズのテストがあり、いずれも現在の実装で通る
- [x] コード内の `$` が数式化される不具合が `it.fails()` として記録されている
- [x] `documentStorage` のテストが、`localStorage` が例外を投げる状況を含めて通る
- [x] テストを1つ意図的に壊すと `npm test` が失敗する（網が機能していることの確認）
- [x] `npm run build` と `npm run lint` が通る
- [x] CLAUDE.mdに検証の使い分けと `npm test` が載っている

## 検討したが採らなかった案

- **node:test（Node標準）を使う。** 依存は増えないが、TypeScriptの解決を自前で
  用意することになる。Viteの設定を共有できるVitestのほうが、この構成では軽い。
- **jsdom環境を入れる。** 必要なのは `localStorage` だけで、2メソッドのスタブで足りる。
- **Reactコンポーネントのテストも入れる。** 描画と操作は実機検証のほうが確実で、
  Testing Libraryの依存も増える。`lib/` に閉じる。
- **CIで自動実行する。** 別issueにする（このリポジトリにまだCIがない）。

## スコープ外

- カバレッジの計測と目標値。
- コンポーネントのテスト、E2Eフレームワークの導入（実機検証は現行スクリプトのまま）。
- CI（GitHub Actions）の設定。
