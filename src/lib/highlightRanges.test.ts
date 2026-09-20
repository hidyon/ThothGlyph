import { describe, expect, it } from 'vitest'
import { findMatches } from './findMatches'
import { highlightHtml, highlightRanges } from './highlightRanges'

/** 区切りを連結すると元の文字列に戻る（ずれると色が別の場所に付く）。 */
const joined = (source: string, current = 0) =>
  highlightRanges(source, findMatches(source, 'a'), current)
    .map((segment) => segment.text)
    .join('')

describe('highlightRanges', () => {
  it('地の文と一致に切り分ける', () => {
    expect(highlightRanges('xaxax', findMatches('xaxax', 'a'), 0)).toEqual([
      { text: 'x', kind: 'none' },
      { text: 'a', kind: 'current' },
      { text: 'x', kind: 'none' },
      { text: 'a', kind: 'match' },
      { text: 'x', kind: 'none' },
    ])
  })

  it('いま選ばれている一致だけ current になる', () => {
    const kinds = highlightRanges('aaa'.replaceAll('a', 'a-'), findMatches('a-a-a-', 'a'), 2).map(
      (segment) => segment.kind,
    )

    expect(kinds.filter((kind) => kind === 'current')).toHaveLength(1)
    expect(kinds.filter((kind) => kind === 'match')).toHaveLength(2)
  })

  it('文字を1つも落とさない', () => {
    for (const source of ['a', 'aa', 'xax', 'abc', '行1\na\n行3', '']) {
      expect(joined(source), source).toBe(source)
    }
  })

  it('一致がなければ全体が地の文', () => {
    expect(highlightRanges('abc', [], -1)).toEqual([{ text: 'abc', kind: 'none' }])
  })

  it('空文字なら区切りも空', () => {
    expect(highlightRanges('', [], -1)).toEqual([])
  })

  it('先頭と末尾の一致を扱える', () => {
    expect(highlightRanges('ab', findMatches('ab', 'a'), 0)).toEqual([
      { text: 'a', kind: 'current' },
      { text: 'b', kind: 'none' },
    ])
    expect(highlightRanges('ba', findMatches('ba', 'a'), 0)).toEqual([
      { text: 'b', kind: 'none' },
      { text: 'a', kind: 'current' },
    ])
  })
})

describe('highlightHtml', () => {
  const html = (source: string, query: string, current = 0) =>
    highlightHtml(source, findMatches(source, query), current)

  it('一致を mark で囲み、現在の1件に印を付ける', () => {
    expect(html('xaxa', 'a')).toBe('x<mark class="is-current">a</mark>x<mark>a</mark>\n')
  })

  it('末尾に改行を足す（pre-wrapでは末尾の改行が行にならないため）', () => {
    expect(html('abc', 'z')).toBe('abc\n')
    expect(html('abc\n', 'z')).toBe('abc\n\n')
  })

  it('HTMLとして解釈される文字をエスケープする', () => {
    expect(html('<script>&', 'z')).toBe('&lt;script&gt;&amp;\n')
    expect(html('<b>', '<b>')).toBe('<mark class="is-current">&lt;b&gt;</mark>\n')
  })

  it('エスケープしてもtextareaと同じ文字数になる（折り返しがずれない）', () => {
    const source = 'a < b & c > d'
    const text = highlightHtml(source, [], -1)
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&')

    expect(text).toBe(`${source}\n`)
  })
})
