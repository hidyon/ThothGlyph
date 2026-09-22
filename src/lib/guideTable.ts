/**
 * 算式記載ガイド 第2部「コマンド一覧」のMarkdownを組む（0079）。
 *
 * データ（`guideCommands.ts`）はKaTeXのソースから生成したもので、ここでは
 * 並べ方だけを持つ。**純粋関数**なので単体テストで確かめる。
 *
 * 名前の欄は `palette.ts` の日英の名前から引く。964件ぶんの名前を新しく
 * 書き起こさず、既に持っているものだけ出す（無ければ空欄）。
 */

import type { GuideCategory } from './guideCommands'
import { guideCommands, guideEnvironments } from './guideCommands'
import type { Lang, Text } from './i18n'
import { pick, t } from './i18n'
import { paletteGroups } from './palette'

/** 表に出す分類の順と名前。データ側の `category` と1対1。 */
export const guideCategories: { id: GuideCategory; name: Text }[] = [
  { id: 'fraction', name: t('分数と二項係数', 'Fractions and binomials') },
  { id: 'bracket', name: t('括弧・区切り', 'Brackets and delimiters') },
  { id: 'operator', name: t('大きな演算子', 'Large operators') },
  { id: 'binary', name: t('二項演算子', 'Binary operators') },
  { id: 'relation', name: t('関係子', 'Relations') },
  { id: 'arrow', name: t('矢印', 'Arrows') },
  { id: 'letter', name: t('文字と変数', 'Letters and variables') },
  { id: 'accent', name: t('装飾・アクセント', 'Accents') },
  { id: 'font', name: t('書体・文字の大きさ', 'Fonts and sizes') },
  { id: 'enclose', name: t('囲み・線', 'Boxes and lines') },
  { id: 'spacing', name: t('間隔・改行', 'Spacing and line breaks') },
  { id: 'symbol', name: t('その他の記号', 'Other symbols') },
  { id: 'macro', name: t('マクロ・その他', 'Macros and others') },
]

/**
 * パレットの名前を引くための索引。`\frac{a}{b}` のようなラベルから
 * 先頭のコマンド（`\frac`）を取り出して名前に結びつける。
 * 同じコマンドが複数のラベルに出るときは、先に定義されたほうを採る。
 */
const nameIndex = (() => {
  const index = new Map<string, Text>()
  for (const group of paletteGroups) {
    for (const item of group.items) {
      for (const match of item.label.matchAll(/\\[a-zA-Z]+/g)) {
        if (!index.has(match[0])) index.set(match[0], item.title)
      }
    }
  }
  return index
})()

/** 表のセルに入れる文字列。`|` は表を壊すのでエスケープする。 */
const cell = (value: string) => value.replace(/\|/g, '\\|')

/**
 * ブロック数式でしか描けないものの断り書き。表のセルに `$$` は置けない
 * （ブロック数式は行の単位で退避される）ので、文言で代える。
 */
const displayOnly = t('ブロック数式の中でのみ', 'In display math only')

const commandRow = (
  command: { name: string; latex: string; displayMode?: true },
  lang: Lang,
): string => {
  const drawn = command.displayMode ? pick(displayOnly, lang) : `$${command.latex}$`
  const name = nameIndex.get(command.name)
  return `| \`${cell(command.latex)}\` | ${cell(drawn)} | ${name ? cell(pick(name, lang)) : ''} |`
}

/** 第2部の見出しと、分類ごとの表を並べたMarkdownを返す。 */
export const buildCommandTable = (lang: Lang): string => {
  const header = pick(t('| コマンド | 描画 | 名前 |', '| Command | Rendered | Name |'), lang)
  const rule = '|---|---|---|'
  const parts: string[] = []

  for (const category of guideCategories) {
    const rows = guideCommands.filter((command) => command.category === category.id)
    if (rows.length === 0) continue
    parts.push(`### ${pick(category.name, lang)}（${rows.length}）`)
    parts.push([header, rule, ...rows.map((row) => commandRow(row, lang))].join('\n'))
  }

  const envHeader = pick(t('| 環境 | 書き方 |', '| Environment | How to write |'), lang)
  const envTitle = pick(t('環境', 'Environments'), lang)
  const envRows = guideEnvironments.map(
    (env) => `| \`${cell(env.name)}\` | \`${cell(env.latex)}\` |`,
  )
  parts.push(`### ${envTitle}（${guideEnvironments.length}）`)
  parts.push(
    pick(
      t(
        'ブロック数式（`$$`）の中で `\\begin{…}` と `\\end{…}` で囲んで使う。',
        'Use inside display math (`$$`) with `\\begin{…}` and `\\end{…}`.',
      ),
      lang,
    ),
  )
  parts.push([envHeader, '|---|---|', ...envRows].join('\n'))

  return parts.join('\n\n')
}

/** 一覧に載っているコマンドの件数（テストと本文の突き合わせに使う）。 */
export const guideCommandCount = guideCommands.length
