import { useRef, useState } from 'react'
import type { Ref } from 'react'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'

type Props = {
  value: string
  onChange: (value: string) => void
  textareaRef: Ref<HTMLTextAreaElement>
  lang: Lang
  /** 読み込むファイルを受け取る。判定も確認もAppに任せ、ここは入口だけを持つ（0012）。 */
  onOpenFiles: (files: FileList | null) => void
}

export function Editor({ value, onChange, textareaRef, lang, onOpenFiles }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

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
      </header>
      <textarea
        ref={textareaRef}
        className="editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder={pick(messages.editorPlaceholder, lang)}
      />
    </section>
  )
}
