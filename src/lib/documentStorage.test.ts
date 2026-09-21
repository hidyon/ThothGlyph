import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDocument, saveDocument } from './documentStorage'

const KEY = 'thothglyph:document:v1'
/** 0062で改名する前のキー。読み継ぎの確認に使う。 */
const LEGACY_KEY = 'matheditor:document:v1'

/**
 * localStorageの差し替え。必要なのは getItem / setItem の2つだけなので、
 * jsdomを持ち込まずにスタブで足す。
 */
function stubStorage(store: Map<string, string>) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      // 0062の読み継ぎが旧キーを消すので、スタブにも要る。
      removeItem: (key: string) => void store.delete(key),
    },
  })
}

/** 読み書きが例外を投げる環境（プライベートウィンドウ、容量超過）。 */
function stubThrowingStorage() {
  vi.stubGlobal('window', {
    get localStorage(): never {
      throw new Error('SecurityError')
    },
  })
}

let store: Map<string, string>

beforeEach(() => {
  store = new Map()
  stubStorage(store)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('saveDocument / loadDocument', () => {
  it('保存した内容がそのまま読み戻せる', () => {
    expect(saveDocument('# 見出し\n$x^2$')).toBe(true)
    expect(loadDocument()?.source).toBe('# 見出し\n$x^2$')
  })

  it('保存時刻をISO 8601で持つ', () => {
    saveDocument('a')

    expect(loadDocument()?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
  })

  it('保存がないときはnullを返す', () => {
    expect(loadDocument()).toBeNull()
  })

  it('壊れたJSONならnullを返す', () => {
    store.set(KEY, '{')

    expect(loadDocument()).toBeNull()
  })

  it('versionが違うならnullを返す', () => {
    store.set(KEY, JSON.stringify({ version: 2, source: 'a', savedAt: '' }))

    expect(loadDocument()).toBeNull()
  })

  it('sourceが文字列でないならnullを返す', () => {
    store.set(KEY, JSON.stringify({ version: 1, source: 42, savedAt: '' }))

    expect(loadDocument()).toBeNull()
  })

  it('JSONが配列やnullでもnullを返す', () => {
    store.set(KEY, 'null')
    expect(loadDocument()).toBeNull()

    store.set(KEY, '[1,2]')
    expect(loadDocument()).toBeNull()
  })

  it('savedAtが欠けていても空文字で読める', () => {
    store.set(KEY, JSON.stringify({ version: 1, source: 'a' }))

    expect(loadDocument()).toEqual({ source: 'a', savedAt: '' })
  })

  it('localStorageが例外を投げる環境でも例外を外に出さない', () => {
    stubThrowingStorage()

    expect(loadDocument()).toBeNull()
    expect(saveDocument('a')).toBe(false)
  })
})

describe('旧キーからの読み継ぎ（0062）', () => {
  const legacyValue = (source: string) =>
    JSON.stringify({ version: 1, source, savedAt: '2026-09-21T00:00:00.000Z' })

  it('旧キーだけがあるとき、その文書が読まれる', () => {
    store.set(LEGACY_KEY, legacyValue('# 改名前に書いた'))
    expect(loadDocument()?.source).toBe('# 改名前に書いた')
  })

  it('読み継ぐと新キーに写り、旧キーが消える', () => {
    store.set(LEGACY_KEY, legacyValue('# 改名前に書いた'))
    loadDocument()
    expect(store.has(LEGACY_KEY)).toBe(false)
    expect(JSON.parse(store.get(KEY) ?? 'null')?.source).toBe('# 改名前に書いた')
  })

  it('新旧の両方があるときは新キーが読まれる（旧キーは触らない）', () => {
    store.set(KEY, legacyValue('# 新しいほう'))
    store.set(LEGACY_KEY, legacyValue('# 古いほう'))
    expect(loadDocument()?.source).toBe('# 新しいほう')
    expect(store.has(LEGACY_KEY)).toBe(true)
  })

  it('旧キーの値が壊れていても例外を投げず null', () => {
    store.set(LEGACY_KEY, '{壊れたJSON')
    expect(loadDocument()).toBeNull()
  })

  it('localStorageが例外を投げる環境でも読み継ぎが外に漏れない', () => {
    stubThrowingStorage()
    expect(() => loadDocument()).not.toThrow()
    expect(loadDocument()).toBeNull()
  })
})
