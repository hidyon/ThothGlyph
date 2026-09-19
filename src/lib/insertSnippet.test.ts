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

  it('CURSOR_TOKENがないスニペットでは選択範囲が置き換わる', () => {
    const { text, cursor } = insertSnippet('x + 1', '\\pi', 0, 5)

    expect(text).toBe('\\pi')
    expect(cursor).toBe(3)
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
})
