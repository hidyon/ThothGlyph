// renderMarkdown を通すので、DOMPurifyのためにjsdomが要る。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { allFormulas, formulaGroups } from './formulas'
import { CURSOR_TOKEN } from './palette'
import { renderMarkdown } from './renderMarkdown'

/** 挿入されたあとの文字列（カーソル位置の印は消える）。 */
const inserted = (snippet: string) => snippet.replaceAll(CURSOR_TOKEN, '')

describe('formulaGroups', () => {
  it('12分類・60件ある', () => {
    expect(formulaGroups).toHaveLength(12)
    expect(allFormulas).toHaveLength(60)
  })

  it('各分類が5件ずつ持つ', () => {
    for (const group of formulaGroups) {
      expect(group.formulas, group.name.ja).toHaveLength(5)
    }
  })

  it('公式の名前が重複しない', () => {
    const names = allFormulas.map((f) => f.name.ja)

    expect(new Set(names).size).toBe(names.length)
  })

  // 英語名はパレットのReactのkeyに使うので、重複すると描画が壊れる。
  it('英語の公式名・分類名も重複しない', () => {
    const names = allFormulas.map((f) => f.name.en)
    const groups = formulaGroups.map((g) => g.name.en)

    expect(new Set(names).size).toBe(names.length)
    expect(new Set(groups).size).toBe(groups.length)
  })

  it('0018で合意した既存6分類の中身が変わっていない', () => {
    // 0030で足したのは後ろの6分類だけ。既存に手を入れると探し方が変わってしまう。
    const original = formulaGroups.slice(0, 6)

    expect(original.map((g) => g.name.ja)).toEqual([
      '方程式', '三角比', '三角関数', '指数・対数', '数列', '微分・積分',
    ])
    expect(original.flatMap((g) => g.formulas.map((f) => f.name.ja))).toEqual([
      '解の公式', '判別式', '解と係数の関係', '因数分解（2乗の差）', '展開（和の2乗）',
      '相互関係', '正弦定理', '余弦定理', '加法定理（sin）', '加法定理（cos）',
      '2倍角（sin）', '2倍角（cos）', '半角（sin²）', '和積（sinの和）', '三角関数の合成',
      '指数法則（積）', '指数法則（べき）', '対数の積', '対数の商', '底の変換',
      '等差数列の一般項', '等差数列の和', '等比数列の一般項', '等比数列の和', 'Σk の公式',
      '微分の定義', 'べき乗の微分', '積の微分', 'べき乗の積分', '定積分と面積',
    ])
  })

  it('分類の名前が重複しない', () => {
    const names = formulaGroups.map((g) => g.name.ja)

    expect(new Set(names).size).toBe(names.length)
  })
})

describe('公式のLaTeX', () => {
  // 目で見ても正しさが分からないので、全件をKaTeXに通して確かめる。
  it.each(allFormulas)('$name.ja の preview がKaTeXでエラーにならない', ({ preview }) => {
    const html = renderMarkdown(`$$\n${preview}\n$$`)

    expect(html).not.toContain('katex-error')
    expect(html).toContain('katex-display')
  })

  it.each(allFormulas)('$name.ja の snippet がKaTeXでエラーにならない', ({ snippet }) => {
    const html = renderMarkdown(inserted(snippet))

    expect(html).not.toContain('katex-error')
    expect(html).toContain('katex-display')
  })

  it.each(allFormulas)('$name.ja の snippet がCURSOR_TOKENをちょうど1つ含む', ({ snippet }) => {
    expect(snippet.split(CURSOR_TOKEN)).toHaveLength(2)
  })

  it.each(allFormulas)('$name.ja の snippet がブロック数式として挿入される', ({ snippet }) => {
    expect(inserted(snippet)).toMatch(/^\n\$\$\n[\s\S]+\n\$\$\n$/)
  })
})
