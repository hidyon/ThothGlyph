# 0024: 初期バンドルを分割する

- 対応issue: [0024](../issues/0024-bundle-size.md)
- 状態: implemented
- 作成日: 2026-09-20

## 目的

このアプリは「開いてすぐ書き始める」道具なのに、書き始めるのに必要のない
KaTeX・marked・DOMPurifyまで全部読み終わるまで、textareaが出ない。
細い回線ではこれが**2秒**かかっている（下の実測）。

数式の描画エンジンをエディタの読み込みから切り離し、**エディタが先に出て、
プレビューとパレットのラベルが追いついてくる**形にする。読むバイト数の合計は
変わらないが、入力できるようになるまでが縮む。

## 現状の実測（2026-09-20）

`npm run build` の出力:

| 成果物 | サイズ | gzip |
|---|---|---|
| `dist/assets/index-*.js` | **579.98 kB** | **180.50 kB** |
| `dist/assets/index-*.css` | 36.09 kB | 9.76 kB |

起票時（563.54 kB）から16kB増えている。0029・0030・0031で記号・公式・翻訳を
足したぶん。チャンクサイズの警告は毎回出ている。

内訳（`manualChunks` で分けて一時ビルドして実測）:

| 中身 | JS | gzip | 用途 |
|---|---|---|---|
| KaTeX | 258.86 kB | 77.65 kB | プレビューの数式、パレットのラベル |
| React + react-dom | 218.80 kB | 68.23 kB | 画面全部 |
| marked | 44.04 kB | 13.07 kB | プレビュー |
| DOMPurify | 26.92 kB | 10.69 kB | プレビュー |
| アプリ本体 | 30.03 kB | 11.24 kB | 全部 |

CSSの36.09 kBのうち **29.79 kB はKaTeXのCSS**（`main.tsx` が
`katex/dist/katex.min.css` を読んでいる）。アプリ自身のCSSは6.29 kB。

読み込み時間（本番ビルドを `vite preview` で配り、ヘッドレスChromiumで3回測った中央値）:

| 条件 | textareaが出るまで | プレビューに数式が出るまで | JSの取得完了 |
|---|---|---|---|
| スロットルなし | 229 ms | 252 ms | 76 ms |
| Fast 3G + CPU 4倍遅く | **1964 ms** | **2021 ms** | 1241 ms |

textareaとプレビューがほぼ同時なのは、**同じ1回のReactの描画で両方出ている**ため。
つまり今は「エディタだけ先に出す」余地が丸ごと残っている。

## 仕様

### 分け方

JSを2つに分ける。

```
初期チャンク : React + アプリ本体（Toolbar / Editor / SymbolPalette の骨組み）+ アプリのCSS
遅延チャンク : KaTeX + marked + DOMPurify + renderMarkdown + KaTeXのCSS
```

遅延チャンクは **利用者の操作を待たずに、初期チャンクの評価と同時に取りに行く**。
「必要になってから読む」にすると、細い回線で初期チャンク→遅延チャンクの
直列待ちになり、プレビューが出るまでが今より明確に遅くなる。

### 読み込み中の見え方

遅延チャンクが届くまでの間:

- **エディタは完全に使える。** 入力・自動保存・テーマ・言語切り替えは
  初期チャンクだけで動く。
- **プレビューのヘッダに `準備中…` / `Preparing…` を出す**（`更新中…` と同じ位置・
  同じ見た目）。本文は空にする。
- **パレットのラベルはLaTeXのソースをそのまま出す**（`\sqrt{x}` と見える）。
  ボタンは押せて、挿入も効く。エンジンが届いたらKaTeXの描画に差し替わる。

エンジンの読み込みに失敗した場合は、上の状態のまま留まる。
プレビューのヘッダは `準備中…` のままで、エディタは使えたままにする
（書いたものを失わせない）。専用のエラー表示は出さない。

### エンジンの持ち方

`src/lib/previewEngine.ts` を足す。

```ts
export type Engine = {
  renderMarkdown: (source: string) => string
  renderLatex: (latex: string) => string   // パレットのラベル用（displayMode: false）
}
export function loadEngine(): Promise<Engine>   // 動的importを1回だけ走らせ、結果を使い回す
```

`App.tsx` がマウント時に `loadEngine()` を呼び、結果を state に持って
`Preview` と `SymbolPalette` に props で配る（テーマ・言語と同じ配り方）。
`renderMarkdown.ts` のパイプライン（コード切り分け→数式退避→marked→DOMPurify→KaTeX）は
**順序も中身も変えない**。単体テストは今までどおり `renderMarkdown` を直接importする。

`main.tsx` の `import 'katex/dist/katex.min.css'` は
`previewEngine.ts` の動的import側へ移す。

### 対象ファイル

| ファイル | 何をするか |
|---|---|
| `src/lib/engine.ts` | 新規。遅延チャンクの入口。ここから静的にたどれるものが遅延側に入る |
| `src/lib/previewEngine.ts` | 新規。動的importと1回だけのキャッシュ |
| `src/main.tsx` | KaTeXのCSSのimportを外す |
| `src/App.tsx` | `loadEngine()` を呼び、`engine` を state で持って配る |
| `src/components/Preview.tsx` | `engine` が無い間は本文を空にし、ヘッダに `準備中…` |
| `src/components/SymbolPalette.tsx` | `katex` の直接importをやめ、`engine?.renderLatex` を使う。無い間はソースを出す |
| `src/lib/messages.ts` | `previewPreparing` を日英で足す |
| `src/index.css` | `.palette__source`（届く前のラベルの幅を詰める） |
| `scripts/measure-load.mjs` | 新規。ビルド→配布→サイズと読み込み時間を測り、基準と照らす |
| `docs/architecture.md` | 「読み込みの分割」を足す。依存の表にどちらのチャンクかを書く |
| `docs/test-spec.md` | 検証手段の表に `measure-load.mjs` の行を足す |
| `docs/functional-spec.md` | 読み込み中の見え方を足す |

### 検証のしかた

読み込み時間は**本番ビルド**でないと意味がないが、`verify-ui.mjs` は開発サーバ
（バンドルされていない）に向いている。そこで**別のスクリプトを1本足す**。

```bash
node scripts/measure-load.mjs
```

`npm run build` → `vite preview` で配る → ヘッドレスChromiumで2条件×3回測る →
`dist/` の成果物サイズと合わせて表で出し、下の基準と照らして `OK` / `NG` を出す。
1件でも落ちたら終了コード1。結果は `tmp/measure-load.json` にも書く。
スロットルの条件は Chrome DevTools の Fast 3G 相当
（下り1.6Mbps・上り750kbps・RTT 150ms）とCPU 4倍遅く、で固定する。

## 未確認の前提（実装で確かめた結果）

- **Vite 8（rolldown）が動的importを別チャンクに切り出すこと** → 切り出した。
  `build.rollupOptions` を書く必要はなく、`import('./engine')` だけで
  `assets/engine-*.js` と `assets/engine-*.css` に分かれた。
- **動的importされたモジュールのCSSが、チャンクの読み込み時に挿入されること** → された。
  数式が崩れて見えることもなかった（実測でプレビューの数式が出るのは1939 ms、
  CSSはそれより先に当たっている）。
- **パレットのラベルをソース表示にしたときの高さ** → **崩れた。** そのまま出すと
  ボタンが横に広がって幅600pxで2段になり、パレットが **168 px**（描画後は126 px、
  差42 px）になった。基準の40 pxを超えたので、`.palette__source` で幅を40 pxに詰め、
  溢れを省略記号にした（描画後のボタンは実測42〜47 px）。結果、**両方126 pxで差0**。
- **`vite preview` をスクリプトから起動して確実に落とせること** → できた。
  ポートは4174（開発サーバの5173とぶつけない）。

実装中に分かったこと:

- **エンジンの取得はReactのマウント前（`main.tsx`）に始めないと効きが薄い。**
  `App` の `useEffect` から始めると、初期チャンクの評価とエンジンの取得が直列になる。
- **検証で遅延チャンクを `route.abort()` で止めるとコンソールエラーが出て、
  この区分だけ常に終了コード1になる。** 解決しないモジュールを返す形に変えた
  （届かない状態としては同じ）。

## 受け入れ基準

## 受け入れ基準

サイズ（`npm run build` の出力と `dist/` の実ファイルで確認）:

- [x] 初期チャンクのJSが **300 kB以下**（gzip **95 kB以下**）になる → **243.20 kB / gzip 76.82 kB**（分割前 579.98 kB / 180.50 kB。**-58%**）
- [x] 遅延チャンクにKaTeX・marked・DOMPurifyが入り、初期チャンクには入っていない（遅延チャンクは324.35 kB / gzip 98.67 kB）
- [x] 初期CSSが **10 kB以下**になる → **6.32 kB**（分割前 36.09 kB）
- [x] `npm run build` でチャンクサイズの警告が出ない
- [x] `scripts/measure-load.mjs` が上の数値を表で出し、全項目 `OK` で終了コード0（12/12件）

読み込み時間（`node scripts/measure-load.mjs`、3回の中央値）:

- [x] スロットルなしで、textareaが出るまでが **250 ms以下** → **204 ms**（分割前229 ms）
- [x] スロットルなしで、プレビューに数式が出るまでが **400 ms以下** → **238 ms**（分割前252 ms）
- [x] Fast 3G + CPU 4倍で、textareaが出るまでが **1500 ms以下** → **1085 ms**（分割前1964 ms。**-879 ms**）
- [x] Fast 3G + CPU 4倍で、プレビューに数式が出るまでが **2400 ms以下** → **1939 ms**（分割前2021 ms。悪化しなかった）
- [x] Fast 3G + CPU 4倍で、パレットのラベルがKaTeXで描画されるまでが **2400 ms以下** → **1945 ms**

見え方（`node scripts/verify-ui.mjs` に区分 `loading` を足して確認）:

- [x] 遅延チャンクの応答を止めた状態で開くと、textareaに文字が打て、
      プレビューのヘッダに `準備中…` が出て、パレットのボタンが押せる（自動保存も動く）
- [x] その状態でパレットのボタンを押すと、ソースに記号が挿入される
- [x] 遅延チャンクが届いた後、プレビューの `準備中…` が消えて数式が描画される
- [x] 幅600pxで、ラベルがソース表示のときとKaTeX描画のときのパレットの高さを
      両方測って仕様に記録し、差が **40 px以内**である → **ソース126 px / KaTeX 126 px、差0**
      （幅を詰める前は168 px / 126 pxで差42 pxあり、基準を外していた）
- [x] 英語表示で `Preparing…` が出る

回帰:

- [x] `npm test` が全件通る（522件。変更なし）
- [x] `node scripts/verify-ui.mjs` が全区分通る（**125件**＝既存111件 + `loading` 14件）
- [x] `npm run build` と `npm run lint` が通る

## 検討したが採らなかった案

- **KaTeXを「使うときだけ」読む（操作を待つ）。** 初期表示のサンプル文書にも
  パレットにも数式があるので、結局すぐ要る。直列待ちになってプレビューが
  今より遅くなるだけ。
- **KaTeXのフォントをサブセット化する。** 利用者が何を書くかで必要な字が変わるので、
  削ると書けない記号が出る。フォントは使われたものだけブラウザが取りに行く
  （実測でも初期表示では2件しか落ちてこない）ので、初期表示への効きも薄い。
- **marked・DOMPurifyだけを遅延させる。** 71 kB（gzip 23.8 kB）しか減らず、
  KaTeXが初期チャンクに残るので警告も消えない。分けるコストに見合わない。
- **依存の差し替え。** [CLAUDE.md](../../CLAUDE.md) の約束。issueの「やらないこと」。
- **`verify-ui.mjs` に読み込み時間の区分を足す。** 開発サーバはバンドルされて
  いないので、測っても本番の値にならない。

## スコープ外

- Service Workerによるキャッシュ（[0019](../issues/0019-app-icon.md) のPWA化と同じく扱わない）。
- パレットが起動時にラベル122件をKaTeXで一気に描くCPUコスト。バイト数ではなく
  CPUの話なので、必要なら別issueにする。
- 遅延チャンクの読み込み失敗を利用者に伝えるUI。まず `準備中…` のままにする。
