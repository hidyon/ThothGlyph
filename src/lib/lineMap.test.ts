import { describe, expect, it } from 'vitest'

import type { OffsetMap } from './lineMap'
import { lineAt, lineStarts, toOriginal } from './lineMap'

describe('lineStarts', () => {
  it('改行のない文字列では先頭の1件だけを返す', () => {
    expect(lineStarts('abc')).toEqual([0])
  })

  it('各行の先頭オフセットを返す', () => {
    // 'a\nbb\nccc' → 0行目:0, 1行目:2, 2行目:5
    expect(lineStarts('a\nbb\nccc')).toEqual([0, 2, 5])
  })

  it('末尾の改行の後ろも1行として数える', () => {
    expect(lineStarts('a\n')).toEqual([0, 2])
  })

  it('空文字列でも先頭の1件を返す', () => {
    expect(lineStarts('')).toEqual([0])
  })
})

describe('lineAt', () => {
  const starts = lineStarts('a\nbb\nccc')

  it('先頭は1行目', () => {
    expect(lineAt(starts, 0)).toBe(1)
  })

  it('行頭のオフセットはその行', () => {
    expect(lineAt(starts, 2)).toBe(2)
    expect(lineAt(starts, 5)).toBe(3)
  })

  it('行の途中でも同じ行', () => {
    expect(lineAt(starts, 3)).toBe(2)
    expect(lineAt(starts, 7)).toBe(3)
  })

  it('改行そのものは手前の行', () => {
    expect(lineAt(starts, 1)).toBe(1)
  })

  it('末尾より後ろを指しても最後の行に留まる', () => {
    expect(lineAt(starts, 999)).toBe(3)
  })
})

describe('toOriginal', () => {
  it('対応点が先頭だけなら、そのまま同じ位置を返す', () => {
    const map: OffsetMap = [{ masked: 0, original: 0 }]
    expect(toOriginal(map, 0)).toBe(0)
    expect(toOriginal(map, 42)).toBe(42)
  })

  it('対応点より後ろは、その点からの差を足した位置になる', () => {
    // 退避後の10文字目までは素通し。そこで元ソースの30文字目に対応する
    // （＝20文字ぶん縮んでいる）。
    const map: OffsetMap = [
      { masked: 0, original: 0 },
      { masked: 10, original: 30 },
    ]
    expect(toOriginal(map, 5)).toBe(5)
    expect(toOriginal(map, 10)).toBe(30)
    expect(toOriginal(map, 15)).toBe(35)
  })

  it('対応点が複数あっても、直前の点を使う', () => {
    const map: OffsetMap = [
      { masked: 0, original: 0 },
      { masked: 10, original: 30 },
      { masked: 20, original: 80 },
    ]
    expect(toOriginal(map, 19)).toBe(39)
    expect(toOriginal(map, 20)).toBe(80)
    expect(toOriginal(map, 25)).toBe(85)
  })

  it('対応表が空でも例外を投げず、そのままの位置を返す', () => {
    expect(toOriginal([], 7)).toBe(7)
  })
})
