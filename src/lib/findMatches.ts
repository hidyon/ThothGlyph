/**
 * 文書の中の検索と置換（[0043](../../docs/specs/0043-find-replace.md)）。
 *
 * 素の文字列として照合し、大文字と小文字を区別する。LaTeXでは `\alpha` と
 * `\Alpha` が別物で、区別しないと置換で式を壊すため。正規表現は使わない。
 *
 * 置換の結果は `insertSnippet` と同じ形（置き換える範囲と入れる文字列）で返す。
 * `App.tsx` の `insertIntoTextarea` に渡してUndo履歴に乗せるため（0021）。
 */

import type { InsertResult } from './insertSnippet'

export type Match = { start: number; end: number }

/**
 * 一致の位置をすべて返す。
 *
 * 重なる一致は数えない（`aaaa` から `aa` は2件）。一致したぶんだけ進むので、
 * 置換したときに結果が重ならない。
 */
export function findMatches(source: string, query: string): Match[] {
  if (query.length === 0) return []

  const matches: Match[] = []
  let from = 0

  for (;;) {
    const start = source.indexOf(query, from)
    if (start === -1) return matches

    matches.push({ start, end: start + query.length })
    from = start + query.length
  }
}

/**
 * カーソル位置から見て次に当たる一致の番号。
 *
 * 後ろに一致がなければ先頭へ回る。一致がなければ -1。
 */
export function matchAfter(matches: Match[], caret: number): number {
  if (matches.length === 0) return -1

  const index = matches.findIndex((match) => match.start >= caret)
  return index === -1 ? 0 : index
}

/** 次（+1）／前（-1）の番号。端では反対側へ回る。 */
export function step(count: number, current: number, direction: 1 | -1): number {
  if (count === 0) return -1
  return (current + direction + count) % count
}

/** 一致1件を置き換える。 */
export function replaceOne(
  source: string,
  match: Match,
  replacement: string,
): InsertResult {
  return {
    text: source.slice(0, match.start) + replacement + source.slice(match.end),
    cursor: match.start + replacement.length,
    start: match.start,
    end: match.end,
    inserted: replacement,
  }
}

/**
 * 一致をすべて置き換える。
 *
 * **全文を1回で差し替える形**で返す。1件ずつ置き換えるとUndoの回数が件数ぶんに
 * なるため（100件置換したら Ctrl+Z を100回押すことになる）。
 *
 * 置換後の文字列は再検索しない（`x` を `xx` にしても無限に増えない）。
 * 一致の位置は置換前の文書に対して求めたものをそのまま使う。
 */
export function replaceAll(
  source: string,
  query: string,
  replacement: string,
): { result: InsertResult; count: number } | null {
  const matches = findMatches(source, query)
  if (matches.length === 0) return null

  let text = ''
  let from = 0
  for (const match of matches) {
    text += source.slice(from, match.start) + replacement
    from = match.end
  }
  text += source.slice(from)

  const first = matches[0] as Match

  return {
    result: {
      text,
      // 最初に置き換えた場所の直後。末尾へ飛ばすと、どこが変わったか見失う。
      cursor: first.start + replacement.length,
      start: 0,
      end: source.length,
      inserted: text,
    },
    count: matches.length,
  }
}
