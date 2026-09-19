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
]

/** 全グループを平らにした一覧。テストと検索で使う。 */
export const allFormulas = formulaGroups.flatMap((group) => group.formulas)
