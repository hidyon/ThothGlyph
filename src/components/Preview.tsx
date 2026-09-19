type Props = {
  html: string
}

export function Preview({ html }: Props) {
  return (
    <section className="pane pane--preview" aria-label="プレビュー">
      <header className="pane__header">プレビュー</header>
      {/* html は renderMarkdown 内で DOMPurify を通している。 */}
      <div
        className="preview"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  )
}
