# issue一覧

このファイルがissueの状態の唯一の正。issueを追加・状態変更したら、同じコミットで
ここも更新すること。

状態は `open` / `in-progress` / `closed` の3つ。新規issueは
[TEMPLATE.md](TEMPLATE.md) をコピーして作る。番号は連番で、再利用しない。

| # | タイトル | 状態 | 仕様 |
|---|---|---|---|
| [0001](0001-autosave.md) | 編集内容の自動保存 | closed | [仕様](../specs/0001-autosave.md) |
| [0002](0002-dark-mode.md) | ダークモード | closed | [仕様](../specs/0002-dark-mode.md) |
| [0003](0003-image-export.md) | 数式の画像書き出し | open | — |
| [0004](0004-multi-document.md) | 複数文書の管理 | open | — |
| [0005](0005-devcontainer.md) | devcontainerでの開発に移行する | closed | [仕様](../specs/0005-devcontainer.md) |
| [0006](0006-math-in-code.md) | コードブロック内の `$` が数式として描画される | closed | [仕様](../specs/0006-math-in-code.md) |
| [0007](0007-preview-performance.md) | 長い文書でプレビューが重い | closed | [仕様](../specs/0007-preview-performance.md) |
| [0008](0008-keyboard-shortcuts.md) | キーボードショートカット | open | — |
| [0009](0009-wrap-selection.md) | 選択範囲があるときの挿入の扱いを揃える | closed | [仕様](../specs/0009-wrap-selection.md) |
| [0010](0010-scroll-sync.md) | スクロール同期と編集位置の復元 | open | — |
| [0011](0011-palette-search.md) | 記号パレットの検索 | open | — |
| [0012](0012-file-io.md) | .mdファイルの書き出しと読み込み | open | — |
| [0013](0013-print-style.md) | 印刷とPDF出力のスタイル | open | — |
| [0014](0014-unit-tests.md) | 単体テストの土台を入れる | closed | [仕様](../specs/0014-unit-tests.md) |
| [0015](0015-error-list.md) | 数式エラーの一覧 | open | — |
| [0016](0016-product-docs.md) | プロダクト全体の仕様文書を書く | closed | [仕様](../specs/0016-product-docs.md) |
| [0017](0017-verify-script-structure.md) | 検証スクリプトが育ちすぎている | closed | [仕様](../specs/0017-verify-script-structure.md) |
| [0018](0018-formula-library.md) | 有名な公式を選んで挿入する | closed | [仕様](../specs/0018-formula-library.md) |
| [0019](0019-app-icon.md) | アプリのアイコン | open | — |
| [0020](0020-preview-click-to-edit.md) | プレビューでクリックした箇所をパレットで編集する | open | — |
| [0021](0021-undo.md) | パレットで挿入したあとUndoで戻せない | open | — |
| [0022](0022-narrow-pane-switch.md) | 狭い画面でソースとプレビューを切り替えられない | open | — |
| [0023](0023-snapshot-recovery.md) | 誤操作から書いたものを取り戻せない | open | — |
| [0024](0024-bundle-size.md) | 初期バンドルが563kBある | open | — |
| [0025](0025-ci.md) | CIがない | open | — |
| [0026](0026-typescript-strict.md) | TypeScriptがstrictでない | closed | [仕様](../specs/0026-typescript-strict.md) |
| [0027](0027-verify-flaky.md) | 検証スクリプトの結果が再現しないことがある | closed | [仕様](../specs/0027-verify-flaky.md) |
| [0028](0028-initial-section-checks.md) | 初期表示の区分にチェックが1件もない | open | — |
| [0029](0029-greek-complete.md) | ギリシャ文字をすべてパレットから入力できるようにする | closed | [仕様](../specs/0029-greek-complete.md) |
| [0030](0030-formula-library-more.md) | 公式をさらに30件追加する | closed | [仕様](../specs/0030-formula-library-more.md) |
| [0031](0031-english-ui.md) | 英語に対応する | closed | [仕様](../specs/0031-english-ui.md) |
| [0032](0032-palette-height-narrow.md) | 狭い画面でパレットが画面の3割を占める | open | — |

## 着手順の目安

0014 → 0006 → 0007 → 0002 → 0009 は完了した。次は 0008（キーボード
ショートカット。0009で固めた `insertSnippet` の上に乗る）
→ 0004（複数文書）を想定している。0004は0001の保存機構の上に乗るので、
保存形式を変える0010より後がやりやすい。この順序は拘束しない。
着手するissueは毎回ユーザーと決める。

入力の手数を減らす系のうち0018（公式の挿入）は完了した。残る0011（記号の検索）と
0020（プレビューからの編集）は互いに関わる。0011で検索を作るなら、
記号62件と公式30件の両方を対象にすると一貫する。

**パレットの中身を増やす系**（0029 ギリシャ文字・0030 公式の追加）は、
どちらもデータを足すだけなので軽い。ただし件数が増えるほど0011（検索）の
必要性が上がるので、先に0011をやる手もある。

0031（英語対応）は完了した。0029・0030を先に入れたぶん翻訳は約182件に増えたが、
翻訳を元の文字列の隣に置く形（`t('平方根', 'Square root')`）にしたので、
**これ以降に記号や公式を足すときは1行に両方書くだけで済む**。
以後に画面の文言を足すときは `lib/messages.ts` に2言語で書く。
0019（アイコン）は他のどれとも独立していて、いつ着手してもよい。

**安いうちにやると得なもの**: 0026（strict）は完了した（実測どおりコードの変更は
ゼロで済んだ）。0023（履歴からの復旧）は保存形式を変えるので、
0004（複数文書）より先か同時がよい。

0017（検証の区分け）と0027（検証の揺れ）は完了した。設計をまとめて行い、
実装を2つに分けたことで、同じファイルを2回書き換えずに済んだ。
残りは0028（初期表示の区分にチェックがない）。

**0021（Undo）は0008（ショートカット）と近い。** どちらもキー入力とtextareaの
扱いに触れるので、続けてやると土台を共有できる。
