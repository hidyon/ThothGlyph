// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEditorDisplay, saveEditorDisplay } from './editorDisplayStorage'

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks() })

describe('editorDisplayStorage', () => {
  it('保存した表示設定を復元する', () => {
    saveEditorDisplay({ lineNumbers: false, syntaxHighlight: true })
    expect(loadEditorDisplay()).toEqual({ lineNumbers: false, syntaxHighlight: true })
  })
  it('壊れた値は両方オンへ戻す', () => {
    window.localStorage.setItem('thothglyph:editor-display:v1', '{')
    expect(loadEditorDisplay()).toEqual({ lineNumbers: true, syntaxHighlight: true })
  })
})
