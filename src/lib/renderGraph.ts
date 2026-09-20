/**
 * グラフの指定（`graphBlock.ts` の結果）をSVGの文字列にする。
 *
 * 描画ライブラリを入れない（[0024](../../docs/specs/0024-bundle-size.md) で初期バンドルを削ったばかりで、
 * 描くのは折れ線と目盛りの文字だけ）。色と文字の大きさは属性ではなくCSSで
 * 当てる。ダークモードとメディアクエリで切り替えるため。
 */

import type { GraphSpec, Range } from './graphBlock'
import type { Lang, Text } from './i18n'
import { pick } from './i18n'
import { messages } from './messages'

/** viewBoxの大きさ。縦横比3:2。実際の表示幅はCSS（最大480px）で決まる。 */
const WIDTH = 480
const HEIGHT = 320

/*
  左の余白は、いちばん幅を食う目盛りの値（`-4.24` のような5〜6文字）が入る幅。
  36にすると、狭い画面で文字を18ユーザー単位へ上げたときに左端で切れた（実測）。
*/
const MARGIN = { top: 10, right: 8, bottom: 26, left: 60 }
/** 凡例を出すときに下へ足す高さ。 */
const LEGEND_HEIGHT = 22
/** xを何等分して評価するか。800点にしても曲線は変わらず文字数だけ倍になる。 */
const SAMPLES = 400
/** 目盛りの本数（両端を含む）。 */
const TICKS = 5

export type GraphRenderResult = { ok: true; svg: string } | { ok: false; error: Text }

export function renderGraph(spec: GraphSpec, lang: Lang): GraphRenderResult {
  const legend = spec.functions.length >= 2
  const plot = {
    left: MARGIN.left,
    right: WIDTH - MARGIN.right,
    top: MARGIN.top,
    bottom: HEIGHT - MARGIN.bottom - (legend ? LEGEND_HEIGHT : 0),
  }

  const series = spec.functions.map((fn) => sample(fn.evaluate, spec.x))
  const y = spec.y ?? autoRange(series.flat())
  if (y === null) return { ok: false, error: messages.graphNothingToPlot }

  const toX = (value: number) =>
    plot.left + ((value - spec.x.min) / (spec.x.max - spec.x.min)) * (plot.right - plot.left)
  const toY = (value: number) =>
    plot.bottom - ((value - y.min) / (y.max - y.min)) * (plot.bottom - plot.top)

  const parts: string[] = []

  // グリッドと目盛りの値。
  const grid: string[] = []
  const ticks: string[] = []
  for (let i = 0; i < TICKS; i += 1) {
    const xValue = spec.x.min + ((spec.x.max - spec.x.min) * i) / (TICKS - 1)
    const px = round(toX(xValue))
    grid.push(`<line x1="${px}" y1="${plot.top}" x2="${px}" y2="${plot.bottom}"/>`)
    ticks.push(
      `<text class="graph__tick" x="${px}" y="${plot.bottom + 14}" text-anchor="middle">${formatTick(xValue)}</text>`,
    )

    const yValue = y.min + ((y.max - y.min) * i) / (TICKS - 1)
    const py = round(toY(yValue))
    grid.push(`<line x1="${plot.left}" y1="${py}" x2="${plot.right}" y2="${py}"/>`)
    ticks.push(
      `<text class="graph__tick" x="${plot.left - 6}" y="${round(py + 4)}" text-anchor="end">${formatTick(yValue)}</text>`,
    )
  }
  parts.push(`<g class="graph__grid">${grid.join('')}</g>`)

  // x=0 / y=0 が範囲に入るときだけ、軸をグリッドより濃く引く。
  const axes: string[] = []
  if (spec.x.min < 0 && spec.x.max > 0) {
    const px = round(toX(0))
    axes.push(`<line x1="${px}" y1="${plot.top}" x2="${px}" y2="${plot.bottom}"/>`)
  }
  if (y.min < 0 && y.max > 0) {
    const py = round(toY(0))
    axes.push(`<line x1="${plot.left}" y1="${py}" x2="${plot.right}" y2="${py}"/>`)
  }
  if (axes.length > 0) parts.push(`<g class="graph__axis">${axes.join('')}</g>`)

  parts.push(`<g class="graph__ticks">${ticks.join('')}</g>`)

  // 曲線。範囲の外と有限でない点は打たず、そこで線を切る（1/x や tan の
  // 偽の縦線を防ぐ。clipPath を使わないのは id が文書内で衝突するため）。
  series.forEach((points, index) => {
    const d = pathFor(points, y, toX, toY)
    if (d.length === 0) return
    parts.push(`<path class="graph__line graph__line--${index + 1}" d="${d}"/>`)
  })

  if (legend) parts.push(legendOf(spec, plot.left))

  const label = pick(messages.graphAlt(spec.functions.map((fn) => `y = ${fn.source}`).join(', ')), lang)

  return {
    ok: true,
    svg:
      `<svg class="graph" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeText(label)}">` +
      `${parts.join('')}</svg>`,
  }
}

type Point = { x: number; y: number }

function sample(evaluate: (x: number) => number, range: Range): Point[] {
  const points: Point[] = []
  for (let i = 0; i <= SAMPLES; i += 1) {
    const x = range.min + ((range.max - range.min) * i) / SAMPLES
    points.push({ x, y: evaluate(x) })
  }
  return points
}

/**
 * yの範囲を自動で決める。
 *
 * 単純な最小・最大にしないのは、`1/x` や `tan(x)` が桁違いの値を出して曲線が
 * 1本の直線に潰れるため。上下5%を捨ててから10%の余白を足す。
 */
function autoRange(points: Point[]): Range | null {
  const values = points
    .map((point) => point.y)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (values.length === 0) return null

  const drop = Math.floor(values.length * 0.05)
  const kept = values.slice(drop, values.length - drop)
  const min = (kept[0] ?? values[0]) as number
  const max = (kept.at(-1) ?? values.at(-1)) as number

  // 定数関数（`y = 2`）は高さが0になるので、上下に1ずつ取る。
  if (max - min < 1e-12) return { min: min - 1, max: max + 1 }

  const padding = (max - min) * 0.1
  return { min: min - padding, max: max + padding }
}

function pathFor(
  points: Point[],
  y: Range,
  toX: (value: number) => number,
  toY: (value: number) => number,
): string {
  const commands: string[] = []
  let pen = false

  for (const point of points) {
    const visible = Number.isFinite(point.y) && point.y >= y.min && point.y <= y.max
    if (!visible) {
      pen = false
      continue
    }
    commands.push(`${pen ? 'L' : 'M'}${round(toX(point.x))},${round(toY(point.y))}`)
    pen = true
  }

  return commands.join(' ')
}

/** 凡例の1件あたりの横幅（ユーザー単位）。3件で 36 + 145×3 = 471 に収まる。 */
const LEGEND_STEP = 145

function legendOf(spec: GraphSpec, left: number): string {
  const items = spec.functions
    .map((fn, index) => {
      const x = left + index * LEGEND_STEP
      const baseline = HEIGHT - 6
      return (
        `<line class="graph__line graph__line--${index + 1}" x1="${x}" y1="${baseline - 4}" x2="${x + 18}" y2="${baseline - 4}"/>` +
        `<text class="graph__tick" x="${x + 24}" y="${baseline}">${escapeText(truncate(`y = ${fn.source}`))}</text>`
      )
    })
    .join('')

  return `<g class="graph__legend">${items}</g>`
}

/** 凡例の1件あたりに使える幅に収める。 */
function truncate(text: string): string {
  const LIMIT = 15
  return text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1)}…`
}

/** 目盛りの値。有効数字3桁までで、末尾の0は落とす。 */
function formatTick(value: number): string {
  const rounded = Number(value.toPrecision(3))
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** 座標。小数2桁で十分（480×320のSVG）で、文字数を抑えられる。 */
const round = (value: number): number => Math.round(value * 100) / 100

/** 利用者が書いた文字列をSVGに入れる唯一の箇所（凡例と aria-label）。 */
function escapeText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
