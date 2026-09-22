import { useEffect } from 'react'
import type { RefObject } from 'react'

import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'

type Props = {
  html: string
  /** 表示中のHTMLが最新の入力より古いか。 */
  stale: boolean
  /** 数式の描画エンジンが届いているか。届くまで本文は空（0024）。 */
  ready: boolean
  lang: Lang
  /** スクロールする要素。Appが位置を測って合わせる（0010）。 */
  containerRef: RefObject<HTMLDivElement | null>
  /** スクロールしたことをAppへ伝える（エディタを追わせる。0010）。 */
  onScrollSync: () => void
  /** 数式をクリックしたことをAppへ伝える。範囲は元ソースの中身（0020）。 */
  onMathClick: (range: { start: number; end: number }) => void
  /** いま選ばれている数式。印を付ける先（0020）。 */
  activeMath: { start: number; end: number } | null
  /** 参照をたどったことをAppへ伝える。印だけ出す（0044）。 */
  onFollowRef: (range: { start: number; end: number }) => void
}

export function Preview({
  html,
  stale,
  ready,
  lang,
  containerRef,
  onScrollSync,
  onMathClick,
  activeMath,
  onFollowRef,
}: Props) {
  /*
    選んだ数式の印（0020）。HTMLは文字列で流し込むので、印はレンダリングの
    たびに当て直す。`html` を依存に入れているのは、描き直しで class が
    消えるため（消えたままにすると、印が出ているのに要素が別物になる）。
  */
  useEffect(() => {
    const root = containerRef.current
    if (root === null) return

    for (const marked of root.querySelectorAll('.math-anchor--active')) {
      marked.classList.remove('math-anchor--active')
    }
    if (activeMath === null) return

    root
      .querySelector(`.math-anchor[data-math-start="${activeMath.start}"]`)
      ?.classList.add('math-anchor--active')
  }, [activeMath, html, containerRef])

  /**
   * クリックが数式の上なら、その中身の範囲をAppへ渡す。本文の上なら何もしない。
   * 式への参照（`#eq-…`）なら、ブラウザのハッシュ遷移を止めてその式へ寄せる（0044）。
   */
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest?.('a[href^="#eq-"]')
    if (link instanceof HTMLAnchorElement) {
      // URLを変えない（プレビューは内部スクロールで、戻る先も作りたくない）。
      event.preventDefault()
      followRef(link.getAttribute('href') ?? '')
      return
    }

    const anchor = (event.target as Element).closest?.('.math-anchor')
    if (!(anchor instanceof HTMLElement)) return

    const start = Number(anchor.dataset.mathStart)
    const end = Number(anchor.dataset.mathEnd)
    if (!Number.isInteger(start) || !Number.isInteger(end)) return

    onMathClick({ start, end })
  }

  /**
   * 参照の飛び先までプレビューを寄せ、その式に印を付ける（0044）。
   *
   * **ソースのカーソルと選択範囲には触らない。** 読み返している最中に編集位置を
   * 失わないため（0010のスクロール同期と同じ線）。飛び先が無ければ何もしない。
   */
  const followRef = (href: string) => {
    const root = containerRef.current
    if (root === null) return

    const target = root.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)
    if (!(target instanceof HTMLElement)) return

    const top =
      target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
    // 上に少し余白を残す。ぴったり上端に付けると見出しの下に隠れて見える。
    root.scrollTop = Math.max(0, top - 40)

    const start = Number(target.dataset.mathStart)
    const end = Number(target.dataset.mathEnd)
    if (Number.isInteger(start) && Number.isInteger(end)) onFollowRef({ start, end })
  }

  return (
    <section className="pane pane--preview" aria-label={pick(messages.previewLabel, lang)}>
      <header className="pane__header">
        {pick(messages.previewHeader, lang)}
        {/* 追いつくまでの間だけ出す。プレビュー自体は薄くしない（読めなくなる）。 */}
        {!ready && <span className="pane__note">{pick(messages.previewPreparing, lang)}</span>}
        {ready && stale && <span className="pane__note">{pick(messages.previewStale, lang)}</span>}
      </header>
      {/* html は renderMarkdown 内で DOMPurify を通している。 */}
      <div
        className="preview"
        ref={containerRef}
        onScroll={onScrollSync}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  )
}
