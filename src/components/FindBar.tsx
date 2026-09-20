import type { RefObject } from 'react'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'

type Props = {
  query: string
  replacement: string
  /** 置換の行を出しているか。 */
  showReplace: boolean
  matchCount: number
  /** 何件目か（0始まり）。一致がなければ -1。 */
  index: number
  lang: Lang
  inputRef: RefObject<HTMLInputElement | null>
  onQueryChange: (value: string) => void
  onReplacementChange: (value: string) => void
  onToggleReplace: () => void
  onStep: (direction: 1 | -1) => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onClose: () => void
}

/**
 * 文書内の検索・置換バー（[0043](../../docs/specs/0043-find-replace.md)）。
 *
 * 描画と入力の受け取りだけを持つ。一致の計算と置換の実行は `Editor` 側にある
 * （一致は裏のハイライト層にも要るので、両方から見える場所に置いている）。
 */
export function FindBar({
  query,
  replacement,
  showReplace,
  matchCount,
  index,
  lang,
  inputRef,
  onQueryChange,
  onReplacementChange,
  onToggleReplace,
  onStep,
  onReplaceOne,
  onReplaceAll,
  onClose,
}: Props) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      onStep(event.shiftKey ? -1 : 1)
    }
  }

  const count =
    matchCount === 0
      ? pick(messages.findNone, lang)
      : pick(messages.findCount(index + 1, matchCount), lang)

  return (
    <div className="find" role="search">
      <div className="find__row">
        <input
          ref={inputRef}
          type="text"
          className="find__field"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pick(messages.findPlaceholder, lang)}
          aria-label={pick(messages.findPlaceholder, lang)}
          spellCheck={false}
        />
        <span className="find__count" aria-live="polite">
          {count}
        </span>
        {/* 幅480px以下では文言を記号に差し替える。名前は aria-label で固定（0033）。 */}
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => onStep(-1)}
          disabled={matchCount === 0}
          aria-label={pick(messages.findPrev, lang)}
        >
          <span className="button__wide">{pick(messages.findPrev, lang)}</span>
          <span className="button__narrow">{pick(messages.findPrevShort, lang)}</span>
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => onStep(1)}
          disabled={matchCount === 0}
          aria-label={pick(messages.findNext, lang)}
        >
          <span className="button__wide">{pick(messages.findNext, lang)}</span>
          <span className="button__narrow">{pick(messages.findNextShort, lang)}</span>
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={onToggleReplace}
          aria-expanded={showReplace}
        >
          {pick(messages.replaceToggle, lang)}
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={onClose}
          aria-label={pick(messages.findClose, lang)}
        >
          <span className="button__wide">{pick(messages.findClose, lang)}</span>
          <span className="button__narrow">{pick(messages.findCloseShort, lang)}</span>
        </button>
      </div>
      {showReplace && (
        <div className="find__row">
          <input
            type="text"
            className="find__field"
            value={replacement}
            onChange={(event) => onReplacementChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pick(messages.replacePlaceholder, lang)}
            aria-label={pick(messages.replacePlaceholder, lang)}
            spellCheck={false}
          />
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={onReplaceOne}
            disabled={matchCount === 0}
            aria-label={pick(messages.replaceOne, lang)}
          >
            <span className="button__wide">{pick(messages.replaceOne, lang)}</span>
            <span className="button__narrow">{pick(messages.replaceOneShort, lang)}</span>
          </button>
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={onReplaceAll}
            disabled={matchCount === 0}
            aria-label={pick(messages.replaceAll, lang)}
          >
            <span className="button__wide">{pick(messages.replaceAll, lang)}</span>
            <span className="button__narrow">{pick(messages.replaceAllShort, lang)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
