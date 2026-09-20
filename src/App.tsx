import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { SymbolPalette } from './components/SymbolPalette'
import { Toolbar } from './components/Toolbar'
import type { SaveState } from './components/Toolbar'
import { loadDocument, saveDocument } from './lib/documentStorage'
import type { Match } from './lib/findMatches'
import type { Lang } from './lib/i18n'
import { pick } from './lib/i18n'
import { loadLang, nextLang, saveLang } from './lib/langStorage'
import { messages } from './lib/messages'
import type { Theme } from './lib/themeStorage'
import { loadTheme, nextTheme, saveTheme } from './lib/themeStorage'
import type { InsertResult } from './lib/insertSnippet'
import { insertSnippet } from './lib/insertSnippet'
import { checkFile, normalizeText } from './lib/loadMarkdownFile'
import { contentFor, fileNameFor, isEmptySource } from './lib/downloadName'
import type { Engine } from './lib/previewEngine'
import { loadEngine } from './lib/previewEngine'
import { sampleDocument } from './sampleDocument'

/** 入力が止まってから保存するまでの待ち時間。localStorageは同期APIなので1文字ごとには書かない。 */
const SAVE_DELAY_MS = 600

/**
 * textarea に「利用者が打ったのと同じ扱い」で挿入する（0021）。
 * ブラウザのUndo履歴に乗るのはこの経路だけなので、非推奨の execCommand を使う。
 * 入らなかった場合は false を返し、呼び出し側が state の差し替えへ落ちる。
 *
 * 前後の setSelectionRange は、カーソルを動かすためだけのものではない。
 * Chromiumは連続した入力を1つのUndo単位にまとめるため、選択を置き直して
 * 区切らないと「打つ→挿入→打つ」がCtrl+Z 1回でまとめて消える。
 */
function insertIntoTextarea(textarea: HTMLTextAreaElement, result: InsertResult): boolean {
  try {
    textarea.focus()
    textarea.setSelectionRange(result.start, result.end)
    if (!document.execCommand('insertText', false, result.inserted)) return false
  } catch {
    return false
  }

  textarea.setSelectionRange(result.cursor, result.cursor)
  return true
}

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

  // 数式の描画エンジンは別チャンクなので、届くまでは null（0024）。
  // 届かなくてもエディタは使えたままにする（書いたものを失わせない）ので、
  // 失敗は握りつぶし、プレビューは「準備中…」で留まる。
  const [engine, setEngine] = useState<Engine | null>(null)
  useEffect(() => {
    let alive = true
    loadEngine().then(
      (loaded) => {
        if (alive) setEngine(loaded)
      },
      () => {},
    )
    return () => {
      alive = false
    }
  }, [])

  // グラフのaria-labelとエラー文言が言語で変わるので、langも渡す（0037）。
  const html = useMemo(
    () => (engine === null ? '' : engine.renderMarkdown(deferredSource, lang)),
    [engine, deferredSource, lang],
  )
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

    const result = insertSnippet(source, snippet, start, end)

    if (textarea !== null && insertIntoTextarea(textarea, result)) {
      // execCommand が成功していればブラウザが input を投げ、Editor の onChange
      // 経由で source が更新される。ここで setSource は呼ばない。
      return
    }

    // 退避経路。Undoは効かなくなるが、挿入自体は動かす（0021）。
    setSource(result.text)

    // setStateの反映後にカーソルを復元する。
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(result.cursor, result.cursor)
    })
  }

  /**
   * 検索の一致をtextarea上で選ぶ（0043）。
   *
   * **フォーカスは奪わない。** 奪うと検索欄から文字を打てなくなる。
   * `setSelectionRange` はフォーカスが無くても効くが、そのままでは画面外の
   * 一致へスクロールしないので、行の高さから位置を計算して自分で寄せる。
   */
  const handleSelectRange = ({ start, end }: Match) => {
    const textarea = textareaRef.current
    if (textarea === null) return

    textarea.setSelectionRange(start, end)

    const line = source.slice(0, start).split('\n').length - 1
    const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight)
    if (!Number.isFinite(lineHeight)) return

    const top = line * lineHeight
    const view = textarea.clientHeight
    // 見えている範囲に無いときだけ動かす。2行ぶん上に余白を残す。
    if (top < textarea.scrollTop || top > textarea.scrollTop + view - lineHeight) {
      textarea.scrollTop = Math.max(0, top - lineHeight * 2)
    }
  }

  /** 置換。挿入と同じ経路を通すので、Undoは自動で効く（0021・0043）。 */
  const handleReplace = (result: InsertResult) => {
    const textarea = textareaRef.current

    if (textarea !== null && insertIntoTextarea(textarea, result)) return

    // 退避経路（0021と同じ）。Undoは効かなくなるが、置換自体は動かす。
    setSource(result.text)
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(result.cursor, result.cursor)
    })
  }

  /** 検索バーを開くときの初期値。選択していればその文字列。 */
  const selectedText = () => {
    const textarea = textareaRef.current
    if (textarea === null) return ''
    return source.slice(textarea.selectionStart, textarea.selectionEnd)
  }

  // 読み込みの結果（コピーの結果と同じ枠に出す）。数秒で消す。
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(0)
  const showNotice = useCallback((text: string) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3000)
  }, [])

  const handleOpenFiles = async (files: FileList | null) => {
    if (files === null || files.length === 0) return
    if (files.length > 1) {
      showNotice(pick(messages.openTooMany, lang))
      return
    }

    const file = files[0]
    const checked = checkFile(file.name, file.size)
    if (!checked.ok) {
      showNotice(
        pick(checked.reason === 'extension' ? messages.openWrongType : messages.openTooLarge, lang),
      )
      return
    }

    // 確認は読む前に出す。断られたファイルを読む理由がない。
    if (!window.confirm(pick(messages.openConfirm(file.name), lang))) return

    let text: string
    try {
      text = await file.text()
    } catch {
      showNotice(pick(messages.openFailed, lang))
      return
    }

    setSource(normalizeText(text))
    showNotice(pick(messages.opened(file.name), lang))
    textareaRef.current?.focus()
  }

  const handleSaveFile = () => {
    if (isEmptySource(source)) {
      showNotice(pick(messages.saveNothing, lang))
      return
    }

    const name = fileNameFor(source)
    // `<a download>` を通すのは、File System Access API が Safari・Firefox に
    // 無いため（0034）。リンクはDOMに入れずに押す。
    const url = URL.createObjectURL(
      new Blob([contentFor(source)], { type: 'text/markdown;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    // 解放が早すぎるとダウンロードが始まらないブラウザがあるので次のタスクで捨てる。
    window.setTimeout(() => URL.revokeObjectURL(url), 0)

    showNotice(pick(messages.savedFile(name), lang))
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
        notice={notice}
      />
      <SymbolPalette
        onInsert={handleInsert}
        onFocusEditor={() => textareaRef.current?.focus()}
        lang={lang}
        renderLatex={engine?.renderLatex}
      />
      <main className="panes">
        <Editor
          value={source}
          onChange={setSource}
          textareaRef={textareaRef}
          lang={lang}
          onOpenFiles={handleOpenFiles}
          onSaveFile={handleSaveFile}
          onSelectRange={handleSelectRange}
          onReplace={handleReplace}
          selectedText={selectedText}
        />
        <Preview html={html} stale={isPreviewStale} ready={engine !== null} lang={lang} />
      </main>
    </div>
  )
}
