import { describe, expect, it } from 'vitest'
import {
  CURSOR_TOKEN,
  describeInsertion,
  paletteGroups,
  wrapsSelection,
} from './palette'

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
