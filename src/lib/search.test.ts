import { describe, expect, it } from 'vitest'
import { SEARCH_LIMIT, hitKey, hitSnippet, searchPalette } from './search'
import type { SearchHit } from './search'

/** 結果に含まれる記号のlabel（公式は名前）を並べる。 */
const labels = (hits: SearchHit[]) =>
  hits.map((hit) => (hit.kind === 'symbol' ? hit.item.label : hit.formula.name.ja))

describe('searchPalette', () => {
  it('コマンド名で引ける（バックスラッシュの有無と大文字小文字を問わない）', () => {
    for (const query of ['\\alpha', 'alpha', 'ALPHA']) {
      expect(labels(searchPalette(query).hits), query).toContain('\\alpha')
    }
  })

  it('日本語の名前でも英語の名前でも同じ記号を引く', () => {
    const ja = labels(searchPalette('積分').hits)
    const en = labels(searchPalette('integral').hits)

    expect(ja).toContain('\\int_{a}^{b}')
    expect(en).toContain('\\int_{a}^{b}')
  })

  it('labelの部分一致で引ける', () => {
    expect(labels(searchPalette('frac').hits)).toContain('\\frac{a}{b}')
  })

  it('前方一致が部分一致より前に来る', () => {
    const found = labels(searchPalette('pi').hits)
    const pi = found.indexOf('\\pi')
    const varpi = found.indexOf('\\varpi')

    expect(pi).toBeGreaterThanOrEqual(0)
    expect(varpi).toBeGreaterThan(pi)
  })

  it('記号だけでなく公式も引ける', () => {
    for (const query of ['parts', '部分積分']) {
      const hits = searchPalette(query).hits
      expect(hits.some((hit) => hit.kind === 'formula'), query).toBe(true)
    }
  })

  it('空文字・空白だけ・当たらない文字列では0件', () => {
    for (const query of ['', '   ', 'zzzz']) {
      expect(searchPalette(query), query).toEqual({ hits: [], omitted: 0 })
    }
  })

  it('上限を超えた分は返さず、件数だけ返す', () => {
    const { hits, omitted } = searchPalette('a')

    expect(hits).toHaveLength(SEARCH_LIMIT)
    expect(omitted).toBeGreaterThan(0)
  })

  it('同じ記号が2回現れない', () => {
    for (const query of ['a', 'x', '\\', 'e']) {
      const keys = searchPalette(query).hits.map(hitKey)
      expect(new Set(keys).size, query).toBe(keys.length)
    }
  })

  it('結果はすべて挿入できる（snippetが空でない）', () => {
    for (const hit of searchPalette('a').hits) {
      expect(hitSnippet(hit), hitKey(hit)).not.toBe('')
    }
  })

  it('どのグループから来たかを返す', () => {
    const [first] = searchPalette('alpha').hits

    expect(first.group.ja).toBe('ギリシャ小文字')
    expect(first.group.en).toBe('Greek (lowercase)')
  })
})
