import DOMPurify from 'dompurify'
import katex from 'katex'
import { marked } from 'marked'

import { parseGraphBlock } from './graphBlock'
import type { Lang } from './i18n'
import { pick } from './i18n'
import type { OffsetMap } from './lineMap'
import { lineAt, lineStarts, toOriginal } from './lineMap'
import { renderGraph } from './renderGraph'

/**
 * Markdown（$...$ / $$...$$ の数式込み）をレンダリング済みHTMLに変換する。
 *
 * 数式は先に取り出してプレースホルダに置き換えておく。Markdownパーサは
 * `_` や `*` や `\` をMarkdown記法として解釈してしまうので、LaTeXを
 * そのまま通すと壊れるため。
 */

type Formula = {
  latex: string
  displayMode: boolean
  /** 元ソース上の「中身の範囲」。`source.slice(start, end)` が latex に一致する（0020）。 */
  start: number
  end: number
}

const PLACEHOLDER_PREFIX = '%%MATHEDITOR_MATH_'
const PLACEHOLDER_SUFFIX = '%%'

const placeholderFor = (index: number) =>
  `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`

const GRAPH_PLACEHOLDER_PREFIX = '%%MATHEDITOR_GRAPH_'

const graphPlaceholderFor = (index: number) =>
  `${GRAPH_PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`

// 情報文字列が graph ちょうどのフェンスだけをグラフにする（```graphql は対象外）。
const GRAPH_FENCE = /^ {0,3}(?:`{3,}|~{3,})graph[ \t]*$/

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

/**
 * グラフのブロックと数式を抜き出し、プレースホルダ入りのMarkdownと
 * それぞれのリストを返す。
 *
 * **グラフの退避は数式の退避より先**。ブロックの中の `$` を数式にしないため
 * （コードの中の `$` を数式にしないのと同じ理由。0006）。
 */
function extractBlocks(source: string): {
  masked: string
  formulas: Formula[]
  graphs: string[]
  offsets: OffsetMap
} {
  const formulas: Formula[] = []
  const graphs: string[] = []

  /*
    退避のたびに「退避後の位置」と「元ソースの位置」の対応を控える（0010）。
    プレースホルダは元の文字列より短く、$$...$$ は複数行を1行に畳むので、
    これが無いと退避後のテキストから元の行番号を出せない。
  */
  const offsets: OffsetMap = [{ masked: 0, original: 0 }]
  const parts: string[] = []
  let maskedLength = 0
  let original = 0

  /** 1件退避したときに、両側の位置を進めて対応点を記録する。 */
  const replaced = (placeholder: string, originalLength: number) => {
    parts.push(placeholder)
    maskedLength += placeholder.length
    original += originalLength
    offsets.push({ masked: maskedLength, original })
  }

  /** 素通しの部分。両側が同じだけ進むので対応点は増えない。 */
  const kept = (text: string) => {
    parts.push(text)
    maskedLength += text.length
    original += text.length
  }

  // 数式の番号は文書全体を通した連番。コード領域を跨いでも狂わない。
  for (const segment of splitByCode(source)) {
    if (segment.isCode) {
      const masked = maskGraph(segment.text, graphs)
      if (masked === segment.text) kept(segment.text)
      else replaced(masked, segment.text.length)
      continue
    }

    let last = 0
    for (const match of segment.text.matchAll(MATH_PATTERN)) {
      const start = match.index
      if (start > last) kept(segment.text.slice(last, start))

      const isBlock = match[1] !== undefined
      const raw = isBlock ? match[1] : match[2]
      const latex = raw.trim()
      // 中身が空の $$ $$ は数式にしない。文字として残す。
      if (latex.length === 0) kept(match[0])
      else {
        /*
          プレビューから元ソースの位置を指すため、中身の範囲を控える（0020）。
          `original` はこの時点で match の開始位置（直前の kept で進んでいる）。
          そこからデリミタのぶん内側へ入り、trim で落ちた空白のぶんを詰める。
        */
        const contentStart =
          original + (isBlock ? 2 : 1) + (raw.length - raw.trimStart().length)
        const index =
          formulas.push({
            latex,
            displayMode: isBlock,
            start: contentStart,
            end: contentStart + latex.length,
          }) - 1
        replaced(placeholderFor(index), match[0].length)
      }

      last = start + match[0].length
    }

    if (last < segment.text.length) kept(segment.text.slice(last))
  }

  return { masked: parts.join(''), formulas, graphs, offsets }
}

/**
 * コードのセグメントが ```graph なら、中身を退避してプレースホルダに替える。
 * グラフでなければそのまま返す（コードの解釈はmarkedに任せる）。
 */
function maskGraph(text: string, graphs: string[]): string {
  const lines = text.split('\n')
  if (!GRAPH_FENCE.test(lines[0] ?? '')) return text

  // 末尾の空文字はフェンス行の改行によるもの。閉じフェンスはその手前にある。
  if (lines.at(-1) === '') lines.pop()
  const closed = lines.length >= 2 && FENCE.test((lines.at(-1) as string).trim())
  const body = lines.slice(1, closed ? -1 : undefined).join('\n')

  const index = graphs.push(body) - 1
  return `${graphPlaceholderFor(index)}\n`
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

/**
 * サニタイズ後のHTMLに残ったプレースホルダを、描画した数式に差し戻す。
 *
 * 出力は `.math-anchor` で包み、元ソース上の位置を持たせる（0020）。
 * **包むのはキャッシュの外側**なので、同じLaTeXが別の位置にあっても
 * キャッシュはこれまでどおり効く。属性に入るのは自前で数えた整数2つだけで、
 * 利用者の入力は入らない（サニタイズを迂回する経路を広げない）。
 */
function anchorClass({ displayMode }: Formula): string {
  /*
    ブロック数式のラッパは block にする。中の .katex-display は中央寄せの
    ブロックなので、inline のまま包むと輪郭が行ボックスに沿って引かれ、
    式とずれた位置に出る。
  */
  return displayMode ? 'math-anchor math-anchor--block' : 'math-anchor'
}

function restoreFormulas(html: string, formulas: Formula[]): string {
  return formulas.reduce(
    (acc, formula, index) =>
      acc.replaceAll(
        placeholderFor(index),
        `<span class="${anchorClass(formula)}" data-math-start="${formula.start}" data-math-end="${formula.end}">${renderFormula(formula)}</span>`,
      ),
    html,
  )
}

const MARKED_OPTIONS = { async: false, breaks: true, gfm: true } as const

// 出力の先頭にある開始タグ。ここへ data-line を差し込む。
const OPEN_TAG = /^(\s*<[a-zA-Z][a-zA-Z0-9-]*)/

/**
 * Markdownを解析しつつ、トップレベルのブロックに元ソースの行番号を付ける（0010）。
 *
 * 文書全体を一度に `marked.parse()` すると、出力のどこがソースの何行目かが
 * 分からない。トークンに分けて1つずつ解析し、それぞれの先頭の開始タグへ
 * `data-line` を差し込む。トークンの `raw` を連結すると入力と完全に一致するので、
 * 足し上げた長さがそのトークンの開始位置になる。
 *
 * 付けるのはトップレベルだけ。`li` や `td` まで付けると、アンカーが数千件になり
 * 測定のコストが入力の体感に出る（ブロック単位で足りる）。
 */
function parseWithLines(masked: string, source: string, offsets: OffsetMap): string {
  const tokens = marked.lexer(masked, MARKED_OPTIONS)
  const starts = lineStarts(source)
  const parts: string[] = []
  let offset = 0

  for (const token of tokens) {
    /*
      参照リンクの定義（[foo]: url）はトークンではなくlexerの状態に載る。
      1件ずつ渡すときも持たせないと、参照で書いたリンクが文字のまま残る。
    */
    const one = [token] as typeof tokens
    one.links = tokens.links

    const html = marked.parser(one, MARKED_OPTIONS)
    const line = lineAt(starts, toOriginal(offsets, offset))
    offset += token.raw.length

    // 空行（space）や、開始タグで始まらない出力には付けない。
    // アンカーが1つ減るだけで、前後のアンカーからの補間で足りる。
    parts.push(html === '' ? html : html.replace(OPEN_TAG, `$1 data-line="${line}"`))
  }

  return parts.join('')
}

export function renderMarkdown(source: string, lang: Lang = 'ja'): string {
  const { masked, formulas, graphs, offsets } = extractBlocks(source)

  const rawHtml = parseWithLines(masked, source, offsets)

  const safeHtml = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  })

  // 数式HTMLの差し戻しはサニタイズ後に行う。KaTeXの出力は信頼できる
  // （入力LaTeXはKaTeX側でエスケープされる）一方、DOMPurifyに通すと
  // MathMLのアノテーションなど描画に必要な要素が落ちることがあるため。
  //
  // グラフのSVGはKaTeXと違いDOMPurifyを通せる（実測済み）ので、差し戻す前に
  // 1つずつ通す。抜け道を増やさないため。
  return restoreFormulas(restoreGraphs(safeHtml, graphs, lang), formulas)
}

/**
 * グラフごとの描画結果のキャッシュ。数式と同じ理由（1文字打つたびに文書全体を
 * 描き直すが、ほとんどのブロックは前回と同一）。言語でaria-labelと
 * エラー文言が変わるので、言語もキーに含める。
 */
const graphCache = new Map<string, string>()

/** 上限。1件あたり数十KBのSVGになりうるので、数式より少なくする。 */
const GRAPH_CACHE_LIMIT = 100

/** テスト用。 */
export function clearGraphCache(): void {
  graphCache.clear()
}

function restoreGraphs(html: string, graphs: string[], lang: Lang): string {
  return graphs.reduce(
    (acc, body, index) =>
      acc.replaceAll(graphPlaceholderFor(index), renderGraphBlock(body, lang)),
    html,
  )
}

function renderGraphBlock(body: string, lang: Lang): string {
  const key = `${lang}:${body}`
  const cached = graphCache.get(key)
  if (cached !== undefined) return cached

  const html = renderGraphBlockUncached(body, lang)

  if (graphCache.size >= GRAPH_CACHE_LIMIT) {
    const oldest = graphCache.keys().next().value
    if (oldest !== undefined) graphCache.delete(oldest)
  }
  graphCache.set(key, html)

  return html
}

function renderGraphBlockUncached(body: string, lang: Lang): string {
  const parsed = parseGraphBlock(body)
  if (!parsed.ok) return graphError(pick(parsed.error, lang))

  const rendered = renderGraph(parsed.spec, lang)
  if (!rendered.ok) return graphError(pick(rendered.error, lang))

  // 生成したSVGもサニタイズを通す。KaTeXの出力と違って通せることを実測した
  // （docs/specs/0037-graph.md）ので、迂回させる理由がない。
  return DOMPurify.sanitize(rendered.svg, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  })
}

/**
 * 描けないときの表示。数式と同じで、プレビュー全体は消さずその場に赤字を出す。
 * プレースホルダは段落の中にあるので、囲みは <span> にする（<p> は入れ子にできない）。
 */
function graphError(message: string): string {
  return `<span class="graph-error">${escapeHtml(message)}</span>`
}

/** 利用者が書いた文字列をそのまま出す箇所（エラーメッセージ）。 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
