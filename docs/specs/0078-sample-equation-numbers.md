# 0078: サンプル文書に式の番号と参照を入れる

- 対応issue: [0078](../issues/0078-sample-equation-numbers.md)
- 状態: implemented
- 作成日: 2026-09-22

## 目的

[0044](0044-equation-numbers.md) で入れた「式の番号と参照」は、記法を手で書く
前提（パレットからは入れられない。[0077](../issues/0077-palette-tag.md)）なので、
**サンプル文書が唯一の手本**になる。いまサンプルには `\tag` が1つもないので、
初回訪問では機能の存在に気づけない。

このissueのあと、初回訪問の画面に **`(1)` `(2)` という番号と、本文からその
番号を指すリンク**が出ている。ソースを見れば `\tag{名前}` と
`[(1)](#eq-名前)` の書き方がそのまま読める。

## 仕様

`src/sampleDocument.ts` の日本語版・英語版を変える。**題材と先頭行は変えない。**

### 日本語版

1つ目のブロック数式（密度関数）に `\tag{密度}`、2つ目（標本平均）に
`\tag{標本平均}` を付ける。参照は、すでにある2つの文を書き換えて入れる
（番号のためだけの文を足さない）。

```diff
 $$
-f(x) = \frac{1}{\sqrt{2\pi}\,\sigma} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right)
+f(x) = \frac{1}{\sqrt{2\pi}\,\sigma} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right) \tag{密度}
 $$

 - 期待値は $\mathrm{E}(X) = \mu$
 - 分散は $\mathrm{Var}(X) = \sigma^2$
 - $\mu \pm \sigma$ の内側に約68%が入る

-$\mu = 0$、$\sigma = 1$ とした標準正規分布の密度を描いてみる。
+式 [(1)](#eq-密度) で $\mu = 0$、$\sigma = 1$ とした標準正規分布を描いてみる。
```

```diff
 $$
-\mathrm{E}(\overline{X}) = \mu, \quad \mathrm{Var}(\overline{X}) = \frac{\sigma^2}{n}
+\mathrm{E}(\overline{X}) = \mu, \quad \mathrm{Var}(\overline{X}) = \frac{\sigma^2}{n} \tag{標本平均}
 $$

-標本から推定した $\mu$ の値は $\widehat{\mu}$ と書く。
+式 [(2)](#eq-標本平均) の分散は $n$ が大きいほど小さい。
+標本から推定した $\mu$ の値は $\widehat{\mu}$ と書く。
```

### 英語版

同じ狙いを英語で満たす。ラベルは英語にする（`density` / `samplemean`）。

```diff
 $$
-f(x) = \frac{1}{\sqrt{2\pi}\,\sigma} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right)
+f(x) = \frac{1}{\sqrt{2\pi}\,\sigma} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right) \tag{density}
 $$
 …
-Here is the standard normal density, with $\mu = 0$ and $\sigma = 1$.
+Here is equation [(1)](#eq-density) with $\mu = 0$ and $\sigma = 1$.
```

```diff
 $$
-\mathrm{E}(\overline{X}) = \mu, \quad \mathrm{Var}(\overline{X}) = \frac{\sigma^2}{n}
+\mathrm{E}(\overline{X}) = \mu, \quad \mathrm{Var}(\overline{X}) = \frac{\sigma^2}{n} \tag{samplemean}
 $$

-An estimate of $\mu$ from a sample is written $\widehat{\mu}$.
+The variance in [(2)](#eq-samplemean) shrinks as $n$ grows.
+An estimate of $\mu$ from a sample is written $\widehat{\mu}$.
```

**日本語版のラベルを日本語にするのは意図的**で、「ラベルに日本語が使える」ことを
手本として見せるため（0044の検証で実測済み）。英語版は英語のラベルにする。

**参照の文は書きながら直した。** 上の diff の
「式 [(2)](#eq-標本平均) の分散は $n$ が大きいほど小さい。」は、直前の
「$n$ が大きいほど $\mu$ の近くに集まる」と言い回しが重なるので、
**「式 [(2)](#eq-標本平均) のとおり、分散は $n$ に反比例する。」**にした
（$\sigma^2/n$ なので事実としても正確）。英語版も同じ理由で
**「As [(2)](#eq-samplemean) shows, the variance is inversely proportional to $n$.」**
にしている。

### 直すもの

- **`math-click` の1件**が、サンプルの2つ目のブロック数式の中身を
  文字列で期待している。`\tag{標本平均}` が付くぶんを期待値に足す。
- **READMEのスクリーンショット3枚**を撮り直す
  （`node scripts/make-screenshots.mjs`）。初期表示が変わるため。

### 対象ファイル

| ファイル | 何をするか |
|---|---|
| `src/sampleDocument.ts` | 日英に `\tag` と参照を入れる |
| `scripts/verify-ui.mjs` | `math-click` の期待値を直す。`initial` に番号と参照の確認を足す |
| `docs/screenshots/` | 3枚を撮り直す |
| `docs/functional-spec.md` | サンプル文書の説明（あれば） |

## 未確認の前提

- **番号が付くとサンプル文書の高さが変わる。** ブロック数式のラッパがflexに
  なり、番号のぶん式の幅が減る（0044で幅360pxの実測: 式312px → 273px）。
  幅360pxで既存の検証（`initial` のグラフ、`layout` の横スクロール）に
  影響しないかは実装して確かめる。
- **`verify-file-build.mjs` の「数式16個」は変わらない**見込み（`\tag` は
  既存の数式に足すだけで、参照はリンク）。実装して確かめる。

### 実装して分かったこと

- **数式は16個から17個に増えた。** 前提が崩れた理由は `\tag` でも参照でもなく、
  足した文の中の `$n$`（「分散は $n$ に反比例する」）。**本文を足せば
  その中の数式も増える**という当たり前のことを、`\tag` と参照だけを見て
  見落としていた。`verify-file-build.mjs` の期待値を17に直した。
- 番号が付いても幅360pxで式と番号は重ならず（間隔16px）、横スクロールも
  出ない。既存の `initial` `layout` への影響もなかった。

## 受け入れ基準

**実機検証（`node scripts/verify-ui.mjs`）**

- [x] 初回訪問のプレビューに番号が2つ出て、上から `(1)` `(2)` である
- [x] 初回訪問のプレビューに `#eq-` へのリンクが2つあり、リンク先が
      `#eq-1` `#eq-2`、文字列が `(1)` `(2)` である
- [x] サンプルの参照をクリックすると、その式へ移動して輪郭が出る
- [x] `math-click` の全件が通る（2つ目のブロック数式の期待値を直したうえで）
- [x] 英語表示に切り替えたサンプルでも番号が2つ出て、リンク先が `#eq-1` `#eq-2`
- [x] 幅360pxで、サンプルの番号付きの式と番号が重ならず、横スクロールも増えない
- [x] `node scripts/verify-ui.mjs` の全区分が通る（494件）
- [x] `node scripts/verify-file-build.mjs` が通る（**数式は17個に増えた**。上を見よ）

**目で見るもの**

- [x] READMEのスクリーンショット3枚を撮り直し、**広い2枚（ライト・ダーク）に
      番号 `(1)` と参照のリンク `(1)` が写っている**ことを画像で確かめる
      （**3枚とも、から書き換えた**。`phone.png` は幅360pxの初期位置を撮るので、
      1つ目の式が画面より下にあり写らない。0078の前から同じ構図で、
      サンプルを変えても変わらない）

**前提**

- [x] `npm run build` と `npm test` と `npm run lint` が通る
- [x] `npm run build:file` の結果（`dist-file/`）を同じコミットに入れる

## 検討したが採らなかった案

- **番号のためだけの一文を足す** — サンプルは「何ができるか一目で分かる」
  ための文書であって、機能の展示場ではない。既にある文を書き換えれば、
  文書としての読みやすさを落とさずに済む。
- **3つ目の式を足して番号を3つにする** — サンプルが長くなる。
  0072で決めた分量を変える理由がない。
- **日英ともラベルを英語にする** — 日本語版で日本語ラベルを見せるほうが、
  「名前は自由に付けてよい」ことが伝わる。

## スコープ外

- サンプル文書の題材・先頭行の変更（検証9件が依存している）。
- パレットから `\tag` を入れる手段（[0077](../issues/0077-palette-tag.md)）。
