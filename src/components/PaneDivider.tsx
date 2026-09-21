import type { KeyboardEvent, PointerEvent } from 'react'

type Props = {
  /** 読み上げ用の名前（`lib/messages.ts` から渡す）。 */
  label: string
  /** ドラッグとキーの移動量。右が正、左が負（px）。 */
  onMove: (deltaX: number) => void
  /** ドラッグを終えた（保存する合図）。 */
  onCommit: () => void
  /** 既定に戻す。 */
  onReset: () => void
}

/** 左右キー1回で動く量。ドラッグと違って刻みが要る。 */
const STEP = 16

/**
 * 領域の境目（0057）。グリッドの列として6pxを占める。
 *
 * ポインタを掴んだ要素に固定する（`setPointerCapture`）ので、速く動かして
 * 仕切りの外へ出てもドラッグが切れない。位置は「前回からの差」で渡し、
 * 幅の計算はApp側に任せる（下限の丸めが1か所に集まる）。
 */
export function PaneDivider({ label, onMove, onCommit, onReset }: Props) {
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 既定のドラッグ（テキスト選択）が走ると、ソースの文字が選ばれてしまう。
    event.preventDefault()
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    let lastX = event.clientX

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      onMove(moveEvent.clientX - lastX)
      lastX = moveEvent.clientX
    }
    const handleUp = () => {
      element.releasePointerCapture(event.pointerId)
      element.removeEventListener('pointermove', handleMove)
      element.removeEventListener('pointerup', handleUp)
      onCommit()
    }
    element.addEventListener('pointermove', handleMove)
    element.addEventListener('pointerup', handleUp)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onMove(event.key === 'ArrowRight' ? STEP : -STEP)
    onCommit()
  }

  return (
    <div
      className="pane-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
    />
  )
}
