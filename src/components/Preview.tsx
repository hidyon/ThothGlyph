import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'

type Props = {
  html: string
  /** 表示中のHTMLが最新の入力より古いか。 */
  stale: boolean
  lang: Lang
}

export function Preview({ html, stale, lang }: Props) {
  return (
    <section className="pane pane--preview" aria-label={pick(messages.previewLabel, lang)}>
      <header className="pane__header">
        {pick(messages.previewHeader, lang)}
        {/* 追いつくまでの間だけ出す。プレビュー自体は薄くしない（読めなくなる）。 */}
        {stale && <span className="pane__note">{pick(messages.previewStale, lang)}</span>}
      </header>
      {/* html は renderMarkdown 内で DOMPurify を通している。 */}
      <div
        className="preview"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  )
}
