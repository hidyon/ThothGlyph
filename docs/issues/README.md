# issue一覧

このファイルがissueの状態の唯一の正。issueを追加・状態変更したら、同じコミットで
ここも更新すること。

状態は `open` / `in-progress` / `closed` の3つ。新規issueは
[TEMPLATE.md](TEMPLATE.md) をコピーして作る。番号は連番で、再利用しない。

| # | タイトル | 状態 | 仕様 |
|---|---|---|---|
| [0001](0001-autosave.md) | 編集内容の自動保存 | open | — |
| [0002](0002-dark-mode.md) | ダークモード | open | — |
| [0003](0003-image-export.md) | 数式の画像書き出し | open | — |
| [0004](0004-multi-document.md) | 複数文書の管理 | open | — |
| [0005](0005-devcontainer.md) | devcontainerでの開発に移行する | closed | [仕様](../specs/0005-devcontainer.md) |

## 着手順の目安

0001 → 0002 → 0003 → 0004 を想定している。0001の保存機構の上に0002のテーマ保持と
0004の複数文書が乗るため、0001を先に固めたい。ただし着手するissueは毎回ユーザーと
決める。この順序は拘束しない。
