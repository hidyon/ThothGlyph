// renderMarkdown を通すので、DOMPurifyのためにjsdomが要る。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { allFormulas, formulaGroups } from './formulas'
import { CURSOR_TOKEN } from './palette'
import { renderMarkdown } from './renderMarkdown'

/** 挿入されたあとの文字列（カーソル位置の印は消える）。 */
const inserted = (snippet: string) => snippet.replaceAll(CURSOR_TOKEN, '')

describe('formulaGroups', () => {
  it('6分類・30件ある', () => {
    expect(formulaGroups).toHaveLength(6)
    expect(allFormulas).toHaveLength(30)
  })

  it('各分類が5件ずつ持つ', () => {
    for (const group of formulaGroups) {
      expect(group.formulas, group.name).toHaveLength(5)
    }
  })

  it('公式の名前が重複しない', () => {
    const names = allFormulas.map((f) => f.name)

    expect(new Set(names).size).toBe(names.length)
  })

  it('分類の名前が重複しない', () => {
    const names = formulaGroups.map((g) => g.name)

    expect(new Set(names).size).toBe(names.length)
  })
})

describe('公式のLaTeX', () => {
  // 目で見ても正しさが分からないので、全件をKaTeXに通して確かめる。
  it.each(allFormulas)('$name の preview がKaTeXでエラーにならない', ({ preview }) => {
    const html = renderMarkdown(`$$\n${preview}\n$$`)

    expect(html).not.toContain('katex-error')
    expect(html).toContain('katex-display')
  })

  it.each(allFormulas)('$name の snippet がKaTeXでエラーにならない', ({ snippet }) => {
    const html = renderMarkdown(inserted(snippet))

    expect(html).not.toContain('katex-error')
    expect(html).toContain('katex-display')
  })

  it.each(allFormulas)('$name の snippet がCURSOR_TOKENをちょうど1つ含む', ({ snippet }) => {
    expect(snippet.split(CURSOR_TOKEN)).toHaveLength(2)
  })

  it.each(allFormulas)('$name の snippet がブロック数式として挿入される', ({ snippet }) => {
    expect(inserted(snippet)).toMatch(/^\n\$\$\n[\s\S]+\n\$\$\n$/)
  })
})
