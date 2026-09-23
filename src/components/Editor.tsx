import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Ref, RefObject } from 'react'
import type { Match } from '../lib/findMatches'
import { findMatches, matchAfter, replaceAll, replaceOne, step } from '../lib/findMatches'
import { highlightHtml } from '../lib/highlightRanges'
import { editorHighlightHtml } from '../lib/editorHighlight'
import type { EditorDisplay } from '../lib/editorDisplayStorage'
import type { InsertResult } from '../lib/insertSnippet'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'
import { FindBar } from './FindBar'
import { PaneIcon } from './PaneIcon'

type Props = {
  value: string
  onChange: (value: string) => void
  textareaRef: Ref<HTMLTextAreaElement>
  lang: Lang
  /** 読み込むファイルを受け取る。判定も確認もAppに任せ、ここは入口だけを持つ（0012）。 */
  onOpenFiles: (files: FileList | null) => void
  /** 編集中の内容を .md として書き出す（0034）。 */
  onSaveFile: () => void
  onNew: () => void
  onSample: () => void
  /** 一致をtextarea上で選ぶ（0043）。 */
  onSelectRange: (match: Match) => void
  /** 置換を挿入と同じ経路で行う（0021のUndo履歴に乗せる。0043）。 */
  onReplace: (result: InsertResult) => void
  /** 検索バーを開くときに、いま選択している文字列を初期値にする。 */
  selectedText: () => string
  /** 行の座標を測るミラーの器（0010）。中身はAppが計測のときに入れる。 */
  mirrorRef: RefObject<HTMLDivElement | null>
  /** スクロールしたことをAppへ伝える（プレビューを追わせる。0010）。 */
  onScrollSync: () => void
  editorDisplay: EditorDisplay
}

export function Editor({
  value,
  onChange,
  textareaRef,
  lang,
  onOpenFiles,
  onSaveFile,
  onNew,
  onSample,
  onSelectRange,
  onReplace,
  selectedText,
  mirrorRef,
  onScrollSync,
  editorDisplay,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  /*
    検索・置換の一時的な状態（0043）。保存はしない。
    一致の計算をここに置くのは、バーと裏のハイライト層の両方が同じ結果を
    見る必要があるため。textareaを触る操作（選択・置換）はAppにある。
  */
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [current, setCurrent] = useState(0)
  const findInput = useRef<HTMLInputElement>(null)
  const highlights = useRef<HTMLDivElement>(null)
  const syntax = useRef<HTMLDivElement>(null)
  const lineNumberLayer = useRef<HTMLDivElement>(null)

  /*
    一致の計算は入力から遅らせる（プレビューと同じ `useDeferredValue` の手）。
    400節の文書で400件を塗り直すと、遅らせない場合は61.8ms/文字かかり、
    N1の50msを超えた（実測）。件数の表示も同じ値から作るので、表示と塗りが
    食い違うことはない。
  */
  const deferredValue = useDeferredValue(value)
  const matches = useMemo(
    () => (findOpen ? findMatches(deferredValue, query) : []),
    [findOpen, deferredValue, query],
  )
  // 置換や編集で件数が減っても、範囲の外を指したままにしない。
  const index = matches.length === 0 ? -1 : Math.min(current, matches.length - 1)
  const syntaxMarkup = useMemo(() => editorHighlightHtml(deferredValue), [deferredValue])
  const lineNumbers = useMemo(() => Array.from({ length: value.split('\n').length }, (_, index) => index + 1).join('\n'), [value])
  const highlightMarkup = useMemo(
    () => (matches.length === 0 ? '' : highlightHtml(deferredValue, matches, index)),
    [deferredValue, matches, index],
  )

  const focusEditor = () => {
    if (typeof textareaRef === 'object' && textareaRef !== null) textareaRef.current?.focus()
  }

  const openFind = () => {
    const selected = selectedText()
    setFindOpen(true)
    if (selected !== '') {
      setQuery(selected)
      setCurrent(0)
    }
    // 開き直しでも検索欄へ入れる（すでに開いているときにボタンを押した場合）。
    requestAnimationFrame(() => {
      findInput.current?.focus()
      findInput.current?.select()
    })
  }

  const closeFind = () => {
    setFindOpen(false)
    // 次に開いたときは検索だけの1行から始める（置換の行は出したままにしない）。
    setShowReplace(false)
    // 閉じたら書く場所へ戻す。Escで閉じた直後にそのまま打てるように。
    focusEditor()
  }

  const go = (next: number) => {
    const match = matches[next]
    if (match === undefined) return
    setCurrent(next)
    onSelectRange(match)
  }

  const handleQuery = (next: string) => {
    setQuery(next)
    const found = findMatches(value, next)
    const first = matchAfter(found, 0)
    setCurrent(first === -1 ? 0 : first)

    const match = found[first]
    if (match !== undefined) onSelectRange(match)
  }

  const handleReplaceOne = () => {
    const match = matches[index]
    if (match === undefined) return
    onReplace(replaceOne(value, match, replacement))
  }

  const handleReplaceAll = () => {
    const replaced = replaceAll(value, query, replacement)
    if (replaced === null) return
    onReplace(replaced.result)
    setCurrent(0)
  }

  /** 裏の層を表のtextareaと同じ位置・同じ幅に合わせる。ずれると色が別の文字に付く。 */
  const syncScroll = () => {
    const layer = highlights.current
    if (typeof textareaRef !== 'object' || textareaRef === null) return
    const textarea = textareaRef.current
    if (textarea === null) return

    for (const element of [layer, syntax.current, lineNumberLayer.current]) {
      if (element === null) continue
      element.scrollTop = textarea.scrollTop
      element.scrollLeft = textarea.scrollLeft
    }
    /*
      縦スクロールバーが出ると、その幅だけtextareaの折り返しが早くなる。
      層は同じ幅のままなので、揃えないと行がずれる（幅375pxで24pxぶん
      高さが違った）。バーの幅だけ層の右を詰める。
    */
    if (layer !== null) layer.style.right = `${textarea.offsetWidth - textarea.clientWidth}px`
  }

  // 選択で動いたスクロールにも追従させる（scrollイベントより後に効かせる）。
  useEffect(syncScroll)

  const handleDrop = (event: React.DragEvent) => {
    // 止めないとブラウザがファイルを別ページとして開き、書いたものが画面から消える。
    event.preventDefault()
    setDragging(false)
    onOpenFiles(event.dataTransfer.files)
  }

  return (
    <section
      className={`pane pane--editor${dragging ? ' pane--dropping' : ''}`}
      aria-label={pick(messages.editorLabel, lang)}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      // ペインの中で子要素をまたぐたびに dragleave が飛ぶので、ペインの外へ
      // 出たときだけ戻す。currentTarget に含まれる要素への移動は無視する。
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={handleDrop}
    >
      <header className="pane__header pane__header--editor">
        <span className="pane__heading"><PaneIcon name="source" />{pick(messages.editorHeader, lang)}</span>
        <div className="pane__menu">
          <button
            type="button"
            className="pane__menu-button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {pick(messages.sourceMenu, lang)} <span aria-hidden="true">⌄</span>
          </button>
          {menuOpen && (
            <div className="pane__menu-list" role="menu">
              <button type="button" className="pane__menu-item" role="menuitem" onClick={() => { setMenuOpen(false); onNew() }}>
                {pick(messages.newDocument, lang)}
              </button>
              <button type="button" className="pane__menu-item" role="menuitem" onClick={() => { setMenuOpen(false); onSample() }}>
                {pick(messages.sample, lang)}
              </button>
              <button type="button" className="pane__menu-item" role="menuitem" title={pick(messages.findTitle, lang)} onClick={() => { setMenuOpen(false); openFind() }}>
                {pick(messages.find, lang)}
              </button>
              <button type="button" className="pane__menu-item" role="menuitem" title={pick(messages.saveFileTitle, lang)} onClick={() => { setMenuOpen(false); onSaveFile() }}>
                {pick(messages.saveFile, lang)}
              </button>
              <button type="button" className="pane__menu-item" role="menuitem" title={pick(messages.openFileTitle, lang)} onClick={() => { setMenuOpen(false); fileInput.current?.click() }}>
                {pick(messages.openFile, lang)}
              </button>
            </div>
          )}
          {/* 視覚的にだけ隠す。ファイル選択の入口はメニューにまとめる。 */}
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              onOpenFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </div>
      </header>
      {findOpen && (
        <FindBar
          query={query}
          replacement={replacement}
          showReplace={showReplace}
          matchCount={matches.length}
          index={index}
          lang={lang}
          inputRef={findInput}
          onQueryChange={handleQuery}
          onReplacementChange={setReplacement}
          onToggleReplace={() => setShowReplace((open) => !open)}
          onStep={(direction) => go(step(matches.length, index, direction))}
          onReplaceOne={handleReplaceOne}
          onReplaceAll={handleReplaceAll}
          onClose={closeFind}
        />
      )}
      <div className={`editor-wrap${editorDisplay.lineNumbers ? '' : ' editor-wrap--no-lines'}`} style={{ '--editor-gutter': `${String(value.split('\n').length).length + 3}ch` } as CSSProperties}>
        {editorDisplay.lineNumbers && <div className="editor-line-numbers" ref={lineNumberLayer} aria-hidden="true">{lineNumbers}</div>}
        {editorDisplay.syntaxHighlight && <div className="editor-syntax" ref={syntax} aria-hidden="true" dangerouslySetInnerHTML={{ __html: syntaxMarkup }} />}
        {/*
          行の座標を測るためのミラー（0010）。器だけを置き、中身はAppが
          スクロールのときに入れる。visibility: hidden なので描かれない。
        */}
        <div className="editor-mirror" ref={mirrorRef} aria-hidden="true" />
        {/*
          一致を塗る層。textareaは中の一部だけ色を付けられず、フォーカスが
          外れていると選択範囲すら描画されない（Chromiumで実測。0043）。
          同じ書式の層を裏に敷いて、一致だけを塗る。読み上げからは隠す。
        */}
        {findOpen && matches.length > 0 && (
          <div
            className="editor-highlights"
            ref={highlights}
            aria-hidden="true"
            /*
              入れる文字列は `highlightHtml` がエスケープ済みで、mark 以外の
              要素は作らない（単体テストで固定している）。要素を並べる形だと
              400件で1文字あたり60msかかり、N1の50msを超えた。
            */
            dangerouslySetInnerHTML={{ __html: highlightMarkup }}
          />
        )}
      <textarea
        ref={textareaRef}
        className={`editor${findOpen && matches.length > 0 ? ' editor--highlighting' : ''}${editorDisplay.syntaxHighlight ? ' editor--syntax' : ''}`}
        value={value}
        onScroll={() => {
          syncScroll()
          onScrollSync()
        }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          /*
            Ctrl+F は**エディタにフォーカスがあるときだけ**奪う（0043）。
            プレビューやパレットにいるときはブラウザの検索に任せる
            （プレビューの文字を探す手段を残すため）。
          */
          if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
            event.preventDefault()
            openFind()
          }
        }}
        spellCheck={false}
        placeholder={pick(messages.editorPlaceholder, lang)}
      />
      </div>
    </section>
  )
}
