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
  copied: t('コピーしました', 'Copied'),
  copyFailed: t(
    'コピーできませんでした（手動で選択してください）',
    'Could not copy (please select the text manually)',
  ),
  reset: t('サンプルに戻す', 'Reset to sample'),
  resetConfirm: t(
    '編集中の内容を破棄してサンプル文書に戻します。よろしいですか？',
    'Discard what you have written and restore the sample document?',
  ),
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

  // パレット
  paletteLabel: t('記号パレット', 'Symbol palette'),
  formulaTab: t('公式', 'Formulas'),
  /** 記号の説明。日本語は全角括弧、英語は半角括弧で語順も変わる。 */
  wrapsSelection: (name: string) => t(`${name}（選択範囲を囲む）`, `${name} (wraps selection)`),
  insertsAfter: (name: string) =>
    t(`${name}（選択範囲の後ろに挿入）`, `${name} (inserts after selection)`),
} as const

export type Messages = typeof messages
