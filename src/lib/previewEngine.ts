/**
 * 数式の描画エンジン（KaTeX・marked・DOMPurify）を、エディタの読み込みから
 * 切り離して取りに行く（[0024](../../docs/specs/0024-bundle-size.md)）。
 *
 * 「使うときに読む」ではなく、アプリの起動と同時に読み始める。初期表示の
 * サンプル文書にもパレットのラベルにも数式があるので、操作を待つと
 * 初期チャンク→遅延チャンクの直列待ちになり、プレビューが出るまでが
 * かえって遅くなる。
 */
import type { Lang } from './i18n'

export type Engine = {
  renderMarkdown: (source: string, lang: Lang) => string
  renderLatex: (latex: string) => string
}

// 呼び出し側が複数あっても取得は1回だけ。失敗したPromiseは捨てて、
// 次に呼ばれたらもう一度試せるようにする。
let pending: Promise<Engine> | null = null

export function loadEngine(): Promise<Engine> {
  pending ??= import('./engine').catch((error) => {
    pending = null
    throw error
  })
  return pending
}
