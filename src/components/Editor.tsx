import { useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Match } from '../lib/findMatches'
import type { InsertResult } from '../lib/insertSnippet'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'
import { FindBar } from './FindBar'

type Props = {
  value: string
  onChange: (value: string) => void
  textareaRef: Ref<HTMLTextAreaElement>
  lang: Lang
  /** 読み込むファイルを受け取る。判定も確認もAppに任せ、ここは入口だけを持つ（0012）。 */
  onOpenFiles: (files: FileList | null) => void
  /** 編集中の内容を .md として書き出す（0034）。 */
  onSaveFile: () => void
  /** 一致をtextarea上で選ぶ（0043）。 */
  onSelectRange: (match: Match) => void
  /** 置換を挿入と同じ経路で行う（0021のUndo履歴に乗せる。0043）。 */
  onReplace: (result: InsertResult) => void
  /** 検索バーを開くときに、いま選択している文字列を初期値にする。 */
  selectedText: () => string
}

export function Editor({
  value,
  onChange,
  textareaRef,
  lang,
  onOpenFiles,
  onSaveFile,
  onSelectRange,
  onReplace,
  selectedText,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  // 検索バーの開閉と、開いたときの初期値（0043）。どちらもUIの一時的な状態。
  const [find, setFind] = useState<{ open: boolean; query: string }>({ open: false, query: '' })

  const openFind = () => setFind({ open: true, query: selectedText() })
  const closeFind = () => {
    setFind((state) => ({ ...state, open: false }))
    // 閉じたら書く場所へ戻す。Escで閉じた直後にそのまま打てるように。
    if (typeof textareaRef === 'object' && textareaRef !== null) textareaRef.current?.focus()
  }

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
      <header className="pane__header">
        {pick(messages.editorHeader, lang)}
        {/*
          ボタンは1つのまとまりとして右端に置く。見出しと並べて
          space-between に任せると、ボタン同士が離れて散らばる（0034）。
          保存が先、読み込みが後。書くほうが主で、読み込みは入口。
        */}
        <span className="pane__actions">
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={openFind}
          title={pick(messages.findTitle, lang)}
        >
          {pick(messages.find, lang)}
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={onSaveFile}
          title={pick(messages.saveFileTitle, lang)}
        >
          {pick(messages.saveFile, lang)}
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => fileInput.current?.click()}
          title={pick(messages.openFileTitle, lang)}
        >
          {pick(messages.openFile, lang)}
        </button>
        {/*
          視覚的にだけ隠す（display:none にはしない。Playwrightの setInputFiles は
          入るが、隠し方でDOMから外れる実装に寄せたくない）。
          input[type=file] 自身も role=button として数えられるので、
          aria-hidden で隠して入口を上のボタン1つに絞る。
        */}
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            onOpenFiles(event.target.files)
            // 同じファイルを続けて選べるように値を戻す（変化がないと change が出ない）。
            event.target.value = ''
          }}
          />
        </span>
      </header>
      {find.open && (
        <FindBar
          source={value}
          initialQuery={find.query}
          lang={lang}
          onSelect={onSelectRange}
          onReplace={onReplace}
          onClose={closeFind}
        />
      )}
      <textarea
        ref={textareaRef}
        className="editor"
        value={value}
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
    </section>
  )
}
