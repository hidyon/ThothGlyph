# 0072: サンプル文書を統計の覚書にする

- 対応issue: [0072](../issues/0072-sample-document.md)
- 状態: implemented
- 作成日: 2026-09-21

## 目的

初回訪問で入っているサンプル文書を、**正規分布と標本平均の短い覚書**に差し替える。
いまは二次方程式で、[0018](0018-formula-library.md) の頃（記号62件・公式30件）に
書かれたもの。その後パレットは記号150件・公式75件になったが、
[0064](0064-palette-beyond-highschool.md)・[0068](0068-palette-decorations.md)・
[0070](0070-wide-accents.md) で足した記号は**サンプルに1つも出てこない**。

差し替えると、開いた瞬間の画面に `\mathcal{N}` `\sim` `\mathrm{E}` `\mathrm{Var}`
`\overline{X}` `\widehat{\mu}` が出る。

## 実測（仕様を決めるために先に測った）

### 規模は大きく変えない

| | いま（二次方程式） | 新しい（統計） |
|---|---|---|
| 行数 | 32行 | **32行** |
| バイト数（日本語） | 789バイト | **981バイト**（+24%） |
| バイト数（英語） | 701バイト | **891バイト**（+27%） |
| 見出し | 2 | **2** |
| ブロック数式 | 2 | **2** |
| インライン数式 | 8（英9） | **14** |
| グラフ | 1 | **1** |
| 箇条書き | 3 | **3** |

issueの「2倍にはしない」は満たしている。増えるのはインライン数式（8→14）。

### 初回描画のコスト

| 測り方 | いま | 新しい |
|---|---|---|
| 開発サーバ（幅1440px・5回の中央値。数式が全部描かれグラフが出るまで） | 606ms | **712ms**（+106ms） |
| 本番ビルド（`scripts/measure-load.mjs`・スロットルなし・3回の中央値。プレビューの数式まで） | 309ms | **286ms** |
| 本番ビルド（Fast 3G + CPU 4倍・数式まで） | — | **2231ms**（基準2400ms） |

**本番では悪化していない**（測定誤差の範囲で、むしろ速い側に出た）。
開発サーバで+106ms増えるのは数式が6個増えたぶん。
`measure-load.mjs` の基準（スロットルなしで数式まで400ms以下、
Fast 3Gで2400ms以下）はどちらも満たす。

### 壊れる既存チェック（実装前に全区分を流して洗った）

**9件**が落ちる。すべて先頭行とファイル名の文字列に依存したもの。

| 区分 | チェック | 直し方 |
|---|---|---|
| `autosave` | 初回訪問でサンプル文書が表示される | 先頭行を `# 正規分布と標本平均` へ |
| `autosave` | 確認をOKするとサンプル文書に戻る | 同じ |
| `autosave` | 壊れたJSONでもサンプル文書で起動する | 同じ |
| `i18n` | 保存がないときは日本語のサンプル文書が出る | 同じ |
| `i18n` | 英語のサンプル文書が出る | `# The normal distribution and sample means` へ |
| `file-save` | サンプル文書の見出しがファイル名になる | `正規分布と標本平均.md` へ |
| `file-save` | 書き出すと結果が表示される | 同じ |
| `file-save` | 英語のサンプルは The quadratic formula.md になる | `The normal distribution and sample means.md` へ |
| `file-save` | 英語表示では結果が Saved … になる | 同じ |

**issueで「14件が依存している」と数えたうち、実際に落ちるのは9件。**
グラフの存在を見る4件（`initial` `autosave` `i18n` `placement`）は
**新しいサンプルにもグラフを1つ入れるので通る**。
「上のパレット」という語がないことを見る2件（`placement`）も通る。

### サンプルとは無関係に落ちているもの（別issue）

`measure-load.mjs` の「初期CSSが10.00 kB以下」が**10.39 kBで落ちている**。
`src/index.css` の最終更新は [0010](0010-scroll-sync.md) で、**このissueの前から
落ちていた**（変更前のサンプルでも同じ値）。`measure-load.mjs` は `verify-ui.mjs`
とは別に手で流すものなので、気づかれずに残っていた。
**[0073](../issues/0073-initial-css-size.md) として起票する。**

## 仕様

### 1. 日本語のサンプル

````markdown
# 正規分布と標本平均

測定誤差のようなばらつきは、正規分布 $\mathcal{N}(\mu, \sigma^2)$ で近似できることが多い。
確率変数 $X$ がこれに従うことを $X \sim \mathcal{N}(\mu, \sigma^2)$ と書く。

$$
f(x) = \frac{1}{\sqrt{2\pi}\,\sigma} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right)
$$

- 期待値は $\mathrm{E}(X) = \mu$
- 分散は $\mathrm{Var}(X) = \sigma^2$
- $\mu \pm \sigma$ の内側に約68%が入る

$\mu = 0$、$\sigma = 1$ とした標準正規分布の密度を描いてみる。

```graph
y = exp(-x^2/2)/sqrt(2*pi)
x: -4..4
```

## 標本平均

$n$ 個の標本の平均 $\overline{X}$ は、$n$ が大きいほど $\mu$ の近くに集まる。

$$
\mathrm{E}(\overline{X}) = \mu, \quad \mathrm{Var}(\overline{X}) = \frac{\sigma^2}{n}
$$

標本から推定した $\mu$ の値は $\widehat{\mu}$ と書く。

パレットのボタンを押すと、カーソル位置に数式コマンドが入ります。
````

### 2. 英語のサンプル

訳ではなく、同じ狙い（数式・箇条書き・グラフ・複数行）を英語で満たす文書。

````markdown
# The normal distribution and sample means

Spread such as measurement error is often approximated by a normal distribution $\mathcal{N}(\mu, \sigma^2)$.
We write $X \sim \mathcal{N}(\mu, \sigma^2)$ to say that $X$ follows it.

$$
f(x) = \frac{1}{\sqrt{2\pi}\,\sigma} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right)
$$

- The mean is $\mathrm{E}(X) = \mu$
- The variance is $\mathrm{Var}(X) = \sigma^2$
- About 68% of the mass lies within $\mu \pm \sigma$

Here is the standard normal density, with $\mu = 0$ and $\sigma = 1$.

```graph
y = exp(-x^2/2)/sqrt(2*pi)
x: -4..4
```

## Sample means

The mean $\overline{X}$ of $n$ samples clusters closer to $\mu$ as $n$ grows.

$$
\mathrm{E}(\overline{X}) = \mu, \quad \mathrm{Var}(\overline{X}) = \frac{\sigma^2}{n}
$$

An estimate of $\mu$ from a sample is written $\widehat{\mu}$.

Press a palette button to insert a command at the cursor.
````

### 3. 守ること

- **末尾の案内の一文は残す**（`パレットのボタンを押すと…` / `Press a palette button…`）。
  位置の言葉（「上のパレット」）は書かない（[0054](0054-palette-placement.md)）。
- **グラフを1つ入れる**（[0040](0040-sample-graph.md)の4件が通るため）。
  式は `y = exp(-x^2/2)/sqrt(2*pi)`、範囲は `x: -4..4`。
  `exp` `sqrt` `pi` は式の評価器（`lib/expression.ts`）が対応している。
- **ファイル名**は日本語 `正規分布と標本平均.md`、英語
  `The normal distribution and sample means.md`（`fileNameFor` に通して確認済み）。

### 対象ファイル

| ファイル | すること |
|---|---|
| `src/sampleDocument.ts` | 日本語・英語を差し替える |
| `scripts/verify-ui.mjs` | 上の9件を直す（`autosave` 3件・`i18n` 2件・`file-save` 4件） |
| `docs/functional-spec.md` | サンプルの名前とファイル名の例を直す |
| `docs/test-spec.md` | 区分の説明でサンプルに触れている箇所を直す |
| `docs/issues/0073-initial-css-size.md` | 新規（初期CSSの超過。このissueの作業中に見つけた） |
| `README.md` のスクリーンショット3枚 | `node scripts/make-screenshots.mjs` で撮り直す |

`src/lib/downloadName.test.ts` は `# 二次方程式の解の公式` を例に使っているが、
**サンプルとは独立した単体テスト**なので触らない（ファイル名の作り方の例として
正しく、サンプルが変わっても意味は変わらない）。

## 未確認の前提

- **なし。** 新しいサンプルの数式16件（ブロック2・インライン14）を
  `katex.renderToString` に `throwOnError: true` で通し、**両言語とも0件NG**。
  グラフブロックは `parseGraphBlock` → `renderGraph` を通して**SVGが出る**
  ことを確かめた（7248文字）。ファイル名も `fileNameFor` で確認した。

## 受け入れ基準

実際に確認した結果を各項目の後ろに書いた（`npm test` 957件・
`node scripts/verify-ui.mjs` 438件は全件OK、コンソールエラー0件）。

### 単体テスト（`npm test`）

- [x] 既存の957件が落ちない（サンプルを参照しているテストはなかった）

### ヘッドレスChromium（`node scripts/verify-ui.mjs`）

- [x] 初回訪問で `# 正規分布と標本平均` が表示される
- [x] 初回訪問でプレビューにグラフが1つ描かれ、`graph-error` が出ない（0040の回帰）
- [x] 初回訪問でプレビューに `katex-error` が0件
- [x] 「サンプルに戻す」でOKすると新しいサンプルに戻り、グラフも描かれる
- [x] 英語表示で `# The normal distribution and sample means` が出て、グラフも1つある
- [x] 書き出すと `正規分布と標本平均.md`、英語では `The normal distribution and sample means.md` になる
- [x] 幅1440pxでサンプルのグラフが480×320pxのまま（0037の回帰）
- [x] サンプルに「上のパレット」という語がない（0054の回帰）
- [x] 全区分が通る（438/438）

### 性能（`scripts/measure-load.mjs`）

- [x] スロットルなしでプレビューの数式まで400ms以下（**実測286ms**。変更前309ms）
- [x] Fast 3G + CPU 4倍で数式まで2400ms以下（**実測2231ms**）
- [x] 初期CSSの超過（10.39 kB）はこのissueでは直さず、[0073](../issues/0073-initial-css-size.md) として起票した

### その他

- [x] `npm run build` と `npm run lint` が通る
- [x] `node scripts/make-screenshots.mjs` で3枚を撮り直した（新しいサンプルが写っている）

## 実装で変えたところ

**仕様どおりで、変えたところはない。** 事前に洗った9件（`autosave` 3件・
`i18n` 2件・`file-save` 4件）は文字列も直し方も想定どおりで、
**実装後に落ちたチェックは0件**だった。

0064（言語の取り違え）・0068（描画待ちの漏れ）・0070（実測表に無かった幅540px）で
3件続いていた「測る範囲の取りこぼし」は、このissueでは出なかった。
違いは**仕様を書く前に全区分を1回流したこと**で、落ちる9件を数えてから
仕様の表に書いている（0070は該当しそうな13区分だけを流し、幅540pxを含む
`graph` 区分を見ていなかった）。**洗うときは全区分を流す。**

あわせて `src/sampleDocument.ts` の冒頭コメントに、
**中身を変えるときに直すもの**（先頭行とファイル名に依存した9件、
グラフを1つ入れること、位置の言葉を書かないこと）を書き足した。

## 検討したが採らなかった案

- **二次方程式のまま中身を厚くする。** 先頭行を変えないので壊れるチェックが
  9件→3件くらいに減るが、高校数学の範囲に留まるので足した記号が出てこない。
  このissueの目的（いまできることを見せる）を満たさない。
- **アプリの案内にする**（何ができるかを列挙）。伝わるが読み物にならず、
  「数式ノートの例」としての見本にならない。
- **多変量正規分布と重回帰**（[0060](../issues/0060-display-math-overflow.md)の
  起票に使った覚書）。ブロック数式が長く、**幅1440pxでも右で切れる**（0060そのもの）。
  サンプルで最初に見せるものではない。
- **サンプルを長くして記号を網羅する。** 初回描画が重くなり、
  スクリーンショットにも収まらない。規模は今のままにした。

## スコープ外

- **白紙から始める手段**（[0061](../issues/0061-new-note.md)）。
- **初期CSSの超過**（[0073](../issues/0073-initial-css-size.md)）。
- **長いブロック数式が切れる件**（[0060](../issues/0060-display-math-overflow.md)）。
  新しいサンプルの2つのブロック数式は幅1440pxで切れない。
- **記法の追加**（定理の囲み [0041](../issues/0041-theorem-blocks.md)、
  式番号 [0044](../issues/0044-equation-numbers.md)）。
- **パレットの中身**（[0067](../issues/0067-palette-linear-algebra.md)）。
