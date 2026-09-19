# matheditor

数式入りMarkdownを書くためのWebエディタ。左にMarkdownソース、右にリアルタイム
プレビュー、上部に記号パレット。書いたソースはクリップボードにコピーして持ち出す。

## 使い方

```bash
npm install
npm run dev   # http://localhost:5173
```

数式は `$x^2$`（インライン）と `$$...$$`（ブロック）で書く。記号パレットの
ボタンを押すと、カーソル位置にLaTeXコマンドが挿入される。テキストを選択してから
押すと、その選択部分を包む。

## 開発

このリポジトリは仕様駆動開発で進めている。進め方は [CLAUDE.md](CLAUDE.md)、
issueは [docs/issues/](docs/issues/) を参照。

| 目的 | コマンド |
|---|---|
| 開発サーバ | `npm run dev` |
| 型チェック＋ビルド | `npm run build` |
| Lint | `npm run lint` |
