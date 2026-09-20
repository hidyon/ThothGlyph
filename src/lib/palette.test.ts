// KaTeXでの描画を確かめるので、jsdomではなくnodeで足りる（katexは文字列を返す）。
import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { t } from './i18n'
import {
  CURSOR_TOKEN,
  describeInsertion,
  paletteGroups,
  wrapsSelection,
} from './palette'

/** グループは日本語名で引く（テストの読みやすさを優先。英語名でも一意）。 */
const groupNamed = (name: string) =>
  paletteGroups.find((group) => group.name.ja === name)

describe('wrapsSelection', () => {
  it('CURSOR_TOKENを持つスニペットはtrue', () => {
    expect(wrapsSelection(`\\sqrt{${CURSOR_TOKEN}}`)).toBe(true)
  })

  it('CURSOR_TOKENを持たない単体記号はfalse', () => {
    expect(wrapsSelection('\\pi')).toBe(false)
  })
})

describe('describeInsertion', () => {
  const pi = { label: '\\pi', snippet: '\\pi', title: t('円周率', 'Pi') }
  const sqrt = {
    label: '\\sqrt{x}',
    snippet: `\\sqrt{${CURSOR_TOKEN}}`,
    title: t('平方根', 'Square root'),
  }

  it('単体記号には「選択範囲の後ろに挿入」を付ける', () => {
    expect(describeInsertion(pi, 'ja')).toBe('円周率（選択範囲の後ろに挿入）')
  })

  it('囲める記号には「選択範囲を囲む」を付ける', () => {
    expect(describeInsertion(sqrt, 'ja')).toBe('平方根（選択範囲を囲む）')
  })

  // 英語は語順も括弧も変わる。文字列の連結では作れないことを固定しておく。
  it('英語では名前のあとに半角括弧で説明を置く', () => {
    expect(describeInsertion(sqrt, 'en')).toBe('Square root (wraps selection)')
    expect(describeInsertion(pi, 'en')).toBe('Pi (inserts after selection)')
  })

  it('パレットの全項目がどちらかの文言を持つ', () => {
    const items = paletteGroups.flatMap((group) => group.items)

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(describeInsertion(item, 'ja')).toMatch(/（選択範囲(を囲む|の後ろに挿入)）$/)
      expect(describeInsertion(item, 'en')).toMatch(/ \((wraps|inserts after) selection\)$/)
    }
  })
})

describe('ギリシャ文字', () => {
  // 小文字24文字。ここから1文字でも欠けると「すべて入力できる」が崩れる。
  const LOWERCASE = [
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
    'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
    'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  ]

  it('小文字は24文字＋異体字7件で31件', () => {
    expect(groupNamed('ギリシャ小文字')?.items).toHaveLength(31)
  })

  it('大文字はラテン文字と字形が異なる11件', () => {
    expect(groupNamed('ギリシャ大文字')?.items).toHaveLength(11)
  })

  it.each(LOWERCASE)('小文字の %s がパレットにある', (name) => {
    const items = groupNamed('ギリシャ小文字')?.items ?? []

    expect(items.some((item) => item.snippet.trim() === `\\${name}`)).toBe(true)
  })
})

describe('パレット全件のLaTeX', () => {
  // Markdownグループのsnippetは `## ` のようなMarkdown記法で、LaTeXではない。
  // labelだけは全件がLaTeX（ボタンに描画するため）。
  const items = paletteGroups.flatMap((group) => group.items)
  const mathItems = paletteGroups
    .filter((group) => group.name.ja !== 'Markdown')
    .flatMap((group) => group.items)
  // 目で見ても正しさが分からないので、全件をKaTeXに通して確かめる。
  const renders = (latex: string) => {
    katex.renderToString(latex, { throwOnError: true })
  }

  it.each(items)('$title.ja の label が描画できる', ({ label }) => {
    expect(() => renders(label)).not.toThrow()
  })

  it.each(mathItems)('$title.ja の snippet が描画できる', ({ snippet }) => {
    expect(() => renders(snippet.replaceAll(CURSOR_TOKEN, ''))).not.toThrow()
  })
})

// READMEに書いた件数（0035）。数が変わったらここが落ちるので、README側も直す。
describe('READMEに書いた件数', () => {
  it('記号は7グループ88件', () => {
    expect(paletteGroups).toHaveLength(7)
    expect(paletteGroups.reduce((total, group) => total + group.items.length, 0)).toBe(88)
  })
})
