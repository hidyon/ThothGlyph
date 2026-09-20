import type { Lang } from './lib/i18n'

/** 初回起動時に入っている文書。何ができるかが一目で分かることを狙う。 */
const japanese = `# 二次方程式の解の公式

二次方程式 $ax^2 + bx + c = 0$（ただし $a \\neq 0$）の解は次で与えられる。

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

判別式 $D = b^2 - 4ac$ の符号で解の種類が決まる。

- $D > 0$ のとき、異なる2つの実数解
- $D = 0$ のとき、重解
- $D < 0$ のとき、共役な2つの虚数解

判別式の符号は、グラフが $x$ 軸と何回交わるかに対応する。$D > 0$ の例を描いてみる。

\`\`\`graph
y = x^2 - 2x
x: -2..4
\`\`\`

## 導出

$$
\\begin{aligned}
ax^2 + bx + c &= 0 \\\\
x^2 + \\frac{b}{a}x &= -\\frac{c}{a} \\\\
\\left( x + \\frac{b}{2a} \\right)^2 &= \\frac{b^2 - 4ac}{4a^2}
\\end{aligned}
$$

上のパレットのボタンを押すと、カーソル位置に数式コマンドが入ります。
`

/** 英語版。訳ではなく、同じ狙い（数式・箇条書き・複数行の式）を英語で満たす文書。 */
const english = `# The quadratic formula

The solutions of $ax^2 + bx + c = 0$ (with $a \\neq 0$) are given by

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

The sign of the discriminant $D = b^2 - 4ac$ tells you what kind of roots you get.

- $D > 0$: two distinct real roots
- $D = 0$: one repeated root
- $D < 0$: two complex conjugate roots

The sign of $D$ tells you how often the graph meets the $x$-axis. Here is a case with $D > 0$.

\`\`\`graph
y = x^2 - 2x
x: -2..4
\`\`\`

## Derivation

$$
\\begin{aligned}
ax^2 + bx + c &= 0 \\\\
x^2 + \\frac{b}{a}x &= -\\frac{c}{a} \\\\
\\left( x + \\frac{b}{2a} \\right)^2 &= \\frac{b^2 - 4ac}{4a^2}
\\end{aligned}
$$

Press a button in the palette above to insert a math command at the cursor.
`

/**
 * 表示言語に合わせたサンプル文書。
 *
 * 利用者が書いた文書は翻訳しないので、これを使うのは保存された文書がない
 * 初回訪問のときだけ。言語を切り替えたときに差し替えると、書いたものが消える。
 */
export function sampleDocument(lang: Lang): string {
  return lang === 'ja' ? japanese : english
}
