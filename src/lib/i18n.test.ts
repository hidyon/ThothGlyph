import { describe, expect, it } from 'vitest'
import { formulaGroups } from './formulas'
import type { Text } from './i18n'
import { pick, t } from './i18n'
import { messages } from './messages'
import { paletteGroups } from './palette'

describe('pick', () => {
  it('表示中の言語の文字列を返す', () => {
    const text = t('平方根', 'Square root')

    expect(pick(text, 'ja')).toBe('平方根')
    expect(pick(text, 'en')).toBe('Square root')
  })
})

/**
 * 翻訳漏れは型では捕まらない（`t('平方根', '平方根')` も通る）。
 * 記号や公式を足したときに英語を書き忘れていないかを、ここで全件見る。
 */
describe('翻訳の網羅', () => {
  const both = (label: string, text: Text) => {
    expect(text.ja, `${label} の日本語`).not.toBe('')
    expect(text.en, `${label} の英語`).not.toBe('')
  }

  it('パレットのグループ名と記号の名前が両方の言語を持つ', () => {
    expect(paletteGroups.length).toBeGreaterThan(0)

    for (const group of paletteGroups) {
      both(`グループ ${group.name.ja}`, group.name)
      for (const item of group.items) {
        both(`記号 ${item.label}`, item.title)
      }
    }
  })

  it('公式の分類名と公式名が両方の言語を持つ', () => {
    expect(formulaGroups.length).toBeGreaterThan(0)

    for (const group of formulaGroups) {
      both(`分類 ${group.name.ja}`, group.name)
      for (const formula of group.formulas) {
        both(`公式 ${formula.name.ja}`, formula.name)
      }
    }
  })

  it('画面の文言が両方の言語を持つ', () => {
    for (const [key, value] of Object.entries(messages)) {
      // 関数の文言（語順が変わるもの）は引数を与えてから見る。引数の数も型も
      // 関数ごとに違うので、ここでは数を揃えずに渡す（余分な引数は無視される）。
      const call = value as (...args: unknown[]) => Text
      const text = typeof value === 'function' ? call('x', 1) : value
      both(`messages.${key}`, text)
    }
  })

  /**
   * 日本語と英語が同じ文字列でも構わないもの（`alpha` など、
   * ギリシャ文字の名前は両方の言語で同じ）は数えて固定しておく。
   * 増えたら翻訳漏れを疑う。
   */
  it('日本語と英語が同じ記号はギリシャ文字の24件だけ', () => {
    const same = paletteGroups
      .flatMap((group) => group.items)
      .filter((item) => item.title.ja === item.title.en)

    expect(same).toHaveLength(24)
  })
})
