import DOMPurify from 'dompurify'
import katex from 'katex'
import { marked } from 'marked'

/**
 * Markdown（$...$ / $$...$$ の数式込み）をレンダリング済みHTMLに変換する。
 *
 * 数式は先に取り出してプレースホルダに置き換えておく。Markdownパーサは
 * `_` や `*` や `\` をMarkdown記法として解釈してしまうので、LaTeXを
 * そのまま通すと壊れるため。
 */

type Formula = { latex: string; displayMode: boolean }

const PLACEHOLDER_PREFIX = '%%MATHEDITOR_MATH_'
const PLACEHOLDER_SUFFIX = '%%'

const placeholderFor = (index: number) =>
  `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`

// $$...$$ を先に見る（$...$ に食われないように）。
// インライン側は $ の直後・直前が空白でないものだけを数式とみなし、
// エスケープされた \$ と、$100 のような通貨表記を巻き込みにくくする。
const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|(?<![\\$])\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\$)/g

type Segment = { text: string; isCode: boolean }

// 行頭（インデント3つまで）の ``` または ~~~ でフェンスが開く。
const FENCE = /^ {0,3}(`{3,}|~{3,})/
// 開きと同じ個数のバッククォートで閉じるインラインコード。
// 個数を合わせるのは ``code with ` inside`` のような入れ子を取り違えないため。
const INLINE_CODE = /(`+)[\s\S]*?\1/g

/**
 * ソースをコード領域とそれ以外に切り分ける。
 *
 * コード領域の中の `$...$` を数式にしないため。コード自体はプレースホルダへ
 * 逃がさず、そのままmarkedへ渡す（コードの解釈はmarkedに任せるほうが安全）。
 *
 * フェンスは行単位で見る。正規表現だけで「閉じないフェンスは末尾まで」を
 * 表そうとすると、複数行モードの `$` が行末にも当たって取り違えるため。
 */
function splitByCode(source: string): Segment[] {
  const fenced: Segment[] = []
  let buffer: string[] = []
  let openFence: string | null = null

  const flush = (isCode: boolean) => {
    if (buffer.length === 0) return
    fenced.push({ text: buffer.join(''), isCode })
    buffer = []
  }

  for (const line of source.split('\n')) {
    const withBreak = `${line}\n`

    if (openFence === null) {
      const match = line.match(FENCE)
      if (match) {
        flush(false)
        openFence = match[1]
      }
      buffer.push(withBreak)
      continue
    }

    buffer.push(withBreak)
    // 閉じフェンスは開きと同じ記号で、同じ個数以上。
    if (line.trim().startsWith(openFence)) {
      flush(true)
      openFence = null
    }
  }

  // 閉じないまま終わったフェンスは、末尾までをコードとみなす（markedと同じ扱い）。
  flush(openFence !== null)

  // 行ごとに改行を足して組み直したので、元が改行で終わっていなければ1つ戻す。
  const last = fenced.at(-1)
  if (last && !source.endsWith('\n')) {
    last.text = last.text.slice(0, -1)
  }

  return fenced.flatMap((segment) =>
    segment.isCode ? [segment] : splitByInlineCode(segment.text),
  )
}

/** フェンスの外側をインラインコードで分ける。 */
function splitByInlineCode(text: string): Segment[] {
  const segments: Segment[] = []
  let last = 0

  for (const match of text.matchAll(INLINE_CODE)) {
    const start = match.index
    if (start > last) segments.push({ text: text.slice(last, start), isCode: false })
    segments.push({ text: match[0], isCode: true })
    last = start + match[0].length
  }

  if (last < text.length) segments.push({ text: text.slice(last), isCode: false })
  return segments
}

/** 数式を抜き出し、プレースホルダ入りのMarkdownと数式リストを返す。 */
function extractFormulas(source: string): {
  masked: string
  formulas: Formula[]
} {
  const formulas: Formula[] = []

  // 数式の番号は文書全体を通した連番。コード領域を跨いでも狂わない。
  const masked = splitByCode(source)
    .map((segment) =>
      segment.isCode
        ? segment.text
        : segment.text.replace(MATH_PATTERN, (_match, block, inline) => {
            const isBlock = block !== undefined
            const latex = (isBlock ? block : inline).trim()
            if (latex.length === 0) return _match

            const index = formulas.push({ latex, displayMode: isBlock }) - 1
            return placeholderFor(index)
          }),
    )
    .join('')

  return { masked, formulas }
}

/**
 * 数式ごとの描画結果のキャッシュ。
 *
 * 1文字打つたびに文書全体を描き直すが、そのとき文書中の数式はほとんどが
 * 前回と同一である。KaTeXの呼び出しが描画コストの大半なので、ここが効く。
 * 同じ入力からは同じ出力が返るので、関数としての振る舞いは変わらない。
 */
const formulaCache = new Map<string, string>()

/** 上限。1件あたり数KBのHTMLなので、この程度なら数MBに収まる。 */
const CACHE_LIMIT = 500

/** テスト用。キャッシュの有無で結果が変わらないことを確かめるために使う。 */
export function clearFormulaCache(): void {
  formulaCache.clear()
}

/** 1つの数式をKaTeXでHTML化する。壊れた入力でも例外は投げない。 */
function renderFormula(formula: Formula): string {
  const key = `${formula.displayMode ? 'block' : 'inline'}:${formula.latex}`
  const cached = formulaCache.get(key)
  if (cached !== undefined) return cached

  const html = renderFormulaUncached(formula)

  // 素朴なFIFO。古い順に捨てる（Mapは挿入順を保つ）。
  if (formulaCache.size >= CACHE_LIMIT) {
    const oldest = formulaCache.keys().next().value
    if (oldest !== undefined) formulaCache.delete(oldest)
  }
  formulaCache.set(key, html)

  return html
}

function renderFormulaUncached({ latex, displayMode }: Formula): string {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    // 入力途中の壊れた数式は赤字で見せる。プレビューが消えるより分かりやすい。
    errorColor: '#dc2626',
    strict: false,
  })
}

/** サニタイズ後のHTMLに残ったプレースホルダを、描画した数式に差し戻す。 */
function restoreFormulas(html: string, formulas: Formula[]): string {
  return formulas.reduce(
    (acc, formula, index) =>
      acc.replaceAll(placeholderFor(index), renderFormula(formula)),
    html,
  )
}

export function renderMarkdown(source: string): string {
  const { masked, formulas } = extractFormulas(source)

  // marked.parse は async にも設定できるが、既定は同期。型のためだけに String() する。
  const rawHtml = marked.parse(masked, { async: false, breaks: true, gfm: true })

  const safeHtml = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  })

  // 数式HTMLの差し戻しはサニタイズ後に行う。KaTeXの出力は信頼できる
  // （入力LaTeXはKaTeX側でエスケープされる）一方、DOMPurifyに通すと
  // MathMLのアノテーションなど描画に必要な要素が落ちることがあるため。
  return restoreFormulas(safeHtml, formulas)
}
