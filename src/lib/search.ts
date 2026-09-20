/**
 * 記号パレットの横断検索。
 *
 * 記号62件と公式60件はタブの奥にあり、どのタブにあるかを覚えていないと
 * 往復することになる。ここではタブを無視して全件から絞り込む。
 *
 * 照合に使うのは既にあるデータ（記号の `label` / `title`、公式の `name` /
 * `preview`）だけで、検索のためのフィールドを足さない。記号を1行で
 * 追加できる約束（palette.ts の先頭）を崩さないため。
 */

import type { Formula } from './formulas'
import { formulaGroups } from './formulas'
import type { Text } from './i18n'
import type { PaletteItem } from './palette'
import { paletteGroups } from './palette'

export type SearchHit =
  | { kind: 'symbol'; item: PaletteItem; group: Text }
  | { kind: 'formula'; formula: Formula; group: Text }

/**
 * 返す件数の上限。`a` のような1文字では100件近く当たり、
 * パレットだけで画面が埋まる。
 */
export const SEARCH_LIMIT = 40

/**
 * 照合用に整える。`\` や `{}` を落とすので `\alpha` も `alpha` も同じ形になり、
 * `frac` が `\frac{a}{b}` に当たる。
 */
const normalize = (value: string) => value.replace(/[\\{}^_\s]/g, '').toLowerCase()

type Entry = { hit: SearchHit; keys: string[] }

/**
 * 照合する文字列は日英の両方を入れる。表示言語に関わらず、
 * 日本語表示のまま `integral` と打っても引けるようにするため
 * （言語ごとに引ける語が変わるほうが驚きが大きい）。
 */
const entries: Entry[] = [
  ...paletteGroups.flatMap((group) =>
    group.items.map((item) => ({
      hit: { kind: 'symbol', item, group: group.name } as SearchHit,
      keys: [item.label, item.title.ja, item.title.en].map(normalize),
    })),
  ),
  ...formulaGroups.flatMap((group) =>
    group.formulas.map((formula) => ({
      hit: { kind: 'formula', formula, group: group.name } as SearchHit,
      keys: [formula.name.ja, formula.name.en, formula.preview].map(normalize),
    })),
  ),
]

/** 結果のキー。記号と公式が同じ一覧に並ぶので、種別で分けておく。 */
export function hitKey(hit: SearchHit): string {
  return hit.kind === 'symbol' ? `s:${hit.item.label}` : `f:${hit.formula.name.en}`
}

/** 挿入される文字列。 */
export function hitSnippet(hit: SearchHit): string {
  return hit.kind === 'symbol' ? hit.item.snippet : hit.formula.snippet
}

/**
 * クエリに当たる記号と公式を返す。
 *
 * 曖昧検索もスコアリングもしない（部分一致だけ）。ただし並び順だけは
 * 前方一致を先に出す。`pi` と打って `\pi` が `\varpi` より後に来ると
 * 探せないため。同順のものはパレットの定義順。
 */
export function searchPalette(query: string): { hits: SearchHit[]; omitted: number } {
  const normalized = normalize(query)
  if (normalized.length === 0) return { hits: [], omitted: 0 }

  const prefix: SearchHit[] = []
  const partial: SearchHit[] = []

  for (const entry of entries) {
    if (entry.keys.some((key) => key.startsWith(normalized))) prefix.push(entry.hit)
    else if (entry.keys.some((key) => key.includes(normalized))) partial.push(entry.hit)
  }

  const all = [...prefix, ...partial]

  return {
    hits: all.slice(0, SEARCH_LIMIT),
    omitted: Math.max(0, all.length - SEARCH_LIMIT),
  }
}
