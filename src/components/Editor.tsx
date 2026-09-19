import type { Ref } from 'react'

type Props = {
  value: string
  onChange: (value: string) => void
  textareaRef: Ref<HTMLTextAreaElement>
}

export function Editor({ value, onChange, textareaRef }: Props) {
  return (
    <section className="pane pane--editor" aria-label="Markdownソース">
      <header className="pane__header">ソース</header>
      <textarea
        ref={textareaRef}
        className="editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder="Markdownを入力… 数式は $x^2$ または $$...$$"
      />
    </section>
  )
}
