# 0075: lintがビルド出力を見て1538件の警告を出す

- 状態: open
- 起票日: 2026-09-21

## 背景

`npm run lint`（oxlint）が **`dist-file/app.js` を対象にしていて、1538件の警告**を
出す。終了コードは0なので落ちはしないが、**本物の警告が埋もれる**。

```
$ npm run lint | wc -l
1538
dist-file/app.js:404:2537: warning eslint(no-unused-expressions): …
```

内訳（起票時の実測）:

| 規則 | 件数 |
|---|---|
| `no-unused-expressions` | 1327 |
| `no-unused-vars` | 74 |
| `no-cond-assign` | 52 |
| `no-useless-escape` | 30 |
| `no-control-regex` | 8 |

**すべて `dist-file/` から**で、`src/` と `scripts/` からは1件も出ていない。
minifyされたバンドルを人が書いたコードとして検査しているだけなので、
**指摘に意味がない**。

原因は [0074](0074-file-protocol.md) で `dist-file/` を**リポジトリで追跡する**
ことにしたため。`dist/` は `.gitignore` に入っていて、oxlintも既定で
`.gitignore` を尊重するため対象にならない。`dist-file/` は無視していないので
対象に入る。

## やりたいこと

- `npm run lint` の出力が、**人が書いたコードの警告だけ**になる。
- `dist-file/` を追跡する形（0074）は変えない。

## やらないこと

- **`dist-file/` を追跡しないようにすること。** GitHubから落として
  そのまま開けるようにするための判断（0074）。
- **警告そのものを黙らせること**（規則を `off` にする）。
  `src/` で同じ規則に当たったときに気づけなくなる。
- **oxlintから別のlinterへ移ること。**

## メモ

- `.oxlintrc.json` に `ignorePatterns` を足すのが素直
  （`"ignorePatterns": ["dist-file"]`）。**いまの設定は7行しかない**ので、
  足しても読みにくくならない。
- **確かめること**: oxlintの `ignorePatterns` の書き方（ディレクトリ名だけで
  効くのか、`dist-file/**` の形が要るのか）。**推測で書かず、実際に流して
  1538件が0件になることを見る。**
- あわせて**`npm run lint` の出力が0件になったかを検証で固定するか**を決める。
  いまlintはCLAUDE.mdのコマンド表にあるだけで、`verify-ui.mjs` の対象外。
  [0025](0025-ci.md)（CI）でまとめて流す形にするなら、そちらで見てもよい。
- 同種の「ビルド出力が追跡されていることの副作用」は、ほかにもあるかもしれない。
  `npm test`（vitest）は `src/**/*.test.ts` だけを見ているので影響なし（実測で957件のまま）。
  `tsc -b` は `tsconfig.app.json` の対象だけなので影響なし。
