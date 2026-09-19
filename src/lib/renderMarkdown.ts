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

/** 数式を抜き出し、プレースホルダ入りのMarkdownと数式リストを返す。 */
function extractFormulas(source: string): {
  masked: string
  formulas: Formula[]
} {
  const formulas: Formula[] = []

  const masked = source.replace(MATH_PATTERN, (_match, block, inline) => {
    const isBlock = block !== undefined
    const latex = (isBlock ? block : inline).trim()
    if (latex.length === 0) return _match

    const index = formulas.push({ latex, displayMode: isBlock }) - 1
    return placeholderFor(index)
  })

  return { masked, formulas }
}

/** 1つの数式をKaTeXでHTML化する。壊れた入力でも例外は投げない。 */
function renderFormula({ latex, displayMode }: Formula): string {
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
