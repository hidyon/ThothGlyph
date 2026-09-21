import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PALETTE,
  DEFAULT_SOURCE_RATIO,
  MIN_PALETTE,
  clampPaneSizes,
  defaultPaneSizes,
  loadPaneSizes,
  paneColumns,
  savePaneSizes,
} from './paneSizes'

const KEY = 'matheditor:panes:v1'

// themeStorage.test.ts と同じ形。テストはnode環境で走るので window を差し込む。
let store: Map<string, string>

describe('既定', () => {
  it('パレット180px・ソース半分', () => {
    expect(defaultPaneSizes()).toEqual({ palette: DEFAULT_PALETTE, sourceRatio: DEFAULT_SOURCE_RATIO })
  })
})

// 仕様に書いた4例をそのまま固定する（0057）。
describe('clampPaneSizes', () => {
  it('下限を満たす値はそのまま', () => {
    expect(clampPaneSizes({ palette: 180, sourceRatio: 0.5 }, 1440)).toEqual({
      palette: 180,
      sourceRatio: 0.5,
    })
  })

  it('パレットが狭すぎるときは150pxに上げる', () => {
    expect(clampPaneSizes({ palette: 100, sourceRatio: 0.5 }, 1440).palette).toBe(MIN_PALETTE)
  })

  it('ソースに寄せすぎるとプレビュー360pxの下限で止まる', () => {
    const rest = 1440 - 180 - 12
    const { sourceRatio } = clampPaneSizes({ palette: 180, sourceRatio: 0.95 }, 1440)

    expect(sourceRatio).toBeCloseTo(1 - 360 / rest, 2)
    // 丸めで下限を割らないこと（3桁に丸めていたとき0.6pxずれて359pxになった）。
    // 比較に余裕を持たせるのはIEEEの誤差のぶんだけ（359.99999999999994 が出る）。
    expect(rest * (1 - sourceRatio)).toBeGreaterThan(360 - 0.001)
  })

  it('ソースを狭めすぎてもソース360pxを割らない', () => {
    const rest = 1440 - 180 - 12
    const { sourceRatio } = clampPaneSizes({ palette: 180, sourceRatio: 0.05 }, 1440)

    expect(rest * sourceRatio).toBeGreaterThan(360 - 0.001)
  })

  it('パレットを広げすぎるとソースとプレビューの下限で止まる', () => {
    const { palette } = clampPaneSizes({ palette: 900, sourceRatio: 0.5 }, 1440)
    expect(palette).toBe(1440 - 360 - 360 - 12)
  })

  it('下限の合計（882px）に足りない画面では既定を返す', () => {
    expect(clampPaneSizes({ palette: 300, sourceRatio: 0.7 }, 800)).toEqual(defaultPaneSizes())
  })

  it('幅が数値でないときも既定を返す', () => {
    expect(clampPaneSizes({ palette: 300, sourceRatio: 0.7 }, Number.NaN)).toEqual(defaultPaneSizes())
  })
})

describe('保存と復元', () => {
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

  it('保存した値が読み戻せる', () => {
    expect(savePaneSizes({ palette: 240, sourceRatio: 0.62 })).toBe(true)
    expect(loadPaneSizes()).toEqual({ palette: 240, sourceRatio: 0.62 })
  })

  it('保存がないときは既定', () => {
    expect(loadPaneSizes()).toEqual(defaultPaneSizes())
  })

  it('壊れたJSONは既定', () => {
    store.set(KEY, '{壊れている')
    expect(loadPaneSizes()).toEqual(defaultPaneSizes())
  })

  it('版違いは既定', () => {
    store.set(KEY, JSON.stringify({ version: 2, palette: 240, sourceRatio: 0.6 }))
    expect(loadPaneSizes()).toEqual(defaultPaneSizes())
  })

  it('数値でない値は既定', () => {
    store.set(KEY, JSON.stringify({ version: 1, palette: '240', sourceRatio: 0.6 }))
    expect(loadPaneSizes()).toEqual(defaultPaneSizes())
  })

  it('割合が0や1のときは既定（片方が消える）', () => {
    store.set(KEY, JSON.stringify({ version: 1, palette: 240, sourceRatio: 1 }))
    expect(loadPaneSizes()).toEqual(defaultPaneSizes())
  })
})

describe('paneColumns', () => {
  // 仕切りの6pxを引いた残りを割合で分ける。% にすると6pxはみ出す。
  it('frで書く', () => {
    expect(paneColumns(0.5)).toBe('0.5fr 6px 0.5fr')
  })

  it('端数は5桁で丸める（3桁だと下限ちょうどで360pxを割る）', () => {
    expect(paneColumns(0.713456789)).toBe('0.71346fr 6px 0.28654fr')
  })
})
