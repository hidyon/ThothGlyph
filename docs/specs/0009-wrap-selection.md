# 0009: 選択範囲があるときの挿入の扱いを揃える

- 対応issue: [0009](../issues/0009-wrap-selection.md)
- 状態: implemented
- 作成日: 2026-09-19

## 目的

いまパレットの記号は2つの挙動に割れている。`%CURSOR%` を持つ24件は選択範囲を
包み、持たない38件は選択範囲を**記号で置き換えて消す**。`x + 1` を選んだまま
`\alpha` を押すと式が消える。textareaの値をJSから書き換えているためブラウザの
Undo履歴も切れていて、戻す手段がない。

この仕様では「**どの記号を押しても、選択したテキストは文書から消えない**」に
揃える。包める記号は包み、包めない単体記号は選択範囲の直後に挿入する。
利用者は押す前に、tooltipでどちらになるかを知れる。

## 仕様

### 1. 単体記号は選択範囲の直後に挿入する

`insertSnippet` の「スニペットに `CURSOR_TOKEN` が無い」経路を変える。

| 選択 | 現在 | 変更後 |
|---|---|---|
| なし（start === end） | カーソル位置に挿入 | 変更なし |
| あり | 選択範囲を置き換える | 選択範囲を**残したまま**その直後に挿入する |

`x + 1` を全選択して `\pi` を押すと `x + 1\pi` になる（現在は `\pi`）。
カーソルは挿入した文字列の末尾（`x + 1\pi` の後ろ）に置き、選択は解除する。
選択を保ったままにすると、次に文字を打った瞬間に今度はその選択が消えるため、
「消えない」という約束をかえって破る。

`CURSOR_TOKEN` を持つスニペットの挙動は変えない（既存のテストがそのまま通る）。

### 2. tooltipで挙動を示す

`PaletteItem` に派生値を持たせるのではなく、`snippet` に `CURSOR_TOKEN` が
含まれるかで決める。パレットボタンの `title` / `aria-label` を次にする。

| スニペット | title の例 |
|---|---|
| `CURSOR_TOKEN` あり | `平方根（選択範囲を囲む）` |
| `CURSOR_TOKEN` なし | `円周率（選択範囲の後ろに挿入）` |

付記は `palette.ts` の `title` には書かない。62件すべてに手で書くと、記号を
1行足すだけで済む約束（データ駆動）が崩れる。`wrapsSelection(snippet)` と
`describeInsertion(item)` を `lib/` の純粋関数として置き、コンポーネントは
それを呼ぶだけにする。

### 対象ファイル

| ファイル | すること |
|---|---|
| `src/lib/insertSnippet.ts` | `CURSOR_TOKEN` なしの経路を「選択の直後に挿入」に変える |
| `src/lib/insertSnippet.test.ts` | 置き換えを期待するテストを書き換え、境界のケースを足す |
| `src/lib/palette.ts` | `wrapsSelection` / `describeInsertion` を追加 |
| `src/lib/palette.test.ts` | 新規。2関数のテスト |
| `src/components/SymbolPalette.tsx` | `title` / `aria-label` に `describeInsertion` を使う |
| `scripts/verify-ui.mjs` | 受け入れ基準のチェックを追加（既存チェックは消さない） |
| `docs/functional-spec.md` / `docs/test-spec.md` | 挙動の記述を更新（クローズと同じコミットで） |

## 未確認の前提

- ブラウザのネイティブUndo（Ctrl+Z）は、React stateでtextareaの値を差し替えると
  切れる。`document.execCommand('insertText')` なら履歴を保てるはずだが、
  非推奨APIであり、**この仕様では採らない**。テキストが消えなくなればUndoは
  不要になるという判断による。Undoの復旧は必要なら別issueで起票する。
- `describeInsertion` の文言を変えても `aria-label` はそのまま読み上げられる、
  という前提で `title` と同じ文字列を使う。スクリーンリーダーでの実地確認はしない。

## 受け入れ基準

ヘッドレスChromium（`node scripts/verify-ui.mjs`）で確認する項目には [UI]、
`npm test` で確認する項目には [unit] と書く。

- [x] [unit] `insertSnippet('x + 1', '\\pi', 0, 5)` が `{ text: 'x + 1\\pi', cursor: 8 }` を返す
- [x] [unit] 選択が無いとき（`start === end`）の挙動は変わらない（既存テストが通る）
- [x] [unit] `CURSOR_TOKEN` を持つスニペットで選択を包む挙動は変わらない（既存テストが通る）
- [x] [unit] `wrapsSelection` が `\\sqrt{%CURSOR%}` に true、`\\pi` に false を返す
- [x] [unit] `describeInsertion` が `\\pi` の項目に対し `円周率（選択範囲の後ろに挿入）` を返す
- [x] [UI] 本文の先頭6文字を選択して `\alpha` を押すと、textareaの値からその6文字が消えていない
- [x] [UI] 同じ操作のあと、textareaの `selectionStart === selectionEnd` で、
      その位置の直前が `\alpha` で終わっている
- [x] [UI] 本文の一部を選択して `\sqrt{x}` を押すと、選択したテキストが `\sqrt{...}` の中に入る
- [x] [UI] パレットの `\pi` ボタンの `title` が `選択範囲の後ろに挿入` を含み、
      `\sqrt{x}` ボタンの `title` が `選択範囲を囲む` を含む
- [x] [UI] 上の操作の間、`console` にエラーが出ない
- [x] `npm run build` と `npm run lint` が通る
- [x] 既存38件の検証チェックが通ったままである（43/43件 OK）

## 検討したが採らなかった案

- **現在の置き換え挙動を残す（issueメモの案b）。** 「選択したものが消える」こと自体が
  issueなので、揃える先にならない。
- **単体記号にも包む位置を定義する（案c）。** `\alpha` に包む意味がなく、
  `\alpha{x + 1}` のような不正なLaTeXを作ってしまう。
- **選択範囲を保ったままにする。** 「選択が保たれる」はissueの受け入れ候補だったが、
  次の打鍵でその選択が消えるため、問題を1手先へ送るだけになる。
- **`execCommand('insertText')` でUndo履歴を保つ。** 非推奨APIを入れる対価に見合わない。
  消えなくなればUndoで戻す必要がない。

## スコープ外

- ネイティブUndoの復旧。必要なら別issueで起票する。
- キーボードからの挿入（[0008](../issues/0008-keyboard-shortcuts.md)）。
  本仕様は `insertSnippet` の意味を固めるところまでで、0008はその上に乗る。
- 記号ごとに包む位置を利用者が設定すること。
