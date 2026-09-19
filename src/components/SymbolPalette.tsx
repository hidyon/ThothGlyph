import katex from 'katex'
import { useMemo, useState } from 'react'
import { allFormulas, formulaGroups } from '../lib/formulas'
import { describeInsertion, paletteGroups } from '../lib/palette'

type Props = {
  onInsert: (snippet: string) => void
}

/** 公式のタブは記号のタブと並べるが、中身の作りが違うので名前で見分ける。 */
const FORMULA_TAB = '公式'

/** ラベルは静的なLaTeXなので、一度だけ描画してキャッシュする。 */
function useRenderedLatex() {
  return useMemo(() => {
    const render = (latex: string) =>
      katex.renderToString(latex, { throwOnError: false, displayMode: false })

    return new Map([
      ...paletteGroups.flatMap((group) =>
        group.items.map((item) => [item.label, render(item.label)] as const),
      ),
      ...allFormulas.map((formula) => [formula.preview, render(formula.preview)] as const),
    ])
  }, [])
}

export function SymbolPalette({ onInsert }: Props) {
  const [activeGroup, setActiveGroup] = useState(paletteGroups[0].name)
  const [activeFormulaGroup, setActiveFormulaGroup] = useState(formulaGroups[0].name)
  const rendered = useRenderedLatex()

  const showsFormulas = activeGroup === FORMULA_TAB
  const group =
    paletteGroups.find((candidate) => candidate.name === activeGroup) ?? paletteGroups[0]
  const formulaGroup =
    formulaGroups.find((candidate) => candidate.name === activeFormulaGroup) ?? formulaGroups[0]

  const tabs = [...paletteGroups.map((candidate) => candidate.name), FORMULA_TAB]

  return (
    <section className="palette" aria-label="記号パレット">
      <div className="palette__tabs" role="tablist">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === activeGroup}
            className={
              name === activeGroup ? 'palette__tab palette__tab--active' : 'palette__tab'
            }
            onClick={() => setActiveGroup(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {showsFormulas ? (
        <div className="palette__panel" role="tabpanel" aria-label={FORMULA_TAB}>
          <div className="palette__tabs palette__tabs--sub" role="tablist">
            {formulaGroups.map((candidate) => (
              <button
                key={candidate.name}
                type="button"
                role="tab"
                aria-selected={candidate.name === formulaGroup.name}
                className={
                  candidate.name === formulaGroup.name
                    ? 'palette__tab palette__tab--active'
                    : 'palette__tab'
                }
                onClick={() => setActiveFormulaGroup(candidate.name)}
              >
                {candidate.name}
              </button>
            ))}
          </div>

          <div className="palette__items" aria-label={formulaGroup.name}>
            {formulaGroup.formulas.map((formula) => (
              <button
                key={formula.name}
                type="button"
                className="palette__item palette__item--formula"
                title={describeInsertion({
                  label: formula.preview,
                  snippet: formula.snippet,
                  title: formula.name,
                })}
                aria-label={describeInsertion({
                  label: formula.preview,
                  snippet: formula.snippet,
                  title: formula.name,
                })}
                // フォーカスがtextareaから外れると選択範囲を失うので、押下前に既定動作を止める。
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsert(formula.snippet)}
              >
                <span className="palette__formula-name">{formula.name}</span>
                <span
                  className="palette__formula-preview"
                  dangerouslySetInnerHTML={{ __html: rendered.get(formula.preview) ?? '' }}
                />
              </button>
            ))}
          </div>
        </div>
      ) : (
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
              dangerouslySetInnerHTML={{ __html: rendered.get(item.label) ?? '' }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
