import { describe, expect, it } from 'vitest'
import { DEFAULT_X, parseGraphBlock } from './graphBlock'

/** 読めたブロックを取り出す。読めなければテストを落とす。 */
const spec = (body: string) => {
  const result = parseGraphBlock(body)
  if (!result.ok) throw new Error(`読めなかった: ${result.error.ja}`)
  return result.spec
}

/** 読めなかったときの日本語メッセージ。 */
const error = (body: string): string => {
  const result = parseGraphBlock(body)
  if (result.ok) throw new Error(`読めてしまった: ${body}`)
  return result.error.ja
}

describe('parseGraphBlock', () => {
  it('関数と範囲に分解する', () => {
    const parsed = spec('y = x^2\nx: -3..5')

    expect(parsed.functions).toHaveLength(1)
    expect(parsed.functions[0]?.source).toBe('x^2')
    expect(parsed.functions[0]?.evaluate(4)).toBe(16)
    expect(parsed.x).toEqual({ min: -3, max: 5 })
    expect(parsed.y).toBeNull()
  })

  it('x: を書かなければ -5..5 にする', () => {
    expect(spec('y = x').x).toEqual(DEFAULT_X)
  })

  it('y: でyの範囲を指定できる', () => {
    expect(spec('y = x\ny: -2..10').y).toEqual({ min: -2, max: 10 })
  })

  it('範囲に式を書ける', () => {
    const parsed = spec('y = sin(x)\nx: -pi..pi')

    expect(parsed.x.min).toBeCloseTo(-Math.PI, 10)
    expect(parsed.x.max).toBeCloseTo(Math.PI, 10)
  })

  it('空行と # の行を無視する', () => {
    const parsed = spec('\n# 二次関数\n\ny = x^2\n\n# ここまで\n')

    expect(parsed.functions).toHaveLength(1)
  })

  it('関数を3本まで受ける', () => {
    expect(spec('y = x\ny = 2x\ny = 3x').functions).toHaveLength(3)
  })

  it('同じ指定が2回あれば後のほうを使う', () => {
    expect(spec('y = x\nx: -1..1\nx: -9..9').x).toEqual({ min: -9, max: 9 })
  })

  it('前後の空白を無視する', () => {
    expect(spec('   y  =  x^2   \n   x :  -1 .. 1  ').x).toEqual({ min: -1, max: 1 })
  })

  it('式がなければエラーにする', () => {
    expect(error('x: -3..5')).toBe('グラフの式がありません')
    expect(error('')).toBe('グラフの式がありません')
  })

  it('関数が4本以上ならエラーにする', () => {
    expect(error('y = x\ny = 2x\ny = 3x\ny = 4x')).toBe('関数は3本までです')
  })

  it('読めない式をエラーにする', () => {
    expect(error('y = x^^2')).toBe('式を読めません: x^^2')
  })

  it('読めない範囲をエラーにする', () => {
    expect(error('y = x\nx: -3-5')).toBe('範囲を読めません: x: -3-5')
    expect(error('y = x\nx: a..b')).toBe('範囲を読めません: x: a..b')
  })

  it('範囲にxを使えない', () => {
    expect(error('y = x\nx: 0..x')).toBe('範囲を読めません: x: 0..x')
  })

  it('左が右以上の範囲をエラーにする', () => {
    expect(error('y = x\nx: 5..-5')).toBe('範囲の左が右以上です: x: 5..-5')
    expect(error('y = x\nx: 1..1')).toBe('範囲の左が右以上です: x: 1..1')
  })

  it('どれでもない行をエラーにする（黙って無視しない）', () => {
    expect(error('y = x\nz = 3')).toBe('読めない行です: z = 3')
    expect(error('y = x\ntitle: 二次関数')).toBe('読めない行です: title: 二次関数')
  })
})
