import type { CSSProperties } from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { GuidePanel } from './components/GuidePanel'
import { Preview } from './components/Preview'
import { PaneDivider } from './components/PaneDivider'
import { SymbolPalette } from './components/SymbolPalette'
import { Toolbar } from './components/Toolbar'
import type { SaveState } from './components/Toolbar'
import { loadDocument, saveDocument } from './lib/documentStorage'
import { mirrorHtml } from './lib/mirrorHtml'
import type { Anchor, Pair } from './lib/scrollMap'
import { mapScroll, pairAnchors } from './lib/scrollMap'
import type { Match } from './lib/findMatches'
import type { Lang } from './lib/i18n'
import { pick } from './lib/i18n'
import { loadLang, nextLang, saveLang } from './lib/langStorage'
import { messages } from './lib/messages'
import type { PaneSizes } from './lib/paneSizes'
import {
  DIVIDER,
  MIN_WINDOW,
  clampPaneSizes,
  defaultPaneSizes,
  loadPaneSizes,
  paneColumns,
  savePaneSizes,
} from './lib/paneSizes'
import type { Theme } from './lib/themeStorage'
import { loadTheme, nextTheme, saveTheme } from './lib/themeStorage'
import type { InsertResult } from './lib/insertSnippet'
import { insertSnippet } from './lib/insertSnippet'
import { checkFile, normalizeText } from './lib/loadMarkdownFile'
import { contentFor, fileNameFor, isEmptySource } from './lib/downloadName'
import type { Engine } from './lib/previewEngine'
import { loadEngine } from './lib/previewEngine'
import { sampleDocument } from './sampleDocument'
import {
  createPersonalSnippetsBackup,
  loadPersonalSnippets,
  readPersonalSnippetsBackup,
  savePersonalSnippets,
} from './lib/personalSnippets'
import type { PersonalSnippet } from './lib/personalSnippets'

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

  // プレビューで選んだ数式（0020）。印を出す先で、文書の内容ではないので保存しない。
  const [activeMath, setActiveMath] = useState<Match | null>(null)

  /**
   * ソースを差し替える唯一の入口。**印はここで消す**（0020）。
   * 編集すると数式の位置がずれ、印がどこを指していたのかが意味を失う。
   * 残すと、別の式へ印が移ったように見える。
   */
  const updateSource = useCallback((next: string) => {
    setSource(next)
    setActiveMath(null)
  }, [])
  const [saveState, setSaveState] = useState<SaveState>(
    restored ? { status: 'saved', savedAt: restored.savedAt } : { status: 'idle' },
  )
  const [theme, setTheme] = useState<Theme>(loadTheme)
  // 3つの領域の分け方（0057）。テーマ・言語と同じ「保存する設定」で、
  // 文書の状態（source）とは別に持つ。
  const [paneSizes, setPaneSizes] = useState<PaneSizes>(loadPaneSizes)
  // ドラッグを離した時点の値を保存する。pointermoveの購読はドラッグ開始時の
  // クロージャを掴んだままなので、最新の値はrefから読む。
  const paneSizesRef = useRef(paneSizes)
  useEffect(() => {
    paneSizesRef.current = paneSizes
  }, [paneSizes])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [personalSnippets, setPersonalSnippets] = useState<PersonalSnippet[]>(loadPersonalSnippets)

  // まだ保存していない内容。beforeunloadからも読むのでstateではなくrefに置く。
  const unsaved = useRef<string | null>(null)

  // 最後に保存した時刻。`pending` のあいだ saveState からは失われるので別に持つ
  // （SaveState が savedAt を持つのは 'saved' のときだけ）。初回訪問では null。
  // 打ってすぐ取り消したときに「保存しました hh:mm」へ戻すために要る（0036）。
  const lastSavedAt = useRef<string | null>(restored?.savedAt ?? null)

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

  /**
   * 算式記載ガイド（0079）。開いている間も編集中の文書・カーソル・選択・保存には
   * 触らない。閉じたらガイドボタンへフォーカスを戻す。
   */
  const [guideOpen, setGuideOpen] = useState(false)
  const guideButtonRef = useRef<HTMLButtonElement>(null)
  const closeGuide = useCallback(() => {
    setGuideOpen(false)
    guideButtonRef.current?.focus()
  }, [])

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
      const savedAt = new Date().toISOString()
      lastSavedAt.current = savedAt
      setSaveState({ status: 'saved', savedAt })
    } else {
      // 失敗した内容はrefに残す。離脱時にもう一度試す余地を残す。
      setSaveState({ status: 'failed' })
    }
  }, [])

  useEffect(() => {
    // 復元した（または初回表示のサンプル）内容をそのまま保存し直さない。
    if (source === savedSource.current) {
      // 打った文字をすぐ取り消すとここへ来る（デバウンスのタイマーは
      // クリーンアップで消えている）。**戻すものが2つある**（0036）。
      //
      // 1. 書き戻し待ち。捨てないと beforeunload の saveNow が
      //    取り消した編集を保存する（消した文字がリロードで戻る）。
      // 2. 表示。`保存中…` のまま止まるので、最後に保存した時刻へ戻す。
      //    一度も保存していなければ何も出さない状態（idle）へ。
      unsaved.current = null
      // pending / failed 以外はそのまま返す。マウント直後もここを通るので、
      // 新しいオブジェクトを入れると意味のない再レンダリングが1回増える。
      setSaveState((current) =>
        current.status === 'pending' || current.status === 'failed'
          ? lastSavedAt.current === null
            ? { status: 'idle' }
            : { status: 'saved', savedAt: lastSavedAt.current }
          : current,
      )
      return
    }

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

  /*
    ソースとプレビューのスクロールの同期（0010）。

    行の対応づけは、両側の `data-line` を突き合わせた「y座標どうしの対応表」に
    畳んである（`lib/scrollMap.ts`）。逆方向は対応表を裏返すだけなので、
    補間の計算は1つしか要らない。
  */
  const previewRef = useRef<HTMLDivElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)

  // 測り直しが要るか。**スクロールが来るまで測らない**（400節で約20msかかり、
  // 打鍵のたびに払うと入力の体感に出る）。
  const needsMeasure = useRef(true)
  const scrollPairs = useRef<{ forward: Pair[]; backward: Pair[] }>({
    forward: [],
    backward: [],
  })

  /*
    自分が書いた scrollTop。戻ってきた scroll がこの値なら自分のせいなので
    相手を動かし返さない。**読み戻した値**を覚えるのが要点で、端で丸められても
    食い違わない（要求値と比べると端で振動する）。
  */
  const writtenScroll = useRef<{ editor: number | null; preview: number | null }>({
    editor: null,
    preview: null,
  })

  const measureAnchors = useCallback(() => {
    const textarea = textareaRef.current
    const preview = previewRef.current
    const mirror = mirrorRef.current
    if (textarea === null || preview === null || mirror === null) return

    // プレビュー側。スクロール内容の座標にするため、スクロール量を足し戻す。
    const base = preview.getBoundingClientRect().top - preview.scrollTop
    const previewAnchors: Anchor[] = []
    for (const element of preview.querySelectorAll<HTMLElement>('[data-line]')) {
      const line = Number(element.dataset.line)
      if (!Number.isFinite(line)) continue
      previewAnchors.push({ line, top: element.getBoundingClientRect().top - base })
    }

    /*
      エディタ側。ミラーの中身はここで入れる（Reactに持たせると31kBの文字列を
      打鍵のたびに描き直すことになる）。アンカーの行番号はプレビューから
      もらうので、両側が同じ行を見る。
      縦スクロールバーのぶん右を詰めるのは、折り返しを合わせるため（0043と同じ）。
    */
    mirror.style.right = `${textarea.offsetWidth - textarea.clientWidth}px`
    mirror.innerHTML = mirrorHtml(
      textarea.value,
      previewAnchors.map((anchor) => anchor.line),
    )

    const editorAnchors: Anchor[] = []
    for (const span of mirror.querySelectorAll<HTMLElement>('span[data-line]')) {
      editorAnchors.push({ line: Number(span.dataset.line), top: span.offsetTop })
    }

    const forward = pairAnchors(editorAnchors, previewAnchors)
    scrollPairs.current = {
      forward,
      backward: forward
        .map((pair) => ({ from: pair.to, to: pair.from }))
        .sort((a, b) => a.from - b.from),
    }
    needsMeasure.current = false
  }, [])

  const handleScrollSync = useCallback(
    (from: 'editor' | 'preview') => {
      const textarea = textareaRef.current
      const preview = previewRef.current
      if (textarea === null || preview === null) return

      const source = from === 'editor' ? textarea : preview
      const written = writtenScroll.current[from]
      writtenScroll.current[from] = null
      // 自分で書いた値が返ってきただけなら、動かし返さない（往復が止まらなくなる）。
      if (written !== null && Math.abs(source.scrollTop - written) < 1) return

      if (needsMeasure.current) measureAnchors()

      const target = from === 'editor' ? preview : textarea
      const pairs =
        from === 'editor' ? scrollPairs.current.forward : scrollPairs.current.backward
      const next = mapScroll(
        pairs,
        source.scrollTop,
        source.scrollHeight - source.clientHeight,
        target.scrollHeight - target.clientHeight,
      )

      target.scrollTop = next
      writtenScroll.current[from === 'editor' ? 'preview' : 'editor'] = target.scrollTop
    },
    [measureAnchors],
  )

  // 内容が変われば測り直す。ただし印を立てるだけで、測るのはスクロールのとき。
  useEffect(() => {
    needsMeasure.current = true
  }, [source, html])

  // 大きさが変わっても行の座標は変わる。フォントの差し替えでも変わる
  // （KaTeXのフォントが届くとプレビューの高さが動く）。
  useEffect(() => {
    const textarea = textareaRef.current
    const preview = previewRef.current
    if (textarea === null || preview === null) return

    const invalidate = () => {
      needsMeasure.current = true
    }
    const observer = new ResizeObserver(invalidate)
    observer.observe(textarea)
    observer.observe(preview)
    document.fonts?.ready.then(invalidate, () => {})

    return () => observer.disconnect()
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
    updateSource(result.text)

    // setStateの反映後にカーソルを復元する。
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(result.cursor, result.cursor)
    })
  }

  /**
   * 選んだ位置が見えていなければ、そこまでtextareaを寄せる。
   *
   * **見えているときは動かさない。** 動かすと0010の同期でプレビューも動き、
   * いま見ていた場所が画面から逃げる（0020でプレビューから選ぶようになり、
   * これが目に見える形で効くようになった）。
   */
  const scrollToOffset = (textarea: HTMLTextAreaElement, offset: number) => {
    const line = source.slice(0, offset).split('\n').length - 1
    const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight)
    if (!Number.isFinite(lineHeight)) return

    const top = line * lineHeight
    const view = textarea.clientHeight
    // 見えている範囲に無いときだけ動かす。2行ぶん上に余白を残す。
    if (top < textarea.scrollTop || top > textarea.scrollTop + view - lineHeight) {
      textarea.scrollTop = Math.max(0, top - lineHeight * 2)
    }
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
    scrollToOffset(textarea, start)
  }

  /**
   * プレビューの数式をクリックしたとき、ソースのその中身を選ぶ（0020）。
   *
   * **ここではフォーカスを奪う。** 0043の検索と違って打ち込む先を横取り
   * しないうえ、フォーカスが無いとChromiumは選択を描画せず、選ばれたことが
   * 画面で分からない（0043はそのために塗る層を足した）。
   */
  const handleMathClick = (range: Match) => {
    const textarea = textareaRef.current
    if (textarea === null) return

    textarea.focus()
    textarea.setSelectionRange(range.start, range.end)
    scrollToOffset(textarea, range.start)
    setActiveMath(range)
  }

  /** 置換。挿入と同じ経路を通すので、Undoは自動で効く（0021・0043）。 */
  const handleReplace = (result: InsertResult) => {
    const textarea = textareaRef.current

    if (textarea !== null && insertIntoTextarea(textarea, result)) return

    // 退避経路（0021と同じ）。Undoは効かなくなるが、置換自体は動かす。
    updateSource(result.text)
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

  const handleSavePersonalSnippet = (name: string, body: string, id?: string) => {
    const nextItem: PersonalSnippet = {
      id: id ?? crypto.randomUUID(),
      name: name.trim(),
      body,
    }
    const next = id === undefined
      ? [...personalSnippets, nextItem]
      : personalSnippets.map((item) => (item.id === id ? nextItem : item))

    if (!savePersonalSnippets(next)) {
      showNotice(pick(messages.personalSaveFailed, lang))
      return false
    }

    setPersonalSnippets(next)
    showNotice(pick(messages.personalSaved, lang))
    return true
  }

  const handleDeletePersonalSnippet = (id: string) => {
    const next = personalSnippets.filter((item) => item.id !== id)
    if (!savePersonalSnippets(next)) {
      showNotice(pick(messages.personalSaveFailed, lang))
      return false
    }

    setPersonalSnippets(next)
    return true
  }

  const handleExportPersonalSnippets = () => {
    const url = URL.createObjectURL(
      new Blob([createPersonalSnippetsBackup(personalSnippets)], {
        type: 'application/json;charset=utf-8',
      }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'thothglyph-snippets.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    showNotice(pick(messages.personalExported, lang))
  }

  const handleImportPersonalSnippets = async (files: FileList | null) => {
    const [file] = files ?? []
    if (file === undefined) return

    let imported: PersonalSnippet[] | null
    try {
      imported = readPersonalSnippetsBackup(await file.text())
    } catch {
      imported = null
    }
    if (imported === null) {
      showNotice(pick(messages.personalImportInvalid, lang))
      return
    }
    if (!window.confirm(pick(messages.personalImportConfirm, lang))) return
    if (!savePersonalSnippets(imported)) {
      showNotice(pick(messages.personalSaveFailed, lang))
      return
    }

    setPersonalSnippets(imported)
    showNotice(pick(messages.personalImported, lang))
  }

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

    updateSource(normalizeText(text))
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

  /**
   * 仕切りを動かす（0057）。差分をpxで受け取り、下限は clampPaneSizes に任せる。
   * 画面の幅が変わっても割合が保たれるよう、ソース側は割合へ戻して持つ。
   */
  const moveDivider = (which: 'palette' | 'source', deltaX: number) => {
    setPaneSizes((current) => {
      const width = window.innerWidth
      if (width < MIN_WINDOW) return current

      if (which === 'palette') {
        return clampPaneSizes({ ...current, palette: current.palette + deltaX }, width)
      }
      const rest = width - current.palette - DIVIDER * 2
      const source = rest * current.sourceRatio + deltaX
      return clampPaneSizes({ ...current, sourceRatio: source / rest }, width)
    })
  }

  const handleReset = () => {
    if (!window.confirm(pick(messages.resetConfirm, lang))) return
    updateSource(sampleDocument(lang))
    textareaRef.current?.focus()
  }

  return (
    <div
      className="app"
      style={
        {
          ['--palette-width' as string]: `${Math.round(paneSizes.palette)}px`,
          // インラインで .panes に grid-template-columns を当てると、狭い画面用の
          // CSS（上下分割）まで上書きしてしまう。変数で渡し、当てるのは
          // 幅1200px以上のメディアクエリの中だけにする。
          ['--pane-columns' as string]: paneColumns(paneSizes.sourceRatio),
        } as CSSProperties
      }
    >
      <Toolbar
        source={source}
        saveState={saveState}
        onReset={handleReset}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        lang={lang}
        onToggleLang={handleToggleLang}
        onOpenGuide={() => setGuideOpen(true)}
        guideButtonRef={guideButtonRef}
        notice={notice}
      />
      {guideOpen && <GuidePanel lang={lang} engine={engine} onClose={closeGuide} />}
      <SymbolPalette
        onInsert={handleInsert}
        onFocusEditor={() => textareaRef.current?.focus()}
        snippets={personalSnippets}
        selectedText={selectedText}
        onSaveSnippet={handleSavePersonalSnippet}
        onDeleteSnippet={handleDeletePersonalSnippet}
        onExportSnippets={handleExportPersonalSnippets}
        onImportSnippets={handleImportPersonalSnippets}
        lang={lang}
        renderLatex={engine?.renderLatex}
      />
      <PaneDivider
        label={pick(messages.paletteDivider, lang)}
        onMove={(deltaX) => moveDivider('palette', deltaX)}
        onCommit={() => savePaneSizes(paneSizesRef.current)}
        onReset={() => {
          setPaneSizes((current) => ({ ...current, palette: defaultPaneSizes().palette }))
          savePaneSizes({ ...paneSizesRef.current, palette: defaultPaneSizes().palette })
        }}
      />
      <main className="panes">
        <Editor
          value={source}
          onChange={updateSource}
          textareaRef={textareaRef}
          lang={lang}
          onOpenFiles={handleOpenFiles}
          onSaveFile={handleSaveFile}
          onSelectRange={handleSelectRange}
          onReplace={handleReplace}
          selectedText={selectedText}
          mirrorRef={mirrorRef}
          onScrollSync={() => handleScrollSync('editor')}
        />
        <PaneDivider
          label={pick(messages.sourceDivider, lang)}
          onMove={(deltaX) => moveDivider('source', deltaX)}
          onCommit={() => savePaneSizes(paneSizesRef.current)}
          onReset={() => {
            setPaneSizes((current) => ({ ...current, sourceRatio: defaultPaneSizes().sourceRatio }))
            savePaneSizes({ ...paneSizesRef.current, sourceRatio: defaultPaneSizes().sourceRatio })
          }}
        />
        <Preview
          html={html}
          stale={isPreviewStale}
          ready={engine !== null}
          lang={lang}
          containerRef={previewRef}
          onScrollSync={() => handleScrollSync('preview')}
          onMathClick={handleMathClick}
          activeMath={activeMath}
          onFollowRef={setActiveMath}
        />
      </main>
    </div>
  )
}
