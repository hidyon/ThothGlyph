import katex from 'katex'
import { useMemo, useState } from 'react'
import { allFormulas, formulaGroups } from '../lib/formulas'
import type { Lang } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'
import { describeInsertion, paletteGroups } from '../lib/palette'

type Props = {
  onInsert: (snippet: string) => void
  lang: Lang
}

/**
 * 公式のタブは記号のタブの後ろに1つだけ足す。記号のグループと中身の作りが
 * 違うので、タブの添字で見分ける（名前で見分けると言語ごとに条件が要る）。
 */
const FORMULA_TAB_INDEX = paletteGroups.length

/** ラベルは静的なLaTeXなので、一度だけ描画してキャッシュする。言語には依らない。 */
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

export function SymbolPalette({ onInsert, lang }: Props) {
  // 選択中のタブは名前ではなく添字で持つ。言語を切り替えても選択が外れない。
  const [activeTab, setActiveTab] = useState(0)
  const [activeFormulaTab, setActiveFormulaTab] = useState(0)
  const rendered = useRenderedLatex()

  const showsFormulas = activeTab === FORMULA_TAB_INDEX
  const group = paletteGroups[activeTab] ?? paletteGroups[0]
  const formulaGroup = formulaGroups[activeFormulaTab] ?? formulaGroups[0]

  const tabs = [...paletteGroups.map((candidate) => candidate.name), messages.formulaTab]

  return (
    <section className="palette" aria-label={pick(messages.paletteLabel, lang)}>
      <div className="palette__tabs" role="tablist">
        {tabs.map((name, index) => (
          <button
            key={name.en}
            type="button"
            role="tab"
            aria-selected={index === activeTab}
            className={
              index === activeTab ? 'palette__tab palette__tab--active' : 'palette__tab'
            }
            onClick={() => setActiveTab(index)}
          >
            {pick(name, lang)}
          </button>
        ))}
      </div>

      {showsFormulas ? (
        <div
          className="palette__panel"
          role="tabpanel"
          aria-label={pick(messages.formulaTab, lang)}
        >
          <div className="palette__tabs palette__tabs--sub" role="tablist">
            {formulaGroups.map((candidate, index) => (
              <button
                key={candidate.name.en}
                type="button"
                role="tab"
                aria-selected={index === activeFormulaTab}
                className={
                  index === activeFormulaTab
                    ? 'palette__tab palette__tab--active'
                    : 'palette__tab'
                }
                onClick={() => setActiveFormulaTab(index)}
              >
                {pick(candidate.name, lang)}
              </button>
            ))}
          </div>

          <div className="palette__items" aria-label={pick(formulaGroup.name, lang)}>
            {formulaGroup.formulas.map((formula) => {
              const description = describeInsertion(
                { label: formula.preview, snippet: formula.snippet, title: formula.name },
                lang,
              )
              return (
                <button
                  key={formula.name.en}
                  type="button"
                  className="palette__item palette__item--formula"
                  title={description}
                  aria-label={description}
                  // フォーカスがtextareaから外れると選択範囲を失うので、押下前に既定動作を止める。
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onInsert(formula.snippet)}
                >
                  <span className="palette__formula-name">{pick(formula.name, lang)}</span>
                  <span
                    className="palette__formula-preview"
                    dangerouslySetInnerHTML={{ __html: rendered.get(formula.preview) ?? '' }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="palette__items" role="tabpanel" aria-label={pick(group.name, lang)}>
          {group.items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="palette__item"
              title={describeInsertion(item, lang)}
              aria-label={describeInsertion(item, lang)}
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
