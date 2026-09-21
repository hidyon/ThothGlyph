/**
 * 3つの領域（パレット・ソース・プレビュー）の分け方を保存・復元する（0057）。
 *
 * themeStorage と同じ形にしてある（キーの付け方、版の持ち方、読めないときに
 * 既定へ落ちること、保存の失敗を握りつぶすこと）。失われるのは「次回開いたときの
 * 分け方」だけで、文書が消える自動保存とは代償の大きさが違う。
 *
 * パレットは**px**、ソースとプレビューは**割合**で持つ。pxで両方を持つと、
 * ウィンドウを広げたときにソースだけが広がる（割合なら両方が広がる）。
 */

import { readWithMigration } from './storageMigration'

const KEY = 'thothglyph:panes:v1'

/** 0065で `matheditor:` から改名した。古い保存を読み継ぐために見る。 */
const LEGACY_KEY = 'matheditor:panes:v1'

const VERSION = 1

/** 仕切り1本の幅。グリッドの列として場所を取る。 */
export const DIVIDER = 6

/** タブ名 `Ωギリシャ大文字` が折り返さない下限。140pxではタブが48pxになる。 */
export const MIN_PALETTE = 150
/** 見出し行のボタン3つが1行に収まる下限。300pxでは30px→47pxに折り返す。 */
export const MIN_SOURCE = 360
/** グラフが312px（0037が幅360pxのペインで確かめた値）。240pxで数式がはみ出す。 */
export const MIN_PREVIEW = 360

export const DEFAULT_PALETTE = 180
export const DEFAULT_SOURCE_RATIO = 0.5

/** 可変にするのは縦帯（0054）と同じ幅から。 */
export const MIN_WINDOW = 1200

export type PaneSizes = {
  /** パレットの幅（px）。 */
  palette: number
  /** ソースとプレビューの合計に対するソースの割合（0〜1）。 */
  sourceRatio: number
}

export const defaultPaneSizes = (): PaneSizes => ({
  palette: DEFAULT_PALETTE,
  sourceRatio: DEFAULT_SOURCE_RATIO,
})

const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * 画面の幅に収まるよう値を丸める。
 *
 * 下限の合計（150 + 360 + 360 + 仕切り12 = 882px）に足りない画面では、
 * 丸めようがないので既定を返す（可変にするのは1200px以上なので通常は起こらない）。
 */
export function clampPaneSizes(sizes: PaneSizes, windowWidth: number): PaneSizes {
  const needed = MIN_PALETTE + MIN_SOURCE + MIN_PREVIEW + DIVIDER * 2
  if (!isFinitePositive(windowWidth) || windowWidth < needed) return defaultPaneSizes()

  const maxPalette = windowWidth - MIN_SOURCE - MIN_PREVIEW - DIVIDER * 2
  // ここで丸めない。ドラッグは小さな差分の積み重ねなので、1回ごとに丸めると
  // 端数が毎回切り捨てられ、100px動かしたつもりが96pxしか動かない（実測）。
  // 丸めるのは画面に当てるときと保存するときだけ。
  const palette = Math.min(Math.max(sizes.palette, MIN_PALETTE), maxPalette)

  // 残り（ソース＋プレビュー）の中で割合を丸める。
  const rest = windowWidth - palette - DIVIDER * 2
  const minRatio = MIN_SOURCE / rest
  const maxRatio = 1 - MIN_PREVIEW / rest
  // パレットと同じ理由でここでも丸めない（丸めるのは保存とCSSのときだけ）。
  const ratio = Math.min(Math.max(sizes.sourceRatio, minRatio), maxRatio)

  return { palette, sourceRatio: ratio }
}

/** 保存された分け方を返す。読めない・壊れている・版違いなら既定。 */
export function loadPaneSizes(): PaneSizes {
  // 新キー→旧キーの順で読む。旧キーから読めたら新キーへ写される（0065）。
  const raw = readWithMigration(KEY, LEGACY_KEY)
  if (raw === null) return defaultPaneSizes()

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return defaultPaneSizes()

    const { version, palette, sourceRatio } = parsed as Record<string, unknown>
    if (version !== VERSION) return defaultPaneSizes()
    if (!isFinitePositive(palette) || !isFinitePositive(sourceRatio)) return defaultPaneSizes()
    if (sourceRatio <= 0 || sourceRatio >= 1) return defaultPaneSizes()

    return { palette, sourceRatio }
  } catch {
    return defaultPaneSizes()
  }
}

/** 保存できたら true。失敗しても例外は投げない。 */
export function savePaneSizes(sizes: PaneSizes): boolean {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        version: VERSION,
        palette: Math.round(sizes.palette),
        // 4桁あれば幅1440pxで0.1px未満の誤差に収まる。
        sourceRatio: Math.round(sizes.sourceRatio * 10000) / 10000,
      }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * `.panes` に当てる `grid-template-columns`。
 *
 * `fr` で書くのは、仕切りの6pxを引いた**残り**を割合で分けるため。
 * `%` で書くと全幅に対する割合になり、仕切りのぶん6pxはみ出す。
 */
export function paneColumns(sourceRatio: number): string {
  // 5桁。3桁だと幅1440pxで0.6pxずれ、下限ちょうどのとき360pxを割った。
  const source = Math.round(sourceRatio * 100000) / 100000
  return `${source}fr ${DIVIDER}px ${Math.round((1 - source) * 100000) / 100000}fr`
}
