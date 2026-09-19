# matheditor

数式入りMarkdownを書くためのWebエディタ。左にMarkdownソース、右にリアルタイムプレビュー、
上部に記号パレット。書いたソースはクリップボードにコピーして持ち出す。

## 技術スタック

Vite 8 + React 19 + TypeScript / KaTeX（数式）/ marked（Markdown）/ DOMPurify（サニタイズ）。
状態管理ライブラリもUIフレームワークも入れない。この規模ではReact stateと素のCSSで足りる。

```
src/
  App.tsx              source state と挿入ハンドラ。状態はここに集約する
  sampleDocument.ts    初期表示の文書
  components/          Toolbar / SymbolPalette / Editor / Preview
  lib/
    renderMarkdown.ts  数式を退避 → marked → DOMPurify → KaTeXで差し戻し
    palette.ts         記号パレットの定義データ
    insertSnippet.ts   カーソル位置への挿入（純粋関数）
docs/
  issues/              issue。README.md が一覧
  specs/               仕様。issue番号と対応
  retrospectives/      振り返り
```

### コマンド

| 目的 | コマンド |
|---|---|
| 開発サーバ | `npm run dev`（http://localhost:5173） |
| 型チェック＋ビルド | `npm run build` |
| Lint | `npm run lint`（oxlint） |

### 設計上の約束

- **数式はMarkdown変換の前に退避する。** `_` `*` `\` をmarkedがMarkdown記法として
  解釈してLaTeXを壊すため。順序を変えない。
- **KaTeXは `throwOnError: false` で呼ぶ。** 入力途中の壊れた数式でプレビューが
  消えると編集できない。赤字で見せる。
- **数式HTMLの差し戻しはDOMPurifyの後。** KaTeXの出力は信頼できる一方、
  サニタイズすると描画に必要なMathML要素が落ちる。
- **ロジックは `lib/` に純粋関数として置く。** コンポーネントは描画と配線だけ。
- **パレットはデータ駆動。** 記号追加は `palette.ts` に1行足すだけで済ませる。
- `@types/katex` は入れない。katex 0.18 が型定義を同梱していて衝突する。

## 開発の進め方：仕様駆動開発

このリポジトリは**仕様駆動開発**で進める。実装より先に仕様を書き、仕様には必ず
**受け入れ基準**を含める。受け入れ基準は「どう検証すれば満たしたと言えるか」を
具体的な操作と期待結果で書く。曖昧な基準は基準ではない。

### サイクル

```
1. issueを選ぶ   →  何をやるか合意する
2. 仕様を書く     →  docs/specs/ に書き、ユーザーの承認を得る（ここで止まる）
3. 実装する       →  仕様に書いたことだけを作る
4. 検証する       →  受け入れ基準を実際に確認し、issueをクローズ
```

**各フェーズの約束:**

1. **issueを選ぶ** — 着手前に `docs/issues/README.md` を読み、どれをやるか
   ユーザーと決める。勝手に選んで始めない。

2. **仕様を書く** — `docs/specs/NNNN-slug.md` に書く。テンプレートは
   `docs/specs/TEMPLATE.md`。書いたら**必ずユーザーの承認を取ってから実装に入る**。
   仕様が複数の解釈を許すなら、実装ではなく質問で解消する。

3. **実装する** — 仕様のスコープを超えない。実装中に「ついでに直したい」ものを
   見つけたら、直さずに新しいissueとして起票する。仕様の前提が崩れたら、
   実装を続けずに仕様に戻って相談する。

4. **検証する** — 受け入れ基準を**実際に動かして**確認する。型が通ることは
   検証ではない。UIの変更はヘッドレスChromiumで操作してスクリーンショットを見る
   （手順は下の「実機検証」）。全項目を満たしたらissueをクローズし、
   結果を報告する。満たせなかった項目があれば、隠さずそう言う。

### issue管理

`docs/issues/` にMarkdownで置く。外部サービスは使わない。

- ファイル名は `NNNN-slug.md`（例 `0001-autosave.md`）。番号は連番、再利用しない。
- `docs/issues/README.md` が一覧かつ唯一の正。issueを追加・状態変更したら
  **必ず同じコミットでREADMEを更新する**。
- 状態は `open` / `in-progress` / `closed` の3つだけ。
- テンプレートは `docs/issues/TEMPLATE.md`。

思いつきや「あとで直す」は、その場で直さずissueにする。issueになっていない作業は
存在しない作業として扱う。

### git

- issue着手時に `issue/NNNN-slug` ブランチを切る。`main` に直接コミットしない。
- コミットメッセージは1行目に `#NNNN <何をしたか>` を書く。
- コミットとpushはユーザーが指示したときだけ行う。

## 振り返り

**issueを3件クローズするごとに**、開発の進め方を振り返り、CLAUDE.mdの見直しを提案する。
ユーザーに言われるのを待たず、3件目のクローズ時に自分から切り出す。

`docs/retrospectives/YYYY-MM-DD.md` に記録する。振り返るのはコードではなく**進め方**:

- 仕様が実装中に変わった箇所はどこか。なぜ仕様の時点で気づけなかったか。
- 受け入れ基準で捕まえられなかった問題はあったか。
- CLAUDE.mdに書いてあるのに守られなかったルール、または書いていないのに
  毎回やっている暗黙のルールはあるか。後者は明文化を提案する。
- 逆に、守る価値がなくなったルールがあれば削除を提案する。**CLAUDE.mdは足す
  だけでなく減らす。** 長くなるほど読まれなくなる。

提案はするが、CLAUDE.mdの変更は**ユーザーの承認を得てから**行う。

## 実機検証

UIの変更は実際にブラウザで動かして確認する。Playwrightのブラウザは
`~/.cache/ms-playwright/` に入っている。`playwright-core` はスクラッチパッドに
インストールして使う（プロジェクトの依存には加えない）。

```js
const browser = await chromium.launch({
  executablePath: '/home/hide/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox'],
})
```

確認すること: 対象の操作が期待通り動くか、**スクリーンショットを実際に見る**、
`console` にエラーが出ていないか。見た目の違和感は目視で判断せず、DOMの座標や
値を測って確かめる（`aligned` の桁揃えは目の錯覚で崩れて見えることがある）。

## 言語

ユーザーとのやり取りは日本語。コード内のコメント、issue、仕様、振り返りも日本語で書く。
コメントは「何をしているか」ではなく「なぜそうしたか」を書く。
