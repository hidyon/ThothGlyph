# 0026: TypeScriptがstrictでない

- 状態: open
- 起票日: 2026-09-19

## 背景

`tsconfig.app.json` に `"strict": true` がない。`noUnusedLocals`・
`noUnusedParameters`・`noFallthroughCasesInSwitch` は入っているが、
`strictNullChecks` や `noImplicitAny` は効いていない。

つまり `textarea?.selectionStart ?? source.length`（`src/App.tsx`）のような
null を意識した書き方を、**いまは規律で守っているだけ**で、型が裏付けていない。

**起票時点で実測した**: `npx tsc -p tsconfig.app.json --strict --noEmit` は
**エラー0件**で通る。いま有効にしても直すコードはない。

## やりたいこと

- `tsconfig.app.json` で `strict` が有効になっている。
- `npm run build` が通る（型チェックを含む）。
- 今後 null を取りこぼすコードが、ビルドで止まる。

## やらないこと

- `strict` より厳しい設定（`noUncheckedIndexedAccess` など）。
  まず標準の `strict` を入れて、足りなければ別issueにする。
- 既存コードの書き換え。エラー0件なので、そもそも必要がない。

## メモ

- エラー0件で通るということは、**このissueは実質1行の変更で終わる**。
  ただし0件なのは今の規模だからで、[0004](0004-multi-document.md)（複数文書）や
  [0021](0021-undo.md) で状態が増えたあとに入れると、直す量が増える。
  **安いうちに入れるのが要点。**
- `tsconfig.node.json` 側（Vite設定など）も同じか確かめること。**未確認。**
- 受け入れ基準は「`strict` を消すとビルドが落ちる」では書けない（消さないので）。
  「設定ファイルに `"strict": true` がある」「`npm run build` が通る」に加えて、
  **わざと null を取りこぼすコードを書いたらビルドが落ちる**ことを
  一時的に確かめて記録する形が考えられる。仕様で決めること。
