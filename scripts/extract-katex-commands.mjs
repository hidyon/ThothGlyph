/**
 * KaTeXが対応するコマンドの一覧を作る（0079）。
 *
 *   node scripts/extract-katex-commands.mjs
 *
 * 読むのは `node_modules/katex/src/` で、**これは公開APIではない**。
 * 実行時に内部をたどるとKaTeXの更新で静かに壊れるので、依存をこのスクリプト
 * 1本に閉じ、生成物（src/lib/guideCommands.ts）をコミットする。
 *
 * 生成の最後に全件をKaTeXへ通し、描画できないものは落として報告する
 * （`\varcoppa` は symbols.ts にあるのに未定義。実測）。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import katex from 'katex'
import { EXAMPLES, DISPLAY_ONLY, ENV_EXAMPLES } from './guide-examples.mjs'

const SRC = 'node_modules/katex/src/'
const OUT = 'src/lib/guideCommands.ts'

/**
 * `"\\alpha"` のような二重エスケープを元の文字列へ戻す。
 * 正規表現が拾った断片が文字列として読めないことがあるので、そのときは null。
 */
const unescape = (raw) => {
  try {
    return JSON.parse(`"${raw}"`)
  } catch {
    return null
  }
}

// ---- 1. 抽出 ----

/** 記号。`defineSymbol(mode, font, group, "文字", "\\名前")` の5番目を取る。 */
const symbols = new Map()
for (const m of readFileSync(SRC + 'symbols.ts', 'utf8').matchAll(
  /defineSymbol\(\s*(\w+),\s*(\w+),\s*(\w+),\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"/g,
)) {
  const name = unescape(m[5])
  if (name?.startsWith('\\') && !symbols.has(name)) symbols.set(name, m[3])
}

/** 関数。定義しているファイル名をそのまま分類の手がかりにする。 */
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  )
const functions = new Map()
for (const file of walk(SRC + 'functions')) {
  const body = readFileSync(file, 'utf8')
  const family = file.split('/').pop().replace(/\.ts$/, '')
  for (const m of body.matchAll(/names:\s*\[([\s\S]*?)\]/g)) {
    for (const q of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const name = unescape(q[1])
      if (name?.startsWith('\\') && !functions.has(name)) functions.set(name, family)
    }
  }
}

/** マクロ。 */
const macros = new Set()
for (const m of readFileSync(SRC + 'macros.ts', 'utf8').matchAll(
  /defineMacro\(\s*"((?:[^"\\]|\\.)*)"/g,
)) {
  const name = unescape(m[1])
  if (name?.startsWith('\\')) macros.add(name)
}

/** 環境（`\begin{…}`）。 */
const environments = new Set()
for (const file of [...walk(SRC + 'environments'), SRC + 'environments.ts']) {
  for (const m of readFileSync(file, 'utf8').matchAll(/names:\s*\[([\s\S]*?)\]/g)) {
    for (const q of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const name = unescape(q[1])
      // `\\hline` のような環境の中でだけ使う命令は環境の一覧に混ぜない。
      if (name && /^[A-Za-z][A-Za-z*]*$/.test(name)) environments.add(name)
    }
  }
}

// ---- 2. 載せないもの ----

/**
 * 内部用。利用者が書くものではない。`\show` `\message` `\errmessage` は
 * **コンソールに出力を吐く**ので、一覧に置くとガイドを開くたびに汚れる（実測）。
 */
const INTERNAL = new Set([
  '\\show',
  '\\message',
  '\\errmessage',
  '\\html@mathml',
  '\\bra@ket',
  '\\bra@set',
  '\\operatorname@',
  '\\tag@literal',
  '\\tag@paren',
])
/** Khan Academy由来の色マクロ。KaTeXが同梱しているだけで、この文書の記法ではない。 */
const KHAN_COLOR = /^\\(blue|red|green|gold|purple|maroon|teal|pink|gray|kaBlue|kaGreen|mint)/
/**
 * `\\abovefrac` のようにバックスラッシュ2つで始まるものは、KaTeXがマクロの
 * 展開先に使う内部の名前。書いても中身の文字がそのまま出るだけなので載せない。
 * 改行の `\\` だけは利用者が書くものなので残す。
 */
const INTERNAL_DOUBLE = (name) => name.startsWith('\\\\') && name !== '\\\\'
const excluded = (name) =>
  name.startsWith('\\@') || INTERNAL.has(name) || KHAN_COLOR.test(name) || INTERNAL_DOUBLE(name)

// ---- 3. 分類 ----

const CATEGORY_BY_SYMBOL_GROUP = {
  rel: 'relation',
  textord: 'symbol',
  bin: 'binary',
  mathord: 'letter',
  op: 'operator',
  accent: 'accent',
  open: 'bracket',
  close: 'bracket',
  spacing: 'spacing',
  inner: 'symbol',
  punct: 'symbol',
}
const CATEGORY_BY_FUNCTION_FAMILY = {
  op: 'operator',
  arrow: 'arrow',
  accent: 'accent',
  accentunder: 'accent',
  font: 'font',
  styling: 'font',
  delimsizing: 'bracket',
  genfrac: 'fraction',
  enclose: 'enclose',
  overline: 'enclose',
  underline: 'enclose',
  horizBrace: 'enclose',
  kern: 'spacing',
  cr: 'spacing',
}

const categoryOf = (name) => {
  const group = symbols.get(name)
  if (group) return CATEGORY_BY_SYMBOL_GROUP[group] ?? 'macro'
  const family = functions.get(name)
  if (family) return CATEGORY_BY_FUNCTION_FAMILY[family] ?? 'macro'
  return 'macro'
}

// ---- 4. 組み立て ----

const names = [...new Set([...symbols.keys(), ...functions.keys(), ...macros])]
  .filter((name) => !excluded(name))
  .sort()

const entries = []
const dropped = []
for (const name of names) {
  const latex = EXAMPLES[name] ?? name
  const displayMode = DISPLAY_ONLY.has(name)
  try {
    katex.renderToString(latex, { throwOnError: true, strict: false, displayMode })
  } catch (error) {
    dropped.push(`${name}（${latex}）: ${String(error.message).split('\n')[0]}`)
    continue
  }
  entries.push({ name, latex, category: categoryOf(name), displayMode })
}

const envEntries = []
for (const env of [...environments].sort()) {
  const latex = ENV_EXAMPLES[env] ?? `\\begin{${env}} a & b \\\\ c & d \\end{${env}}`
  try {
    katex.renderToString(latex, { throwOnError: true, strict: false, displayMode: true })
    envEntries.push({ name: env, latex })
  } catch {
    dropped.push(`環境 ${env}: 例が要る（scripts/guide-examples.mjs の ENV_EXAMPLES）`)
  }
}

// ---- 5. 書き出し ----

const lit = (value) => JSON.stringify(value)
const rows = entries
  .map(
    (e) =>
      `  { name: ${lit(e.name)}, latex: ${lit(e.latex)}, category: ${lit(e.category)}${
        e.displayMode ? ', displayMode: true' : ''
      } },`,
  )
  .join('\n')
const envRows = envEntries.map((e) => `  { name: ${lit(e.name)}, latex: ${lit(e.latex)} },`).join('\n')

const out = `/**
 * KaTeXが対応するコマンドの一覧（0079）。**手で書き換えない。**
 *
 *   node scripts/extract-katex-commands.mjs
 *
 * で作り直す。例（引数の要るもの）は scripts/guide-examples.mjs にある。
 * 全件がKaTeXで描画できることを生成時に確かめてある（通らないものは落とす）。
 */

/** 第2部の分類。表はこの順で並ぶ。 */
export type GuideCategory =
  | 'relation'
  | 'symbol'
  | 'binary'
  | 'letter'
  | 'operator'
  | 'arrow'
  | 'accent'
  | 'font'
  | 'bracket'
  | 'fraction'
  | 'enclose'
  | 'spacing'
  | 'macro'

export type GuideCommand = {
  /** 書くコマンド。 */
  name: string
  /** 表に描くLaTeX。引数の要るものは例になっている。 */
  latex: string
  category: GuideCategory
  /** ブロック数式でしか描けないもの（\\tag）。 */
  displayMode?: true
}

export type GuideEnvironment = { name: string; latex: string }

export const guideCommands: GuideCommand[] = [
${rows}
]

export const guideEnvironments: GuideEnvironment[] = [
${envRows}
]
`
writeFileSync(OUT, out)

console.log(`記号 ${symbols.size} / 関数 ${functions.size} / マクロ ${macros.size}`)
console.log(`載せる ${entries.length} 件、環境 ${envEntries.length} 件を ${OUT} へ書いた`)
if (dropped.length) {
  console.log(`落としたもの ${dropped.length} 件:`)
  for (const d of dropped) console.log('  ' + d)
}
