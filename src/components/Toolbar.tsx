import { useState } from 'react'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { langLabel } from '../lib/langStorage'
import { messages } from '../lib/messages'
import type { Theme } from '../lib/themeStorage'
import { themeLabel } from '../lib/themeStorage'

export type SaveState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'saved'; savedAt: string }
  | { status: 'failed' }

type Props = {
  theme: Theme
  onToggleTheme: () => void
  lang: Lang
  onToggleLang: () => void
}

export function Toolbar({ theme, onToggleTheme, lang, onToggleLang }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mascotOpen, setMascotOpen] = useState(false)

  return (
    <header className="toolbar">
      <div className="toolbar__identity">
        <button type="button" className="toolbar__mascot-button" onClick={() => setMascotOpen(true)} aria-label="トトを拡大">
          <img className="toolbar__mascot" src="./thothglyph-thoth-mascot.png" alt="" />
        </button>
        <h1 className="toolbar__title">ThothGlyph</h1>
      </div>
      {mascotOpen && (
        <div className="mascot-dialog" role="dialog" aria-modal="true" aria-label="トト">
          <button type="button" className="mascot-dialog__backdrop" aria-label="閉じる" onClick={() => setMascotOpen(false)} />
          <div className="mascot-dialog__content">
            <img src="./thothglyph-thoth-mascot.png" alt="数式の巻物を持つトト" />
            <button type="button" className="button button--quiet" onClick={() => setMascotOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
      <div className="toolbar__settings">
        <button
          type="button"
          className="button button--quiet toolbar__settings-button"
          aria-label={pick(messages.settings, lang)}
          title={pick(messages.settings, lang)}
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          ⚙
        </button>
        {settingsOpen && (
          <div className="toolbar__settings-menu">
            <button type="button" className="button button--quiet" onClick={onToggleLang}>
              {pick(messages.langPrefix, lang)}
              {langLabel(lang)}
            </button>
            <button type="button" className="button button--quiet" onClick={onToggleTheme}>
              {pick(messages.themePrefix, lang)}
              {themeLabel(theme, lang)}
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
