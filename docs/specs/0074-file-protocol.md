# 0074: file:// で開ける出力を作る

- 対応issue: [0074](../issues/0074-file-protocol.md)
- 状態: implemented
- 作成日: 2026-09-21

## 目的

`dist/` をコピーして `index.html` を開くだけで使えるようにする。いまは
本体が ES モジュールとして読み込まれるため、`file://`（origin が `null`）では
CORSで止まり、エディタもプレビューも出ない。

サーバを立てられない場所（USBで渡す、閲覧だけの端末、社内で許可がない）へ
アプリごと渡せるようにする。

**HTTPで配る形（`npm run build` → `npm run preview`）は今のまま変えない。**
`file://` 向けの出力を**もう1つ**作る。

## 実測（仕様を決めるために先に測った）

### 動くことは実験で確かめた

`vite.config.file.ts` 相当の設定（ESモジュールをやめて1本のIIFE、`base: './'`、
HTMLの `type="module" crossorigin` を `defer` に書き換え）でビルドし、
`Toolbar.tsx` の `/favicon.svg` を `./favicon.svg` に直したうえで
`file://` から開いた結果:

| 見たもの | 結果 |
|---|---|
| エディタ・プレビュー | 動く（数式16個・グラフ1つ・パレット23件） |
| KaTeXのフォント | 当たっている（`KaTeX_Main`、20書体） |
| 取れなかったファイル | **なし**（`/favicon.svg` を直す前はロゴの404が1件） |
| コンソールエラー | **なし** |
| 自動保存 | 効く（`thothglyph:document:v1`。リロード後も残る） |

### 速さ（幅1440px・3回の中央値・スロットルなし）

| 配り方 | textarea | 数式 | グラフ |
|---|---|---|---|
| `file://`（1本にまとめた版・app.js 602.8 kB） | 279ms | **301ms** | 305ms |
| `http://`（いまの分割ビルド・268.9 kB + 遅延332.6 kB） | 243ms | **273ms** | 278ms |

**差は約30ms。** `file://` はローカルディスクから読むので、
[N10](../requirements.md)（細い回線で1.5秒以内）が想定する回線がそもそも無い。

### 保存は `file://` 全体で1つを共有する

別のフォルダへコピーして開いても、**前の場所で書いたものがそのまま出た**。
`file://` のページは保存を共有している（パスごとに分かれない）。

- **置き場所を変えても書いたものは残る**（利用者にとっては良い側）。
- 一方で、**2つのコピーを別々のノートとしては使えない**。
  これは仕様として受け入れ、READMEに書く。

### `import.meta` は使っていない

IIFEにすると `import.meta` が空オブジェクトに置き換わる警告が出るが、
`src/` と `scripts/` と `index.html` に `import.meta` は**1件もない**（実測）。
実験でも動いている。

### 壊れる既存チェック

**1件だけ。**

| 区分 | チェック | いま | 直し方 |
|---|---|---|---|
| `icon` | ツールバーのアイコンが favicon.svg を参照している | `/favicon.svg` と完全一致で判定 | `./favicon.svg` を許す（相対に変えるため） |

`loading` 区分14件と `measure-load.mjs` の12件は、**HTTP向けの出力を
変えないので影響を受けない**（下の「検討したが採らなかった案」を見よ）。

## 仕様

### 1. `file://` 向けのビルド設定を足す

`vite.config.file.ts` をリポジトリの根に置く。**いまの `vite.config.ts` は変えない。**

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * file:// で開ける出力を作る設定（0074）。
 *
 * ESモジュールは origin が null の file:// では取得を拒否されるので、
 * 1本のIIFEにまとめて classic script として読む。**classic script は
 * defer されない**ので、defer を付けないと #root より先に走って React が落ちる。
 */
const forFileProtocol = () => ({
  name: 'for-file-protocol',
  transformIndexHtml: {
    order: 'post' as const,
    handler: (html: string) =>
      html
        .replace(
          /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
          '<script defer src="$1"></script>',
        )
        .replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, '<link rel="stylesheet" href="$1">'),
  },
})

export default defineConfig({
  plugins: [react(), forFileProtocol()],
  base: './',
  build: {
    outDir: 'dist-file',
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

`package.json` に足すスクリプト:

```json
"build:file": "tsc -b && vite build --config vite.config.file.ts"
```

`.gitignore` に `dist-file` を足す（`dist` と同じ扱い）。

### 2. ツールバーのロゴを相対パスにする

`src/components/Toolbar.tsx:88` の `src="/favicon.svg"` を `./favicon.svg` にする。
**この1行だけが両方の出力で共有される変更。** 開発サーバとHTTP配信では
どちらも `/` 直下で配るので、相対にしても同じファイルを指す
（`icon` 区分で確認する）。

### 3. `file://` の出力を検証するスクリプトを足す

`scripts/verify-file-build.mjs`（新規）。`verify-ui.mjs` は開発サーバ前提
（`http://localhost:5173`）なので分ける。やること:

1. `npm run build:file` を実行する
2. ヘッドレスChromiumで `file://<絶対パス>/dist-file/index.html` を開く
3. 下の受け入れ基準を1項目1チェックで確かめる（`verify-ui.mjs` と同じ形で
   OK/NG を出し、1件でも落ちたら終了コード1、結果を `tmp/verify-file.json` に書く）

**`verify-ui.mjs` の429件はこのスクリプトに移さない**（重複させない）。
ここで見るのは「`file://` で成り立つか」だけにする。

### 4. READMEに「サーバなしで使う」を足す

いまのREADMEには配り方が書かれていない。次の3つを短く書く。

- `npm run build` → `npm run preview`（HTTPで配る。いつもの使い方）
- `npm run build:file` → `dist-file/` をコピーして `index.html` を開く（サーバ不要）
- **書いたものは `file://` 全体で1つを共有する**ので、2つのコピーを
  別々のノートとしては使えない

### 対象ファイル

| ファイル | すること |
|---|---|
| `vite.config.file.ts` | 新規（上記） |
| `package.json` | `build:file` を足す |
| `.gitignore` | `dist-file` を足す |
| `src/components/Toolbar.tsx` | ロゴを `./favicon.svg` に |
| `scripts/verify-file-build.mjs` | 新規 |
| `scripts/verify-ui.mjs` | `icon` 区分1件の判定を直す |
| `README.md` | 「サーバなしで使う」を足す |
| `docs/architecture.md` | 出力が2つあることと、なぜ分けるかを書く |
| `docs/test-spec.md` | 新しいスクリプトを検証の一覧に足す |
| `docs/functional-spec.md` | 触らない（画面の振る舞いは変わらない） |

## 未確認の前提

- **なし。** ビルドの通り方、`file://` での描画・フォント・自動保存、
  別フォルダへ移したときの保存の引き継ぎ、`import.meta` の不在、
  壊れる既存チェックの件数（1件）を、すべて仕様を書く前に実測した。

## 受け入れ基準

実際に確認した結果を各項目の後ろに書いた。

### `node scripts/verify-file-build.mjs`

**15/15件OK**（約25秒）。

- [x] `npm run build:file` が終了コード0で通り、`dist-file/index.html` と `dist-file/app.js` ができる
- [x] `<script defer src="./app.js">` になっている（`type="module"` と `crossorigin` が無い）
- [x] `file://` で開くと、取れなかったファイルが**0件**
- [x] `file://` で開くと、コンソールエラーが**0件**
- [x] `file://` でエディタが出て、プレビューに数式が16個・グラフが1つ描かれる
- [x] `file://` でパレットのボタンが出て（基本タブ23件）、押すと挿入される
- [x] `file://` でKaTeXのフォントが当たっている（`KaTeX_Main, "Times New Roman", serif`）
- [x] `file://` でツールバーのロゴが描かれている（`naturalWidth` 32）
- [x] `file://` で書いた内容がリロード後も残る
- [x] `file://` で別のフォルダへコピーして開いても書いた内容が出る（保存を共有している）
- [x] `file://` で数式が出るまでが1秒以内（**実測692ms**。textareaまで657ms）

`dist-file/` は**1.9 MB・69ファイル**（`dist/` は70ファイル）。

### HTTPで配る形が変わっていないこと

- [x] `npm run build` の初期JSが**268.85 kB**（変わらず。遅延340.62 kB）
- [x] `node scripts/measure-load.mjs` が**11/12件OK**で、落ちるのは初期CSSの超過1件だけ（[0073](../issues/0073-initial-css-size.md)。実装前と同じ）
- [x] `node scripts/verify-ui.mjs` が全区分通る（**438/438**。`icon` の1件を直した）
- [x] `npm test` が957件通る
- [x] `npm run build` と `npm run lint` が通る

### 文書

- [x] READMEに「手元で使う」があり、2つの配り方と保存の注意が書かれている
- [x] `docs/architecture.md` に第8節「ビルドの出力は2つある」を足した
- [x] `docs/test-spec.md` に新しいスクリプトの一覧を足した

## 実装で変えたところ

**仕様どおりで、変えたところはない。** 事前に洗った1件（`icon` 区分の
`/favicon.svg` 完全一致）も想定どおりで、**実装後に落ちたチェックは0件**だった。

仕様に書いていなかった細部を2つ足している。

- **`tsconfig.node.json` の `include` に `vite.config.file.ts` を足した。**
  `build:file` は `tsc -b` を通るので、設定ファイル自体も型検査の対象にする
  （`include` が `["vite.config.ts"]` だけだと新しい設定が検査されない）。
- **README のファイル数を実測で書いた**（`dist-file/` は69ファイル）。
  仕様には「1.9 MB」までしか書いていなかった。

## 検討したが採らなかった案

- **出力を1つにして `file://` 向けだけにする**（0024を諦める）。
  ユーザーからは「0024は諦めてもよい」と言われているが、**諦めなくても
  目的は達せられる**ので採らない。諦めると次のものを失う。
  - [N10](../requirements.md)（初期JSは300 kB以下）が602.8 kBになり、**要求仕様の書き換え**が要る
  - `準備中…`（エンジンが届く前でも打てる・保存できる）が意味を失い、`loading` 区分**14件**が宙に浮く
  - `measure-load.mjs` の12件のうち、初期JS・gzip・遅延チャンクの目印を見る**5件**が成り立たなくなる
  - 対して得るものは「設定ファイル1つとnpmスクリプト1つを持たなくてよい」だけ
- **1つのHTMLファイルに全部詰める**（フォントもbase64で埋める）。
  KaTeXのフォントが1.8 MBあり、単一HTMLが2.4 MB前後になる。
  「フォルダをコピーして index.html を開く」で足りるので採らない。
  **本当に1ファイルが要る場面（メールで送るなど）が出たら別issueにする。**
- **利用者に `--allow-file-access-from-files` で起動してもらう。**
  いまの `dist` がそのまま使えるが、**起動オプションを要求するのは配る形として重い**。
- **`dist` の中に `file://` 向けも同梱する。** 出力が混ざって、
  どちらを配ったのか分からなくなる。別のフォルダ（`dist-file/`）にする。

## スコープ外

- **`dist`（HTTP向け）の作り方を変えること。** [0024](0024-bundle-size.md)の分割はそのまま。
- **初期CSSの超過**（[0073](../issues/0073-initial-css-size.md)）。
- **書いた文書を配る形**（[0050](../issues/0050-html-export.md)）。これはアプリ自体を配る話。
- **CIで両方のビルドを流すこと**（[0025](../issues/0025-ci.md)）。
- **`file://` でのファイルの読み書き**（[0012](0012-file-load.md)・[0034](0034-file-save.md)）。
  ダウンロードとファイル選択が `file://` でどう振る舞うかは**この仕様では見ない**。
  受け入れ基準に入れていないので、動く保証もしない。
