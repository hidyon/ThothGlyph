import type { RefObject } from 'react'

import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'

type Props = {
  html: string
  /** 表示中のHTMLが最新の入力より古いか。 */
  stale: boolean
  /** 数式の描画エンジンが届いているか。届くまで本文は空（0024）。 */
  ready: boolean
  lang: Lang
  /** スクロールする要素。Appが位置を測って合わせる（0010）。 */
  containerRef: RefObject<HTMLDivElement | null>
  /** スクロールしたことをAppへ伝える（エディタを追わせる。0010）。 */
  onScrollSync: () => void
}

export function Preview({ html, stale, ready, lang, containerRef, onScrollSync }: Props) {
  return (
    <section className="pane pane--preview" aria-label={pick(messages.previewLabel, lang)}>
      <header className="pane__header">
        {pick(messages.previewHeader, lang)}
        {/* 追いつくまでの間だけ出す。プレビュー自体は薄くしない（読めなくなる）。 */}
        {!ready && <span className="pane__note">{pick(messages.previewPreparing, lang)}</span>}
        {ready && stale && <span className="pane__note">{pick(messages.previewStale, lang)}</span>}
      </header>
      {/* html は renderMarkdown 内で DOMPurify を通している。 */}
      <div
        className="preview"
        ref={containerRef}
        onScroll={onScrollSync}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  )
}
