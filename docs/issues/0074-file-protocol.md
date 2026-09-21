# 0074: 静的ファイルだけ（file://）では開けない

- 状態: open
- 起票日: 2026-09-21

## 背景

このアプリはバックエンドを持たない静的なファイルの集まりで、`npm run build` が
出す `dist/` がすべて（**1.9 MB・63ファイル**。KaTeXのフォントも同梱なので
ネットワークは要らない）。しかし**`dist/index.html` をブラウザで直接開いても動かない**。

```
file:///.../dist/index.html
  {"editor":false,"katex":0,"graph":0,"palette":0}
  エラー: Access to CSS stylesheet at 'file:///assets/index-CKySFXEQ.css' from
         origin 'null' has been blocked | Access to script … blocked by CORS
```

**原因はパスではなく、本体が ES モジュールとして読み込まれること。**
`file://` の origin は `null` なので、モジュールの取得がCORSで拒否される。
`--base=./` で相対パスにしてビルドし直しても**同じように止まる**（実測）。

HTTPで配れば完全に動く（`npm run preview`、または `dist` の中で
`python3 -m http.server`）。ただし**サーバを立てられない場所へ渡せない**
（USBで渡す、閲覧だけの端末、社内で許可がない、など）。

## 動かせることは実験で確かめた

作り方を2つ変えると `file://` で動く。**実際に動かして確認した**（2026-09-21）。

| 見たもの | 結果 |
|---|---|
| エディタ・プレビュー | 動く（数式16個・グラフ1つ・パレット23件） |
| KaTeXのフォント | 当たっている（`KaTeX_Main`、20書体読み込み済み） |
| 自動保存 | **効く**（`thothglyph:document:v1` が保存され、リロード後も残った） |
| コンソール | 404が1件だけ（下記） |

必要な変更は2つ。

1. **ESモジュールをやめて1本のIIFEにし、`<script defer>` で読む。**
   モジュールは既定で defer されるので、`defer` を付けずに classic script へ
   変えると `#root` より先に走って React が落ちる（実験で踏んだ。
   `Minified React error #299`）。
2. **`src/components/Toolbar.tsx:88` の `src="/favicon.svg"` を相対にする。**
   ここだけ絶対パスで、`file://` ではファイルシステムのルートを見にいく。
   **唯一の404で、ツールバーのロゴが壊れて見える。**
   タブのアイコンはHTML側が相対なので出る。

## やりたいこと

- **`dist`（または別の出力）をコピーして、`index.html` を開くだけで使える。**
  サーバを立てなくてよい。
- 書いたものが残る（自動保存が効く）。**実験では効いた。**
- 見た目が壊れていない（ロゴも出る）。

## やらないこと

- **オンラインで配る形を壊すこと。** HTTPで配ったときの動きは今のまま。
- **読み込み時間の基準を緩めること。** 下の「決めること」を見よ。
- **1つのHTMLファイルに全部（フォントまで）詰めること。**
  KaTeXのフォントは1.8 MBあり、base64で埋めると2.4 MB前後の単一HTMLになる。
  今回は「フォルダをコピーして index.html を開く」で足りる。

## 決めること（仕様で決める）

**出力を1つにするか、2つ持つか。** ここで要求仕様を直すかどうかが決まる。

| | 出力を1つにする（0024を諦める） | 出力を2つ持つ（`build` と `build:file`） |
|---|---|---|
| 初期JS | **602.8 kB**（実測） | HTTP向けは今のまま268.9 kB + 遅延332.6 kB |
| [N10](../requirements.md)（初期JSは300 kB以下） | **書き換えが要る** | そのまま満たせる |
| `準備中…`（エンジンが届く前でも打てる） | 意味を失う。`loading` 区分**14件**が宙に浮く | 残る |
| `measure-load.mjs` の12件 | 初期JS・gzip・遅延チャンクの目印など**数件が成り立たなくなる** | そのまま |
| 手間 | 少ない | 設定と検証が2系統になる |

**ユーザーの意向は「0024は諦めてもよいので、静的ファイルだけで使えるように
しておきたい」**（2026-09-21）。ただし下の実測を踏まえると、
**N10を書き換えずに済む可能性がある**ので、仕様で確かめてから決める。

### 実測: `file://` は「細い回線」の話にならない

| 配り方 | textarea | 数式 | グラフ |
|---|---|---|---|
| `file://`（1本にまとめた版・602.8 kB） | 279ms | **301ms** | 305ms |
| `http://`（いまの分割ビルド） | 243ms | **273ms** | 278ms |

（幅1440px・3回の中央値・スロットルなし）

**差は約30ms。** N10の基準は「細い回線（Fast 3G + CPU 4倍）で1.5秒以内」で、
**`file://` にはそもそも回線がない**（ローカルディスクから読む）。
N10の狙い（開いてすぐ書き始められる）は `file://` でも満たされている。
**「初期JSは300 kB以下」という手段の側を、配り方ごとに分けて書けば足りる**
かもしれない。ここを仕様で判断する。

## メモ

- 実験に使った設定（`tmp/` に置いたもの。`tmp/` は gitignore されるので写しておく）:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
```

  ビルド後に `index.html` の `<script type="module" crossorigin src="./app.js">` を
  `<script defer src="./app.js">` に、`<link rel="stylesheet" crossorigin …>` の
  `crossorigin` を外す。**この書き換えを手でやらずに済ませる**（プラグインか
  小さなスクリプト）ところまでが仕様の範囲。
- `import.meta` が IIFE では空オブジェクトに置き換わる旨の警告が出る。
  いまの実験では動いたが、**`import.meta.env` を使っている箇所がないかを
  仕様の時点で確かめること**。
- **保存の残り方は「同じ場所に置いたまま開く」で確かめた**（同一パスのリロード）。
  **置き場所を変えたときに引き継がれるかは未確認。** `file://` の保存が
  パスごとに分かれるなら、フォルダを移すと書いたものが見えなくなる。
  仕様の時点で測ること。
- 検証スクリプト（`verify-ui.mjs`）は**開発サーバに向いている**ので、
  `file://` の確認は別の区分（または `measure-load.mjs` 側）に足すことになる。
  区分の作り方は [docs/test-spec.md](../test-spec.md) を見よ。
- 関連: [0024](0024-bundle-size.md)（初期バンドルの分割）、
  [0050](0050-html-export.md)（数式が描かれた形で文書を渡す。**別の話**——
  0050は「書いた文書を渡す」、これは「アプリ自体を渡す」）。
