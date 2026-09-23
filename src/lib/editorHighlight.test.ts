import { describe, expect, it } from 'vitest'
import { editorHighlightHtml } from './editorHighlight'

describe('editorHighlightHtml', () => {
  it('見出しとLaTexコマンドを色付けしHTMLをエスケープする', () => {
    const html = editorHighlightHtml('# 見出し\n$\\frac{a}{b}$ <script>')
    expect(html).toContain('syntax-heading')
    expect(html).toContain('syntax-math')
    expect(html).toContain('&lt;script&gt;')
  })
  it('コードフェンス内の数式を数式色にしない', () => {
    const html = editorHighlightHtml('```txt\n$x$\n```')
    expect((html.match(/syntax-math/g) ?? [])).toHaveLength(0)
  })
})
