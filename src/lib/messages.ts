/**
 * 画面に出る文言。記号や公式の名前は palette.ts / formulas.ts が持つので、
 * ここにあるのは枠のほう（ツールバー、ペインの見出し、確認ダイアログ）だけ。
 *
 * 文の形が言語で変わるものは、文字列の連結ではなく関数にする。
 * 「名前＋説明」を `${name}（${説明}）` で組み立てると英語の語順に合わない。
 */

import { t } from './i18n'

export const messages = {
  // ツールバー
  copy: t('Markdownをコピー', 'Copy Markdown'),
  /** 幅480px以下で出す短いほう。長いほうは aria-label に残る（0033）。 */
  copyShort: t('コピー', 'Copy'),
  copied: t('コピーしました', 'Copied'),
  copyFailed: t(
    'コピーできませんでした（手動で選択してください）',
    'Could not copy (please select the text manually)',
  ),
  newDocument: t('新規作成', 'New'),
  newDocumentConfirm: t(
    '編集中の内容を破棄して新しい文書を作成します。よろしいですか？',
    'Discard what you have written and create a new document?',
  ),
  sample: t('サンプル', 'Sample'),
  reset: t('サンプルに戻す', 'Reset to sample'),
  /** 幅480px以下で出す短いほう。長いほうは aria-label に残る（0033）。 */
  resetShort: t('戻す', 'Reset'),
  resetConfirm: t(
    '編集中の内容を破棄してサンプル文書に戻します。よろしいですか？',
    'Discard what you have written and restore the sample document?',
  ),
  // ファイルの読み込み（0012）
  openFile: t('ファイルを開く', 'Open file'),
  openFileTitle: t(
    '手元の .md ファイルを開く（ソースの欄へドラッグしてもよい）',
    'Open a .md file from your computer (or drag one onto the source pane)',
  ),
  /** 置き換える前の確認。ファイル名の位置が言語で変わるので関数にする。 */
  openConfirm: (name: string) =>
    t(
      `編集中の内容を破棄して ${name} を読み込みます。よろしいですか？`,
      `Discard what you have written and open ${name}?`,
    ),
  opened: (name: string) => t(`${name} を読み込みました`, `Opened ${name}`),
  openTooMany: t('一度に開けるのは1つだけです', 'You can open only one file at a time'),
  openWrongType: t('.md ファイルを選んでください', 'Please choose a .md file'),
  openTooLarge: t('ファイルが大きすぎます（上限1MB）', 'The file is too large (1 MB limit)'),
  openFailed: t('ファイルを読み込めませんでした', 'Could not read the file'),

  // ファイルの書き出し（0034）
  saveFile: t('ファイルに保存', 'Save to file'),
  saveFileTitle: t(
    '編集中の内容を .md ファイルとして保存する',
    'Save what you have written as a .md file',
  ),
  savedFile: (name: string) => t(`${name} を保存しました`, `Saved ${name}`),
  saveNothing: t('書き出す内容がありません', 'There is nothing to save'),

  // 算式記載ガイド（0079）
  guide: t('ガイド', 'Guide'),
  /** 幅480px以下で出す記号。長いほうは aria-label に残る（0033と同じ扱い）。 */
  guideShort: t('?', '?'),
  guideTitle: t(
    '書ける記法とコマンドの一覧を開く',
    'Open the list of notation and commands you can use',
  ),
  guideClose: t('閉じる', 'Close'),

  settings: t('設定', 'Settings'),
  readme: t('README', 'README'),
  paletteMenu: t('パレット', 'Palette'),
  sourceMenu: t('メニュー', 'Menu'),
  themePrefix: t('テーマ: ', 'Theme: '),
  themeTitle: t(
    'テーマを切り替える（自動 → ライト → ダーク）',
    'Switch theme (Auto → Light → Dark)',
  ),
  themeSystem: t('自動', 'Auto'),
  themeLight: t('ライト', 'Light'),
  themeDark: t('ダーク', 'Dark'),
  langPrefix: t('言語: ', 'Language: '),
  langTitle: t('表示言語を切り替える（日本語 / English）', 'Switch language (日本語 / English)'),

  // 保存状態
  saving: t('保存中…', 'Saving…'),
  saved: t('保存しました', 'Saved'),
  /** 時刻は言語に依らず HH:MM だが、語順が違うので関数にする。 */
  savedAt: (time: string) => t(`保存しました ${time}`, `Saved at ${time}`),
  saveFailed: t(
    '保存できません（ブラウザの設定か容量の上限）',
    'Cannot save (browser settings or storage limit)',
  ),

  // エディタ / プレビュー
  editorLabel: t('Markdownソース', 'Markdown source'),
  editorHeader: t('ソース', 'Source'),
  editorPlaceholder: t(
    'Markdownを入力… 数式は $x^2$ または $$...$$',
    'Write Markdown… math goes in $x^2$ or $$...$$',
  ),
  previewLabel: t('プレビュー', 'Preview'),
  previewHeader: t('プレビュー', 'Preview'),

  /** パレットの見出し（0056）。縦帯のときだけ画面に出る。 */
  paletteHeader: t('パレット', 'Palette'),
  previewStale: t('更新中…', 'Updating…'),
  // 数式の描画エンジンが届くまでの表示（0024）。
  previewPreparing: t('準備中…', 'Preparing…'),

  // パレット
  paletteLabel: t('記号パレット', 'Symbol palette'),

  /** 領域の境目（0057）。読み上げと検証で使う名前。 */
  paletteDivider: t('パレットとソースの境目', 'Divider between palette and source'),
  sourceDivider: t('ソースとプレビューの境目', 'Divider between source and preview'),
  formulaTab: t('公式', 'Formulas'),
  personalTab: t('自分用', 'Personal'),
  personalSaveSelection: t('選択範囲を登録', 'Save selection'),
  personalEmpty: t('よく使うMarkdownを選択して登録できます', 'Select Markdown to save it here'),
  personalNeedSelection: t('登録する範囲を選択してください', 'Select text to save first'),
  personalName: t('名前', 'Name'),
  personalBody: t('内容', 'Content'),
  personalSave: t('登録', 'Save'),
  personalUpdate: t('更新', 'Update'),
  personalEdit: t('編集', 'Edit'),
  personalDelete: t('削除', 'Delete'),
  personalCancel: t('キャンセル', 'Cancel'),
  personalNameRequired: t('名前を入力してください', 'Enter a name'),
  personalBodyRequired: t('内容を入力してください', 'Enter content'),
  personalSaved: t('自分用スニペットを保存しました', 'Saved personal snippet'),
  personalSaveFailed: t(
    '自分用スニペットを保存できません（ブラウザの設定か容量の上限）',
    'Cannot save personal snippets (browser settings or storage limit)',
  ),
  personalDeleteConfirm: (name: string) =>
    t('「' + name + '」を削除します。よろしいですか？', 'Delete “' + name + '”?'),
  personalExport: t('バックアップを書き出す', 'Export backup'),
  personalImport: t('バックアップを読み込む', 'Import backup'),
  personalExported: t('自分用スニペットをバックアップしました', 'Backed up personal snippets'),
  personalImported: t('自分用スニペットを復元しました', 'Restored personal snippets'),
  personalImportInvalid: t(
    'スニペットのバックアップとして読み込めません',
    'Could not read this as a personal snippets backup',
  ),
  personalImportConfirm: t(
    '現在の自分用スニペットをバックアップの内容で置き換えます。よろしいですか？',
    'Replace your current personal snippets with this backup?',
  ),

  // パレットの検索
  searchLabel: t('記号を検索', 'Search symbols'),
  searchPlaceholder: t('検索（\\int, 積分）', 'Search (\\int, integral)'),
  searchResults: t('検索結果', 'Search results'),
  searchEmpty: t('一致する記号がありません', 'No matching symbols'),
  /** 上限を超えた分。数だけ知らせる（絞り込めば出てくる）。 */
  searchOmitted: (count: string | number) => t(`他${count}件`, `${count} more`),
  /** 検索結果は横断なので、どのグループの記号かをtooltipに添える。 */
  inGroup: (description: string, group = '') =>
    t(`${description}［${group}］`, `${description} [${group}]`),
  // 文書内の検索・置換（0043）
  find: t('検索', 'Find'),
  findTitle: t('文書の中を検索して置き換える（Ctrl+F）', 'Find and replace in the document (Ctrl+F)'),
  findPlaceholder: t('文書内を検索', 'Find in document'),
  replacePlaceholder: t('置換後の文字列', 'Replace with'),
  /** 何件目か。日本語だけ「件」が付くので関数にする。 */
  findCount: (current: number, total: number) => t(`${current}/${total}件`, `${current}/${total}`),
  findNone: t('0件', 'No matches'),
  findPrev: t('前へ', 'Prev'),
  findNext: t('次へ', 'Next'),
  /** 幅480px以下で出す短いほう。長いほうは aria-label に残る（0033と同じ）。 */
  findPrevShort: t('‹', '‹'),
  findNextShort: t('›', '›'),
  replaceToggle: t('置換', 'Replace'),
  replaceOne: t('置換', 'Replace'),
  replaceOneShort: t('置換', 'Repl.'),
  replaceAll: t('すべて置換', 'Replace all'),
  replaceAllShort: t('全て', 'All'),
  findClose: t('閉じる', 'Close'),
  findCloseShort: t('×', '×'),
  /** 置換した件数。数字の位置が言語で変わるので関数にする。 */
  replacedCount: (count: number) => t(`${count}件を置換しました`, `Replaced ${count}`),

  // グラフ（0037）
  graphLabel: t('グラフ', 'Graph'),
  /** SVGの aria-label。式の位置が言語で変わるので関数にする。 */
  graphAlt: (functions: string) => t(`${functions} のグラフ`, `Graph of ${functions}`),
  graphNoFunction: t('グラフの式がありません', 'No function to plot'),
  graphTooManyFunctions: t('関数は3本までです', 'At most 3 functions'),
  graphBadExpression: (source: string) =>
    t(`式を読めません: ${source}`, `Cannot read expression: ${source}`),
  graphBadRange: (line: string) => t(`範囲を読めません: ${line}`, `Cannot read range: ${line}`),
  graphEmptyRange: (line: string) =>
    t(`範囲の左が右以上です: ${line}`, `Range is empty: ${line}`),
  graphUnknownLine: (line: string) => t(`読めない行です: ${line}`, `Unknown line: ${line}`),
  graphNothingToPlot: t(
    'この範囲に描ける点がありません',
    'Nothing to plot in this range',
  ),

  /** 記号の説明。日本語は全角括弧、英語は半角括弧で語順も変わる。 */
  wrapsSelection: (name: string) => t(`${name}（選択範囲を囲む）`, `${name} (wraps selection)`),
  insertsAfter: (name: string) =>
    t(`${name}（選択範囲の後ろに挿入）`, `${name} (inserts after selection)`),
} as const

export type Messages = typeof messages
