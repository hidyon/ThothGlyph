import { describe, expect, it } from 'vitest'
import { compileExpression } from './expression'

/** 読めた式を評価する。読めなければテストを落とす。 */
const at = (source: string, x: number): number => {
  const result = compileExpression(source)
  if (!result.ok) throw new Error(`読めなかった: ${source}`)
  return result.expression.evaluate(x)
}

describe('compileExpression', () => {
  it('仕様に書いた5例を評価する', () => {
    expect(at('x^2 - 2x', 3)).toBe(3)
    expect(at('2x + 1', 4)).toBe(9)
    expect(at('-x^2', 3)).toBe(-9)
    expect(at('2sin(x)', Math.PI / 2)).toBeCloseTo(2, 10)
    expect(at('1/x', 0)).toBe(Infinity)
  })

  it('四則と括弧の優先順位を守る', () => {
    expect(at('1 + 2 * 3', 0)).toBe(7)
    expect(at('(1 + 2) * 3', 0)).toBe(9)
    expect(at('8 / 2 / 2', 0)).toBe(2)
    expect(at('10 - 3 - 2', 0)).toBe(5)
  })

  it('^ は右結合で、単項マイナスより強い', () => {
    expect(at('2^3^2', 0)).toBe(512)
    expect(at('-2^2', 0)).toBe(-4)
  })

  it('暗黙の乗算を補う', () => {
    expect(at('2x', 5)).toBe(10)
    expect(at('3(x + 1)', 2)).toBe(9)
    expect(at('2sin(x)', 0)).toBe(0)
    expect(at('2pi', 0)).toBeCloseTo(2 * Math.PI, 10)
  })

  it('定数と関数を使える', () => {
    expect(at('pi', 0)).toBeCloseTo(Math.PI, 10)
    expect(at('e', 0)).toBeCloseTo(Math.E, 10)
    expect(at('sqrt(x)', 9)).toBe(3)
    expect(at('abs(x)', -4)).toBe(4)
    expect(at('log(e)', 0)).toBeCloseTo(1, 10)
    expect(at('exp(0)', 0)).toBe(1)
    expect(at('cos(0)', 0)).toBe(1)
    expect(at('tan(0)', 0)).toBe(0)
  })

  it('小数と .5 の書き方を受ける', () => {
    expect(at('0.5x', 4)).toBe(2)
    expect(at('.5 + x', 1)).toBe(1.5)
  })

  it('読めない式をエラーとして返す（例外は投げない）', () => {
    for (const source of ['X', 'SIN(x)', 'x^^2', '(x', 'x)', 'foo(x)', 'x $ 1', '', '+', 'x +']) {
      expect(compileExpression(source).ok, source).toBe(false)
    }
  })

  it('x を使うかどうかを返す', () => {
    const withX = compileExpression('2x')
    const withoutX = compileExpression('2pi')
    expect(withX.ok && withX.expression.usesX).toBe(true)
    expect(withoutX.ok && withoutX.expression.usesX).toBe(false)
  })

  it('元の文字列を前後の空白を落として保つ', () => {
    const result = compileExpression('  x^2 - 2x  ')
    expect(result.ok && result.expression.source).toBe('x^2 - 2x')
  })

  it('定義域の外は有限でない値になる（例外は投げない）', () => {
    expect(Number.isNaN(at('sqrt(x)', -1))).toBe(true)
    expect(at('log(0)', 0)).toBe(-Infinity)
  })
})
