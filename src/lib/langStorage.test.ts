import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectLang, langLabel, loadLang, nextLang, saveLang } from './langStorage'

const KEY = 'thothglyph:lang:v1'
/** 0065で改名する前のキー。読み継ぎの確認に使う。 */
const LEGACY_KEY = 'matheditor:lang:v1'

let store: Map<string, string>

/** ブラウザの言語を差し替える。既定は英語（devcontainerのChromiumと同じ）。 */
const stubNavigator = (language: string) => {
  vi.stubGlobal('navigator', { language })
}

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      // 0065の読み継ぎが旧キーを消すので、スタブにも要る。
      removeItem: (key: string) => void store.delete(key),
    },
  })
  stubNavigator('en-US')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detectLang', () => {
  it('ブラウザが日本語なら ja', () => {
    stubNavigator('ja-JP')

    expect(detectLang()).toBe('ja')
  })

  it('ブラウザが英語なら en', () => {
    expect(detectLang()).toBe('en')
  })

  it('日本語でも英語でもない言語は en に寄せる', () => {
    stubNavigator('fr-FR')

    expect(detectLang()).toBe('en')
  })

  it('地域なしの ja でも ja', () => {
    stubNavigator('ja')

    expect(detectLang()).toBe('ja')
  })

  it('navigator が読めない環境でも例外を外に出さない', () => {
    vi.stubGlobal('navigator', {
      get language(): never {
        throw new Error('SecurityError')
      },
    })

    expect(detectLang()).toBe('en')
  })
})

describe('saveLang / loadLang', () => {
  it('保存した選択が読み戻せる', () => {
    expect(saveLang('ja')).toBe(true)
    expect(loadLang()).toBe('ja')
  })

  it('保存がないときはブラウザの言語に従う', () => {
    stubNavigator('ja-JP')

    expect(loadLang()).toBe('ja')
  })

  it('壊れたJSONならブラウザの言語に落とす', () => {
    store.set(KEY, '{')

    expect(loadLang()).toBe('en')
  })

  it('版が違えばブラウザの言語に落とす', () => {
    store.set(KEY, JSON.stringify({ version: 2, lang: 'ja' }))

    expect(loadLang()).toBe('en')
  })

  it('知らない値ならブラウザの言語に落とす', () => {
    store.set(KEY, JSON.stringify({ version: 1, lang: 'fr' }))

    expect(loadLang()).toBe('en')
  })

  it('保存された選択はブラウザの言語より優先する', () => {
    stubNavigator('ja-JP')
    saveLang('en')

    expect(loadLang()).toBe('en')
  })

  it('localStorageが例外を投げる環境でも例外を外に出さない', () => {
    vi.stubGlobal('window', {
      get localStorage(): never {
        throw new Error('SecurityError')
      },
    })

    expect(loadLang()).toBe('en')
    expect(saveLang('ja')).toBe(false)
  })
})

describe('nextLang', () => {
  it('日本語と英語を往復する', () => {
    expect(nextLang('ja')).toBe('en')
    expect(nextLang('en')).toBe('ja')
  })
})

describe('langLabel', () => {
  it('言語そのものの名前を返す（表示中の言語では訳さない）', () => {
    expect(langLabel('ja')).toBe('日本語')
    expect(langLabel('en')).toBe('English')
  })
})

describe('旧キーからの読み継ぎ（0065）', () => {
  const legacyValue = (lang: string) => JSON.stringify({ version: 1, lang })

  it('旧キーだけがあるとき、その選択が読まれる', () => {
    store.set(LEGACY_KEY, legacyValue('ja'))
    expect(loadLang()).toBe('ja')
  })

  it('読み継ぐと新キーに写り、旧キーが消える', () => {
    store.set(LEGACY_KEY, legacyValue('ja'))
    loadLang()
    expect(store.has(LEGACY_KEY)).toBe(false)
    expect(JSON.parse(store.get(KEY) ?? 'null')?.lang).toBe('ja')
  })

  it('新旧の両方があるときは新キーが読まれる（旧キーは触らない）', () => {
    store.set(KEY, legacyValue('en'))
    store.set(LEGACY_KEY, legacyValue('ja'))
    expect(loadLang()).toBe('en')
    expect(store.has(LEGACY_KEY)).toBe(true)
  })

  it('旧キーの値が壊れていれば detectLang() に落ちる', () => {
    store.set(LEGACY_KEY, '{壊れたJSON')
    stubNavigator('ja-JP')
    expect(loadLang()).toBe('ja')
  })
})
