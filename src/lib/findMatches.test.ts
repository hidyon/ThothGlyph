import { describe, expect, it } from 'vitest'
import { findMatches, matchAfter, replaceAll, replaceOne, step } from './findMatches'

describe('findMatches', () => {
  it('仕様に書いた3例を満たす', () => {
    // 重なる一致は数えない。
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ])
    // 大文字と小文字を区別する。
    expect(findMatches('\\alpha + \\Alpha', '\\alpha')).toEqual([{ start: 0, end: 6 }])
    // 空のクエリは0件。
    expect(findMatches('x + 1', '')).toEqual([])
  })

  it('改行をまたぐ語もLaTeXの \\ を含む語も見つける', () => {
    expect(findMatches('行1\n行2', '1\n行')).toHaveLength(1)
    expect(findMatches('$\\frac{a}{b}$ と $\\frac{c}{d}$', '\\frac')).toHaveLength(2)
  })

  it('一致がなければ空', () => {
    expect(findMatches('abc', 'z')).toEqual([])
  })
})

describe('matchAfter', () => {
  const matches = findMatches('a__a__a', 'a')

  it('カーソル位置から後ろの最初の一致を返す', () => {
    expect(matchAfter(matches, 0)).toBe(0)
    expect(matchAfter(matches, 1)).toBe(1)
    expect(matchAfter(matches, 4)).toBe(2)
  })

  it('後ろに一致がなければ先頭へ回る', () => {
    expect(matchAfter(matches, 7)).toBe(0)
  })

  it('一致がなければ -1', () => {
    expect(matchAfter([], 0)).toBe(-1)
  })
})

describe('step', () => {
  it('次と前へ動く', () => {
    expect(step(3, 0, 1)).toBe(1)
    expect(step(3, 1, -1)).toBe(0)
  })

  it('端では反対側へ回る', () => {
    expect(step(3, 2, 1)).toBe(0)
    expect(step(3, 0, -1)).toBe(2)
  })

  it('一致がなければ -1', () => {
    expect(step(0, -1, 1)).toBe(-1)
  })
})

describe('replaceOne', () => {
  it('指定した位置だけを置き換える', () => {
    const source = 'a + a'
    const result = replaceOne(source, { start: 4, end: 5 }, 'b')

    expect(result.text).toBe('a + b')
    expect({ start: result.start, end: result.end, inserted: result.inserted }).toEqual({
      start: 4,
      end: 5,
      inserted: 'b',
    })
    // 不変条件（insertSnippet と同じ）。
    expect(result.text).toBe(source.slice(0, result.start) + result.inserted + source.slice(result.end))
  })

  it('置き換えた直後にカーソルを置く', () => {
    expect(replaceOne('xx', { start: 0, end: 1 }, 'abc').cursor).toBe(3)
  })
})

describe('replaceAll', () => {
  it('仕様に書いた3例を満たす', () => {
    expect(replaceAll('aaaa', 'aa', 'b')?.result.text).toBe('bb')
    // 置換後の文字列は再検索しない（x → xx が増殖しない）。
    expect(replaceAll('x^2 + x', 'x', 'xx')?.result.text).toBe('xx^2 + xx')
    expect(replaceAll('\\alpha', '\\alpha', '\\beta')?.result.text).toBe('\\beta')
  })

  it('全文を1回で差し替える形で返す（Undoを1回にするため）', () => {
    const source = 'a a a'
    const replaced = replaceAll(source, 'a', 'b')

    expect(replaced?.count).toBe(3)
    expect(replaced?.result.start).toBe(0)
    expect(replaced?.result.end).toBe(source.length)
    expect(replaced?.result.inserted).toBe('b b b')
  })

  it('最初に置き換えた場所の直後にカーソルを置く', () => {
    expect(replaceAll('__ab__ab', 'ab', 'xyz')?.result.cursor).toBe(5)
  })

  it('一致がなければ null（文書を触らない）', () => {
    expect(replaceAll('abc', 'z', 'y')).toBeNull()
    expect(replaceAll('abc', '', 'y')).toBeNull()
  })

  it('空文字への置換（削除）もできる', () => {
    expect(replaceAll('a-b-c', '-', '')?.result.text).toBe('abc')
  })
})
