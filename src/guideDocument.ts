/**
 * 算式記載ガイド（0079）。ツールバーの「ガイド」で開くパネルの中身。
 *
 * 第1部は「目的から書く」13項目を手で書いたもの、第2部は
 * `lib/guideTable.ts` が組むコマンドの全件表。**ガイド自身がこのエディタの
 * 記法で書いたMarkdown**で、表示は本文と同じ `renderMarkdown` を通る。
 *
 * サンプル文書（`sampleDocument.ts`）と違い、編集中の文書には入らない。
 * 読むだけのものなので、カーソルや保存には一切関わらない。
 */

import { buildCommandTable } from './lib/guideTable'
import type { Lang } from './lib/i18n'

const japanese = `# 算式記載ガイド

数式は \`$…$\` で文中に、\`$$\` ではさんで独立した行に書く。
下は「何をしたいか」から引く早見で、うしろに対応コマンドの全件表がある。

## 第1部 目的から書く

### 1. 分数と根号

分数は \`\\frac{分子}{分母}\`、根号は \`\\sqrt{中身}\`、n乗根は \`\\sqrt[n]{中身}\`。
分数を大きく見せたいときは \`\\dfrac\`、小さくしたいときは \`\\tfrac\`。

$$
\\frac{a + b}{2} \\qquad \\sqrt{x^2 + y^2} \\qquad \\sqrt[3]{x} \\qquad \\dfrac{1}{2}
$$

### 2. 上付き・下付き

\`^\` が上付き（指数）、\`_\` が下付き（添字）。
2文字以上をまとめるときは \`{}\` で囲む（\`x^{10}\` と \`x^10\` は違う）。

$$
x^2 \\qquad a_i \\qquad x^{10} \\qquad a_{i+1} \\qquad x_i^2
$$

### 3. ギリシャ文字

読みをそのまま書く。\`\\alpha\` \`\\beta\` \`\\gamma\`。
大文字は先頭を大文字にする（\`\\Gamma\` \`\\Delta\`）。

$$
\\alpha \\quad \\beta \\quad \\gamma \\quad \\theta \\quad \\pi \\quad \\sigma \\quad \\omega
\\quad \\Gamma \\quad \\Delta \\quad \\Sigma \\quad \\Omega
$$

### 4. 大きな演算子（和・積・積分）

\`\\sum\` \`\\prod\` \`\\int\` に \`_\` と \`^\` で範囲を付ける。
ブロック数式では範囲が記号の上下に、文中では右肩に付く。

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2} \\qquad \\int_{0}^{1} x^2 \\, dx \\qquad \\prod_{i=1}^{n} a_i
$$

### 5. 括弧の大きさ

中身に合わせて伸ばすには \`\\left(\` と \`\\right)\` で挟む。
決まった大きさなら \`\\big\` \`\\Big\` \`\\bigg\` \`\\Bigg\`。

$$
\\left( \\frac{a}{b} \\right) \\qquad \\left[ \\sum_{k} x_k \\right] \\qquad
\\left\\{ x \\mid x > 0 \\right\\} \\qquad \\Bigl( x \\Bigr)
$$

### 6. 行列

\`$$\` の中で \`\\begin{pmatrix}\` … \`\\end{pmatrix}\`。
列は \`&\`、行の区切りは \`\\\\\`。括弧の形で \`bmatrix\`（角）、\`vmatrix\`（行列式）を使い分ける。

$$
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
\\qquad
\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}
\\qquad
\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}
$$

### 7. 場合分け

\`\\begin{cases}\` … \`\\end{cases}\`。各行に条件を \`&\` で続ける。

$$
|x| = \\begin{cases}
  x & (x \\geq 0) \\\\
  -x & (x < 0)
\\end{cases}
$$

### 8. 複数行の整列

\`\\begin{aligned}\` … \`\\end{aligned}\` で、\`&\` の位置を縦にそろえる。

$$
\\begin{aligned}
  (x + 1)^2 &= x^2 + 2x + 1 \\\\
            &= x(x + 2) + 1
\\end{aligned}
$$

### 9. 装飾とアクセント

1文字には \`\\bar\` \`\\hat\` \`\\vec\` \`\\dot\`、2文字以上に掛けるには
\`\\overline\` \`\\widehat\` \`\\overrightarrow\`。

$$
\\bar{x} \\quad \\hat{a} \\quad \\vec{v} \\quad \\dot{x} \\qquad
\\overline{AB} \\quad \\widehat{ABC} \\quad \\overrightarrow{AB}
$$

### 10. 書体

集合は \`\\mathbb\`、作用素や分布は \`\\mathcal\`、立体（ローマン）は \`\\mathrm\`、
太字は \`\\mathbf\`。関数名は \`\\sin\` のように既にあるものを使う。

$$
\\mathbb{R} \\quad \\mathcal{N}(\\mu, \\sigma^2) \\quad \\mathrm{d}x \\quad \\mathbf{A}
\\quad \\sin \\theta \\quad \\log x
$$

### 11. ブロック数式と \`$$\`

\`$…$\` は文中に収まる形、\`$$\` ではさむと中央寄せの独立した行になる。
\`$$\` は**行の先頭から**書く。

\`\`\`
文中の $E = mc^2$ はこうなる。

$$
E = mc^2
$$
\`\`\`

文中の $E = mc^2$ はこうなる。

$$
E = mc^2
$$

### 12. 式の番号と参照

ブロック数式の閉じ \`$$\` のうしろに \`{#eq-ラベル}\` を書くと、その式に番号が付く。
本文からは \`@eq-ラベル\` で参照でき、番号は上から順に振り直される。
**ラベルは英小文字・数字・\`-\` \`_\` だけ**（\`eq-\` で始める）。

\`\`\`
$$
a^2 + b^2 = c^2
$$ {#eq-pythagoras}

@eq-pythagoras より。
\`\`\`

$$
a^2 + b^2 = c^2
$$ {#eq-pythagoras}

@eq-pythagoras より。

この書き方はQuartoと同じ綴り。古い書き方（\`\\tag{名前}\` と
\`[(1)](#eq-名前)\`）も読めるが、新しく書くならこちらを使う。

### 13. 関数のグラフ

コードブロックの言語名を \`graph\` にすると、中身が関数として読まれて図になる。
\`y = 式\` を最大3本、範囲は \`x:\` \`y:\` で指定する。

\`\`\`\`
\`\`\`graph
y = x^2 - 2x
x: -3..5
\`\`\`
\`\`\`\`

\`\`\`graph
y = x^2 - 2x
x: -3..5
\`\`\`

## 第2部 コマンド一覧

KaTeXが対応するコマンドの全件。左に書くもの、まん中に描かれる姿、
右は名前が分かっているものだけ。引数の要るものは例の形で並べてある。

`

const english = `# Math Notation Guide

Write math inline with \`$…$\`, or on its own line between \`$$\`.
Below is a quick reference by purpose, followed by the full command list.

## Part 1: By purpose

### 1. Fractions and roots

\`\\frac{numerator}{denominator}\`, \`\\sqrt{x}\`, and \`\\sqrt[n]{x}\` for nth roots.
Use \`\\dfrac\` for a larger fraction and \`\\tfrac\` for a smaller one.

$$
\\frac{a + b}{2} \\qquad \\sqrt{x^2 + y^2} \\qquad \\sqrt[3]{x} \\qquad \\dfrac{1}{2}
$$

### 2. Superscripts and subscripts

\`^\` raises, \`_\` lowers. Wrap more than one character in \`{}\`
(\`x^{10}\` is not the same as \`x^10\`).

$$
x^2 \\qquad a_i \\qquad x^{10} \\qquad a_{i+1} \\qquad x_i^2
$$

### 3. Greek letters

Spell the name: \`\\alpha\`, \`\\beta\`, \`\\gamma\`.
Capitalise the first letter for uppercase (\`\\Gamma\`, \`\\Delta\`).

$$
\\alpha \\quad \\beta \\quad \\gamma \\quad \\theta \\quad \\pi \\quad \\sigma \\quad \\omega
\\quad \\Gamma \\quad \\Delta \\quad \\Sigma \\quad \\Omega
$$

### 4. Large operators (sums, products, integrals)

Add limits to \`\\sum\`, \`\\prod\` and \`\\int\` with \`_\` and \`^\`.
In display math the limits sit above and below; inline they sit beside.

$$
\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2} \\qquad \\int_{0}^{1} x^2 \\, dx \\qquad \\prod_{i=1}^{n} a_i
$$

### 5. Sizing brackets

\`\\left(\` and \`\\right)\` grow with their contents.
For a fixed size use \`\\big\`, \`\\Big\`, \`\\bigg\` or \`\\Bigg\`.

$$
\\left( \\frac{a}{b} \\right) \\qquad \\left[ \\sum_{k} x_k \\right] \\qquad
\\left\\{ x \\mid x > 0 \\right\\} \\qquad \\Bigl( x \\Bigr)
$$

### 6. Matrices

Inside \`$$\`, use \`\\begin{pmatrix}\` … \`\\end{pmatrix}\`.
Separate columns with \`&\` and rows with \`\\\\\`. \`bmatrix\` gives square brackets,
\`vmatrix\` gives a determinant.

$$
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
\\qquad
\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}
\\qquad
\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}
$$

### 7. Cases

\`\\begin{cases}\` … \`\\end{cases}\`, with the condition after \`&\`.

$$
|x| = \\begin{cases}
  x & (x \\geq 0) \\\\
  -x & (x < 0)
\\end{cases}
$$

### 8. Aligning several lines

\`\\begin{aligned}\` … \`\\end{aligned}\` lines up everything at \`&\`.

$$
\\begin{aligned}
  (x + 1)^2 &= x^2 + 2x + 1 \\\\
            &= x(x + 2) + 1
\\end{aligned}
$$

### 9. Accents

For a single character: \`\\bar\`, \`\\hat\`, \`\\vec\`, \`\\dot\`.
Over several: \`\\overline\`, \`\\widehat\`, \`\\overrightarrow\`.

$$
\\bar{x} \\quad \\hat{a} \\quad \\vec{v} \\quad \\dot{x} \\qquad
\\overline{AB} \\quad \\widehat{ABC} \\quad \\overrightarrow{AB}
$$

### 10. Fonts

\`\\mathbb\` for number sets, \`\\mathcal\` for operators and distributions,
\`\\mathrm\` for upright text, \`\\mathbf\` for bold. Function names such as
\`\\sin\` already exist.

$$
\\mathbb{R} \\quad \\mathcal{N}(\\mu, \\sigma^2) \\quad \\mathrm{d}x \\quad \\mathbf{A}
\\quad \\sin \\theta \\quad \\log x
$$

### 11. Display math and \`$$\`

\`$…$\` stays in the line; \`$$\` puts the formula on a centred line of its own.
Start \`$$\` at the beginning of a line.

\`\`\`
Inline $E = mc^2$ looks like this.

$$
E = mc^2
$$
\`\`\`

Inline $E = mc^2$ looks like this.

$$
E = mc^2
$$

### 12. Equation numbers and references

Write \`{#eq-label}\` after the closing \`$$\` to number that equation.
Refer to it with \`@eq-label\`; numbers are assigned top to bottom.
**Labels use lowercase letters, digits, \`-\` and \`_\` only**, starting with \`eq-\`.

\`\`\`
$$
a^2 + b^2 = c^2
$$ {#eq-pythagoras}

By @eq-pythagoras.
\`\`\`

$$
a^2 + b^2 = c^2
$$ {#eq-pythagoras}

By @eq-pythagoras.

This is the same spelling Quarto uses. The older form (\`\\tag{name}\` with
\`[(1)](#eq-name)\`) still works, but prefer this one for new writing.

### 13. Function graphs

Set the language of a code block to \`graph\` and its contents are read as
functions. Up to three \`y = …\` lines, with \`x:\` and \`y:\` for the ranges.

\`\`\`\`
\`\`\`graph
y = x^2 - 2x
x: -3..5
\`\`\`
\`\`\`\`

\`\`\`graph
y = x^2 - 2x
x: -3..5
\`\`\`

## Part 2: Command list

Every command KaTeX supports. The command on the left, how it is drawn in the
middle, and a name on the right where one is known. Commands that take
arguments are shown as an example.

`

/** 第1部の本文だけ（単体テストが項目を数えるのに使う）。 */
export const guidePartOne = (lang: Lang): string => (lang === 'ja' ? japanese : english)

/** ガイド全文（第1部＋第2部）。 */
export const guideDocument = (lang: Lang): string => guidePartOne(lang) + buildCommandTable(lang)
