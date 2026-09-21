/**
 * 公式パレットの定義。
 *
 * 記号（`palette.ts`）と分けているのは、持つ情報が違うため。記号は「1つの文字」で
 * ボタンにはその文字だけを出せばよいが、公式は「名前のついた式」で、
 * 名前と式の両方を見せないと選べない。
 *
 * 公式を増やすときはこのファイルの配列に1件足すだけで済ませる（データ駆動）。
 *
 * CURSOR_TOKEN は**最初に書き換えたくなる記号の直前**に置く。置き換える形
 * （`%CURSOR% = \frac{…}` のように記号そのものを消す形）にしないのは、
 * トークンを取り除いた文字列がそのままLaTeXとして正しくなければならないため。
 * たとえば `%CURSOR%^2 = …` は、トークンを消すと `^2 = …` になって壊れる。
 */

import type { Text } from './i18n'
import { t } from './i18n'
import { CURSOR_TOKEN } from './palette'

export type Formula = {
  /** ボタンに出す名前。 */
  name: Text
  /** ボタンに描画して見せるLaTeX。挿入される式と同じもの。 */
  preview: string
  /** 挿入される文字列。CURSOR_TOKEN をちょうど1つ含む。 */
  snippet: string
}

export type FormulaGroup = {
  name: Text
  formulas: Formula[]
}

/**
 * 公式はブロック数式として挿入する。挿入した瞬間にプレビューで
 * 描画された形が見えるほうが、合っているかを確かめやすい。
 */
const block = (latex: string) => `\n$$\n${CURSOR_TOKEN}${latex}\n$$\n`

/** name と preview から1件作る。snippet は preview から組み立てる。 */
const formula = (name: Text, preview: string): Formula => ({
  name,
  preview,
  snippet: block(preview),
})

export const formulaGroups: FormulaGroup[] = [
  {
    name: t('方程式', 'Equations'),
    formulas: [
      formula(t('解の公式', 'Quadratic formula'), 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'),
      formula(t('判別式', 'Discriminant'), 'D = b^2 - 4ac'),
      formula(t('解と係数の関係', "Vieta's formulas"), '\\alpha + \\beta = -\\frac{b}{a}, \\quad \\alpha\\beta = \\frac{c}{a}'),
      formula(t('因数分解（2乗の差）', 'Difference of squares'), 'a^2 - b^2 = (a + b)(a - b)'),
      formula(t('展開（和の2乗）', 'Square of a sum'), '(a + b)^2 = a^2 + 2ab + b^2'),
    ],
  },
  {
    name: t('三角比', 'Trigonometric ratios'),
    formulas: [
      formula(t('相互関係', 'Pythagorean identity'), '\\sin^2 \\theta + \\cos^2 \\theta = 1'),
      formula(t('正弦定理', 'Law of sines'), '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C} = 2R'),
      formula(t('余弦定理', 'Law of cosines'), 'c^2 = a^2 + b^2 - 2ab \\cos C'),
      formula(t('加法定理（sin）', 'Angle addition (sin)'), '\\sin(\\alpha + \\beta) = \\sin\\alpha\\cos\\beta + \\cos\\alpha\\sin\\beta'),
      formula(t('加法定理（cos）', 'Angle addition (cos)'), '\\cos(\\alpha + \\beta) = \\cos\\alpha\\cos\\beta - \\sin\\alpha\\sin\\beta'),
    ],
  },
  {
    name: t('三角関数', 'Trigonometric functions'),
    formulas: [
      formula(t('2倍角（sin）', 'Double angle (sin)'), '\\sin 2\\theta = 2 \\sin\\theta \\cos\\theta'),
      formula(t('2倍角（cos）', 'Double angle (cos)'), '\\cos 2\\theta = 1 - 2\\sin^2\\theta'),
      formula(t('半角（sin²）', 'Half angle (sin²)'), '\\sin^2\\frac{\\theta}{2} = \\frac{1 - \\cos\\theta}{2}'),
      formula(t('和積（sinの和）', 'Sum to product (sin)'), '\\sin A + \\sin B = 2 \\sin\\frac{A + B}{2} \\cos\\frac{A - B}{2}'),
      formula(t('三角関数の合成', 'Harmonic addition'), 'a\\sin\\theta + b\\cos\\theta = \\sqrt{a^2 + b^2}\\,\\sin(\\theta + \\alpha)'),
    ],
  },
  {
    name: t('指数・対数', 'Exponents & logarithms'),
    formulas: [
      formula(t('指数法則（積）', 'Product of powers'), 'a^m a^n = a^{m + n}'),
      formula(t('指数法則（べき）', 'Power of a power'), '(a^m)^n = a^{mn}'),
      formula(t('対数の積', 'Logarithm of a product'), '\\log_a MN = \\log_a M + \\log_a N'),
      formula(t('対数の商', 'Logarithm of a quotient'), '\\log_a \\frac{M}{N} = \\log_a M - \\log_a N'),
      formula(t('底の変換', 'Change of base'), '\\log_a b = \\frac{\\log_c b}{\\log_c a}'),
    ],
  },
  {
    name: t('数列', 'Sequences'),
    formulas: [
      formula(t('等差数列の一般項', 'Arithmetic sequence, nth term'), 'a_n = a_1 + (n - 1)d'),
      formula(t('等差数列の和', 'Arithmetic series sum'), 'S_n = \\frac{n(a_1 + a_n)}{2}'),
      formula(t('等比数列の一般項', 'Geometric sequence, nth term'), 'a_n = a_1 r^{n - 1}'),
      formula(t('等比数列の和', 'Geometric series sum'), 'S_n = \\frac{a_1(1 - r^n)}{1 - r}'),
      formula(t('Σk の公式', 'Sum of the first n integers'), '\\sum_{k=1}^{n} k = \\frac{n(n + 1)}{2}'),
    ],
  },
  {
    name: t('微分・積分', 'Calculus'),
    formulas: [
      formula(t('微分の定義', 'Definition of the derivative'), "f'(x) = \\lim_{h \\to 0} \\frac{f(x + h) - f(x)}{h}"),
      formula(t('べき乗の微分', 'Power rule (derivative)'), "(x^n)' = n x^{n - 1}"),
      formula(t('積の微分', 'Product rule'), "(fg)' = f'g + fg'"),
      formula(t('べき乗の積分', 'Power rule (integral)'), '\\int x^n \\, dx = \\frac{x^{n + 1}}{n + 1} + C'),
      formula(t('定積分と面積', 'Area under a curve'), 'S = \\int_a^b f(x) \\, dx'),
    ],
  },
  {
    name: t('ベクトル', 'Vectors'),
    formulas: [
      formula(t('内積', 'Dot product'), '\\vec{a} \\cdot \\vec{b} = |\\vec{a}||\\vec{b}| \\cos\\theta'),
      formula(t('なす角', 'Angle between vectors'), '\\cos\\theta = \\frac{\\vec{a} \\cdot \\vec{b}}{|\\vec{a}||\\vec{b}|}'),
      formula(t('大きさ（成分）', 'Magnitude (components)'), '|\\vec{a}| = \\sqrt{a_1^2 + a_2^2}'),
      formula(t('平行条件', 'Parallel condition'), '\\vec{b} = k\\vec{a} \\quad (k \\neq 0)'),
      formula(t('内分点', 'Internal division point'), '\\vec{p} = \\frac{n\\vec{a} + m\\vec{b}}{m + n}'),
    ],
  },
  {
    name: t('図形と方程式', 'Analytic geometry'),
    formulas: [
      formula(t('2点間の距離', 'Distance between two points'), 'd = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}'),
      formula(t('点と直線の距離', 'Point-to-line distance'), 'd = \\frac{|ax_0 + by_0 + c|}{\\sqrt{a^2 + b^2}}'),
      formula(t('円の方程式', 'Equation of a circle'), '(x - a)^2 + (y - b)^2 = r^2'),
      formula(t('直線の方程式', 'Equation of a line'), 'y - y_1 = m(x - x_1)'),
      formula(t('円の接線', 'Tangent to a circle'), 'x_1 x + y_1 y = r^2'),
    ],
  },
  {
    name: t('確率・統計', 'Probability & statistics'),
    formulas: [
      formula(t('順列', 'Permutations'), '{}_n P_r = \\frac{n!}{(n - r)!}'),
      formula(t('組合せ', 'Combinations'), '{}_n C_r = \\frac{n!}{r!(n - r)!}'),
      formula(t('余事象', 'Complement rule'), 'P(\\overline{A}) = 1 - P(A)'),
      formula(t('条件付き確率', 'Conditional probability'), 'P_A(B) = \\frac{P(A \\cap B)}{P(A)}'),
      formula(t('期待値', 'Expected value'), 'E(X) = \\sum_{k=1}^{n} x_k p_k'),
    ],
  },
  {
    name: t('複素数', 'Complex numbers'),
    formulas: [
      formula(t('絶対値', 'Modulus'), '|z| = \\sqrt{a^2 + b^2}'),
      formula(t('共役との積', 'Product with the conjugate'), 'z\\bar{z} = |z|^2'),
      formula(t('極形式', 'Polar form'), 'z = r(\\cos\\theta + i\\sin\\theta)'),
      formula(t('ド・モアブルの定理', "De Moivre's theorem"), '(\\cos\\theta + i\\sin\\theta)^n = \\cos n\\theta + i\\sin n\\theta'),
      formula(t('和の共役', 'Conjugate of a sum'), '\\overline{z + w} = \\bar{z} + \\bar{w}'),
    ],
  },
  {
    name: t('微分・積分（応用）', 'Calculus (advanced)'),
    formulas: [
      formula(t('商の微分', 'Quotient rule'), "\\left(\\frac{f}{g}\\right)' = \\frac{f'g - fg'}{g^2}"),
      formula(t('合成関数の微分', 'Chain rule'), '\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}'),
      formula(t('部分積分', 'Integration by parts'), "\\int f g' \\, dx = fg - \\int f' g \\, dx"),
      formula(t('置換積分', 'Integration by substitution'), "\\int f(g(x)) g'(x) \\, dx = \\int f(u) \\, du"),
      formula(t('回転体の体積', 'Volume of a solid of revolution'), 'V = \\pi \\int_a^b \\{f(x)\\}^2 \\, dx'),
    ],
  },
  {
    name: t('極限・不等式', 'Limits & inequalities'),
    formulas: [
      formula(t('sin x / x の極限', 'Limit of sin x / x'), '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'),
      formula(t('e の定義', 'Definition of e'), 'e = \\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n'),
      formula(t('二項定理', 'Binomial theorem'), '(a + b)^n = \\sum_{k=0}^{n} {}_n C_k a^{n-k} b^k'),
      formula(t('相加相乗平均', 'AM–GM inequality'), '\\frac{a + b}{2} \\geq \\sqrt{ab}'),
      formula(t('三角不等式', 'Triangle inequality'), '|a + b| \\leq |a| + |b|'),
    ],
  },
  // ---- ここから0064で足した3分類。既存の12分類は並びも中身も動かしていない。
  // 1分類を10件に太らせると横帯で1件あたり約60px増えるので、
  // 5件のまま分類を足すほうを採った（分類ごと約32px。仕様の実測）。
  {
    name: t('確率', 'Probability'),
    formulas: [
      formula(t('ベイズの定理', "Bayes' theorem"), 'P(A \\mid B) = \\frac{P(B \\mid A)\\, P(A)}{P(B)}'),
      formula(
        t('全確率の公式', 'Law of total probability'),
        'P(B) = \\sum_{i=1}^{n} P(B \\mid A_i)\\, P(A_i)',
      ),
      formula(
        t('独立なときの積', 'Product rule for independent events'),
        'P(A \\cap B) = P(A)\\, P(B)',
      ),
      formula(
        t('二項分布', 'Binomial distribution'),
        'P(X = k) = \\binom{n}{k} p^k (1 - p)^{n - k}',
      ),
      formula(
        t('正規分布の確率密度', 'Normal density'),
        'f(x) = \\frac{1}{\\sqrt{2\\pi}\\,\\sigma} \\exp\\left(-\\frac{(x - \\mu)^2}{2\\sigma^2}\\right)',
      ),
    ],
  },
  {
    name: t('期待値・分散', 'Expectation & variance'),
    formulas: [
      formula(
        t('期待値の線形性', 'Linearity of expectation'),
        '\\mathrm{E}(aX + b) = a\\,\\mathrm{E}(X) + b',
      ),
      formula(
        t('分散の定義', 'Variance'),
        '\\mathrm{Var}(X) = \\mathrm{E}(X^2) - \\{\\mathrm{E}(X)\\}^2',
      ),
      formula(
        t('共分散', 'Covariance'),
        '\\mathrm{Cov}(X, Y) = \\mathrm{E}(XY) - \\mathrm{E}(X)\\,\\mathrm{E}(Y)',
      ),
      formula(
        t('相関係数', 'Correlation coefficient'),
        'r = \\frac{\\mathrm{Cov}(X, Y)}{\\sqrt{\\mathrm{Var}(X)}\\sqrt{\\mathrm{Var}(Y)}}',
      ),
      formula(
        t('標準化', 'Standardization'),
        'Z = \\frac{X - \\mu}{\\sigma} \\sim \\mathcal{N}(0, 1)',
      ),
    ],
  },
  {
    name: t('集合と論理', 'Sets & logic'),
    formulas: [
      formula(
        t('ド・モルガンの法則', "De Morgan's laws"),
        '\\overline{A \\cup B} = \\overline{A} \\cap \\overline{B}',
      ),
      formula(
        t('包除原理', 'Inclusion-exclusion'),
        '|A \\cup B| = |A| + |B| - |A \\cap B|',
      ),
      formula(
        t('分配法則', 'Distributive law'),
        'A \\cap (B \\cup C) = (A \\cap B) \\cup (A \\cap C)',
      ),
      formula(
        t('対偶', 'Contraposition'),
        '(P \\Rightarrow Q) \\iff (\\neg Q \\Rightarrow \\neg P)',
      ),
      formula(
        t('全称の否定', 'Negation of a quantifier'),
        '\\neg \\forall x \\, P(x) \\iff \\exists x \\, \\neg P(x)',
      ),
    ],
  },
]

/** 全グループを平らにした一覧。テストと検索で使う。 */
export const allFormulas = formulaGroups.flatMap((group) => group.formulas)
