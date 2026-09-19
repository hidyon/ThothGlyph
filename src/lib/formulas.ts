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

import { CURSOR_TOKEN } from './palette'

export type Formula = {
  /** ボタンに出す日本語の名前。 */
  name: string
  /** ボタンに描画して見せるLaTeX。挿入される式と同じもの。 */
  preview: string
  /** 挿入される文字列。CURSOR_TOKEN をちょうど1つ含む。 */
  snippet: string
}

export type FormulaGroup = {
  name: string
  formulas: Formula[]
}

/**
 * 公式はブロック数式として挿入する。挿入した瞬間にプレビューで
 * 描画された形が見えるほうが、合っているかを確かめやすい。
 */
const block = (latex: string) => `\n$$\n${CURSOR_TOKEN}${latex}\n$$\n`

/** name と preview から1件作る。snippet は preview から組み立てる。 */
const formula = (name: string, preview: string): Formula => ({
  name,
  preview,
  snippet: block(preview),
})

export const formulaGroups: FormulaGroup[] = [
  {
    name: '方程式',
    formulas: [
      formula('解の公式', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'),
      formula('判別式', 'D = b^2 - 4ac'),
      formula('解と係数の関係', '\\alpha + \\beta = -\\frac{b}{a}, \\quad \\alpha\\beta = \\frac{c}{a}'),
      formula('因数分解（2乗の差）', 'a^2 - b^2 = (a + b)(a - b)'),
      formula('展開（和の2乗）', '(a + b)^2 = a^2 + 2ab + b^2'),
    ],
  },
  {
    name: '三角比',
    formulas: [
      formula('相互関係', '\\sin^2 \\theta + \\cos^2 \\theta = 1'),
      formula('正弦定理', '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C} = 2R'),
      formula('余弦定理', 'c^2 = a^2 + b^2 - 2ab \\cos C'),
      formula('加法定理（sin）', '\\sin(\\alpha + \\beta) = \\sin\\alpha\\cos\\beta + \\cos\\alpha\\sin\\beta'),
      formula('加法定理（cos）', '\\cos(\\alpha + \\beta) = \\cos\\alpha\\cos\\beta - \\sin\\alpha\\sin\\beta'),
    ],
  },
  {
    name: '三角関数',
    formulas: [
      formula('2倍角（sin）', '\\sin 2\\theta = 2 \\sin\\theta \\cos\\theta'),
      formula('2倍角（cos）', '\\cos 2\\theta = 1 - 2\\sin^2\\theta'),
      formula('半角（sin²）', '\\sin^2\\frac{\\theta}{2} = \\frac{1 - \\cos\\theta}{2}'),
      formula('和積（sinの和）', '\\sin A + \\sin B = 2 \\sin\\frac{A + B}{2} \\cos\\frac{A - B}{2}'),
      formula('三角関数の合成', 'a\\sin\\theta + b\\cos\\theta = \\sqrt{a^2 + b^2}\\,\\sin(\\theta + \\alpha)'),
    ],
  },
  {
    name: '指数・対数',
    formulas: [
      formula('指数法則（積）', 'a^m a^n = a^{m + n}'),
      formula('指数法則（べき）', '(a^m)^n = a^{mn}'),
      formula('対数の積', '\\log_a MN = \\log_a M + \\log_a N'),
      formula('対数の商', '\\log_a \\frac{M}{N} = \\log_a M - \\log_a N'),
      formula('底の変換', '\\log_a b = \\frac{\\log_c b}{\\log_c a}'),
    ],
  },
  {
    name: '数列',
    formulas: [
      formula('等差数列の一般項', 'a_n = a_1 + (n - 1)d'),
      formula('等差数列の和', 'S_n = \\frac{n(a_1 + a_n)}{2}'),
      formula('等比数列の一般項', 'a_n = a_1 r^{n - 1}'),
      formula('等比数列の和', 'S_n = \\frac{a_1(1 - r^n)}{1 - r}'),
      formula('Σk の公式', '\\sum_{k=1}^{n} k = \\frac{n(n + 1)}{2}'),
    ],
  },
  {
    name: '微分・積分',
    formulas: [
      formula('微分の定義', "f'(x) = \\lim_{h \\to 0} \\frac{f(x + h) - f(x)}{h}"),
      formula('べき乗の微分', "(x^n)' = n x^{n - 1}"),
      formula('積の微分', "(fg)' = f'g + fg'"),
      formula('べき乗の積分', '\\int x^n \\, dx = \\frac{x^{n + 1}}{n + 1} + C'),
      formula('定積分と面積', 'S = \\int_a^b f(x) \\, dx'),
    ],
  },
  {
    name: 'ベクトル',
    formulas: [
      formula('内積', '\\vec{a} \\cdot \\vec{b} = |\\vec{a}||\\vec{b}| \\cos\\theta'),
      formula('なす角', '\\cos\\theta = \\frac{\\vec{a} \\cdot \\vec{b}}{|\\vec{a}||\\vec{b}|}'),
      formula('大きさ（成分）', '|\\vec{a}| = \\sqrt{a_1^2 + a_2^2}'),
      formula('平行条件', '\\vec{b} = k\\vec{a} \\quad (k \\neq 0)'),
      formula('内分点', '\\vec{p} = \\frac{n\\vec{a} + m\\vec{b}}{m + n}'),
    ],
  },
  {
    name: '図形と方程式',
    formulas: [
      formula('2点間の距離', 'd = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}'),
      formula('点と直線の距離', 'd = \\frac{|ax_0 + by_0 + c|}{\\sqrt{a^2 + b^2}}'),
      formula('円の方程式', '(x - a)^2 + (y - b)^2 = r^2'),
      formula('直線の方程式', 'y - y_1 = m(x - x_1)'),
      formula('円の接線', 'x_1 x + y_1 y = r^2'),
    ],
  },
  {
    name: '確率・統計',
    formulas: [
      formula('順列', '{}_n P_r = \\frac{n!}{(n - r)!}'),
      formula('組合せ', '{}_n C_r = \\frac{n!}{r!(n - r)!}'),
      formula('余事象', 'P(\\overline{A}) = 1 - P(A)'),
      formula('条件付き確率', 'P_A(B) = \\frac{P(A \\cap B)}{P(A)}'),
      formula('期待値', 'E(X) = \\sum_{k=1}^{n} x_k p_k'),
    ],
  },
  {
    name: '複素数',
    formulas: [
      formula('絶対値', '|z| = \\sqrt{a^2 + b^2}'),
      formula('共役との積', 'z\\bar{z} = |z|^2'),
      formula('極形式', 'z = r(\\cos\\theta + i\\sin\\theta)'),
      formula('ド・モアブルの定理', '(\\cos\\theta + i\\sin\\theta)^n = \\cos n\\theta + i\\sin n\\theta'),
      formula('和の共役', '\\overline{z + w} = \\bar{z} + \\bar{w}'),
    ],
  },
  {
    name: '微分・積分（応用）',
    formulas: [
      formula('商の微分', "\\left(\\frac{f}{g}\\right)' = \\frac{f'g - fg'}{g^2}"),
      formula('合成関数の微分', '\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}'),
      formula('部分積分', "\\int f g' \\, dx = fg - \\int f' g \\, dx"),
      formula('置換積分', "\\int f(g(x)) g'(x) \\, dx = \\int f(u) \\, du"),
      formula('回転体の体積', 'V = \\pi \\int_a^b \\{f(x)\\}^2 \\, dx'),
    ],
  },
  {
    name: '極限・不等式',
    formulas: [
      formula('sin x / x の極限', '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'),
      formula('e の定義', 'e = \\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n'),
      formula('二項定理', '(a + b)^n = \\sum_{k=0}^{n} {}_n C_k a^{n-k} b^k'),
      formula('相加相乗平均', '\\frac{a + b}{2} \\geq \\sqrt{ab}'),
      formula('三角不等式', '|a + b| \\leq |a| + |b|'),
    ],
  },
]

/** 全グループを平らにした一覧。テストと検索で使う。 */
export const allFormulas = formulaGroups.flatMap((group) => group.formulas)
