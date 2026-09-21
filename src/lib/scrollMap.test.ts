import { describe, expect, it } from 'vitest'

import type { Pair } from './scrollMap'
import { mapScroll, pairAnchors } from './scrollMap'

describe('pairAnchors', () => {
  it('行番号が両側にあるものだけを組にする', () => {
    const pairs = pairAnchors(
      [
        { line: 1, top: 0 },
        { line: 5, top: 100 },
        { line: 9, top: 200 },
      ],
      [
        { line: 1, top: 0 },
        { line: 9, top: 500 },
      ],
    )
    expect(pairs).toEqual([
      { from: 0, to: 0 },
      { from: 200, to: 500 },
    ])
  })

  it('from の昇順に並べる', () => {
    const pairs = pairAnchors(
      [
        { line: 9, top: 300 },
        { line: 1, top: 10 },
      ],
      [
        { line: 1, top: 20 },
        { line: 9, top: 600 },
      ],
    )
    expect(pairs.map((pair) => pair.from)).toEqual([10, 300])
  })

  it('一致する行が1つもなければ空を返す', () => {
    expect(pairAnchors([{ line: 1, top: 0 }], [{ line: 2, top: 0 }])).toEqual([])
  })
})

describe('mapScroll', () => {
  // 0 → 0、100 → 300、200 → 500。末尾は 400 → 1000。
  const pairs: Pair[] = [
    { from: 0, to: 0 },
    { from: 100, to: 300 },
    { from: 200, to: 500 },
  ]

  it('組をちょうど指すとその位置を返す', () => {
    expect(mapScroll(pairs, 100, 400, 1000)).toBe(300)
    expect(mapScroll(pairs, 200, 400, 1000)).toBe(500)
  })

  it('組と組の間は線形補間する', () => {
    expect(mapScroll(pairs, 150, 400, 1000)).toBe(400)
    expect(mapScroll(pairs, 50, 400, 1000)).toBe(150)
  })

  it('最初の組より手前は 0 との間で比例する', () => {
    const later: Pair[] = [{ from: 100, to: 400 }]
    expect(mapScroll(later, 50, 400, 1000)).toBe(200)
    expect(mapScroll(later, 0, 400, 1000)).toBe(0)
  })

  it('最後の組より後ろは文書の終わりとの間で比例する', () => {
    // 200 → 500、末尾 400 → 1000。その中間の 300 は 750。
    expect(mapScroll(pairs, 300, 400, 1000)).toBe(750)
  })

  it('最下端は最下端に写る', () => {
    expect(mapScroll(pairs, 400, 400, 1000)).toBe(1000)
  })

  it('最上端は最上端に写る', () => {
    expect(mapScroll(pairs, 0, 400, 1000)).toBe(0)
  })

  it('組が0件なら割合での同期になる', () => {
    expect(mapScroll([], 100, 400, 1000)).toBe(250)
    expect(mapScroll([], 400, 400, 1000)).toBe(1000)
  })

  it('同じ from の組が2つあっても割り算に落ちない', () => {
    const duplicated: Pair[] = [
      { from: 0, to: 0 },
      { from: 100, to: 300 },
      { from: 100, to: 320 },
      { from: 200, to: 500 },
    ]
    const result = mapScroll(duplicated, 100, 400, 1000)
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeGreaterThanOrEqual(300)
    expect(result).toBeLessThanOrEqual(320)
  })

  it('結果は 0 と toEnd の間に収まる', () => {
    expect(mapScroll(pairs, -500, 400, 1000)).toBe(0)
    expect(mapScroll(pairs, 99999, 400, 1000)).toBe(1000)
  })

  it('写す先にスクロールの余地がなければ 0 を返す', () => {
    expect(mapScroll(pairs, 100, 400, 0)).toBe(0)
  })

  it('写す元にスクロールの余地がなくても例外を投げない', () => {
    expect(mapScroll([], 0, 0, 1000)).toBe(0)
  })

  it('逆方向は組を裏返すだけで同じ関数が使える', () => {
    const reversed = pairs.map((pair) => ({ from: pair.to, to: pair.from }))
    expect(mapScroll(reversed, 300, 1000, 400)).toBe(100)
    expect(mapScroll(reversed, 400, 1000, 400)).toBe(150)
  })
})

describe('mapScroll の端の扱い', () => {
  it('スクロールで届かないアンカーがあっても最下端は最下端に写る', () => {
    // 最後の画面に入るブロックは fromEnd より後ろの座標を持つ。
    // そのまま使うと、最下端にしても手前に留まる（実測で50px）。
    const pairs: Pair[] = [
      { from: 0, to: 0 },
      { from: 300, to: 700 },
      { from: 500, to: 1200 },
    ]
    expect(mapScroll(pairs, 400, 400, 1000)).toBe(1000)
  })

  it('届かないアンカーしか無ければ割合に落ちる', () => {
    const pairs: Pair[] = [{ from: 900, to: 2000 }]
    expect(mapScroll(pairs, 200, 400, 1000)).toBe(500)
  })

  it('届くアンカーだけで補間する', () => {
    const pairs: Pair[] = [
      { from: 0, to: 0 },
      { from: 200, to: 400 },
      { from: 500, to: 1200 },
    ]
    // 200 → 400 と 終端 400 → 1000 の間。300 はその中間で 700。
    expect(mapScroll(pairs, 300, 400, 1000)).toBe(700)
  })
})
