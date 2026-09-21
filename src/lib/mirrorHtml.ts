/**
 * ミラー要素に入れる文字列を作る（0010）。
 *
 * `<textarea>` は行の座標を返さないので、同じ書式の要素を裏に置いて測る。
 * アンカー行の先頭に空の `<span data-line="N">` を置き、その `offsetTop` を
 * その行のy座標として使う。
 *
 * 0043の「塗る層」と同じ制約が効く。**書式は `.editor` と1文字ぶんも
 * 違えてはならない**（CSSは同じルールにまとめてある）。
 */

/**
 * ソースと、印を付けたい行番号（1始まり）からミラーのHTMLを作る。
 *
 * 末尾に改行を足すのは、`white-space: pre-wrap` では末尾の改行が行にならず、
 * textareaより1行ぶん短くなるため（0043で踏んだもの）。
 */
export function mirrorHtml(source: string, lines: number[]): string {
  const marked = new Set(lines)
  const out: string[] = []

  source.split('\n').forEach((line, index) => {
    if (marked.has(index + 1)) out.push(`<span data-line="${index + 1}"></span>`)
    out.push(escapeHtml(line))
    out.push('\n')
  })

  return out.join('')
}

/**
 * 入れるのは利用者が書いた文字列なので、要素として解釈されないようにする。
 * `&` と `<` を潰せば新しいタグは作れない（`>` 単体はタグにならない）。
 */
function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
}
