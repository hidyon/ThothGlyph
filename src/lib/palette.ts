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
  /**
   * タブの先頭に出す記号1文字（0053）。読まずにタブを見分けるためのもので、
   * 翻訳は持たない（記号は言語で変わらない）。8つのタブで重複させないこと。
   */
  icon: string
  items: PaletteItem[]
}

/**
 * 公式タブのアイコン。公式は `formulas.ts` 側にあって `paletteGroups` に
 * 属さないので、8つ目のアイコンだけここに置く。
 */
export const FORMULA_TAB_ICON = 'ƒ'

export const paletteGroups: PaletteGroup[] = [
  {
    name: t('基本', 'Basic'),
    icon: '√',
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
    icon: 'α',
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
    icon: 'Ω',
    items: [
      { label: '\\Alpha', snippet: '\\Alpha ', title: t('Alpha（大文字。ラテン文字のAと同じ字形）', 'Alpha (uppercase, same shape as Latin A)') },
      { label: '\\Beta', snippet: '\\Beta ', title: t('Beta（大文字。ラテン文字のBと同じ字形）', 'Beta (uppercase, same shape as Latin B)') },
      { label: '\\Gamma', snippet: '\\Gamma ', title: t('Gamma（大文字）', 'Gamma (uppercase)') },
      { label: '\\Delta', snippet: '\\Delta ', title: t('Delta（大文字）', 'Delta (uppercase)') },
      { label: '\\Epsilon', snippet: '\\Epsilon ', title: t('Epsilon（大文字。ラテン文字のEと同じ字形）', 'Epsilon (uppercase, same shape as Latin E)') },
      { label: '\\Zeta', snippet: '\\Zeta ', title: t('Zeta（大文字。ラテン文字のZと同じ字形）', 'Zeta (uppercase, same shape as Latin Z)') },
      { label: '\\Eta', snippet: '\\Eta ', title: t('Eta（大文字。ラテン文字のHと同じ字形）', 'Eta (uppercase, same shape as Latin H)') },
      { label: '\\Theta', snippet: '\\Theta ', title: t('Theta（大文字）', 'Theta (uppercase)') },
      { label: '\\Iota', snippet: '\\Iota ', title: t('Iota（大文字。ラテン文字のIと同じ字形）', 'Iota (uppercase, same shape as Latin I)') },
      { label: '\\Kappa', snippet: '\\Kappa ', title: t('Kappa（大文字。ラテン文字のKと同じ字形）', 'Kappa (uppercase, same shape as Latin K)') },
      { label: '\\Lambda', snippet: '\\Lambda ', title: t('Lambda（大文字）', 'Lambda (uppercase)') },
      { label: '\\Mu', snippet: '\\Mu ', title: t('Mu（大文字。ラテン文字のMと同じ字形）', 'Mu (uppercase, same shape as Latin M)') },
      { label: '\\Nu', snippet: '\\Nu ', title: t('Nu（大文字。ラテン文字のNと同じ字形）', 'Nu (uppercase, same shape as Latin N)') },
      { label: '\\Xi', snippet: '\\Xi ', title: t('Xi（大文字）', 'Xi (uppercase)') },
      { label: '\\Omicron', snippet: '\\Omicron ', title: t('Omicron（大文字。ラテン文字のOと同じ字形）', 'Omicron (uppercase, same shape as Latin O)') },
      { label: '\\Pi', snippet: '\\Pi ', title: t('Pi（大文字）', 'Pi (uppercase)') },
      { label: '\\Rho', snippet: '\\Rho ', title: t('Rho（大文字。ラテン文字のPと同じ字形）', 'Rho (uppercase, same shape as Latin P)') },
      { label: '\\Sigma', snippet: '\\Sigma ', title: t('Sigma（大文字）', 'Sigma (uppercase)') },
      { label: '\\Tau', snippet: '\\Tau ', title: t('Tau（大文字。ラテン文字のTと同じ字形）', 'Tau (uppercase, same shape as Latin T)') },
      { label: '\\Upsilon', snippet: '\\Upsilon ', title: t('Upsilon（大文字）', 'Upsilon (uppercase)') },
      { label: '\\Phi', snippet: '\\Phi ', title: t('Phi（大文字）', 'Phi (uppercase)') },
      { label: '\\Chi', snippet: '\\Chi ', title: t('Chi（大文字。ラテン文字のXと同じ字形）', 'Chi (uppercase, same shape as Latin X)') },
      { label: '\\Psi', snippet: '\\Psi ', title: t('Psi（大文字）', 'Psi (uppercase)') },
      { label: '\\Omega', snippet: '\\Omega ', title: t('Omega（大文字）', 'Omega (uppercase)') },
    ],
  },
  {
    name: t('演算子', 'Operators'),
    icon: 'Σ',
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
      // ---- 統計・確率（0064）----
      // 分布名（\mathcal{N} など）は厳密には演算子ではないが、P・E・Var・Cov と
      // 並べたほうが探す側の手数が少ない。タブを増やすと検索欄が2行目に落ちるため
      // 新しいタブは作らない（仕様の実測）。
      //
      // \overline{X} を装飾のある「基本」ではなくここに置いたのは、**基本タブの
      // 9件目にすると読み込み中だけパレットが41px高くなる**ため（ラベルのソース
      // 表示は文字数が多く、幅600pxで1行増える。0024の「読み込み前後で飛ばない」が
      // 落ちた）。標本平均・補集合として足した記号なので、統計の側にあって困らない。
      {
        label: '\\overline{X}',
        snippet: `\\overline{${CURSOR_TOKEN}}`,
        title: t('上線（標本平均・補集合）', 'Overline (sample mean, complement)'),
      },
      { label: 'P(A)', snippet: `P(${CURSOR_TOKEN})`, title: t('確率', 'Probability') },
      { label: '\\mathrm{E}[X]', snippet: `\\mathrm{E}[${CURSOR_TOKEN}]`, title: t('期待値', 'Expected value') },
      { label: '\\mathrm{Var}(X)', snippet: `\\mathrm{Var}(${CURSOR_TOKEN})`, title: t('分散', 'Variance') },
      {
        label: '\\mathrm{Cov}(X, Y)',
        snippet: `\\mathrm{Cov}(${CURSOR_TOKEN}, )`,
        title: t('共分散', 'Covariance'),
      },
      {
        label: '\\mathcal{N}(\\mu, \\sigma^2)',
        snippet: `\\mathcal{N}(${CURSOR_TOKEN}, )`,
        title: t('正規分布', 'Normal distribution'),
      },
      {
        label: '\\mathrm{Bin}(n, p)',
        snippet: `\\mathrm{Bin}(${CURSOR_TOKEN}, )`,
        title: t('二項分布', 'Binomial distribution'),
      },
      { label: '\\chi^2', snippet: '\\chi^2 ', title: t('カイ二乗', 'Chi-squared') },
      { label: '\\binom{n}{k}', snippet: `\\binom{${CURSOR_TOKEN}}{}`, title: t('二項係数', 'Binomial coefficient') },
      // ---- 集合（0064）----
      { label: '\\cup', snippet: '\\cup ', title: t('和集合', 'Union') },
      { label: '\\cap', snippet: '\\cap ', title: t('共通部分', 'Intersection') },
      { label: '\\setminus', snippet: '\\setminus ', title: t('差集合', 'Set difference') },
      {
        label: '\\bigcup_{i=1}^{n}',
        snippet: `\\bigcup_{${CURSOR_TOKEN}}^{}`,
        title: t('和集合（添字つき）', 'Union (indexed)'),
      },
      {
        label: '\\bigcap_{i=1}^{n}',
        snippet: `\\bigcap_{${CURSOR_TOKEN}}^{}`,
        title: t('共通部分（添字つき）', 'Intersection (indexed)'),
      },
    ],
  },
  {
    name: t('関係子', 'Relations'),
    icon: '≠',
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
      // ---- 統計・確率（0064）----
      // tooltipは記号の呼び名ではなく「使う場面の名前」にする。検索（0011）が
      // 照合するのは label と title だけなので、\sim を「チルダ」と書くと
      // 「分布に従う」で引けない。
      { label: '\\sim', snippet: '\\sim ', title: t('分布に従う', 'Distributed as') },
      { label: '\\mid', snippet: '\\mid ', title: t('条件付き（縦棒）', 'Conditional (mid)') },
      { label: '\\perp', snippet: '\\perp ', title: t('独立・垂直', 'Independent, perpendicular') },
      {
        label: '\\xrightarrow{d}',
        snippet: `\\xrightarrow{${CURSOR_TOKEN}}`,
        title: t('収束（矢印の上に記号）', 'Convergence (labeled arrow)'),
      },
      // ---- 集合・論理（0064）----
      { label: '\\notin', snippet: '\\notin ', title: t('属さない', 'Not an element of') },
      { label: '\\subseteq', snippet: '\\subseteq ', title: t('部分集合（等号つき）', 'Subset or equal') },
      { label: '\\supset', snippet: '\\supset ', title: t('含む', 'Superset') },
      { label: '\\emptyset', snippet: '\\emptyset ', title: t('空集合', 'Empty set') },
      { label: '\\mathbb{R}', snippet: '\\mathbb{R} ', title: t('実数全体', 'Real numbers') },
      { label: '\\land', snippet: '\\land ', title: t('かつ', 'Logical and') },
      { label: '\\lor', snippet: '\\lor ', title: t('または', 'Logical or') },
      { label: '\\neg', snippet: '\\neg ', title: t('否定', 'Negation') },
      { label: '\\therefore', snippet: '\\therefore ', title: t('ゆえに', 'Therefore') },
      { label: '\\because', snippet: '\\because ', title: t('なぜならば', 'Because') },
    ],
  },
  {
    name: t('括弧・構造', 'Brackets & structures'),
    icon: '{}',
    items: [
      // ---- 装飾・書体（0068）----
      // 名前は `括弧・構造` のままにしてある。`括弧・装飾・構造` へ変えると
      // 英語表示で横帯の全幅（〜1199px）で検索欄が2行目に落ち、+34px奪うため
      // （仕様の実測）。探す側は検索で引く前提で、tooltipに使う場面を入れている。
      //
      // 装飾の同族（\bar \vec \hat）がある `基本` グループに置けないのは、
      // **基本が8件でちょうど1行の端**にいるため。1件でも足すと読み込み中だけ
      // 2行になって0032の蓋に達し、KaTeXが届いたときに41px飛ぶ（0064で踏んだ罠と同じ）。
      // 飛びを消すには19件まで増やす必要があり、幅900pxで+53pxになる。
      { label: '\\tilde{x}', snippet: `\\tilde{${CURSOR_TOKEN}}`, title: t('チルダ', 'Tilde') },
      {
        label: '\\dot{x}',
        snippet: `\\dot{${CURSOR_TOKEN}}`,
        title: t('点1つ（時間微分）', 'Dot (time derivative)'),
      },
      {
        label: '\\ddot{x}',
        snippet: `\\ddot{${CURSOR_TOKEN}}`,
        title: t('点2つ（2階の時間微分）', 'Double dot'),
      },
      {
        label: '\\overset{a}{=}',
        snippet: `\\overset{${CURSOR_TOKEN}}{=}`,
        title: t('上に載せる（等号の上に根拠）', 'Overset'),
      },
      {
        label: '\\underset{a}{=}',
        snippet: `\\underset{${CURSOR_TOKEN}}{=}`,
        title: t('下に載せる', 'Underset'),
      },
      {
        label: '\\underbrace{x}_{a}',
        snippet: `\\underbrace{${CURSOR_TOKEN}}_{}`,
        title: t('下の波括弧（説明を付ける）', 'Underbrace'),
      },
      // 書体は「中身を自分で決める入れ物」。0064で入れた \mathcal{N}（正規分布）や
      // \mathbb{R}（実数全体）は完成した記号で、用途が違うので両方残す。
      // 検索では並んで出るため、tooltipで区別する。
      {
        label: '\\mathcal{F}',
        snippet: `\\mathcal{${CURSOR_TOKEN}}`,
        title: t('筆記体（集合・変換）', 'Calligraphic'),
      },
      {
        label: '\\mathbb{N}',
        snippet: `\\mathbb{${CURSOR_TOKEN}}`,
        title: t('白抜き（数の集合）', 'Blackboard bold'),
      },
      {
        label: '\\mathrm{d}',
        snippet: `\\mathrm{${CURSOR_TOKEN}}`,
        title: t('立体（単位・演算子）', 'Roman (upright)'),
      },
      {
        label: '\\mathbf{v}',
        snippet: `\\mathbf{${CURSOR_TOKEN}}`,
        title: t('太字（ベクトル・行列）', 'Bold'),
      },
      {
        label: '\\text{文字}',
        snippet: `\\text{${CURSOR_TOKEN}}`,
        title: t('数式の中の文章', 'Text in math'),
      },
      // ---- ここから0068より前からある6件 ----
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
    icon: '#',
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
