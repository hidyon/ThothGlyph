# 0064: パレットに統計・確率と集合・論理を足す

- 対応issue: [0064](../issues/0064-palette-beyond-highschool.md)
- 状態: implemented
- 作成日: 2026-09-21

## 目的

パレットの中身は高校数学の範囲で止まっていて、大学初年度の講義ノートを書くと
常用する記号が引けない。[0064](../issues/0064-palette-beyond-highschool.md) の
背景にある実測では、`\sim`（分布に従う）・`\mathcal{N}`（正規分布）・`\mid`
（条件付き）が**検索して0件**で、語で引いても「正規分布」0件・「転置」0件だった。

記号を28件・公式を15件足して、**統計・確率**と**集合・論理**の範囲で
[R2](../requirements.md#r2-数式のコマンドを覚えていなくても書ける)（コマンドを
覚えていなくても選んで挿入できる）が満たされる状態にする。「正規分布」「共分散」
「ド・モルガン」と打てば当たるようにする。

線形代数（`\top` `bmatrix`）と装飾（`\mathcal` を書体として使う `\overset`
`\tilde`）は0064の背景に挙がっているが、この仕様では扱わない（[スコープ外](#スコープ外)）。

## 実測（仕様を決めるために先に測った）

寸法は幅×高さで、devcontainer内のヘッドレスChromium、ビューポート高さ900px
（幅360pxのみ780px）、初期文書（サンプル）、保存状態の表示なしで測った値。
言語は日本語・英語の両方を測り、違うときは併記する。

### 現状

| 幅 | パレット | 一覧の最大 |
|---|---|---|
| 1440px（縦帯） | 180×845px（日）/ 180×847px（英） | 公式タブだけスクロール（中身989px/日・1059px/英） |
| 1199px（横帯） | 1199×94px（日）/ 1199×92px（英） | ギリシャ小文字31件で136px（日）/ 134px（英）、公式148px（日）/ 172px（英） |
| 721px（横帯） | 721×126px（日）/ 721×121px（英） | ギリシャ小文字31件で210px（日）/ 205px（英）、公式269px（日）/ 287px（英） |
| 360px（横帯） | 360×141px（日）/ 360×138px（英） | [0032](0032-palette-height-narrow.md)の蓋（`min(98px, 15vh)`）が効き、件数では変わらない |

タブ行は8つで、**検索欄が2行目に落ち始める幅は日本語944px・英語1169px**
（[0053](0053-palette-tab-icons.md)の値を再実測して一致）。

### 3つの足し方のコストを測り比べた

既存のDOMを複製して、足したあとの寸法をシミュレーションで測った
（実装後に本番の値で測り直す。[受け入れ基準](#受け入れ基準)に入れてある）。

| 足し方 | 横帯でのコスト | 縦帯でのコスト |
|---|---|---|
| **記号を既存グループへ足す**（関係子14→28件） | 幅1199px 94→136px（日）/ 92→134px（英）。**既存最大のギリシャ小文字31件と同値**で、画面の最大高は更新しない。幅721px 126→168px（日）、幅360pxは141pxで不変 | 845px→845pxで**変化なし**（スクロールも出ない） |
| **記号の新タブを足す** | 検索欄が2行目に落ち始める幅が上がる（日本語944→1007px[1つ]/1108px[2つ]、英語1169→1199px[1つ・2つとも]）。落ちると+34px | タブが縦に積まれるぶんスクロールが伸びる |
| **公式を既存分類に足す**（確率・統計5→10件） | 幅1199px 148→205px（日）/ 172→229px（英）、幅721px 269→329px（日）/ 287→347px（英）。**1件ごとに約60px**（公式ボタンは1列） | スクロール989→1342px（日）/ 1059→1412px（英） |
| **公式の分類を3つ足す**（各5件のまま） | 幅1199px 148→180px（日、2段目タブが1→2行）/ 172px（英、変化なし）、幅900px 210px（日、変化なし）/ 201→230px（英、2→3行）、幅721px 269px（日、変化なし）/ 287→316px（英、3→4行）、幅360pxは177px（日）/ 171px（英）で不変 | スクロール989→1085px（日）/ 1059→1176px（英）。帯の高さ845/847pxは不変 |

**結論**: 記号は新タブを作らず既存グループへ足す（コストが実質ゼロ）。公式は
既存分類を太らせず、**各5件のまま分類を3つ足す**（1件ごと60pxより、分類ごと
約30pxのほうが安い）。

## 仕様

### 1. 記号を28件足す（102→130件、7グループのまま）

タブは8つのまま増やさない。置き場所は下の2グループ
（`\overline{X}` は当初「基本」に置く予定だったが、実装で演算子へ移した。
[実装で変えたところ](#実装で変えたところ)）。

**演算子（12→26件）**

| label | snippet | tooltip（日 / 英） |
|---|---|---|
| `\overline{X}` | `\overline{%CURSOR%}` | 上線（標本平均・補集合） / Overline (sample mean, complement) |
| `P(A)` | `P(%CURSOR%)` | 確率 / Probability |
| `\mathrm{E}[X]` | `\mathrm{E}[%CURSOR%]` | 期待値 / Expected value |
| `\mathrm{Var}(X)` | `\mathrm{Var}(%CURSOR%)` | 分散 / Variance |
| `\mathrm{Cov}(X, Y)` | `\mathrm{Cov}(%CURSOR%, )` | 共分散 / Covariance |
| `\mathcal{N}(\mu, \sigma^2)` | `\mathcal{N}(%CURSOR%, )` | 正規分布 / Normal distribution |
| `\mathrm{Bin}(n, p)` | `\mathrm{Bin}(%CURSOR%, )` | 二項分布 / Binomial distribution |
| `\chi^2` | `\chi^2 ` | カイ二乗 / Chi-squared |
| `\binom{n}{k}` | `\binom{%CURSOR%}{}` | 二項係数 / Binomial coefficient |
| `\cup` | `\cup ` | 和集合 / Union |
| `\cap` | `\cap ` | 共通部分 / Intersection |
| `\setminus` | `\setminus ` | 差集合 / Set difference |
| `\bigcup_{i=1}^{n}` | `\bigcup_{%CURSOR%}^{}` | 和集合（添字つき） / Union (indexed) |
| `\bigcap_{i=1}^{n}` | `\bigcap_{%CURSOR%}^{}` | 共通部分（添字つき） / Intersection (indexed) |

**関係子（14→28件）**

| label | snippet | tooltip（日 / 英） |
|---|---|---|
| `\sim` | `\sim ` | 分布に従う / Distributed as |
| `\mid` | `\mid ` | 条件付き（縦棒） / Conditional (mid) |
| `\perp` | `\perp ` | 独立・垂直 / Independent, perpendicular |
| `\notin` | `\notin ` | 属さない / Not an element of |
| `\subseteq` | `\subseteq ` | 部分集合（等号つき） / Subset or equal |
| `\supset` | `\supset ` | 含む / Superset |
| `\emptyset` | `\emptyset ` | 空集合 / Empty set |
| `\land` | `\land ` | かつ / Logical and |
| `\lor` | `\lor ` | または / Logical or |
| `\neg` | `\neg ` | 否定 / Negation |
| `\therefore` | `\therefore ` | ゆえに / Therefore |
| `\because` | `\because ` | なぜならば / Because |
| `\mathbb{R}` | `\mathbb{R} ` | 実数全体 / Real numbers |
| `\xrightarrow{d}` | `\xrightarrow{%CURSOR%}` | 収束（矢印の上に記号） / Convergence (labeled arrow) |

#### tooltipの付け方の規則

検索（[0011](0011-palette-search.md)）が照合するのは `label` と `title` の日英だけ
なので、**語で引きたい言葉は tooltip に入れる**。コマンド名から想像できない記号は
「記号の呼び名」ではなく「使う場面の名前」にする。

| 入力（検索語） | 当たる記号 | なぜ当たるか |
|---|---|---|
| `正規分布` | `\mathcal{N}(\mu, \sigma^2)` | tooltipが「正規分布」。`\mathcal` という名前では引けないため |
| `covariance` | `\mathrm{Cov}(X, Y)` | tooltipの英語が `Covariance`。表示言語が日本語でも引ける（0031） |
| `mid` | `\mid` | labelが `\mid`。正規化で `\` が落ちるため |

`\mathrm{E}` と `\mathrm{Var}` のように**立体で書くか斜体で書くか揺れるもの**は
立体（`\mathrm`）に統一する。同じ用途に2通りを並べると選ぶ側が迷う（0064のメモ）。

### 2. 公式を15件足す（60→75件、12→15分類）

**既存の12分類は1件も変えない。** 新しい分類を3つ、各5件で足す。分類は
`formulas.ts` の配列の末尾に置く（既存の並びを動かさない）。

**確率（Probability）**

| 名前（日 / 英） | preview |
|---|---|
| ベイズの定理 / Bayes' theorem | `P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)}` |
| 全確率の公式 / Law of total probability | `P(B) = \sum_{i=1}^{n} P(B \mid A_i)\, P(A_i)` |
| 独立なときの積 / Product rule for independent events | `P(A \cap B) = P(A)\, P(B)` |
| 二項分布 / Binomial distribution | `P(X = k) = \binom{n}{k} p^k (1 - p)^{n - k}` |
| 正規分布の確率密度 / Normal density | `f(x) = \frac{1}{\sqrt{2\pi}\,\sigma} \exp\left(-\frac{(x - \mu)^2}{2\sigma^2}\right)` |

**期待値・分散（Expectation & variance）**

| 名前（日 / 英） | preview |
|---|---|
| 期待値の線形性 / Linearity of expectation | `\mathrm{E}(aX + b) = a\,\mathrm{E}(X) + b` |
| 分散の定義 / Variance | `\mathrm{Var}(X) = \mathrm{E}(X^2) - \{\mathrm{E}(X)\}^2` |
| 共分散 / Covariance | `\mathrm{Cov}(X, Y) = \mathrm{E}(XY) - \mathrm{E}(X)\,\mathrm{E}(Y)` |
| 相関係数 / Correlation coefficient | `r = \frac{\mathrm{Cov}(X, Y)}{\sqrt{\mathrm{Var}(X)}\sqrt{\mathrm{Var}(Y)}}` |
| 標準化 / Standardization | `Z = \frac{X - \mu}{\sigma} \sim \mathcal{N}(0, 1)` |

**集合と論理（Sets & logic）**

| 名前（日 / 英） | preview |
|---|---|
| ド・モルガンの法則 / De Morgan's laws | `\overline{A \cup B} = \overline{A} \cap \overline{B}` |
| 包除原理 / Inclusion-exclusion | `|A \cup B| = |A| + |B| - |A \cap B|` |
| 分配法則 / Distributive law | `A \cap (B \cup C) = (A \cap B) \cup (A \cap C)` |
| 対偶 / Contraposition | `(P \Rightarrow Q) \iff (\neg Q \Rightarrow \neg P)` |
| 全称の否定 / Negation of a quantifier | `\neg \forall x \, P(x) \iff \exists x \, \neg P(x)` |

挿入の形は既存と同じ（`formula()` が `preview` からブロック数式の snippet を作る）。

### 3. 件数の表示を直す

READMEの件数は単体テストで固定されている（[0035](0035-readme-for-users.md)）。
**記号7グループ130個・公式15分類75件**に直す。直す先は
`README.md` の2箇所（機能の表・名前の説明）と、`palette.test.ts`・`formulas.test.ts`。

### 対象ファイル

| ファイル | すること |
|---|---|
| `src/lib/palette.ts` | 記号28件を基本・演算子・関係子に足す |
| `src/lib/formulas.ts` | 分類3つ（各5件）を配列の末尾に足す |
| `src/lib/palette.test.ts` | 件数（102→130）を直す |
| `src/lib/formulas.test.ts` | 件数（12分類60件→15分類75件）を直す |
| `README.md` | 件数を2箇所直す |
| `docs/functional-spec.md` | パレットの件数・分類の記述を直す |
| `docs/test-spec.md` | 追加するチェックを書く |
| `scripts/verify-ui.mjs` | `palette-stats` 区分を足す（既存のチェックは消さない） |

`src/components/SymbolPalette.tsx` は触らない（データ駆動なので描画は変わらない）。
`lib/messages.ts` も触らない（画面の文言は増えない。記号と公式の名前は
`t('日', 'En')` で1行に両方書く。[0031](0031-english-ui.md)）。

## 未確認の前提

- **なし。** 追加する43件のLaTeX（記号28件・公式15件）は、`katex.renderToString` を
  `throwOnError: true` で通して**43件すべて描けることを仕様の時点で確かめた**
  （`\because` `\xrightarrow` `\mathbb` `\binom` `\complement` 系はKaTeXの対応が
  怪しかったため）。`\complement` は使わず `\overline{A}` で補集合を書く形にした。

## 実装で変えたところ

仕様から変えた点と、自分の変更が起こした回帰を直した点。

### 1. `\overline{X}` を「基本」から「演算子」へ移した

仕様では基本（8→9件）に置くつもりだったが、**入れた時点で `loading` 区分の
「幅600pxで、ラベルがソース表示のときとKaTeX描画のときのパレットの高さの差が
40px以内」が落ちた**（ソース141px / KaTeX 100px = 41px）。

読み込み中のラベルはLaTeXのソースそのままなので、`\overline{X}` は12文字あり、
幅600pxで基本タブの9件目が1行折り返す。KaTeXが届くとラベルが縮んで1行戻るため、
**読み込みの完了時にパレットが41px飛ぶ**。変更前は差0px（ソース100px /
KaTeX 100px）だったので、これは0024が守っていたものを壊している。

閾値を上げずに置き場所を変えた。標本平均・補集合として足した記号なので、
統計の記号と同じ演算子グループにあって困らない。基本は8件のまま、
演算子が25→26件になった。

**記号のラベルは、KaTeXで描いた見た目が短くてもソースが長いことがある。**
パレットに文字数の多いlabelを足すときは、幅600pxで `loading` 区分を流すこと。

### 2. 件数と分類名に依存していた既存チェック5件を直した

いずれも私の変更が起こした回帰で、その場で直した。

| 場所 | 直した内容 |
|---|---|
| `verify-ui.mjs` の `formula` | 2段目タブ 12 → 15分類 |
| `verify-ui.mjs` の `i18n` | 英語表示でも 12 → 15分類 |
| `verify-ui.mjs` の `palette-height` | 全分類が同じ高さ 12 → 15件 |
| `verify-ui.mjs` の `palette-height` | 最後の分類 `極限・不等式` → `集合と論理` |
| `verify-ui.mjs` の `palette-height` | 幅1199pxの公式タブの上限 157px → 180px（2段目タブが1行→2行になったぶん） |

### 3. 幅360pxの実測値は言語で違った

仕様の実測表に「360×138px」と条件なしで書いていたが、**日本語141px・英語138px**
（タブ行が2行になるかの差）。最初に測ったときに言語の初期化が効いておらず、
英語の値を日本語として書いていた。変更前・変更後とも日本語141px・英語138pxで
**1pxも動いていない**ことを、両方を測り直して確かめた。

## 受け入れ基準

実際に確認した結果を各項目の後ろに書いた（`npm test` 907件・
`node scripts/verify-ui.mjs` 413件は全件OK、コンソールエラー0件）。

### 単体テスト（`npm test`）

- [x] 記号は7グループ130件である（`palette.test.ts`）
- [x] 公式は15分類75件である（`formulas.test.ts`）
- [x] パレット全件のLaTeXがKaTeXで描画できる（既存のテストが足した28件も対象にした。`palette.test.ts` 271→327件）
- [x] 公式全件のLaTeXがKaTeXで描画できる（`formulas.test.ts` 247→307件）
- [x] `searchPalette('正規分布')` の結果に `\mathcal{N}(\mu, \sigma^2)` が入る
- [x] `searchPalette('covariance')` の結果に記号 `\mathrm{Cov}(X, Y)` と公式「共分散」の両方が入る
- [x] `searchPalette('ド・モルガン')` の結果に公式「ド・モルガンの法則」が入る
- [x] 記号のsnippetに `%CURSOR%` が2つ以上含まれるものがない（既存のテストの対象に入った）

### ヘッドレスChromium（`node scripts/verify-ui.mjs palette-stats`）

20件すべてOK。

- [x] 演算子タブに `\mathcal{N}(\mu, \sigma^2)` のボタンが見え、押すとソースに `\mathcal{N}(, )` が入る
- [x] 関係子タブの `\sim` を押すと、ソースに `\sim ` が入る
- [x] 検索欄に `正規分布` と打つと結果が出て（2件）、先頭を押すとソースに `\mathcal{N}` を含む文字列が入る
- [x] 検索欄に `転置` と打つと「一致する記号がありません」が出る（線形代数は範囲外。文言は仕様に「見つかりません」と書いていたが、実際の文言は「一致する記号がありません」だった）
- [x] 公式タブの2段目に `確率` `期待値・分散` `集合と論理` の3分類が出る（15分類）
- [x] `集合と論理` の「ド・モルガンの法則」を押すと、プレビューのブロック数式が2→3に増え、`katex-error` が0件
- [x] 足した28件・15件のどのボタンを押しても `katex-error` が出ない（記号28件を1つの式にまとめて0件、公式15件を順に挿入して0件）
- [x] パレットのボタンが2行以上並んだ状態で、最後の行のボタンが押せる

### 寸法（実測値を記録した）

すべて日本語表示の値。英語は併記した。

| 項目 | 基準 | 実測 |
|---|---|---|
| 幅1440px（縦帯）のパレットの高さ | 845px（日）/ 847px（英）から変わらない | **845px**（変わらず） |
| 幅1440pxの関係子タブ（28件） | 縦帯がスクロールしない | **スクロールなし** |
| 幅1440pxの公式タブの中身 | 1100px以下（実装前989px） | **1053px** |
| 幅1199pxの関係子タブ（28件） | ギリシャ小文字（31件）を超えない | **136px**（ギリシャ小文字も136px。英語134px） |
| 幅1199pxの演算子タブ（26件） | 136px以下 | **136px**（英語134px） |
| 幅1199pxの基本タブ（8件のまま） | 94px | **94px**（英語92px） |
| 幅1199pxの公式タブ | 180px以下 | **180px**（英語172px。2段目タブが1行→2行） |
| 幅721pxの公式タブ | 269px（日）/ 316px（英）以下 | **269px**（英語287px。どちらも変わらず） |
| 幅721pxの演算子・関係子 | ギリシャ小文字（210px）を超えない | 演算子**210px** / 関係子**168px** |
| 幅360pxのパレットの高さ | 変わらない | **141px**（英語138px。記号のどのタブでも同じ。変更前と同値） |
| 検索欄が2行目に落ち始める幅 | 日本語944px・英語1169pxから変わらない | 幅1199pxでタブと同じ行に残る（**タブを増やしていない**） |

### その他

- [x] `npm run build` と `npm run lint` が通る
- [x] READMEの件数が記号130個・公式75件になっている
- [x] `node scripts/make-screenshots.mjs` で3枚を撮り直した（変わったのは `phone.png`）

## 検討したが採らなかった案

- **「統計」「集合・論理」の記号タブを新設する。** 分類としては最も素直だが、
  タブ行が伸びて検索欄が2行目に落ち始める幅が上がる（日本語944→1108px、
  英語は横帯の全幅で落ちる）。落ちると横帯で+34px奪う。
  [0056](0056-palette-header.md)が同じ理由で横帯の見出しを諦めているので、
  それに揃えた。統計記号が「演算子」に入るのは分類として緩いが、
  `P` `\mathrm{E}` `\mathrm{Var}` `\mathrm{Cov}` は演算子そのもので、
  分布名（`\mathcal{N}` `\mathrm{Bin}` `\chi^2`）だけが緩い。検索で引ける
  （tooltipに「正規分布」が入る）ので、タブ34pxと引き換えにはしない。
- **既存の「確率・統計」分類に10件足す。** 公式ボタンは1列なので1件あたり
  約60px増え、幅1199pxで148→205px（日）になる。分類を足すほう（+32px）が安い。
- **中心極限定理と不偏分散も入れる。** 件数の目安（+15件前後）を超えるため入れない。
  `\xrightarrow{d}` は記号として入れたので、中心極限定理は手で書ける。
- **`\complement` を補集合に使う。** KaTeXでは描けるが、ド・モルガンの法則の
  preview と書き方が揺れる。`\overline{A}` の1通りにした。

## スコープ外

- **線形代数**（`\top` 転置・`bmatrix`・行列式・逆行列・ノルム）。0064の背景に
  挙がっているが、この仕様の範囲（統計・確率と集合・論理）に入らない。
  **別issueとして起票する。**
- **装飾・書体**（`\tilde` `\overset` `\underset` `\text`）。同じく別issueとして起票する。
  `\mathcal` `\mathrm` `\mathbb` はこの仕様でも使うが、**書体を選ぶ道具としてではなく
  「正規分布」「期待値」「実数全体」という完成した記号として**入れる。
- **既存の102件・60件を減らすこと・並べ替えること。**
- **サンプル文書を変えること。** 実機検証の複数の区分が先頭行
  `# 二次方程式の解の公式` に依存している。
- **横帯（幅721〜1199px）の一覧に高さの蓋をすること。** 0032の蓋は幅720px以下だけで、
  この帯には蓋がない。公式タブを開くと幅1199pxで180pxまで伸びる。
  この仕様では既存の最大（公式タブ）を約32px更新するにとどめ、蓋そのものは触らない。
- **未対応コマンドの扱い**（[0063](0063-unsupported-commands.md)）。
