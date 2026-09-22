import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPersonalSnippets, savePersonalSnippets } from './personalSnippets'

const KEY = 'thothglyph:personal-snippets:v1'

function stubStorage(store: Map<string, string>) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
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

describe('personal snippets storage', () => {
  it('保存した複数行のスニペットを読み戻せる', () => {
    const snippets = [{ id: 'proof', name: '証明', body: '> 証明\n> %CURSOR%' }]

    expect(savePersonalSnippets(snippets)).toBe(true)
    expect(loadPersonalSnippets()).toEqual(snippets)
  })

  it('壊れた値と不正な項目を無視する', () => {
    store.set(KEY, '{')
    expect(loadPersonalSnippets()).toEqual([])

    store.set(
      KEY,
      JSON.stringify([
        { id: 'ok', name: '有効', body: 'x' },
        { id: 'missing-name', body: 'x' },
        { id: 'empty-body', name: '空', body: '' },
      ]),
    )
    expect(loadPersonalSnippets()).toEqual([{ id: 'ok', name: '有効', body: 'x' }])
  })

  it('保存し直すと編集・削除後の一覧に置き換わる', () => {
    savePersonalSnippets([
      { id: 'one', name: '古い名前', body: 'old' },
      { id: 'two', name: '消す', body: 'delete' },
    ])
    savePersonalSnippets([{ id: 'one', name: '新しい名前', body: 'new' }])

    expect(loadPersonalSnippets()).toEqual([{ id: 'one', name: '新しい名前', body: 'new' }])
  })

  it('storageの例外を外へ出さない', () => {
    vi.stubGlobal('window', {
      get localStorage(): never {
        throw new Error('SecurityError')
      },
    })

    expect(loadPersonalSnippets()).toEqual([])
    expect(savePersonalSnippets([{ id: 'a', name: 'A', body: 'a' }])).toBe(false)
  })
})
