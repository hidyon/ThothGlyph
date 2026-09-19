import katex from 'katex'
import { useMemo, useState } from 'react'
import { describeInsertion, paletteGroups } from '../lib/palette'

type Props = {
  onInsert: (snippet: string) => void
}

/** ボタンのラベルは静的なLaTeXなので、一度だけ描画してキャッシュする。 */
function useRenderedLabels() {
  return useMemo(
    () =>
      new Map(
        paletteGroups.flatMap((group) =>
          group.items.map((item) => [
            item.label,
            katex.renderToString(item.label, {
              throwOnError: false,
              displayMode: false,
            }),
          ]),
        ),
      ),
    [],
  )
}

export function SymbolPalette({ onInsert }: Props) {
  const [activeGroup, setActiveGroup] = useState(paletteGroups[0].name)
  const labels = useRenderedLabels()

  const group =
    paletteGroups.find((candidate) => candidate.name === activeGroup) ??
    paletteGroups[0]

  return (
    <section className="palette" aria-label="記号パレット">
      <div className="palette__tabs" role="tablist">
        {paletteGroups.map((candidate) => (
          <button
            key={candidate.name}
            type="button"
            role="tab"
            aria-selected={candidate.name === group.name}
            className={
              candidate.name === group.name
                ? 'palette__tab palette__tab--active'
                : 'palette__tab'
            }
            onClick={() => setActiveGroup(candidate.name)}
          >
            {candidate.name}
          </button>
        ))}
      </div>

      <div className="palette__items" role="tabpanel" aria-label={group.name}>
        {group.items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="palette__item"
            title={describeInsertion(item)}
            aria-label={describeInsertion(item)}
            // フォーカスがtextareaから外れると選択範囲を失うので、押下前に既定動作を止める。
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onInsert(item.snippet)}
            dangerouslySetInnerHTML={{ __html: labels.get(item.label) ?? '' }}
          />
        ))}
      </div>
    </section>
  )
}
