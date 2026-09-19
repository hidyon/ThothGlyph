# matheditor

数式入りMarkdownを書くためのWebエディタ。左にMarkdownソース、右にリアルタイム
プレビュー、上部に記号パレット。書いたソースはクリップボードにコピーして持ち出す。

## 使い方

数式は `$x^2$`（インライン）と `$$...$$`（ブロック）で書く。記号パレットの
ボタンを押すと、カーソル位置にLaTeXコマンドが挿入される。テキストを選択してから
押すと、その選択部分を包む。

## 開発

開発はdevcontainer内で行う。Docker と VSCode の Dev Containers 拡張が要る。

1. このリポジトリをcloneしてVSCodeで開く
2. 「Reopen in Container」を選ぶ（Node 22、検証用Chromium、依存パッケージが揃う）
3. `npm run dev` → http://localhost:5173

| 目的 | コマンド |
|---|---|
| 開発サーバ | `npm run dev` |
| 型チェック＋ビルド | `npm run build` |
| Lint | `npm run lint` |
| UIの実機検証 | `node scripts/verify-ui.mjs` |

このリポジトリは仕様駆動開発で進めている。進め方は [CLAUDE.md](CLAUDE.md)、
issueは [docs/issues/](docs/issues/) を参照。
