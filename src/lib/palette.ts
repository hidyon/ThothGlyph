/**
 * 記号パレットの定義。
 *
 * UIはこのデータを描画するだけなので、記号を増やすときはここに1行足せばよい。
 * - `label`: ボタン上に表示するLaTeX（KaTeXで描画される）
 * - `snippet`: エディタに挿入される文字列
 * - snippet 中の CURSOR_TOKEN は「挿入後にカーソルを置く位置」を表す。
 *   省略した場合は挿入文字列の末尾にカーソルが移動する。
 */

export const CURSOR_TOKEN = '%CURSOR%'

export type PaletteItem = {
  /** ボタンに表示するLaTeX。 */
  label: string
  /** 挿入される文字列。 */
  snippet: string
  /** ボタンのtooltip。 */
  title: string
}

export type PaletteGroup = {
  name: string
  items: PaletteItem[]
}

export const paletteGroups: PaletteGroup[] = [
  {
    name: '基本',
    items: [
      { label: '\\frac{a}{b}', snippet: `\\frac{${CURSOR_TOKEN}}{}`, title: '分数' },
      { label: '\\sqrt{x}', snippet: `\\sqrt{${CURSOR_TOKEN}}`, title: '平方根' },
      { label: '\\sqrt[n]{x}', snippet: `\\sqrt[${CURSOR_TOKEN}]{}`, title: 'n乗根' },
      { label: 'x^{n}', snippet: `^{${CURSOR_TOKEN}}`, title: '上付き（指数）' },
      { label: 'x_{i}', snippet: `_{${CURSOR_TOKEN}}`, title: '下付き（添字）' },
      { label: '\\bar{x}', snippet: `\\bar{${CURSOR_TOKEN}}`, title: 'バー' },
      { label: '\\vec{v}', snippet: `\\vec{${CURSOR_TOKEN}}`, title: 'ベクトル' },
      { label: '\\hat{x}', snippet: `\\hat{${CURSOR_TOKEN}}`, title: 'ハット' },
    ],
  },
  {
    name: 'ギリシャ文字',
    items: [
      { label: '\\alpha', snippet: '\\alpha ', title: 'alpha' },
      { label: '\\beta', snippet: '\\beta ', title: 'beta' },
      { label: '\\gamma', snippet: '\\gamma ', title: 'gamma' },
      { label: '\\delta', snippet: '\\delta ', title: 'delta' },
      { label: '\\varepsilon', snippet: '\\varepsilon ', title: 'epsilon' },
      { label: '\\theta', snippet: '\\theta ', title: 'theta' },
      { label: '\\lambda', snippet: '\\lambda ', title: 'lambda' },
      { label: '\\mu', snippet: '\\mu ', title: 'mu' },
      { label: '\\pi', snippet: '\\pi ', title: 'pi' },
      { label: '\\sigma', snippet: '\\sigma ', title: 'sigma' },
      { label: '\\phi', snippet: '\\phi ', title: 'phi' },
      { label: '\\omega', snippet: '\\omega ', title: 'omega' },
      { label: '\\Gamma', snippet: '\\Gamma ', title: 'Gamma（大文字）' },
      { label: '\\Delta', snippet: '\\Delta ', title: 'Delta（大文字）' },
      { label: '\\Theta', snippet: '\\Theta ', title: 'Theta（大文字）' },
      { label: '\\Omega', snippet: '\\Omega ', title: 'Omega（大文字）' },
    ],
  },
  {
    name: '演算子',
    items: [
      { label: '\\sum_{i=1}^{n}', snippet: `\\sum_{${CURSOR_TOKEN}}^{}`, title: '総和' },
      { label: '\\prod_{i=1}^{n}', snippet: `\\prod_{${CURSOR_TOKEN}}^{}`, title: '総乗' },
      { label: '\\int_{a}^{b}', snippet: `\\int_{${CURSOR_TOKEN}}^{}`, title: '積分' },
      { label: '\\iint', snippet: '\\iint ', title: '二重積分' },
      { label: '\\oint', snippet: '\\oint ', title: '周回積分' },
      { label: '\\lim_{x \\to 0}', snippet: `\\lim_{${CURSOR_TOKEN} \\to }`, title: '極限' },
      { label: '\\partial', snippet: '\\partial ', title: '偏微分' },
      { label: '\\nabla', snippet: '\\nabla ', title: 'ナブラ' },
      { label: '\\pm', snippet: '\\pm ', title: 'プラスマイナス' },
      { label: '\\times', snippet: '\\times ', title: '乗算' },
      { label: '\\div', snippet: '\\div ', title: '除算' },
      { label: '\\cdot', snippet: '\\cdot ', title: 'ドット積' },
    ],
  },
  {
    name: '関係子',
    items: [
      { label: '\\leq', snippet: '\\leq ', title: '以下' },
      { label: '\\geq', snippet: '\\geq ', title: '以上' },
      { label: '\\neq', snippet: '\\neq ', title: '等しくない' },
      { label: '\\approx', snippet: '\\approx ', title: 'ほぼ等しい' },
      { label: '\\equiv', snippet: '\\equiv ', title: '合同' },
      { label: '\\propto', snippet: '\\propto ', title: '比例' },
      { label: '\\in', snippet: '\\in ', title: '属する' },
      { label: '\\subset', snippet: '\\subset ', title: '部分集合' },
      { label: '\\to', snippet: '\\to ', title: '右矢印' },
      { label: '\\Rightarrow', snippet: '\\Rightarrow ', title: 'ならば' },
      { label: '\\iff', snippet: '\\iff ', title: '同値' },
      { label: '\\infty', snippet: '\\infty ', title: '無限大' },
      { label: '\\forall', snippet: '\\forall ', title: '全称' },
      { label: '\\exists', snippet: '\\exists ', title: '存在' },
    ],
  },
  {
    name: '括弧・構造',
    items: [
      {
        label: '\\left( x \\right)',
        snippet: `\\left( ${CURSOR_TOKEN} \\right)`,
        title: '自動サイズの丸括弧',
      },
      {
        label: '\\left\\{ x \\right\\}',
        snippet: `\\left\\{ ${CURSOR_TOKEN} \\right\\}`,
        title: '自動サイズの波括弧',
      },
      {
        label: '\\left| x \\right|',
        snippet: `\\left| ${CURSOR_TOKEN} \\right|`,
        title: '絶対値',
      },
      {
        label: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
        snippet: `\\begin{pmatrix}\n${CURSOR_TOKEN} & \\\\\n & \n\\end{pmatrix}`,
        title: '2x2行列',
      },
      {
        label: '\\begin{cases} a \\\\ b \\end{cases}',
        snippet: `\\begin{cases}\n${CURSOR_TOKEN} & \\\\\n & \n\\end{cases}`,
        title: '場合分け',
      },
      {
        label: '\\begin{aligned} a &= b \\end{aligned}',
        snippet: `\\begin{aligned}\n${CURSOR_TOKEN} &= \\\\\n&= \n\\end{aligned}`,
        title: '複数行の式（=で揃える）',
      },
    ],
  },
  {
    name: 'Markdown',
    items: [
      { label: '\\text{\\$x\\$}', snippet: `$${CURSOR_TOKEN}$`, title: 'インライン数式' },
      {
        label: '\\text{\\$\\$x\\$\\$}',
        snippet: `\n$$\n${CURSOR_TOKEN}\n$$\n`,
        title: 'ブロック数式（中央寄せ）',
      },
      { label: '\\text{見出し}', snippet: `## ${CURSOR_TOKEN}`, title: '見出し' },
      { label: '\\textbf{太字}', snippet: `**${CURSOR_TOKEN}**`, title: '太字' },
      { label: '\\textit{斜体}', snippet: `*${CURSOR_TOKEN}*`, title: '斜体' },
      { label: '\\text{箇条書き}', snippet: `- ${CURSOR_TOKEN}`, title: '箇条書き' },
    ],
  },
]

/**
 * このスニペットが選択範囲を囲むか。
 *
 * CURSOR_TOKEN の有無がそのまま「囲めるかどうか」なので、62件のitemに
 * 手で印を付けずに導出する（記号の追加を1行で済ませる約束を崩さないため）。
 */
export function wrapsSelection(snippet: string): boolean {
  return snippet.includes(CURSOR_TOKEN)
}

/**
 * ボタンのtooltipに出す文言。選択範囲があるときに何が起きるかを、
 * 押す前に読めるようにする。
 */
export function describeInsertion(item: PaletteItem): string {
  const behavior = wrapsSelection(item.snippet)
    ? '選択範囲を囲む'
    : '選択範囲の後ろに挿入'

  return `${item.title}（${behavior}）`
}
