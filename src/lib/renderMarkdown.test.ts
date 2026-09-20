// DOMPurifyはDOMを必要とするので、このファイルだけjsdomで動かす。
// （仕様ではnode環境で足りると見込んでいたが、sanitizeがwindowを要求する）
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { clearFormulaCache, clearGraphCache, renderMarkdown } from './renderMarkdown'

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

  it('インラインコード内の $ を数式にしない', () => {
    expect(hasMath(renderMarkdown('これは `$x^2$` というコード。'))).toBe(false)
  })

  it('コードフェンス内の $ を数式にしない', () => {
    expect(hasMath(renderMarkdown('```\nsum $x_i$ here\n```'))).toBe(false)
  })

  it('バッククォート2連の中のバッククォートを取り違えない', () => {
    const html = renderMarkdown('``code with ` and $x$``')

    expect(hasMath(html)).toBe(false)
  })

  it('閉じていないコードフェンス以降の $ を数式にしない', () => {
    expect(hasMath(renderMarkdown('```\n$x$ のまま\n'))).toBe(false)
  })

  it('コードブロックの前後にある数式はこれまで通り描画する', () => {
    const html = renderMarkdown('前 $a$\n\n```\n$b$\n```\n\n後 $c$')

    expect(mathCount(html)).toBe(2)
  })

  it('コードの直後の $$...$$ をブロック数式として描画する', () => {
    const html = renderMarkdown('```\ncode\n```\n\n$$\nx^2\n$$')

    expect(hasDisplayMath(html)).toBe(true)
    expect(mathCount(html)).toBe(1)
  })

  it('チルダのコードフェンス内の $ も数式にしない', () => {
    expect(hasMath(renderMarkdown('~~~\n$x$\n~~~'))).toBe(false)
  })

  it('キャッシュの有無で出力が変わらない', () => {
    const source = '$a+b$ と $$c^2$$ と壊れた $\\frac{$'

    clearFormulaCache()
    const cold = renderMarkdown(source)
    const warm = renderMarkdown(source)

    expect(warm).toBe(cold)
  })

  it('キャッシュの上限を超える数の数式でも全部描画される', () => {
    clearFormulaCache()
    const count = 600
    const source = Array.from({ length: count }, (_, i) => `$x^{${i}}$`).join(' ')

    expect(mathCount(renderMarkdown(source))).toBe(count)
  })

  it('上限を超えて捨てられた数式も描き直される', () => {
    clearFormulaCache()
    // 上限を埋めてから、最初の式をもう一度描く。
    renderMarkdown(Array.from({ length: 600 }, (_, i) => `$y^{${i}}$`).join(' '))

    expect(hasMath(renderMarkdown('$y^{0}$'))).toBe(true)
  })
})

/** ```graph ブロック（0037）。 */
describe('renderMarkdown（グラフ）', () => {
  const fence = (body: string) => '```graph\n' + body + '\n```\n'

  it('graphフェンスをSVGにする', () => {
    const html = renderMarkdown(fence('y = x^2\nx: -3..5'))

    expect(html).toContain('<svg class="graph"')
    expect(html).not.toContain('<code')
  })

  it('前後の本文と数式はそのまま描画する', () => {
    const html = renderMarkdown('# 見出し\n\n' + fence('y = x') + '\n式は $x^2$ である。\n')

    expect(html).toContain('<h1')
    expect(html).toContain('<svg class="graph"')
    expect(hasMath(html)).toBe(true)
  })

  it('graph以外のフェンスは今までどおりコードのまま', () => {
    for (const info of ['', 'js', 'graphql', 'graph2']) {
      const html = renderMarkdown('```' + info + '\ny = x^2\n```\n')

      expect(html, info).toContain('<code')
      expect(html, info).not.toContain('<svg class="graph"')
    }
  })

  it('~~~graph も受ける', () => {
    expect(renderMarkdown('~~~graph\ny = x\n~~~\n')).toContain('<svg class="graph"')
  })

  it('ブロックの中の $ を数式にしない', () => {
    const html = renderMarkdown(fence('# $x$ のグラフ\ny = x'))

    expect(hasMath(html)).toBe(false)
    expect(html).toContain('<svg class="graph"')
  })

  it('ブロックの中の LaTeX 記法で Markdown が壊れない', () => {
    const html = renderMarkdown(fence('y = x^2\n# a_b * c') + '\n**太字**\n')

    expect(html).toContain('<strong>太字</strong>')
  })

  it('描けないブロックを赤字1行にし、他の本文は残す', () => {
    const html = renderMarkdown('# 見出し\n\n' + fence('y = x^^2') + '\n本文。\n')

    expect(html).toContain('<span class="graph-error">式を読めません: x^^2</span>')
    expect(html).toContain('<h1')
    expect(html).toContain('本文。')
  })

  it('エラーメッセージのHTMLをエスケープする', () => {
    const html = renderMarkdown(fence('y = x\n<script>alert(1)</script>'))

    expect(html).toContain('graph-error')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('表示言語でメッセージとaria-labelが変わる', () => {
    expect(renderMarkdown(fence('y = x'), 'en')).toContain('aria-label="Graph of y = x"')
    expect(renderMarkdown(fence('y = x^^2'), 'en')).toContain('Cannot read expression: x^^2')
  })

  it('閉じないフェンスでも描ける', () => {
    expect(renderMarkdown('```graph\ny = x\n')).toContain('<svg class="graph"')
  })

  it('1つの文書に複数のグラフを置ける', () => {
    const html = renderMarkdown(fence('y = x') + '\n' + fence('y = 2x'))

    expect(html.match(/<svg class="graph"/g)).toHaveLength(2)
  })

  it('キャッシュの有無で結果が変わらない', () => {
    const source = fence('y = sin(x)\nx: -pi..pi')
    clearGraphCache()
    const first = renderMarkdown(source)
    const second = renderMarkdown(source)

    expect(second).toBe(first)

    clearGraphCache()
    expect(renderMarkdown(source)).toBe(first)
  })
})
