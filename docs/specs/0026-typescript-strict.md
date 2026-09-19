# 0026: TypeScriptをstrictにする

- 対応issue: [0026](../issues/0026-typescript-strict.md)
- 状態: implemented
- 作成日: 2026-09-19

## 目的

`tsconfig.app.json` と `tsconfig.node.json` のどちらにも `"strict": true` がない。
`strictNullChecks` が効いていないため、`textarea?.selectionStart ?? source.length`
（`src/App.tsx`）のような null を意識した書き方を、いまは**規律だけで守っている**。

起票時に実測したとおり、いま `strict` を有効にしてもエラーは0件で、直すコードはない。
**このissueは設定を入れるだけで終わる。** 値段が上がる前に入れておく、という一点に尽きる。

## 仕様

### 1. 両方のtsconfigに `strict` を入れる

`tsconfig.app.json`（`include: ["src"]`）と `tsconfig.node.json`
（`include: ["vite.config.ts"]`）の `compilerOptions` に `"strict": true` を足す。
既存の `noUnusedLocals` などはそのまま残す（`strict` に含まれないため）。

置き場所は既存の `/* Linting */` ブロックの先頭。`strict` が他の個別フラグの
まとめ役であることが読んで分かる位置にする。

### 2. コードは変えない

実測でエラー0件なので、`src/` にも `vite.config.ts` にも手を入れない。
**実装中にエラーが出たら、それは起票時の実測が誤っていたということなので、
直さずに仕様へ戻って相談する。**

### 3. 効いていることを一度だけ確かめて記録する

設定を入れても、それが実際に型エラーを止めるかは別の話である。
検証のために、`strictNullChecks` に違反するコードを一時的に書いて
`npm run build` が落ちることを確かめ、**出たエラーメッセージをこの仕様に記録する**。
確かめたあとそのコードは消す（リポジトリには残さない）。

記録する場所は下の「## 検証の記録」。空のままクローズしない。

### 対象ファイル

| ファイル | すること |
|---|---|
| `tsconfig.app.json` | `"strict": true` を追加 |
| `tsconfig.node.json` | `"strict": true` を追加 |
| `docs/architecture.md` | 型チェックの前提として strict であることを書く |
| `docs/test-spec.md` | 「型が通ることは検証ではない」の節に、strictが前提だと分かる一文を足す |

`scripts/verify-ui.mjs` は `.mjs` でどちらのtsconfigの `include` にも入らないため、
対象外。検証スクリプトの型チェックは別の話（起票するとしても別issue）。

## 未確認の前提

- `vitest` は自前で型チェックをしない（`npm test` は通ったまま）。
  `npm run build` の `tsc` が唯一の型チェックである、という前提。**未確認。**
- `tsconfig.node.json` は `vite.config.ts` だけを含む。`strict` を入れても
  実測でエラー0件だったが、これは**このファイル1つに対する結果**である。

## 受け入れ基準

- [x] `tsconfig.app.json` に `"strict": true` がある
- [x] `tsconfig.node.json` に `"strict": true` がある
- [x] `npm run build` が通る（型チェックを含む）
- [x] `npm test` が49件通る
- [x] `npm run lint` が通る
- [x] `node scripts/verify-ui.mjs` が43/43件OKで、コンソールエラーが出ない
- [x] `strictNullChecks` に違反するコードを一時的に足すと `npm run build` が落ち、
      そのエラーメッセージが本仕様の「## 検証の記録」に書かれている
- [x] 上の確認に使ったコードがリポジトリに残っていない（`git status` がクリーン）
- [x] `src/` と `vite.config.ts` に変更がない（設定ファイルと文書だけの差分）

## 検証の記録

`strictNullChecks` に違反する一時ファイル `src/lib/strictProbe.ts` を置いて
`npm run build` を流した。

```ts
export function probe(value: string | null): number {
  return value.length
}
```

```
src/lib/strictProbe.ts(3,10): error TS18047: 'value' is possibly 'null'.
```

終了コードは2でビルドが落ちた。同じファイルを `--strict false` で型チェックすると
**エラー0件**になるので、止めているのは `strict` である（他のフラグではない）。
確認後、一時ファイルは削除した。

なお、起票時の実測どおり `src/` と `vite.config.ts` は `strict` でエラー0件のまま
通った。コードの変更は発生していない。

## 検討したが採らなかった案

- **`strict` より厳しい設定を同時に入れる**（`noUncheckedIndexedAccess` など）。
  こちらはエラーが出る可能性が高く、「設定を入れるだけ」というこのissueの
  安さが失われる。必要なら実測してから別issueにする。
- **個別のフラグを1つずつ入れる**（`strictNullChecks` だけ、など）。
  まとめ役が1つあるほうが読みやすく、0件で通る以上、分ける理由がない。

## スコープ外

- `scripts/verify-ui.mjs` の型チェック。
- `strict` を前提にしたコードの書き換え。エラーが0件である以上、必要がない。
- CIで型チェックを自動化すること（[0025](../issues/0025-ci.md)）。
