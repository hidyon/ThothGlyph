# 0031: 英語に対応する

- 対応issue: [0031](../issues/0031-english-ui.md)
- 状態: 完了
- 作成日: 2026-09-19

## 目的

画面の文字はすべて日本語で、切り替える手段がない。数式を書く道具として
言語に依存しない部分が多いのに、日本語が読めない人は使えない。

加えて `index.html` が `<html lang="en">` のままで、中身が日本語なのに
英語だと宣言している。これは現時点でも誤りで、読み上げや翻訳判定に影響する。

## 仕様

### 1. 言語は2状態

| 状態 | 表示 | 振る舞い |
|---|---|---|
| `ja` | `言語: 日本語` | 日本語 |
| `en` | `Language: English` | 英語 |

ツールバーのボタンで `日本語 ⇄ English` と切り替える。

テーマ（[0002](0002-dark-mode.md)）は3状態（`system` / `light` / `dark`）だが、
言語はそろえずに2状態にする。テーマの `system` はOSの設定が**あとから変わる**
（夜になってダークに切り替わる）ので追従する値に意味があるが、
利用者の読む言語は使用中に変わらない。「自動」を状態として持ち続ける利点がない。

**保存がないときの初期値は、ブラウザの言語から決める。**
`navigator.language` が `ja` で始まれば `ja`、それ以外は `en`。
これは初回に一度決まるだけで、状態としては持たない。決めた値は
利用者がボタンを押すまで保存しない（保存するのは明示的に選んだときだけ）。

```ts
// lib/langStorage.ts（Lang は i18n.ts から import する）
/** 保存がないときの既定。navigator.language から決める。 */
export function detectLang(): Lang

/** 保存された選択を返す。無い・壊れている・版違い・知らない値なら detectLang()。 */
export function loadLang(): Lang

export function saveLang(lang: Lang): boolean
export function nextLang(lang: Lang): Lang   // ja ⇄ en
export function langLabel(lang: Lang): string
```

保存先は `localStorage` の `matheditor:lang:v1`。`themeStorage.ts` と同じ形
（`{ version, lang }` のJSON、読めなければ既定に落ちる、保存失敗は握りつぶす）。

### 2. 文字列の持ち方

**1か所に両方の言語を並べて書く。** 翻訳ファイルを別に持つと、記号を1行足すたびに
2つのファイルを触ることになり、「パレットはデータ駆動」の約束が薄まる。

```ts
// lib/i18n.ts
export type Lang = 'ja' | 'en'   // langStorage もここから使う
export type Text = { ja: string; en: string }
export const t = (ja: string, en: string): Text => ({ ja, en })
export const pick = (text: Text, lang: Lang): string => text[lang]
```

`palette.ts` と `formulas.ts` の `title` / `name` を `Text` にする。

```ts
{ label: '\\sqrt{x}', snippet: `\\sqrt{${CURSOR_TOKEN}}`, title: t('平方根', 'Square root') }
```

画面の文言（ツールバーなど）は `lib/messages.ts` にまとめる。
**文の形が言語で変わるものは、文字列の連結ではなく関数にする。**

```ts
savedAt: (time: string) => t(`保存しました ${time}`, `Saved at ${time}`)
wraps: (name: string) => t(`${name}（選択範囲を囲む）`, `${name} (wraps selection)`)
```

`describeInsertion` は現在 `title` と固定文字列を連結しているが、英語では
語順が変わるため、この関数の形に変える。

### 3. 翻訳する量

| 場所 | 件数 |
|---|---|
| `palette.ts` のグループ名 | 7 |
| `palette.ts` の記号の `title` | 88 |
| `formulas.ts` の分類名 | 12 |
| `formulas.ts` の公式名 | 60 |
| ツールバー・エディタ・プレビュー・確認ダイアログ | 約15 |
| **合計** | **約182** |

ギリシャ文字の `title` は既に英語（`alpha`）なので、日本語と英語で同じ文字列に
なるものが多い。`varpi（piの別の形）` のような混在しているものは
`varpi (variant of pi)` にする。

### 4. サンプル文書

`sampleDocument.ts` に英語版を足し、言語に応じて選ぶ。

**利用者が書いた文書は翻訳しない。** 言語を切り替えても、編集中の内容は
そのまま残る。切り替えでサンプル文書が入れ替わるのは、**保存された文書がない
初回訪問のときだけ**。それ以外で入れ替えると書いたものが消える。

### 5. `<html lang>`

表示中の言語に合わせる。テーマと同じく `index.html` のインラインスクリプトで
先に当て（Reactのマウントを待つと一瞬ずれる）、Reactからも更新する。
`index.html` の `lang="en"` 決め打ちは消す。

### 6. 検証スクリプト

**12か所が日本語で要素を探している**（`getByRole('button', { name: 'サンプルに戻す' })` など）。
言語が切り替わると当たらなくなる。

`resetState()` で **`matheditor:lang:v1` に `ja` を書いてから開く**ことで、
既存のチェックは日本語のまま通す。ヘッドレスChromiumの `navigator.language` は
英語なので、保存がないままだと `detectLang()` が `en` を返して全部落ちる。

そのうえで `i18n` 区分を新しく足し、英語に切り替えたときの表示を確認する。

### 対象ファイル

| ファイル | すること |
|---|---|
| `src/lib/i18n.ts` | 新規。`Lang` `Text` `t` `pick` |
| `src/lib/langStorage.ts` | 新規。`themeStorage.ts` と同じ形 |
| `src/lib/messages.ts` | 新規。画面の文言 |
| `src/lib/palette.ts` / `formulas.ts` | `title` / `name` を `Text` に |
| `src/lib/insertSnippet.ts` | 触らない |
| `src/components/*.tsx` | 文言を `messages` 経由に。言語を props で受ける |
| `src/App.tsx` | 言語の状態を持つ（テーマと同じ場所） |
| `src/sampleDocument.ts` | 英語版を足す |
| `index.html` | `lang` の決め打ちを消し、インラインスクリプトで当てる |
| `scripts/verify-ui.mjs` | `resetState` で `ja` を固定。`i18n` 区分を足す |
| `docs/` の4文書 | 更新 |

## 未確認の前提（実装後の結果）

- **`navigator.language` をPlaywrightで変えられるか。** → 使わずに済んだ。
  `addInitScript` で `localStorage` に言語を置くほうが、既存チェックの日本語固定と
  同じ仕組みで済む。`detectLang()` 自体は単体テスト（`navigator` をスタブ）で確かめた。
- `describeInsertion` を関数に変えると `palette.test.ts` の既存テストが壊れる。
  → 壊れたのは3件で、引数に `lang` を足すだけで済んだ。英語の語順を確かめる
  テストを1件足した。
- **翻訳の質は保証しない。** 数学用語の英訳（`余弦定理` → `Law of cosines` など）は
  一般的な呼び方を使うが、専門家の校閲は受けない。受け入れ基準にも入れない。

## 実装中に仕様から外れたこと

- **ツールバーのCSSを触った。** 言語ボタンが1つ増えた結果、幅600px・日本語・
  保存状態ありの組み合わせでツールバーが45px溢れ、既存チェック
  「幅600pxでも横スクロールが出ない」が落ちた。狭い画面での要素の間隔（12→8px）、
  保存表示の最大幅（96→56px）、ツールバーの左右余白（12→10px）を詰めて解消した
  （余白19px）。仕様の対象ファイルに `src/index.css` は挙げていなかったが、
  自分の変更が起こした回帰なので、受け入れ基準「既存59件が通ったまま」の範囲として直した。
- **`themeStorage.themeLabel` に `lang` を足した。** 対象ファイルに挙げていなかったが、
  `自動` / `ライト` / `ダーク` はツールバーに出る文言なので翻訳が要る。
- **パレットのタブの選択状態を名前から添字に変えた。** 名前が `Text` になり、
  言語を切り替えると一致しなくなるため。

## 受け入れ基準

- [x] [unit] `langStorage` が保存・復元でき、壊れた値・版違い・知らない値・未保存で
      `detectLang()` の結果に落ちる（`themeStorage.test.ts` と同じ網羅）
- [x] [unit] `detectLang()` が `navigator.language` = `ja-JP` で `'ja'`、
      `en-US` で `'en'`、`fr-FR` で `'en'` を返す
- [x] [unit] `palette.ts` と `formulas.ts` の全件が `ja` と `en` の両方を持ち、
      どちらも空文字でない
- [x] [unit] `describeInsertion` が日本語で `平方根（選択範囲を囲む）`、
      英語で `Square root (wraps selection)` を返す
- [x] [UI] 言語ボタンを押すと `日本語 ⇄ English` と切り替わる
- [x] [UI] 英語にすると、ツールバー・ペインの見出し・パレットのタブが英語になる
      （`Source` / `Preview` / `Copy Markdown` / `Basic` を確認する）
- [x] [UI] 英語にしてから公式タブを開くと、分類と公式名が英語になっている
- [x] [UI] 選んだ言語がリロード後も保たれる
- [x] [UI] 言語を切り替えても、**編集中の文書が変わらない**
- [x] [UI] 英語のとき `document.documentElement.lang` が `en`、日本語のとき `ja`
- [x] [UI] 既存59件の検証チェックが通ったままである（`i18n` の18件を足して77/77件）
- [x] `npm run build` と `npm run lint` が通る

## 検討したが採らなかった案

- **i18nライブラリ（i18next）を入れる。** 2言語・約182件で、複数形や日付書式の
  込み入った要求がない。「状態管理ライブラリもUIフレームワークも入れない」
  という方針に照らして、依存を増やす理由がない。
- **翻訳を別ファイルの辞書にする。** 記号を1行足すたびに2ファイルを触ることになり、
  データ駆動の利点が減る。
- **英語だけにする（日本語をやめる）。** 利用者は日本語で使っている。
- **言語を3状態（auto / ja / en）にする。** テーマと形はそろうが、
  `auto` に追従する相手（使用中に変わる設定）がない。ブラウザの言語は
  初期値を決めるのに使えば足りる。

## スコープ外

- 日本語・英語以外の言語。
- コード内のコメント、issue、仕様、振り返りの英語化（CLAUDE.mdの方針どおり
  日本語のまま）。
- 翻訳の質の保証・校閲。
- 日付や数値の書式の地域化（`toLocaleTimeString` は `ja-JP` 固定のまま。
  時刻は `HH:MM` で言語に依らない）。
