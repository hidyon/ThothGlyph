import { describe, expect, it } from 'vitest'
import { parseGraphBlock } from './graphBlock'
import { renderGraph } from './renderGraph'
import type { Lang } from './i18n'

/** ブロックの本文からSVGを作る。描けなければテストを落とす。 */
const svg = (body: string, lang: Lang = 'ja'): string => {
  const parsed = parseGraphBlock(body)
  if (!parsed.ok) throw new Error(`読めなかった: ${parsed.error.ja}`)
  const rendered = renderGraph(parsed.spec, lang)
  if (!rendered.ok) throw new Error(`描けなかった: ${rendered.error.ja}`)
  return rendered.svg
}

/** パスが何本に切れているか。`M` の数が線の本数。 */
const segments = (path: string): number => path.match(/M/g)?.length ?? 0

/** n本目の曲線の d 属性。 */
const pathOf = (out: string, index = 1): string =>
  out.match(new RegExp(`graph__line--${index}" d="([^"]*)"`))?.[1] ?? ''

describe('renderGraph', () => {
  it('曲線を1本描く', () => {
    const out = svg('y = x^2')

    expect(out.startsWith('<svg class="graph" viewBox="0 0 480 320"')).toBe(true)
    expect(out).toContain('graph__line--1')
    expect(segments(pathOf(out))).toBe(1)
  })

  it('1/x の線を x=0 で切る（縦線でつながない）', () => {
    expect(segments(pathOf(svg('y = 1/x\nx: -5..5')))).toBeGreaterThanOrEqual(2)
  })

  it('tan(x) の線を漸近線で切る', () => {
    expect(segments(pathOf(svg('y = tan(x)\nx: -pi..pi')))).toBeGreaterThanOrEqual(2)
  })

  it('定数関数でも潰れずに描ける', () => {
    const out = svg('y = 2')
    const path = pathOf(out)

    expect(segments(path)).toBe(1)
    // 上下に1ずつ取るので、線は縦の真ん中あたりに来る。
    const ys = [...path.matchAll(/[ML][-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]))
    expect(Math.min(...ys)).toBeCloseTo(Math.max(...ys), 5)
    expect(Math.min(...ys)).toBeGreaterThan(100)
    expect(Math.max(...ys)).toBeLessThan(200)
  })

  it('定義域の外（sqrt(x) の負の側）を描かない', () => {
    const path = pathOf(svg('y = sqrt(x)\nx: -4..4'))
    const xs = [...path.matchAll(/[ML]([-\d.]+),/g)].map((m) => Number(m[1]))

    // 左半分（x<0）には点がない。viewBoxの中央は (36+472)/2 = 254。
    expect(Math.min(...xs)).toBeGreaterThan(250)
  })

  it('1本のときは凡例を出さず、2本のときは出す', () => {
    expect(svg('y = x')).not.toContain('graph__legend')

    const two = svg('y = x^2\ny = 2x + 1')
    expect(two).toContain('graph__legend')
    expect(two).toContain('y = x^2')
    expect(two).toContain('y = 2x + 1')
    expect(two).toContain('graph__line--2')
  })

  it('目盛りを5本ずつ出し、値を有効数字3桁までで書く', () => {
    const out = svg('y = x\nx: -1..1\ny: 0..1')
    const ticks = [...out.matchAll(/class="graph__tick"[^>]*>([^<]*)</g)].map((m) => m[1])

    expect(ticks).toHaveLength(10)
    expect(ticks).toContain('-1')
    expect(ticks).toContain('-0.5')
    expect(ticks).toContain('0.25')
  })

  it('0が範囲に入るときだけ軸を引く', () => {
    expect(svg('y = x\nx: -5..5')).toContain('graph__axis')
    expect(svg('y = x\nx: 1..5\ny: 1..5')).not.toContain('graph__axis')
  })

  it('aria-labelを表示中の言語で書く', () => {
    expect(svg('y = x^2')).toContain('aria-label="y = x^2 のグラフ"')
    expect(svg('y = x^2', 'en')).toContain('aria-label="Graph of y = x^2"')
  })

  it('描ける点が1つもなければエラーを返す', () => {
    const parsed = parseGraphBlock('y = sqrt(x)\nx: -5..-1')
    if (!parsed.ok) throw new Error('読めなかった')
    const rendered = renderGraph(parsed.spec, 'ja')

    expect(rendered.ok).toBe(false)
    expect(rendered.ok === false && rendered.error.ja).toBe('この範囲に描ける点がありません')
  })

  it('yの範囲を上下5%を捨てて決める（1/x で曲線が潰れない）', () => {
    const path = pathOf(svg('y = 1/x\nx: -5..5'))
    const ys = [...path.matchAll(/[ML][-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]))

    // 単純な最小・最大なら全点が中央の1本に潰れる。上下に広がっていること。
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(100)
  })
})
