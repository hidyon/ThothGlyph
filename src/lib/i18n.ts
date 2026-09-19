/**
 * 表示文字列の2言語表現。
 *
 * 翻訳を別ファイルの辞書にせず、元の文字列の隣に英語を並べて書く。記号や公式を
 * 1件足すときに触るファイルを1つに保つため（パレットはデータ駆動、という約束）。
 */

export type Lang = 'ja' | 'en'

export type Text = { ja: string; en: string }

/** 2言語をまとめて書く。`t('平方根', 'Square root')` のように使う。 */
export const t = (ja: string, en: string): Text => ({ ja, en })

/** 表示中の言語の文字列を取り出す。 */
export const pick = (text: Text, lang: Lang): string => text[lang]
