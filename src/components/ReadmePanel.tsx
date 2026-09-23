import { useEffect, useMemo, useRef } from 'react'

import readmeSource from '../../README.md?raw'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'
import type { Engine } from '../lib/previewEngine'

type Props = {
  lang: Lang
  engine: Engine | null
  onClose: () => void
}

/*
  READMEはリポジトリ内では docs/ 以下を参照するが、アプリでは public/ の同梱画像を
  読む。変換対象を固定の3パスに限り、利用者のMarkdownを処理する経路にはしない。
 */
const bundledReadme = readmeSource
  .replace('public/favicon.svg', './favicon.svg')
  .replace('docs/images/thothglyph-mascot.png', './thothglyph-thoth-mascot.png')
  .replace('docs/screenshots/wide.png', './readme-wide.png')
  .replace('docs/screenshots/phone.png', './readme-phone.png')

export function ReadmePanel({ lang, engine, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const html = useMemo(
    () => (engine === null ? '' : engine.renderMarkdown(bundledReadme, lang)),
    [engine, lang],
  )

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

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <div className="readme-panel" onMouseDown={onClose}>
      <div
        className="readme-panel__content"
        role="dialog"
        aria-modal="true"
        aria-label={pick(messages.readme, lang)}
        tabIndex={-1}
        ref={panelRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="readme-panel__bar">
          <span className="readme-panel__title">{pick(messages.readme, lang)}</span>
          <button type="button" className="button button--quiet" onClick={onClose}>
            {pick(messages.guideClose, lang)}
          </button>
        </div>
        {engine === null ? (
          <p className="readme-panel__loading">{pick(messages.previewPreparing, lang)}</p>
        ) : (
          <div className="readme-panel__body" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  )
}
