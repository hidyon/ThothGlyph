# 0036: 取り消したときに「保存中…」が止まる／取り消した編集が書き戻る

- 対応issue: [0036](../issues/0036-save-status-stuck.md)
- 状態: implemented
- 作成日: 2026-09-21

## 目的

打った文字をすぐ取り消して保存済みの内容へ戻したとき、

1. 保存状態の表示が **`保存中…` のまま止まる**
2. その状態でリロードすると **取り消した編集が書き戻る**

の2つを直す。**2つ目は起票時に見落としていた**（issueの背景には「実害は表示だけ」と
書いてあったが、実測すると消した文字が戻る）。

保存状態の表示は「いま書いたものが失われうるか」を伝える唯一の手掛かりで、
そこが嘘をつく。さらに、**取り消した編集が復活するのは書いたものが変わること**なので、
表示より重い。

## 実測（仕様を決めるために先に測った）

devcontainer内のヘッドレスChromium、幅1440px、日本語表示、初回訪問。

| 手順 | 表示 | 保存された内容 |
|---|---|---|
| 1文字（`a`）打って1.2秒待つ | `保存しました 16:21` | `a` まで入ったもの |
| 続けて `z` を打ち、120ms後に Backspace | **`保存中…`**（2.6秒待っても変わらない） | 変わらない |
| その状態でリロード | `保存しました 16:21` | **末尾が `az`**（消した `z` が戻った） |

### 原因

`src/App.tsx` の保存のeffect。

```ts
useEffect(() => {
  // 復元した（または初回表示のサンプル）内容をそのまま保存し直さない。
  if (source === savedSource.current) return   // ← ここ

  unsaved.current = source
  setSaveState({ status: 'pending' })

  const timer = window.setTimeout(flush, SAVE_DELAY_MS)
  return () => window.clearTimeout(timer)
}, [source, flush])
```

`z` を打った時点で `unsaved.current = '…az'` と `pending` が立ち、タイマーが動く。
Backspaceで元の内容に戻ると、**クリーンアップがタイマーを消してから**
effectが再実行され、`source === savedSource.current` で早期リターンする。
このとき戻していないものが2つある。

| 戻していないもの | 起きること |
|---|---|
| `saveState`（`pending` のまま） | `保存中…` が消えない |
| `unsaved.current`（`'…az'` のまま） | `beforeunload` の `saveNow` がそれを保存する＝**取り消した編集が書き戻る** |

### 表示の戻り先

`SaveState` は4つ（`idle` / `pending` / `saved` / `failed`）で、
**`savedAt` を持つのは `saved` だけ**（`src/components/Toolbar.tsx`）。
`pending` になった時点で直前の `savedAt` は失われるので、
**最後に保存した時刻を別に覚えておく必要がある**。

## 仕様

### 1. 最後に保存した時刻をrefで覚える

```ts
// 最後に保存した時刻。pending のあいだ saveState からは失われるので別に持つ。
// 初回訪問（復元なし）では null。
const lastSavedAt = useRef<string | null>(restored?.savedAt ?? null)
```

`flush` の成功時に `lastSavedAt.current = savedAt` を入れる（`setSaveState` と同じ値）。

### 2. 保存済みの内容へ戻ったときに、両方を戻す

```ts
useEffect(() => {
  // 復元した（または初回表示のサンプル）内容をそのまま保存し直さない。
  if (source === savedSource.current) {
    // 打ってすぐ取り消したときにここへ来る。**書き戻し待ちを捨てる**
    // （捨てないと beforeunload が取り消した編集を保存する。0036）。
    unsaved.current = null
    // 表示も戻す。保存した時刻を覚えているので「保存しました hh:mm」へ、
    // 一度も保存していなければ何も出さない状態（idle）へ。
    setSaveState((current) =>
      current.status === 'pending' || current.status === 'failed'
        ? lastSavedAt.current === null
          ? { status: 'idle' }
          : { status: 'saved', savedAt: lastSavedAt.current }
        : current,
    )
    return
  }

  unsaved.current = source
  setSaveState({ status: 'pending' })

  const timer = window.setTimeout(flush, SAVE_DELAY_MS)
  return () => window.clearTimeout(timer)
}, [source, flush])
```

- **`setSaveState` を関数で渡し、`pending` / `failed` 以外はそのまま返す。**
  こうしないとマウント直後（`source === savedSource.current`）にも新しい
  オブジェクトが入り、意味のない再レンダリングが1回増える。
- **`failed` も戻す。** 保存に失敗した内容を取り消したのなら、その内容はもう
  要らない（`unsaved.current` を捨てるので離脱時の再試行もなくなる）。
  `保存できません` を出したままにすると、**何も保存するものがないのに
  失敗を告げ続ける**ことになる。

### 3. 表示の文言は変えない

`保存しました hh:mm` / `保存中…` / `保存できません` はそのまま
（`lib/messages.ts` を触らない）。

### 対象ファイル

| ファイル | すること |
|---|---|
| `src/App.tsx` | `lastSavedAt` のrefを足し、早期リターンで `unsaved.current` と `saveState` を戻す |
| `scripts/verify-ui.mjs` | `autosave` 区分にチェックを4件足す（既存15件は消さない） |
| `docs/functional-spec.md` | 保存状態の遷移に「取り消して戻したとき」を書く |
| `docs/test-spec.md` | `autosave` 区分の件数と内容を直す |

`src/components/Toolbar.tsx` は触らない（`SaveState` の形も変えない）。

## 未確認の前提

- **なし。** 不具合の再現（表示が止まること・リロードで書き戻ること）、
  原因の箇所、`SaveState` が `savedAt` を `saved` でしか持たないこと、
  React Testing Library が入っていないこと（＝検証は実機になる）を
  仕様を書く前に確かめた。

## 受け入れ基準

実際に確認した結果を各項目の後ろに書いた。

### ヘッドレスChromium（`node scripts/verify-ui.mjs autosave`）

**21/21件OK**（15件→21件。6件足した）。

- [x] 1文字打って保存されたあと、続けて打った文字を120ms後に消すと、2.5秒後の表示が `保存しました hh:mm` に戻っている（取り消し前と同じ文字列）
- [x] 取り消した直後の内容が元に戻っている
- [x] そのままリロードしても、**消した文字が戻らない**
- [x] 初回訪問（保存がない状態）で1文字打ってすぐ消すと、表示が**空**に戻る（`idle` の分岐）
- [x] そのとき内容はサンプルのままである
- [x] 600ms以上待ってから消した場合は、取り消し後の内容が保存される

### 既存が落ちないこと

- [x] `autosave` 区分の既存15件が通る
- [x] `undo` 区分18件が通る
- [x] 全区分が通る（**444/444**）
- [x] `npm test` 957件が通る
- [x] `npm run build` と `npm run lint` が通る（lintは終了コード0）

### 副作用として測ったもの

- [x] 全区分の所要時間: 実装前264.1秒 → **277.1秒**。**短くならなかった。**
      仕様では `saveSettled()` が5秒のタイムアウトまで待たなくなるぶん
      短くなると見込んだが、**その待ちが効いていたのは `undo` 区分だけ**で、
      全体では足した6件（`autosave` が5.3秒→14.8秒）のほうが大きかった。

## 実装で変えたところ

### 1. 「表示の時刻が更新される」は判定に使えなかった

仕様では600ms以上待ってから消した場合の基準を「表示の時刻が更新される」と
書いたが、**時刻は分単位まで**しか出さない（`保存しました 12:34`）。
同じ分のうちに操作すると文字列が変わらないので、
**「取り消し後の内容が保存される」で判定した**（リロードして内容を見る）。

### 2. チェックは4件ではなく6件になった

仕様に並べた4項目のうち2つを、状態の確認とセットにしたため。
「取り消した直後の内容が元に戻っている」と「そのとき内容はサンプルのままである」を
足してある（表示だけを見て内容を見ないと、**別の理由で内容が変わっていても
気づけない**）。

### 3. 全区分の所要時間は短くならなかった

見込みが外れた。上の「副作用として測ったもの」に実測を書いた。

## 検討したが採らなかった案

- **`SaveState` に常に `savedAt` を持たせる**（`pending` でも前回の時刻を運ぶ）。
  型が素直になるが、`Toolbar.tsx` の文言の組み立てと `App.tsx` の初期化を
  同時に変えることになる。**refひとつで足りる**ので採らない。
- **早期リターンをやめて、いつも `pending` → `flush` を通す。**
  保存済みと同じ内容を書き直すことになり、`savedAt` が無意味に更新される
  （書いていないのに「保存しました 16:25」に変わる）。
- **`beforeunload` で `unsaved.current` と現在の `source` を比べる。**
  症状（書き戻し）は消えるが、`保存中…` が止まる側が残る。
  **原因は早期リターンの1箇所**なので、そこで両方戻す。
- **デバウンスを短くする（600ms → 200msなど）。** 踏む確率が下がるだけで直らない。

## スコープ外

- **保存のデバウンス時間（600ms）と保存形式**（[0004](../issues/0004-multi-document.md) の側）。
- **`undo` 区分の待ち方を表示ベースに戻すこと。** この不具合を避けるために
  localStorageで待つ形にしてある（issueのメモ）。直せば戻せるが、
  **検証の書き換えは別の作業**なので分ける。issue READMEに書き残す。
- **保存に失敗したときの再試行の仕組み。** `failed` の表示を戻す条件だけ触る。
