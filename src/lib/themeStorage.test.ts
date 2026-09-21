import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTheme, nextTheme, saveTheme, themeLabel } from './themeStorage'

const KEY = 'thothglyph:theme:v1'
/** 0062で改名する前のキー。読み継ぎの確認に使う。 */
const LEGACY_KEY = 'matheditor:theme:v1'

let store: Map<string, string>

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      // 0062の読み継ぎが旧キーを消すので、スタブにも要る。
      removeItem: (key: string) => void store.delete(key),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('saveTheme / loadTheme', () => {
  it('保存した選択が読み戻せる', () => {
    expect(saveTheme('dark')).toBe(true)
    expect(loadTheme()).toBe('dark')
  })

  it('保存がないときは自動（system）', () => {
    expect(loadTheme()).toBe('system')
  })

  it('壊れたJSONなら自動に落とす', () => {
    store.set(KEY, '{')

    expect(loadTheme()).toBe('system')
  })

  it('版が違えば自動に落とす', () => {
    store.set(KEY, JSON.stringify({ version: 2, theme: 'dark' }))

    expect(loadTheme()).toBe('system')
  })

  it('知らない値なら自動に落とす', () => {
    store.set(KEY, JSON.stringify({ version: 1, theme: 'sepia' }))

    expect(loadTheme()).toBe('system')
  })

  it('localStorageが例外を投げる環境でも例外を外に出さない', () => {
    vi.stubGlobal('window', {
      get localStorage(): never {
        throw new Error('SecurityError')
      },
    })

    expect(loadTheme()).toBe('system')
    expect(saveTheme('dark')).toBe(false)
  })
})

describe('nextTheme', () => {
  it('自動 → ライト → ダーク → 自動 と巡る', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })
})

describe('themeLabel', () => {
  it('画面に出す名前を返す', () => {
    expect(themeLabel('system', 'ja')).toBe('自動')
    expect(themeLabel('light', 'ja')).toBe('ライト')
    expect(themeLabel('dark', 'ja')).toBe('ダーク')
  })

  it('英語でも返す', () => {
    expect(themeLabel('system', 'en')).toBe('Auto')
    expect(themeLabel('light', 'en')).toBe('Light')
    expect(themeLabel('dark', 'en')).toBe('Dark')
  })
})

describe('旧キーからの読み継ぎ（0062）', () => {
  const legacyValue = (theme: string) => JSON.stringify({ version: 1, theme })

  it('旧キーだけがあるとき、その選択が読まれる', () => {
    store.set(LEGACY_KEY, legacyValue('dark'))
    expect(loadTheme()).toBe('dark')
  })

  it('読み継ぐと新キーに写り、旧キーが消える', () => {
    store.set(LEGACY_KEY, legacyValue('dark'))
    loadTheme()
    expect(store.has(LEGACY_KEY)).toBe(false)
    expect(JSON.parse(store.get(KEY) ?? 'null')?.theme).toBe('dark')
  })

  it('新旧の両方があるときは新キーが読まれる（旧キーは触らない）', () => {
    store.set(KEY, legacyValue('light'))
    store.set(LEGACY_KEY, legacyValue('dark'))
    expect(loadTheme()).toBe('light')
    expect(store.has(LEGACY_KEY)).toBe(true)
  })

  it('旧キーの値が壊れていても既定の system', () => {
    store.set(LEGACY_KEY, '{壊れたJSON')
    expect(loadTheme()).toBe('system')
  })
})
