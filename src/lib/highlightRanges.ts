/**
 * 検索の一致を塗り分けるための区切り（[0043](../../docs/specs/0043-find-replace.md)）。
 *
 * textareaは中の一部だけを色付けできず、**フォーカスが外れていると選択範囲も
 * 描画されない**（Chromiumで実測）。そこで同じ書式の層を裏に敷いて、
 * 一致だけを塗る。その層に並べる文字列をここで作る。
 */

import type { Match } from './findMatches'

export type Segment = {
  text: string
  /** `none` は地の文、`match` は一致、`current` はいま選ばれている一致。 */
  kind: 'none' | 'match' | 'current'
}

/**
 * ソースを「地の文」と「一致」に切り分ける。
 *
 * 一致が無ければ全体を1つの地の文として返す。**文字は1つも落とさない**
 * （落とすと裏の層と表のtextareaで折り返しがずれ、色が別の場所に付く）。
 */
export function highlightRanges(
  source: string,
  matches: Match[],
  currentIndex: number,
): Segment[] {
  if (matches.length === 0) return source.length === 0 ? [] : [{ text: source, kind: 'none' }]

  const segments: Segment[] = []
  let from = 0

  matches.forEach((match, index) => {
    if (match.start > from) {
      segments.push({ text: source.slice(from, match.start), kind: 'none' })
    }
    segments.push({
      text: source.slice(match.start, match.end),
      kind: index === currentIndex ? 'current' : 'match',
    })
    from = match.end
  })

  if (from < source.length) segments.push({ text: source.slice(from), kind: 'none' })

  return segments
}

/** HTMLに入れる前のエスケープ。この層に入る文字列は利用者が書いたもの。 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * 塗る層に入れるHTMLを作る。
 *
 * Reactの要素を並べず文字列にするのは**速さのため**。400節の文書で400件を
 * 要素として並べると1文字あたり60msかかり、[N1](../../docs/requirements.md)の
 * 50msを超えた（実測）。文字列なら1回のDOM書き込みで済む。
 *
 * 末尾に改行を1つ足すのは、`white-space: pre-wrap` の要素では**末尾の改行が
 * 行として描かれない**ため。足さないとtextareaより1行ぶん短くなり、
 * 行がずれる（幅375pxで24pxの差を実測した）。
 */
export function highlightHtml(source: string, matches: Match[], currentIndex: number): string {
  const body = highlightRanges(source, matches, currentIndex)
    .map((segment) =>
      segment.kind === 'none'
        ? escapeHtml(segment.text)
        : `<mark${segment.kind === 'current' ? ' class="is-current"' : ''}>${escapeHtml(segment.text)}</mark>`,
    )
    .join('')

  return `${body}\n`
}
