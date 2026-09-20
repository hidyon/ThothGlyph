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
  previewStale: t('更新中…', 'Updating…'),
  // 数式の描画エンジンが届くまでの表示（0024）。
  previewPreparing: t('準備中…', 'Preparing…'),

  // パレット
  paletteLabel: t('記号パレット', 'Symbol palette'),
  formulaTab: t('公式', 'Formulas'),

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
