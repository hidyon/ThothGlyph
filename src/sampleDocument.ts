import type { Lang } from './lib/i18n'

/**
 * 初回起動時に入っている文書。何ができるかが一目で分かることを狙う。
 *
 * 0072で二次方程式から**正規分布と標本平均の覚書**へ差し替えた。パレットが
 * 記号62→150件・公式30→75件になったのに、サンプルには0064以降に足した記号が
 * 1つも出てこなかったため。
 *
 * 0078で式の番号と参照を入れた。記法を手で書く前提なので（パレットからは
 * 入れられない。0077）、ここが唯一の手本になる。
 * 0083で書き方を方言（`$$ … $$ {#eq-ラベル}` と `@eq-ラベル`）へ移した。
 * 旧記法（`\\tag` と `[(1)](#eq-…)`）も読めるが、**手本は新記法に揃える**。
 *
 * **中身を変えるときは、先頭行とファイル名に依存した検証9件を直すこと**
 * （`autosave` 3件・`i18n` 2件・`file-save` 4件）。グラフの存在を見る4件と
 * 「上のパレット」という語がないことを見る2件もあるので、**グラフは1つ入れ、
 * 位置の言葉は書かない**。
 */
const japanese = `# 正規分布と標本平均

測定誤差のようなばらつきは、正規分布 $\\mathcal{N}(\\mu, \\sigma^2)$ で近似できることが多い。
確率変数 $X$ がこれに従うことを $X \\sim \\mathcal{N}(\\mu, \\sigma^2)$ と書く。

$$
f(x) = \\frac{1}{\\sqrt{2\\pi}\\,\\sigma} \\exp\\left( -\\frac{(x - \\mu)^2}{2\\sigma^2} \\right)
$$ {#eq-density}

- 期待値は $\\mathrm{E}(X) = \\mu$
- 分散は $\\mathrm{Var}(X) = \\sigma^2$
- $\\mu \\pm \\sigma$ の内側に約68%が入る

@eq-density で $\\mu = 0$、$\\sigma = 1$ とした標準正規分布を描いてみる。

\`\`\`graph
y = exp(-x^2/2)/sqrt(2*pi)
x: -4..4
\`\`\`

## 標本平均

$n$ 個の標本の平均 $\\overline{X}$ は、$n$ が大きいほど $\\mu$ の近くに集まる。

$$
\\mathrm{E}(\\overline{X}) = \\mu, \\quad \\mathrm{Var}(\\overline{X}) = \\frac{\\sigma^2}{n}
$$ {#eq-samplemean}

@eq-samplemean のとおり、分散は $n$ に反比例する。
標本から推定した $\\mu$ の値は $\\widehat{\\mu}$ と書く。

パレットのボタンを押すと、カーソル位置に数式コマンドが入ります。
`

/** 英語版。訳ではなく、同じ狙い（数式・箇条書き・複数行の式）を英語で満たす文書。 */
const english = `# The normal distribution and sample means

Spread such as measurement error is often approximated by a normal distribution $\\mathcal{N}(\\mu, \\sigma^2)$.
We write $X \\sim \\mathcal{N}(\\mu, \\sigma^2)$ to say that $X$ follows it.

$$
f(x) = \\frac{1}{\\sqrt{2\\pi}\\,\\sigma} \\exp\\left( -\\frac{(x - \\mu)^2}{2\\sigma^2} \\right)
$$ {#eq-density}

- The mean is $\\mathrm{E}(X) = \\mu$
- The variance is $\\mathrm{Var}(X) = \\sigma^2$
- About 68% of the mass lies within $\\mu \\pm \\sigma$

Here is equation @eq-density with $\\mu = 0$ and $\\sigma = 1$.

\`\`\`graph
y = exp(-x^2/2)/sqrt(2*pi)
x: -4..4
\`\`\`

## Sample means

The mean $\\overline{X}$ of $n$ samples clusters closer to $\\mu$ as $n$ grows.

$$
\\mathrm{E}(\\overline{X}) = \\mu, \\quad \\mathrm{Var}(\\overline{X}) = \\frac{\\sigma^2}{n}
$$ {#eq-samplemean}

As @eq-samplemean shows, the variance is inversely proportional to $n$.
An estimate of $\\mu$ from a sample is written $\\widehat{\\mu}$.

Press a palette button to insert a command at the cursor.
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
