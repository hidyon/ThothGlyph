import { CURSOR_TOKEN } from './palette'

export type InsertResult = {
  /** 挿入後のソース全文。 */
  text: string
  /** 挿入後にカーソルを置くべき位置。 */
  cursor: number
}

/**
 * source の [start, end) を snippet で置き換える。
 *
 * - 選択範囲があり、snippet に CURSOR_TOKEN が含まれる場合は、
 *   選択中のテキストをそのトークンの位置に埋め込む（`x+1` を選んで
 *   \sqrt を押すと `\sqrt{x+1}` になる）。
 * - 選択範囲がなければ CURSOR_TOKEN の位置にカーソルを置く。
 * - CURSOR_TOKEN がなければ挿入文字列の末尾にカーソルを置く。
 */
export function insertSnippet(
  source: string,
  snippet: string,
  start: number,
  end: number,
): InsertResult {
  const selected = source.slice(start, end)
  const tokenIndex = snippet.indexOf(CURSOR_TOKEN)

  if (tokenIndex === -1) {
    const text = source.slice(0, start) + snippet + source.slice(end)
    return { text, cursor: start + snippet.length }
  }

  const before = snippet.slice(0, tokenIndex)
  const after = snippet.slice(tokenIndex + CURSOR_TOKEN.length)
  const inserted = before + selected + after

  return {
    text: source.slice(0, start) + inserted + source.slice(end),
    // 選択テキストを包んだ場合はその後ろ、そうでなければトークンの位置。
    cursor: start + before.length + selected.length,
  }
}
