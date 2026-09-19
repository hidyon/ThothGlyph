type Props = {
  html: string
  /** 表示中のHTMLが最新の入力より古いか。 */
  stale: boolean
}

export function Preview({ html, stale }: Props) {
  return (
    <section className="pane pane--preview" aria-label="プレビュー">
      <header className="pane__header">
        プレビュー
        {/* 追いつくまでの間だけ出す。プレビュー自体は薄くしない（読めなくなる）。 */}
        {stale && <span className="pane__note">更新中…</span>}
      </header>
      {/* html は renderMarkdown 内で DOMPurify を通している。 */}
      <div
        className="preview"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  )
}
