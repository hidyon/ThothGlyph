/**
 * 表示言語の選択をlocalStorageに保存・復元する。
 *
 * themeStorage と同じ形にしてある（キーの付け方、版の持ち方、読めないときに
 * 既定へ落ちること、保存の失敗を握りつぶすこと）。失われるのは「次回開いたときの
 * 言語」だけで、文書が消える自動保存とは代償の大きさが違う。
 */

import type { Lang } from './i18n'
import { readWithMigration } from './storageMigration'

/**
 * キーは `thothglyph:<名前>:v<版>`（documentStorage と揃える）。
 *
 * このキーと値の形は index.html のインラインスクリプトにも書いてある。
 * <html lang> をReactのマウント前に当てるため。変えるときは両方直す。
 */
const KEY = 'thothglyph:lang:v1'

/** 0062で `matheditor:` から改名した。古い保存を読み継ぐために見る。 */
const LEGACY_KEY = 'matheditor:lang:v1'

const VERSION = 1

const LANGS: Lang[] = ['ja', 'en']

const isLang = (value: unknown): value is Lang =>
  typeof value === 'string' && (LANGS as string[]).includes(value)

/**
 * 保存がないときの既定。ブラウザの言語が日本語なら日本語、それ以外は英語。
 *
 * 「自動」を状態として持たないのは、テーマの `system` と違って追従する相手が
 * 使用中に変わらないため。初回に一度決めれば足りる。
 */
export function detectLang(): Lang {
  try {
    return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
  } catch {
    return 'en'
  }
}

/** 保存された選択を返す。読めない・壊れている・版違いなら detectLang()。 */
export function loadLang(): Lang {
  // 新キー→旧キーの順で読む。旧キーから読めたら新キーへ写される（0062）。
  const raw = readWithMigration(KEY, LEGACY_KEY)
  if (raw === null) return detectLang()

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return detectLang()

    const { version, lang } = parsed as Record<string, unknown>
    if (version !== VERSION || !isLang(lang)) return detectLang()

    return lang
  } catch {
    return detectLang()
  }
}

/** 保存できたら true。失敗しても例外は投げない。 */
export function saveLang(lang: Lang): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ version: VERSION, lang }))
    return true
  } catch {
    return false
  }
}

/** ボタンを押したときの切り替え先。2状態なので巡回ではなく往復。 */
export function nextLang(lang: Lang): Lang {
  return lang === 'ja' ? 'en' : 'ja'
}

/** 画面に出す名前。言語そのものの名前なので、表示中の言語では訳さない。 */
export function langLabel(lang: Lang): string {
  return lang === 'ja' ? '日本語' : 'English'
}
