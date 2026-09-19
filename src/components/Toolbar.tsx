import { useState } from 'react'

export type SaveState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'saved'; savedAt: string }
  | { status: 'failed' }

type Props = {
  source: string
  saveState: SaveState
  onReset: () => void
}

/** `保存しました 12:34` の時刻部分。秒は出さない（1秒ごとに動いて視線を奪う）。 */
function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function saveMessage(state: SaveState): string {
  switch (state.status) {
    case 'pending':
      return '保存中…'
    case 'saved': {
      const time = formatSavedAt(state.savedAt)
      return time ? `保存しました ${time}` : '保存しました'
    }
    case 'failed':
      return '保存できません（ブラウザの設定か容量の上限）'
    case 'idle':
      return ''
  }
}

export function Toolbar({ source, saveState, onReset }: Props) {
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
      <h1 className="toolbar__title">matheditor</h1>
      <div className="toolbar__actions">
        <span className="toolbar__status" role="status">
          {copied && 'コピーしました'}
          {failed && 'コピーできませんでした（手動で選択してください）'}
        </span>
        {/* 保存状態はコピー結果とは別の要素。同時に出ても互いを消さない。 */}
        <span
          className={`toolbar__save${saveState.status === 'failed' ? ' toolbar__save--failed' : ''}`}
          role="status"
          // 狭い画面では文言を省略表示するので、全文はtitleで読めるようにする。
          title={saveMessage(saveState)}
        >
          {saveMessage(saveState)}
        </span>
        <button type="button" className="button button--quiet" onClick={onReset}>
          サンプルに戻す
        </button>
        <button type="button" className="button" onClick={copy}>
          Markdownをコピー
        </button>
      </div>
    </header>
  )
}
