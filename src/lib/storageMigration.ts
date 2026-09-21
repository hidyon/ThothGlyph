/**
 * 旧名 `matheditor:` のキーからの読み継ぎ（0065）。
 *
 * アプリ名を ThothGlyph に変えたとき、localStorageのキーの接頭辞も
 * `thothglyph:` に変えた。すでに書いたものを持っている利用者の文書・テーマ・
 * 言語・領域の幅を失わせないため、新キーがないときだけ旧キーを読み、
 * 読めたら新キーへ写して旧キーを消す。
 *
 * 版（`v1`）は上げていない。中身の形は変わっていないので、上げると各
 * ストレージの「版違いは捨てる」分岐に自分で引っかかる。
 */

/**
 * 新キーの値を返す。なければ旧キーを読み、新キーへ写してから旧キーを消す。
 * どちらもなければ null。localStorageに触れない環境でも例外を投げない。
 *
 * 写すのは生の文字列で、中身が壊れていても判定しない。壊れた値は呼び出し側の
 * パースが既定値に落とすので、ここで形を知る必要がない。
 */
export function readWithMigration(key: string, legacyKey: string): string | null {
  try {
    const current = window.localStorage.getItem(key)
    if (current !== null) return current
  } catch {
    // プライベートウィンドウなど、アクセス自体が例外を投げる環境。
    return null
  }

  let legacy: string | null
  try {
    legacy = window.localStorage.getItem(legacyKey)
  } catch {
    return null
  }
  if (legacy === null) return null

  try {
    // 写してから消す。この順なら、書けなかったときに旧キーが残る。
    window.localStorage.setItem(key, legacy)
    window.localStorage.removeItem(legacyKey)
  } catch {
    // 移行できなくても、読めた値はそのまま使う（次回また移行を試す）。
  }
  return legacy
}
