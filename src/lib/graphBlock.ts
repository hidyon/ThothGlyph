/**
 * ` ```graph ` ブロックの中身を、描くのに必要な形（関数と範囲）に分ける。
 *
 * 読めない行は黙って無視せずエラーにする。打ち間違いを黙殺すると、
 * なぜ描かれないのか分からなくなるため。
 */

import type { CompiledExpression } from './expression'
import { compileExpression } from './expression'
import type { Text } from './i18n'
import { messages } from './messages'

export type Range = { min: number; max: number }

export type GraphSpec = {
  functions: CompiledExpression[]
  x: Range
  /** 手で指定したyの範囲。null なら自動で決める。 */
  y: Range | null
}

export type GraphParseResult = { ok: true; spec: GraphSpec } | { ok: false; error: Text }

/** 同時に描ける関数の数。増やすのは足りない場面が出てから。 */
export const MAX_FUNCTIONS = 3

/** `x:` を書かなかったときの範囲。 */
export const DEFAULT_X: Range = { min: -5, max: 5 }

const FUNCTION_LINE = /^y\s*=\s*(.+)$/
const X_RANGE_LINE = /^x\s*:\s*(.+)$/
const Y_RANGE_LINE = /^y\s*:\s*(.+)$/

export function parseGraphBlock(body: string): GraphParseResult {
  const functions: CompiledExpression[] = []
  let x: Range = DEFAULT_X
  let y: Range | null = null

  for (const raw of body.split('\n')) {
    const line = raw.trim()

    // 空行とコメント。
    if (line.length === 0 || line.startsWith('#')) continue

    const functionLine = FUNCTION_LINE.exec(line)
    if (functionLine !== null) {
      const source = functionLine[1] as string
      const compiled = compileExpression(source)
      if (!compiled.ok) return { ok: false, error: messages.graphBadExpression(source.trim()) }
      functions.push(compiled.expression)
      continue
    }

    const xLine = X_RANGE_LINE.exec(line)
    const yLine = xLine === null ? Y_RANGE_LINE.exec(line) : null
    if (xLine !== null || yLine !== null) {
      const parsed = parseRange((xLine ?? (yLine as RegExpExecArray))[1] as string, line)
      if (!parsed.ok) return parsed
      // 2回以上書かれたら最後のものを使う。
      if (xLine !== null) x = parsed.range
      else y = parsed.range
      continue
    }

    return { ok: false, error: messages.graphUnknownLine(line) }
  }

  if (functions.length === 0) return { ok: false, error: messages.graphNoFunction }
  if (functions.length > MAX_FUNCTIONS) {
    return { ok: false, error: messages.graphTooManyFunctions }
  }

  return { ok: true, spec: { functions, x, y } }
}

type RangeResult = { ok: true; range: Range } | { ok: false; error: Text }

/**
 * `-3..5` を範囲にする。両端には式も書ける（`-pi..pi`）が、`x` は使えない
 * （範囲を決める前に `x` の値は決まらない）。
 */
function parseRange(text: string, line: string): RangeResult {
  const separator = text.indexOf('..')
  if (separator < 0) return { ok: false, error: messages.graphBadRange(line) }

  const ends = [text.slice(0, separator), text.slice(separator + 2)].map((end) => {
    const compiled = compileExpression(end)
    if (!compiled.ok || compiled.expression.usesX) return null
    const value = compiled.expression.evaluate(NaN)
    return Number.isFinite(value) ? value : null
  })

  const [min, max] = ends
  if (min === null || max === null) return { ok: false, error: messages.graphBadRange(line) }
  if (min >= max) return { ok: false, error: messages.graphEmptyRange(line) }

  return { ok: true, range: { min, max } }
}
