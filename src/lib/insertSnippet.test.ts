import { describe, expect, it } from 'vitest'
import { insertSnippet } from './insertSnippet'
import { CURSOR_TOKEN } from './palette'

describe('insertSnippet', () => {
  it('カーソル位置に挿入し、CURSOR_TOKENの位置にカーソルを返す', () => {
    const { text, cursor } = insertSnippet('ab', `\\sqrt{${CURSOR_TOKEN}}`, 1, 1)

    expect(text).toBe('a\\sqrt{}b')
    expect(cursor).toBe('a\\sqrt{'.length)
  })

  it('CURSOR_TOKENがないスニペットでは挿入文字列の末尾にカーソルが来る', () => {
    const { text, cursor } = insertSnippet('ab', '\\pi', 1, 1)

    expect(text).toBe('a\\pib')
    expect(cursor).toBe('a\\pi'.length)
  })

  it('選択範囲はCURSOR_TOKENの位置に包まれ、カーソルはその後ろに来る', () => {
    const { text, cursor } = insertSnippet('x + 1', `\\sqrt{${CURSOR_TOKEN}}`, 0, 5)

    expect(text).toBe('\\sqrt{x + 1}')
    expect(cursor).toBe('\\sqrt{x + 1'.length)
  })

  it('CURSOR_TOKENがないスニペットは選択範囲を消さず直後に挿入する', () => {
    const { text, cursor } = insertSnippet('x + 1', '\\pi', 0, 5)

    expect(text).toBe('x + 1\\pi')
    expect(cursor).toBe(8)
  })

  it('選択範囲の後ろに文書が続く場合も、選択は残る', () => {
    const { text, cursor } = insertSnippet('x + 1 = y', '\\times', 0, 5)

    expect(text).toBe('x + 1\\times = y')
    expect(cursor).toBe('x + 1\\times'.length)
  })

  it('トークンが末尾でない場合も残りの文字列が後ろに付く', () => {
    const { text } = insertSnippet('', `\\frac{${CURSOR_TOKEN}}{}`, 0, 0)

    expect(text).toBe('\\frac{}{}')
  })

  it('空文書の末尾に挿入できる', () => {
    const { text, cursor } = insertSnippet('', `^{${CURSOR_TOKEN}}`, 0, 0)

    expect(text).toBe('^{}')
    expect(cursor).toBe(2)
  })

  // 0021: execCommand('insertText') に渡すための「置き換える範囲と入れる文字列」。
  describe('置き換える範囲', () => {
    it('単体記号はカーソル位置の空範囲に入る', () => {
      const result = insertSnippet('x+1', '\\alpha', 3, 3)

      expect([result.start, result.end]).toEqual([3, 3])
      expect(result.inserted).toBe('\\alpha')
    })

    it('単体記号は選択があっても選択の終わりの空範囲に入る（0009）', () => {
      const result = insertSnippet('x+1', '\\alpha', 0, 3)

      expect([result.start, result.end]).toEqual([3, 3])
      expect(result.inserted).toBe('\\alpha')
    })

    it('囲める記号は選択範囲を、選択を含んだ文字列で置き換える', () => {
      const result = insertSnippet('x+1', `\\sqrt{${CURSOR_TOKEN}}`, 0, 3)

      expect([result.start, result.end]).toEqual([0, 3])
      expect(result.inserted).toBe('\\sqrt{x+1}')
    })

    it.each([
      ['ab', `\\sqrt{${CURSOR_TOKEN}}`, 1, 1],
      ['ab', '\\pi', 1, 1],
      ['x + 1', `\\sqrt{${CURSOR_TOKEN}}`, 0, 5],
      ['x + 1', '\\pi', 0, 5],
      ['x + 1 = y', '\\times', 0, 5],
      ['', `\\frac{${CURSOR_TOKEN}}{}`, 0, 0],
    ])('範囲を置き換えた結果が text と一致する（%s / %s）', (source, snippet, start, end) => {
      const result = insertSnippet(source, snippet, start, end)

      expect(
        source.slice(0, result.start) + result.inserted + source.slice(result.end),
      ).toBe(result.text)
    })
  })
})
