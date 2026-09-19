import { useMemo, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { SymbolPalette } from './components/SymbolPalette'
import { Toolbar } from './components/Toolbar'
import { insertSnippet } from './lib/insertSnippet'
import { renderMarkdown } from './lib/renderMarkdown'
import { sampleDocument } from './sampleDocument'

export default function App() {
  const [source, setSource] = useState(sampleDocument)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const html = useMemo(() => renderMarkdown(source), [source])

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

  return (
    <div className="app">
      <Toolbar source={source} />
      <SymbolPalette onInsert={handleInsert} />
      <main className="panes">
        <Editor value={source} onChange={setSource} textareaRef={textareaRef} />
        <Preview html={html} />
      </main>
    </div>
  )
}
