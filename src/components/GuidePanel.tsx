import { useEffect, useMemo, useRef } from 'react'

import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'
import type { Engine } from '../lib/previewEngine'

type Props = {
  lang: Lang
  /** 描画エンジン。届くまでは `準備中…` を出す（0024と同じ扱い）。 */
  engine: Engine | null
  onClose: () => void
}

/**
 * 算式記載ガイド（0079）。画面に重ねて開き、閉じると元の編集に戻る。
 *
 * **編集中の文書には一切触らない。** ここからエディタへ挿入する導線も作らない
 * （挿入はパレットの役割）。中身は本文と同じ `renderMarkdown` を通すので、
 * ガイド自身がこのエディタの記法の実例になっている。
 */
export function GuidePanel({ lang, engine, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  const html = useMemo(
    () => (engine === null ? '' : engine.renderMarkdown(engine.guideDocument(lang), lang)),
    [engine, lang],
  )

  // Escapeで閉じる。エディタにフォーカスが残っていても効くよう、documentで拾う。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // 開いた直後にパネルへフォーカスを移す（そのまま矢印キーで読めるように）。
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    // 背景。ここを押すと閉じる（パネルの中のクリックは下で止める）。
    <div className="guide" onMouseDown={onClose}>
      <div
        className="guide__panel"
        role="dialog"
        aria-modal="true"
        aria-label={pick(messages.guide, lang)}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="guide__bar">
          <span className="guide__title">{pick(messages.guide, lang)}</span>
          <button type="button" className="button button--quiet" onClick={onClose}>
            {pick(messages.guideClose, lang)}
          </button>
        </div>
        {engine === null ? (
          <p className="guide__loading">{pick(messages.previewPreparing, lang)}</p>
        ) : (
          // 流し込むHTMLは renderMarkdown の出力だけ（アーキテクチャ 第4節）。
          <div className="guide__body" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  )
}
