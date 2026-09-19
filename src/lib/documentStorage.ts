/**
 * 編集中の文書をlocalStorageに保存・復元する。
 *
 * localStorageに触るのはこのファイルだけに閉じる。プライベートウィンドウや
 * サイトデータ無効の環境ではアクセス自体が例外を投げるため、呼び出し側に
 * try/catchを散らさずここで吸収する。
 */

/** キーは `matheditor:<名前>:v<版>`。0004で複数文書へ移るときは名前と版を変える。 */
const KEY = 'matheditor:document:v1'

const VERSION = 1

export type StoredDocument = {
  source: string
  savedAt: string
}

/**
 * 保存された文書を返す。保存がない、形式が違う、読めない場合は null。
 * 呼び出し側はそれを「初回訪問」として扱う。
 */
export function loadDocument(): StoredDocument | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { version, source, savedAt } = parsed as Record<string, unknown>
    // 版が違うデータで起動を壊さない。読めないものは保存なしと同じ扱いにする。
    if (version !== VERSION || typeof source !== 'string') return null

    return { source, savedAt: typeof savedAt === 'string' ? savedAt : '' }
  } catch {
    return null
  }
}

/** 保存できたら true。容量超過や書き込み禁止では false を返し、例外は投げない。 */
export function saveDocument(source: string): boolean {
  const payload = JSON.stringify({
    version: VERSION,
    source,
    savedAt: new Date().toISOString(),
  })

  try {
    window.localStorage.setItem(KEY, payload)
    return true
  } catch {
    return false
  }
}
