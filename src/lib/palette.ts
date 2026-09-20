/**
 * 記号パレットの定義。
 *
 * UIはこのデータを描画するだけなので、記号を増やすときはここに1行足せばよい。
 * - `label`: ボタン上に表示するLaTeX（KaTeXで描画される）
 * - `snippet`: エディタに挿入される文字列
 * - snippet 中の CURSOR_TOKEN は「挿入後にカーソルを置く位置」を表す。
 *   省略した場合は挿入文字列の末尾にカーソルが移動する。
 */

import type { Lang, Text } from './i18n'
import { pick, t } from './i18n'
import { messages } from './messages'

export const CURSOR_TOKEN = '%CURSOR%'

export type PaletteItem = {
  /** ボタンに表示するLaTeX。 */
  label: string
  /** 挿入される文字列。 */
  snippet: string
  /** ボタンのtooltip。 */
  title: Text
}

export type PaletteGroup = {
  name: Text
  items: PaletteItem[]
}

export const paletteGroups: PaletteGroup[] = [
  {
    name: t('基本', 'Basic'),
    items: [
      { label: '\\frac{a}{b}', snippet: `\\frac{${CURSOR_TOKEN}}{}`, title: t('分数', 'Fraction') },
      { label: '\\sqrt{x}', snippet: `\\sqrt{${CURSOR_TOKEN}}`, title: t('平方根', 'Square root') },
      { label: '\\sqrt[n]{x}', snippet: `\\sqrt[${CURSOR_TOKEN}]{}`, title: t('n乗根', 'nth root') },
      { label: 'x^{n}', snippet: `^{${CURSOR_TOKEN}}`, title: t('上付き（指数）', 'Superscript (exponent)') },
      { label: 'x_{i}', snippet: `_{${CURSOR_TOKEN}}`, title: t('下付き（添字）', 'Subscript (index)') },
      { label: '\\bar{x}', snippet: `\\bar{${CURSOR_TOKEN}}`, title: t('バー', 'Bar') },
      { label: '\\vec{v}', snippet: `\\vec{${CURSOR_TOKEN}}`, title: t('ベクトル', 'Vector') },
      { label: '\\hat{x}', snippet: `\\hat{${CURSOR_TOKEN}}`, title: t('ハット', 'Hat') },
    ],
  },
  {
    name: t('ギリシャ小文字', 'Greek (lowercase)'),
    items: [
      { label: '\\alpha', snippet: '\\alpha ', title: t('alpha', 'alpha') },
      { label: '\\beta', snippet: '\\beta ', title: t('beta', 'beta') },
      { label: '\\gamma', snippet: '\\gamma ', title: t('gamma', 'gamma') },
      { label: '\\delta', snippet: '\\delta ', title: t('delta', 'delta') },
      { label: '\\epsilon', snippet: '\\epsilon ', title: t('epsilon', 'epsilon') },
      { label: '\\varepsilon', snippet: '\\varepsilon ', title: t('varepsilon（epsilonの別の形）', 'varepsilon (variant of epsilon)') },
      { label: '\\zeta', snippet: '\\zeta ', title: t('zeta', 'zeta') },
      { label: '\\eta', snippet: '\\eta ', title: t('eta', 'eta') },
      { label: '\\theta', snippet: '\\theta ', title: t('theta', 'theta') },
      { label: '\\vartheta', snippet: '\\vartheta ', title: t('vartheta（thetaの別の形）', 'vartheta (variant of theta)') },
      { label: '\\iota', snippet: '\\iota ', title: t('iota', 'iota') },
      { label: '\\kappa', snippet: '\\kappa ', title: t('kappa', 'kappa') },
      { label: '\\varkappa', snippet: '\\varkappa ', title: t('varkappa（kappaの別の形）', 'varkappa (variant of kappa)') },
      { label: '\\lambda', snippet: '\\lambda ', title: t('lambda', 'lambda') },
      { label: '\\mu', snippet: '\\mu ', title: t('mu', 'mu') },
      { label: '\\nu', snippet: '\\nu ', title: t('nu', 'nu') },
      { label: '\\xi', snippet: '\\xi ', title: t('xi', 'xi') },
      { label: '\\omicron', snippet: '\\omicron ', title: t('omicron', 'omicron') },
      { label: '\\pi', snippet: '\\pi ', title: t('pi', 'pi') },
      { label: '\\varpi', snippet: '\\varpi ', title: t('varpi（piの別の形）', 'varpi (variant of pi)') },
      { label: '\\rho', snippet: '\\rho ', title: t('rho', 'rho') },
      { label: '\\varrho', snippet: '\\varrho ', title: t('varrho（rhoの別の形）', 'varrho (variant of rho)') },
      { label: '\\sigma', snippet: '\\sigma ', title: t('sigma', 'sigma') },
      { label: '\\varsigma', snippet: '\\varsigma ', title: t('varsigma（sigmaの別の形）', 'varsigma (variant of sigma)') },
      { label: '\\tau', snippet: '\\tau ', title: t('tau', 'tau') },
      { label: '\\upsilon', snippet: '\\upsilon ', title: t('upsilon', 'upsilon') },
      { label: '\\phi', snippet: '\\phi ', title: t('phi', 'phi') },
      { label: '\\varphi', snippet: '\\varphi ', title: t('varphi（phiの別の形）', 'varphi (variant of phi)') },
      { label: '\\chi', snippet: '\\chi ', title: t('chi', 'chi') },
      { label: '\\psi', snippet: '\\psi ', title: t('psi', 'psi') },
      { label: '\\omega', snippet: '\\omega ', title: t('omega', 'omega') },
    ],
  },
  {
    name: t('ギリシャ大文字', 'Greek (uppercase)'),
    items: [
      { label: '\\Gamma', snippet: '\\Gamma ', title: t('Gamma（大文字）', 'Gamma (uppercase)') },
      { label: '\\Delta', snippet: '\\Delta ', title: t('Delta（大文字）', 'Delta (uppercase)') },
      { label: '\\Theta', snippet: '\\Theta ', title: t('Theta（大文字）', 'Theta (uppercase)') },
      { label: '\\Lambda', snippet: '\\Lambda ', title: t('Lambda（大文字）', 'Lambda (uppercase)') },
      { label: '\\Xi', snippet: '\\Xi ', title: t('Xi（大文字）', 'Xi (uppercase)') },
      { label: '\\Pi', snippet: '\\Pi ', title: t('Pi（大文字）', 'Pi (uppercase)') },
      { label: '\\Sigma', snippet: '\\Sigma ', title: t('Sigma（大文字）', 'Sigma (uppercase)') },
      { label: '\\Upsilon', snippet: '\\Upsilon ', title: t('Upsilon（大文字）', 'Upsilon (uppercase)') },
      { label: '\\Phi', snippet: '\\Phi ', title: t('Phi（大文字）', 'Phi (uppercase)') },
      { label: '\\Psi', snippet: '\\Psi ', title: t('Psi（大文字）', 'Psi (uppercase)') },
      { label: '\\Omega', snippet: '\\Omega ', title: t('Omega（大文字）', 'Omega (uppercase)') },
    ],
  },
  {
    name: t('演算子', 'Operators'),
    items: [
      { label: '\\sum_{i=1}^{n}', snippet: `\\sum_{${CURSOR_TOKEN}}^{}`, title: t('総和', 'Summation') },
      { label: '\\prod_{i=1}^{n}', snippet: `\\prod_{${CURSOR_TOKEN}}^{}`, title: t('総乗', 'Product') },
      { label: '\\int_{a}^{b}', snippet: `\\int_{${CURSOR_TOKEN}}^{}`, title: t('積分', 'Integral') },
      { label: '\\iint', snippet: '\\iint ', title: t('二重積分', 'Double integral') },
      { label: '\\oint', snippet: '\\oint ', title: t('周回積分', 'Contour integral') },
      { label: '\\lim_{x \\to 0}', snippet: `\\lim_{${CURSOR_TOKEN} \\to }`, title: t('極限', 'Limit') },
      { label: '\\partial', snippet: '\\partial ', title: t('偏微分', 'Partial derivative') },
      { label: '\\nabla', snippet: '\\nabla ', title: t('ナブラ', 'Nabla') },
      { label: '\\pm', snippet: '\\pm ', title: t('プラスマイナス', 'Plus-minus') },
      { label: '\\times', snippet: '\\times ', title: t('乗算', 'Multiplication') },
      { label: '\\div', snippet: '\\div ', title: t('除算', 'Division') },
      { label: '\\cdot', snippet: '\\cdot ', title: t('ドット積', 'Dot product') },
    ],
  },
  {
    name: t('関係子', 'Relations'),
    items: [
      { label: '\\leq', snippet: '\\leq ', title: t('以下', 'Less than or equal') },
      { label: '\\geq', snippet: '\\geq ', title: t('以上', 'Greater than or equal') },
      { label: '\\neq', snippet: '\\neq ', title: t('等しくない', 'Not equal') },
      { label: '\\approx', snippet: '\\approx ', title: t('ほぼ等しい', 'Approximately equal') },
      { label: '\\equiv', snippet: '\\equiv ', title: t('合同', 'Congruent') },
      { label: '\\propto', snippet: '\\propto ', title: t('比例', 'Proportional to') },
      { label: '\\in', snippet: '\\in ', title: t('属する', 'Element of') },
      { label: '\\subset', snippet: '\\subset ', title: t('部分集合', 'Subset') },
      { label: '\\to', snippet: '\\to ', title: t('右矢印', 'Right arrow') },
      { label: '\\Rightarrow', snippet: '\\Rightarrow ', title: t('ならば', 'Implies') },
      { label: '\\iff', snippet: '\\iff ', title: t('同値', 'If and only if') },
      { label: '\\infty', snippet: '\\infty ', title: t('無限大', 'Infinity') },
      { label: '\\forall', snippet: '\\forall ', title: t('全称', 'For all') },
      { label: '\\exists', snippet: '\\exists ', title: t('存在', 'There exists') },
    ],
  },
  {
    name: t('括弧・構造', 'Brackets & structures'),
    items: [
      {
        label: '\\left( x \\right)',
        snippet: `\\left( ${CURSOR_TOKEN} \\right)`,
        title: t('自動サイズの丸括弧', 'Auto-sized parentheses'),
      },
      {
        label: '\\left\\{ x \\right\\}',
        snippet: `\\left\\{ ${CURSOR_TOKEN} \\right\\}`,
        title: t('自動サイズの波括弧', 'Auto-sized braces'),
      },
      {
        label: '\\left| x \\right|',
        snippet: `\\left| ${CURSOR_TOKEN} \\right|`,
        title: t('絶対値', 'Absolute value'),
      },
      {
        label: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
        snippet: `\\begin{pmatrix}\n${CURSOR_TOKEN} & \\\\\n & \n\\end{pmatrix}`,
        title: t('2x2行列', '2x2 matrix'),
      },
      {
        label: '\\begin{cases} a \\\\ b \\end{cases}',
        snippet: `\\begin{cases}\n${CURSOR_TOKEN} & \\\\\n & \n\\end{cases}`,
        title: t('場合分け', 'Cases'),
      },
      {
        label: '\\begin{aligned} a &= b \\end{aligned}',
        snippet: `\\begin{aligned}\n${CURSOR_TOKEN} &= \\\\\n&= \n\\end{aligned}`,
        title: t('複数行の式（=で揃える）', 'Multi-line equation (aligned at =)'),
      },
    ],
  },
  {
    name: t('Markdown', 'Markdown'),
    items: [
      { label: '\\text{\\$x\\$}', snippet: `$${CURSOR_TOKEN}$`, title: t('インライン数式', 'Inline math') },
      {
        label: '\\text{\\$\\$x\\$\\$}',
        snippet: `\n$$\n${CURSOR_TOKEN}\n$$\n`,
        title: t('ブロック数式（中央寄せ）', 'Block math (centered)'),
      },
      { label: '\\text{見出し}', snippet: `## ${CURSOR_TOKEN}`, title: t('見出し', 'Heading') },
      { label: '\\textbf{太字}', snippet: `**${CURSOR_TOKEN}**`, title: t('太字', 'Bold') },
      { label: '\\textit{斜体}', snippet: `*${CURSOR_TOKEN}*`, title: t('斜体', 'Italic') },
      { label: '\\text{箇条書き}', snippet: `- ${CURSOR_TOKEN}`, title: t('箇条書き', 'Bullet list') },
      {
        label: '\\text{グラフ}',
        snippet: `\n\`\`\`graph\ny = ${CURSOR_TOKEN}\nx: -5..5\n\`\`\`\n`,
        title: t('関数のグラフ', 'Function graph'),
      },
    ],
  },
]

/**
 * このスニペットが選択範囲を囲むか。
 *
 * CURSOR_TOKEN の有無がそのまま「囲めるかどうか」なので、88件のitemに
 * 手で印を付けずに導出する（記号の追加を1行で済ませる約束を崩さないため）。
 */
export function wrapsSelection(snippet: string): boolean {
  return snippet.includes(CURSOR_TOKEN)
}

/**
 * ボタンのtooltipに出す文言。選択範囲があるときに何が起きるかを、
 * 押す前に読めるようにする。
 *
 * 「名前＋説明」を文字列の連結で作らないのは、英語で語順と括弧が変わるため
 * （`平方根（選択範囲を囲む）` / `Square root (wraps selection)`）。
 */
export function describeInsertion(item: PaletteItem, lang: Lang): string {
  const name = pick(item.title, lang)
  const describe = wrapsSelection(item.snippet) ? messages.wrapsSelection : messages.insertsAfter

  return pick(describe(name), lang)
}
