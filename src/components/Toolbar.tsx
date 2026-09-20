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
  source: string
  saveState: SaveState
  onReset: () => void
  theme: Theme
  onToggleTheme: () => void
  lang: Lang
  onToggleLang: () => void
}

/**
 * `保存しました 12:34` の時刻部分。秒は出さない（1秒ごとに動いて視線を奪う）。
 *
 * 言語で書式を変えないのは、24時間表記の HH:MM がどちらの言語でも同じ読みだから。
 */
function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function saveMessage(state: SaveState, lang: Lang): string {
  switch (state.status) {
    case 'pending':
      return pick(messages.saving, lang)
    case 'saved': {
      const time = formatSavedAt(state.savedAt)
      return time ? pick(messages.savedAt(time), lang) : pick(messages.saved, lang)
    }
    case 'failed':
      return pick(messages.saveFailed, lang)
    case 'idle':
      return ''
  }
}

export function Toolbar({
  source,
  saveState,
  onReset,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setFailed(false)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // http:// 経由やブラウザ設定でクリップボードAPIが使えないことがある。
      setCopied(false)
      setFailed(true)
      window.setTimeout(() => setFailed(false), 3000)
    }
  }

  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        {/*
          記号のパスを書き写さず public/favicon.svg をそのまま参照する。
          書き写すと favicon を直したときに片方だけ古くなる。
          隣に matheditor の文字があるので、画像は装飾（alt="")。
        */}
        <img className="toolbar__mark" src="/favicon.svg" alt="" width="20" height="20" />
        <h1 className="toolbar__title">matheditor</h1>
      </div>
      <div className="toolbar__actions">
        <span className="toolbar__status" role="status">
          {copied && pick(messages.copied, lang)}
          {failed && pick(messages.copyFailed, lang)}
        </span>
        {/* 保存状態はコピー結果とは別の要素。同時に出ても互いを消さない。 */}
        <span
          className={`toolbar__save${saveState.status === 'failed' ? ' toolbar__save--failed' : ''}`}
          role="status"
          // 狭い画面では文言を省略表示するので、全文はtitleで読めるようにする。
          title={saveMessage(saveState, lang)}
        >
          {saveMessage(saveState, lang)}
        </span>
        <button
          type="button"
          className="button button--quiet"
          onClick={onToggleLang}
          title={pick(messages.langTitle, lang)}
        >
          {/* 狭い画面では「言語:」を省いて状態だけ出す。 */}
          <span className="button__label">{pick(messages.langPrefix, lang)}</span>
          {langLabel(lang)}
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={onToggleTheme}
          title={pick(messages.themeTitle, lang)}
        >
          {/* 狭い画面では「テーマ:」を省いて状態だけ出す。 */}
          <span className="button__label">{pick(messages.themePrefix, lang)}</span>
          {themeLabel(theme, lang)}
        </button>
        {/*
          幅480px以下では長い文言が画面から溢れるので、短いほうへ差し替える（0033）。
          どちらを出すかはCSSで決める。aria-labelに長いほうを常に置くのは、
          読み上げとテストから見える名前を画面幅で変えないため。
        */}
        <button
          type="button"
          className="button button--quiet"
          onClick={onReset}
          aria-label={pick(messages.reset, lang)}
        >
          <span className="button__wide">{pick(messages.reset, lang)}</span>
          <span className="button__narrow">{pick(messages.resetShort, lang)}</span>
        </button>
        <button type="button" className="button" onClick={copy} aria-label={pick(messages.copy, lang)}>
          <span className="button__wide">{pick(messages.copy, lang)}</span>
          <span className="button__narrow">{pick(messages.copyShort, lang)}</span>
        </button>
      </div>
    </header>
  )
}
