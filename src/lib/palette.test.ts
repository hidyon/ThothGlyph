// KaTeXでの描画を確かめるので、jsdomではなくnodeで足りる（katexは文字列を返す）。
import katex from 'katex'
import { describe, expect, it } from 'vitest'
import {
  CURSOR_TOKEN,
  describeInsertion,
  paletteGroups,
  wrapsSelection,
} from './palette'

const groupNamed = (name: string) =>
  paletteGroups.find((group) => group.name === name)

describe('wrapsSelection', () => {
  it('CURSOR_TOKENを持つスニペットはtrue', () => {
    expect(wrapsSelection(`\\sqrt{${CURSOR_TOKEN}}`)).toBe(true)
  })

  it('CURSOR_TOKENを持たない単体記号はfalse', () => {
    expect(wrapsSelection('\\pi')).toBe(false)
  })
})

describe('describeInsertion', () => {
  it('単体記号には「選択範囲の後ろに挿入」を付ける', () => {
    expect(describeInsertion({ label: '\\pi', snippet: '\\pi', title: '円周率' })).toBe(
      '円周率（選択範囲の後ろに挿入）',
    )
  })

  it('囲める記号には「選択範囲を囲む」を付ける', () => {
    expect(
      describeInsertion({
        label: '\\sqrt{x}',
        snippet: `\\sqrt{${CURSOR_TOKEN}}`,
        title: '平方根',
      }),
    ).toBe('平方根（選択範囲を囲む）')
  })

  it('パレットの全項目がどちらかの文言を持つ', () => {
    const items = paletteGroups.flatMap((group) => group.items)

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(describeInsertion(item)).toMatch(/（選択範囲(を囲む|の後ろに挿入)）$/)
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
    .filter((group) => group.name !== 'Markdown')
    .flatMap((group) => group.items)
  // 目で見ても正しさが分からないので、全件をKaTeXに通して確かめる。
  const renders = (latex: string) => {
    katex.renderToString(latex, { throwOnError: true })
  }

  it.each(items)('$title の label が描画できる', ({ label }) => {
    expect(() => renders(label)).not.toThrow()
  })

  it.each(mathItems)('$title の snippet が描画できる', ({ snippet }) => {
    expect(() => renders(snippet.replaceAll(CURSOR_TOKEN, ''))).not.toThrow()
  })
})
