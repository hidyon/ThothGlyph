import { CURSOR_TOKEN } from './palette'

export type InsertResult = {
  /** 挿入後のソース全文。 */
  text: string
  /** 挿入後にカーソルを置くべき位置。 */
  cursor: number
  /** 置き換える範囲の始まり。 */
  start: number
  /** 置き換える範囲の終わり。 */
  end: number
  /** その範囲に入れる文字列。 */
  inserted: string
}

/**
 * source の [start, end) に snippet を挿入する。
 *
 * - snippet に CURSOR_TOKEN が含まれる場合は、選択中のテキストをその
 *   トークンの位置に埋め込む（`x+1` を選んで \sqrt を押すと
 *   `\sqrt{x+1}` になる）。選択が無ければトークンの位置にカーソルを置く。
 * - CURSOR_TOKEN が無い単体記号は、選択範囲を**置き換えずに直後へ**挿入する。
 *   記号を押したつもりで書いた式が消えるのを防ぐため（issue 0009）。
 *   選択を保ったままにはしない。次の打鍵でその選択が消えて同じ問題が起きる。
 *
 * text のほかに「どの範囲を何で置き換えるか」も返す。呼び出し側が
 * execCommand('insertText') で入れるため（issue 0021）。不変条件は
 * `text === source.slice(0, start) + inserted + source.slice(end)`。
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
    // 選択範囲の終わりに差し込むので、選択が無い場合はカーソル位置への挿入と同じになる。
    const text = source.slice(0, end) + snippet + source.slice(end)
    // 置き換えではなく差し込みなので、範囲は end の空範囲になる。
    return { text, cursor: end + snippet.length, start: end, end, inserted: snippet }
  }

  const before = snippet.slice(0, tokenIndex)
  const after = snippet.slice(tokenIndex + CURSOR_TOKEN.length)
  const inserted = before + selected + after

  return {
    text: source.slice(0, start) + inserted + source.slice(end),
    // 選択テキストを包んだ場合はその後ろ、そうでなければトークンの位置。
    cursor: start + before.length + selected.length,
    start,
    end,
    inserted,
  }
}
