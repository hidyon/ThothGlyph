import { useEffect, useRef, useState } from 'react'
import { findMatches, matchAfter, replaceAll, replaceOne, step } from '../lib/findMatches'
import type { Match } from '../lib/findMatches'
import type { InsertResult } from '../lib/insertSnippet'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'

type Props = {
  /** 検索の対象。エディタの内容そのもの。 */
  source: string
  /** 開いたときの初期値（エディタで選択していた文字列）。 */
  initialQuery: string
  lang: Lang
  /** 一致をtextarea上で選ぶ（見えるところまでスクロールする）。 */
  onSelect: (match: Match) => void
  /** 置き換える。Undo履歴に乗せるためAppの挿入経路を通す（0021）。 */
  onReplace: (result: InsertResult) => void
  onClose: () => void
}

/**
 * 文書内の検索・置換バー（[0043](../../docs/specs/0043-find-replace.md)）。
 *
 * 検索語・置換語・何件目かはここだけの一時的な状態で、保存もしない
 * （パレットの検索クエリと同じ扱い）。textareaを触る操作はAppが持っている。
 */
export function FindBar({ source, initialQuery, lang, onSelect, onReplace, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [current, setCurrent] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const matches = findMatches(source, query)
  // 置換や編集で件数が減っても、範囲の外を指したままにしない。
  const index = matches.length === 0 ? -1 : Math.min(current, matches.length - 1)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const go = (next: number) => {
    const match = matches[next]
    if (match === undefined) return
    setCurrent(next)
    onSelect(match)
  }

  /** 検索語を変えたら、先頭から数えて最初の一致へ移る（選択も動かす）。 */
  const handleQuery = (value: string) => {
    setQuery(value)
    const found = findMatches(source, value)
    const next = matchAfter(found, 0)
    setCurrent(next === -1 ? 0 : next)

    const match = found[next]
    if (match !== undefined) onSelect(match)
  }

  const handleReplaceOne = () => {
    const match = matches[index]
    if (match === undefined) return
    onReplace(replaceOne(source, match, replacement))
    // 置換したぶん詰まるので、同じ番号がそのまま「次の一致」になる。
  }

  const handleReplaceAll = () => {
    const replaced = replaceAll(source, query, replacement)
    if (replaced === null) return
    onReplace(replaced.result)
    setCurrent(0)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (matches.length === 0) return
      go(step(matches.length, index, event.shiftKey ? -1 : 1))
    }
  }

  const count =
    matches.length === 0
      ? pick(messages.findNone, lang)
      : pick(messages.findCount(index + 1, matches.length), lang)

  return (
    <div className="find" role="search">
      <div className="find__row">
        <input
          ref={input}
          type="text"
          className="find__field"
          value={query}
          onChange={(event) => handleQuery(event.target.value)}
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
          onClick={() => go(step(matches.length, index, -1))}
          disabled={matches.length === 0}
          aria-label={pick(messages.findPrev, lang)}
        >
          <span className="button__wide">{pick(messages.findPrev, lang)}</span>
          <span className="button__narrow">{pick(messages.findPrevShort, lang)}</span>
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => go(step(matches.length, index, 1))}
          disabled={matches.length === 0}
          aria-label={pick(messages.findNext, lang)}
        >
          <span className="button__wide">{pick(messages.findNext, lang)}</span>
          <span className="button__narrow">{pick(messages.findNextShort, lang)}</span>
        </button>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => setShowReplace((open) => !open)}
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
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pick(messages.replacePlaceholder, lang)}
            aria-label={pick(messages.replacePlaceholder, lang)}
            spellCheck={false}
          />
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={handleReplaceOne}
            disabled={matches.length === 0}
            aria-label={pick(messages.replaceOne, lang)}
          >
            <span className="button__wide">{pick(messages.replaceOne, lang)}</span>
            <span className="button__narrow">{pick(messages.replaceOneShort, lang)}</span>
          </button>
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={handleReplaceAll}
            disabled={matches.length === 0}
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
