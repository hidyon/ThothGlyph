import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { SymbolPalette } from './components/SymbolPalette'
import { Toolbar } from './components/Toolbar'
import type { SaveState } from './components/Toolbar'
import { loadDocument, saveDocument } from './lib/documentStorage'
import type { Lang } from './lib/i18n'
import { pick } from './lib/i18n'
import { loadLang, nextLang, saveLang } from './lib/langStorage'
import { messages } from './lib/messages'
import type { Theme } from './lib/themeStorage'
import { loadTheme, nextTheme, saveTheme } from './lib/themeStorage'
import { insertSnippet } from './lib/insertSnippet'
import { renderMarkdown } from './lib/renderMarkdown'
import { sampleDocument } from './sampleDocument'

/** 入力が止まってから保存するまでの待ち時間。localStorageは同期APIなので1文字ごとには書かない。 */
const SAVE_DELAY_MS = 600

export default function App() {
  // 遅延初期化でマウント時の1回だけ読む。再レンダリングで読み直さない。
  const [restored] = useState(loadDocument)
  const [lang, setLang] = useState<Lang>(loadLang)

  // 初回訪問のサンプルは、そのとき決まった言語のものを1度だけ選ぶ。以降は
  // 言語を切り替えても差し替えない（利用者が書いたものを消さないため）。
  const [source, setSource] = useState(restored?.source ?? sampleDocument(lang))
  const [saveState, setSaveState] = useState<SaveState>(
    restored ? { status: 'saved', savedAt: restored.savedAt } : { status: 'idle' },
  )
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // まだ保存していない内容。beforeunloadからも読むのでstateではなくrefに置く。
  const unsaved = useRef<string | null>(null)

  // 最後に保存した内容。初期値は復元した内容（初回訪問ならサンプル文書）。
  // 「初回レンダリングか」で判定するとStrictModeの二重マウントで保存が走るため、
  // 内容そのものを比べる。
  const savedSource = useRef(source)

  // プレビューの再計算を入力から切り離す。textareaの更新を優先し、重い描画は
  // Reactが後回しにする。固定のデバウンス時間を置かないので、端末の速さに
  // 合わせて待ち時間が決まる。
  const deferredSource = useDeferredValue(source)
  // 'system' のときは属性を外し、prefers-color-scheme に任せる。
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.dataset.theme = theme
  }, [theme])

  // 表示中の言語を <html lang> に反映する。index.html のインラインスクリプトが
  // 先に当てているので、ここで変わるのは切り替えたときだけ。
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const handleToggleLang = () => {
    const next = nextLang(lang)
    setLang(next)
    // 保存に失敗しても切り替え自体は効く。次回開いたときに戻るだけ。
    saveLang(next)
  }

  const handleToggleTheme = () => {
    const next = nextTheme(theme)
    setTheme(next)
    // 保存に失敗しても切り替え自体は効く。次回開いたときに戻るだけ。
    saveTheme(next)
  }

  const html = useMemo(() => renderMarkdown(deferredSource), [deferredSource])
  const isPreviewStale = deferredSource !== source

  const flush = useCallback(() => {
    if (unsaved.current === null) return
    const target = unsaved.current
    if (saveDocument(target)) {
      savedSource.current = target
      unsaved.current = null
      setSaveState({ status: 'saved', savedAt: new Date().toISOString() })
    } else {
      // 失敗した内容はrefに残す。離脱時にもう一度試す余地を残す。
      setSaveState({ status: 'failed' })
    }
  }, [])

  useEffect(() => {
    // 復元した（または初回表示のサンプル）内容をそのまま保存し直さない。
    if (source === savedSource.current) return

    unsaved.current = source
    setSaveState({ status: 'pending' })

    const timer = window.setTimeout(flush, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [source, flush])

  // デバウンス待ちのまま離脱すると直前の編集が消える。離脱時に書き切る。
  useEffect(() => {
    const saveNow = () => {
      if (unsaved.current !== null) saveDocument(unsaved.current)
    }
    window.addEventListener('beforeunload', saveNow)
    return () => window.removeEventListener('beforeunload', saveNow)
  }, [])

  const handleInsert = (snippet: string) => {
    const textarea = textareaRef.current
    // パレットを押す前にエディタを触っていない場合は末尾に挿入する。
    const start = textarea?.selectionStart ?? source.length
    const end = textarea?.selectionEnd ?? source.length

    const { text, cursor } = insertSnippet(source, snippet, start, end)
    setSource(text)

    // setStateの反映後にカーソルを復元する。
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(cursor, cursor)
    })
  }

  const handleReset = () => {
    if (!window.confirm(pick(messages.resetConfirm, lang))) return
    setSource(sampleDocument(lang))
    textareaRef.current?.focus()
  }

  return (
    <div className="app">
      <Toolbar
        source={source}
        saveState={saveState}
        onReset={handleReset}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        lang={lang}
        onToggleLang={handleToggleLang}
      />
      <SymbolPalette onInsert={handleInsert} lang={lang} />
      <main className="panes">
        <Editor value={source} onChange={setSource} textareaRef={textareaRef} lang={lang} />
        <Preview html={html} stale={isPreviewStale} lang={lang} />
      </main>
    </div>
  )
}
