/**
 * テーマの選択をlocalStorageに保存・復元する。
 *
 * 保存に失敗しても表示は出さない。失われるのは「次回開いたときの見た目」だけで、
 * 文書が消える自動保存（documentStorage）とは代償の大きさが違う。
 */

/**
 * キーは `matheditor:<名前>:v<版>`（documentStorage と揃える）。
 *
 * このキーと値の形は index.html のインラインスクリプトにも書いてある。
 * 本体の読み込み前にテーマを当てないと白がちらつくため（実測20ms）。
 * 変えるときは両方直す。
 */
const KEY = 'matheditor:theme:v1'

const VERSION = 1

/** `system` はOSの設定に従う。既定値。 */
export type Theme = 'system' | 'light' | 'dark'

const THEMES: Theme[] = ['system', 'light', 'dark']

const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as string[]).includes(value)

/** 保存された選択を返す。読めない・壊れている場合は 'system'。 */
export function loadTheme(): Theme {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    return 'system'
  }
  if (raw === null) return 'system'

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return 'system'

    const { version, theme } = parsed as Record<string, unknown>
    if (version !== VERSION || !isTheme(theme)) return 'system'

    return theme
  } catch {
    return 'system'
  }
}

/** 保存できたら true。失敗しても例外は投げない。 */
export function saveTheme(theme: Theme): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: VERSION, theme }))
    return true
  } catch {
    return false
  }
}

/** ボタンを押したときの巡り順: 自動 → ライト → ダーク → 自動。 */
export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
}

/** 画面に出す名前。 */
export function themeLabel(theme: Theme): string {
  switch (theme) {
    case 'light':
      return 'ライト'
    case 'dark':
      return 'ダーク'
    case 'system':
      return '自動'
  }
}
