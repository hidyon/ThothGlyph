// 遅延チャンクの入口。ここから静的にたどれるものが、エディタの後から
// 読み込まれる側に入る（KaTeX・marked・DOMPurify・KaTeXのCSS）。
// **ここに軽い依存を足さない。** 足すと初期チャンクから切り離した意味が薄れる。
import 'katex/dist/katex.min.css'
import katex from 'katex'
// ガイドの本文と964件のコマンド表（0079）。**遅延チャンク側に置く**ために
// ここから読む。初期チャンクに入れるとN10（初期JS 300 kB以下）に効く。
import { guideDocument } from '../guideDocument'
import { renderMarkdown } from './renderMarkdown'

/** パレットのラベル用。displayModeは常にfalse（行の中に収める）。 */
const renderLatex = (latex: string) =>
  katex.renderToString(latex, { throwOnError: false, displayMode: false })

export { renderMarkdown, renderLatex, guideDocument }
