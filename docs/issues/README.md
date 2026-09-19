# issue一覧

このファイルがissueの状態の唯一の正。issueを追加・状態変更したら、同じコミットで
ここも更新すること。

状態は `open` / `in-progress` / `closed` の3つ。新規issueは
[TEMPLATE.md](TEMPLATE.md) をコピーして作る。番号は連番で、再利用しない。

| # | タイトル | 状態 | 仕様 |
|---|---|---|---|
| [0001](0001-autosave.md) | 編集内容の自動保存 | closed | [仕様](../specs/0001-autosave.md) |
| [0002](0002-dark-mode.md) | ダークモード | open | — |
| [0003](0003-image-export.md) | 数式の画像書き出し | open | — |
| [0004](0004-multi-document.md) | 複数文書の管理 | open | — |
| [0005](0005-devcontainer.md) | devcontainerでの開発に移行する | closed | [仕様](../specs/0005-devcontainer.md) |
| [0006](0006-math-in-code.md) | コードブロック内の `$` が数式として描画される | closed | [仕様](../specs/0006-math-in-code.md) |
| [0007](0007-preview-performance.md) | 長い文書でプレビューが重い | closed | [仕様](../specs/0007-preview-performance.md) |
| [0008](0008-keyboard-shortcuts.md) | キーボードショートカット | open | — |
| [0009](0009-wrap-selection.md) | 選択範囲があるときの挿入の扱いを揃える | open | — |
| [0010](0010-scroll-sync.md) | スクロール同期と編集位置の復元 | open | — |
| [0011](0011-palette-search.md) | 記号パレットの検索 | open | — |
| [0012](0012-file-io.md) | .mdファイルの書き出しと読み込み | open | — |
| [0013](0013-print-style.md) | 印刷とPDF出力のスタイル | open | — |
| [0014](0014-unit-tests.md) | 単体テストの土台を入れる | closed | [仕様](../specs/0014-unit-tests.md) |
| [0015](0015-error-list.md) | 数式エラーの一覧 | open | — |
| [0016](0016-product-docs.md) | プロダクト全体の仕様文書を書く | closed | [仕様](../specs/0016-product-docs.md) |

## 着手順の目安

0014 → 0006 → 0007 は完了した。次は 0002（ダークモード）→ 0008・0009（編集の打鍵）
→ 0004（複数文書）を想定している。0004は0001の保存機構の上に乗るので、
保存形式を変える0010より後がやりやすい。この順序は拘束しない。
着手するissueは毎回ユーザーと決める。
