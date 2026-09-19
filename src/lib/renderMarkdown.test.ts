// DOMPurifyはDOMを必要とするので、このファイルだけjsdomで動かす。
// （仕様ではnode環境で足りると見込んでいたが、sanitizeがwindowを要求する）
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './renderMarkdown'

/** 数式として描画されたか。KaTeXの出力は .katex を持つ。 */
const hasMath = (html: string) => html.includes('class="katex')
/** ブロック数式か。 */
const hasDisplayMath = (html: string) => html.includes('katex-display')
/** 描画された数式の数。KaTeXは式ごとに1つのannotationを出す。 */
const mathCount = (html: string) =>
  html.match(/annotation encoding="application\/x-tex"/g)?.length ?? 0

describe('renderMarkdown', () => {
  it('$...$ をインライン数式として描画する', () => {
    const html = renderMarkdown('式は $x^2$ である。')

    expect(hasMath(html)).toBe(true)
    expect(hasDisplayMath(html)).toBe(false)
  })

  it('$$...$$ をブロック数式として描画する', () => {
    expect(hasDisplayMath(renderMarkdown('$$\nx^2\n$$'))).toBe(true)
  })

  it('$$ を $ より先に解釈する', () => {
    // $$a$$ が $a$ 2つに割れると、ブロックにならず数式が2つになる。
    const html = renderMarkdown('$$a+b$$')

    expect(hasDisplayMath(html)).toBe(true)
    expect(mathCount(html)).toBe(1)
  })

  it('$100 から $200 のような通貨表記を数式にしない', () => {
    const html = renderMarkdown('価格は $100 から $200 まで。')

    expect(hasMath(html)).toBe(false)
    expect(html).toContain('$100')
  })

  it('エスケープした \\$ を数式の開始にしない', () => {
    expect(hasMath(renderMarkdown('\\$x\\$ と書く。'))).toBe(false)
  })

  it('アンダースコアを含むLaTeXがMarkdownの強調に壊されない', () => {
    // $a_i$ と $b_j$ の間の _ が <em> になると、LaTeXが壊れる。
    const html = renderMarkdown('$a_i$ と $b_j$')

    expect(html).not.toContain('<em>')
    expect(html).toContain('a_i')
    expect(html).toContain('b_j')
  })

  it('アスタリスクを含むLaTeXがMarkdownの強調に壊されない', () => {
    const html = renderMarkdown('$a*b$ と $c*d$')

    expect(html).not.toContain('<em>')
  })

  it('壊れたLaTeXでも例外を投げず、エラー色で描画する', () => {
    const html = renderMarkdown('$\\frac{$')

    expect(html).toContain('#dc2626')
  })

  it('scriptタグをサニタイズする', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n文章')

    expect(html).not.toContain('<script')
  })

  it('数式の中のHTMLをエスケープする（KaTeXの出力に生のタグを残さない）', () => {
    // 数式HTMLはサニタイズの後に差し戻すので、KaTeX側のエスケープが頼り。
    const html = renderMarkdown('$<img src=x onerror=alert(1)>$')

    expect(html).not.toContain('<img')
  })

  // --- 既知の不具合（0006で直す） ---
  // 直したら it.fails を it に裏返す。放置された不具合を一覧に見えるようにしておく。

  it.fails('インラインコード内の $ を数式にしない', () => {
    expect(hasMath(renderMarkdown('これは `$x^2$` というコード。'))).toBe(false)
  })

  it.fails('コードフェンス内の $ を数式にしない', () => {
    expect(hasMath(renderMarkdown('```\nsum $x_i$ here\n```'))).toBe(false)
  })
})
