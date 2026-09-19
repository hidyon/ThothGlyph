import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTheme, nextTheme, saveTheme, themeLabel } from './themeStorage'

const KEY = 'matheditor:theme:v1'

let store: Map<string, string>

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
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
    expect(themeLabel('system')).toBe('自動')
    expect(themeLabel('light')).toBe('ライト')
    expect(themeLabel('dark')).toBe('ダーク')
  })
})
