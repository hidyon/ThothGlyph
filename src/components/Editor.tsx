import type { Ref } from 'react'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'

type Props = {
  value: string
  onChange: (value: string) => void
  textareaRef: Ref<HTMLTextAreaElement>
  lang: Lang
}

export function Editor({ value, onChange, textareaRef, lang }: Props) {
  return (
    <section className="pane pane--editor" aria-label={pick(messages.editorLabel, lang)}>
      <header className="pane__header">{pick(messages.editorHeader, lang)}</header>
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
