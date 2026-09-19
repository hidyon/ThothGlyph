import { useState } from 'react'

type Props = {
  source: string
}

export function Toolbar({ source }: Props) {
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
        <button type="button" className="button" onClick={copy}>
          Markdownをコピー
        </button>
      </div>
    </header>
  )
}
