/**
 * 退避後のテキスト上の位置を、元ソースの行番号へ直す（0010）。
 *
 * `renderMarkdown` は数式とグラフをプレースホルダへ退避してからMarkdownを解析する。
 * プレースホルダは元の文字列より短く、複数行を1行に畳むので、**退避後のテキストで
 * 行を数えると以降が全部ずれる**。退避のたびに対応する位置を控えておき、
 * ここで元の位置へ引き直す。
 */

/** 退避後のテキスト上の位置と、元ソース上の位置の対応。退避のたびに1件増える。 */
export type OffsetMap = { masked: number; original: number }[]

/**
 * 各行の先頭オフセット。`starts[i]` が i 行目（0始まり）の先頭。
 * 行ごとに数え直すと文書の長さの2乗になるので、1回だけ作って使い回す。
 */
export function lineStarts(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}

/**
 * 退避後のオフセットを元ソースのオフセットへ直す。
 *
 * 対応表の2点の間では、退避後と元ソースのずれは一定なので、直前の対応点からの
 * 差を足せばよい。プレースホルダの内側を指した場合は、退避した元の文字列の
 * 内側に落ちる（その数式が始まる行の側に寄る）。
 */
export function toOriginal(map: OffsetMap, masked: number): number {
  let low = 0
  let high = map.length - 1
  let found = 0

  // 「masked 以下で最も後ろの対応点」を二分探索する。
  while (low <= high) {
    const middle = (low + high) >> 1
    if (map[middle].masked <= masked) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  const point = map[found]
  if (point === undefined) return masked
  return point.original + (masked - point.masked)
}

/** 元ソースのオフセットが何行目か（1始まり）。 */
export function lineAt(starts: number[], offset: number): number {
  let low = 0
  let high = starts.length - 1
  let found = 0

  while (low <= high) {
    const middle = (low + high) >> 1
    if (starts[middle] <= offset) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return found + 1
}
