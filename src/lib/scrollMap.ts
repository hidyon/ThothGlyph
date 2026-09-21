/**
 * 2つのペインのスクロール位置を写し合わせる（0010）。
 *
 * 両側で測ったアンカー（`data-line` を持つブロックのy座標）を行番号で突き合わせ、
 * **y座標どうしの対応表**にしてしまう。行番号は突き合わせの鍵としてだけ使う。
 * 対応表にしておけば、逆方向は from と to を入れ替えるだけで済み、
 * 補間の計算を2つ持たずにすむ。
 */

/** ある行が、そのペインのスクロール内容のどこ（y座標）から始まるか。 */
export type Anchor = { line: number; top: number }

/** 対応する1組。`from` 側の y が `to` 側の y に対応する。 */
export type Pair = { from: number; to: number }

/**
 * 行番号で突き合わせ、`from` の昇順に並べる。片方にしか無い行は捨てる。
 *
 * 片方にしか無い行が出るのは、ミラーとプレビューが別のタイミングの内容を
 * 映していることがあるため（打鍵の直後など）。捨てても前後の組からの補間で足りる。
 */
export function pairAnchors(from: Anchor[], to: Anchor[]): Pair[] {
  const tops = new Map<number, number>()
  for (const anchor of to) tops.set(anchor.line, anchor.top)

  const pairs: Pair[] = []
  for (const anchor of from) {
    const top = tops.get(anchor.line)
    if (top !== undefined) pairs.push({ from: anchor.top, to: top })
  }

  return pairs.sort((a, b) => a.from - b.from)
}

/**
 * `from` 側の位置 `value` を `to` 側の位置へ写す。
 *
 * - 組と組の間は線形補間
 * - 最初の組より手前は 0 〜 最初の組の間で比例
 * - 最後の組より後ろは 最後の組 〜 末尾（`fromEnd` / `toEnd`）の間で比例
 * - 組が0件なら `fromEnd` と `toEnd` の比（＝割合での同期）に落ちる
 *
 * `fromEnd` / `toEnd` は `scrollHeight - clientHeight`（スクロールできる最大量）。
 * 末尾をここで留めるので、**片方が最下端ならもう片方も最下端になる**。
 */
export function mapScroll(
  pairs: Pair[],
  value: number,
  fromEnd: number,
  toEnd: number,
): number {
  if (toEnd <= 0) return 0

  /*
    **スクロールで届かないアンカーは落とす。** 最後の画面に入るブロックは
    `scrollHeight - clientHeight` より後ろの座標を持つ。そのまま使うと
    終端の組と前後が入れ替わり、片方を最下端にしても相手が最下端にならない
    （実測で50px手前に留まった）。
  */
  const usable = pairs.filter((pair) => pair.from < fromEnd && pair.to < toEnd)
  if (usable.length === 0) return clamp(ratio(value, fromEnd) * toEnd, toEnd)

  // 終端どうしを組にして足す。これで最下端は必ず最下端に写る。
  const points = [...usable, { from: fromEnd, to: toEnd }]

  const first = points[0]
  if (value <= first.from) {
    // 先頭からの区間。0 と最初の組の間で比例させる（最上端は最上端に写る）。
    return clamp(interpolate(value, 0, first.from, 0, first.to), toEnd)
  }

  // value を挟む組を二分探索する（`value` より手前で最も後ろの組）。
  let low = 0
  let high = points.length - 1
  let found = 0
  while (low <= high) {
    const middle = (low + high) >> 1
    if (points[middle].from <= value) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  const before = points[found]
  const after = points[found + 1] ?? before
  return clamp(interpolate(value, before.from, after.from, before.to, after.to), toEnd)
}

/**
 * 区間 [fromLow, fromHigh] の value を [toLow, toHigh] へ写す。
 * 区間の幅が0のとき（同じ位置に2つのアンカーがある、末尾に余白がない）は
 * 割り算に落ちないよう手前の端を返す。
 */
function interpolate(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number,
): number {
  const width = fromHigh - fromLow
  if (width <= 0) return toLow
  return toLow + ((value - fromLow) / width) * (toHigh - toLow)
}

function ratio(value: number, end: number): number {
  if (end <= 0) return 0
  return value / end
}

function clamp(value: number, toEnd: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), toEnd)
}
