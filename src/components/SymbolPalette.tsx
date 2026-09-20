import katex from 'katex'
import type { KeyboardEvent } from 'react'
import { Fragment, useMemo, useRef, useState } from 'react'
import type { Formula } from '../lib/formulas'
import { allFormulas, formulaGroups } from '../lib/formulas'
import type { Lang, Text } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'
import type { PaletteItem } from '../lib/palette'
import { describeInsertion, paletteGroups } from '../lib/palette'
import { hitKey, hitSnippet, searchPalette } from '../lib/search'

type Props = {
  onInsert: (snippet: string) => void
  /** 検索欄からエディタへ戻る（Escape）ための経路。 */
  onFocusEditor: () => void
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

export function SymbolPalette({ onInsert, onFocusEditor, lang }: Props) {
  // 選択中のタブは名前ではなく添字で持つ。言語を切り替えても選択が外れない。
  const [activeTab, setActiveTab] = useState(0)
  const [activeFormulaTab, setActiveFormulaTab] = useState(0)
  // 検索中もタブの選択はそのまま残す。クエリを消せば見ていたタブに戻る。
  const [query, setQuery] = useState('')
  const rendered = useRenderedLatex()
  const searchInput = useRef<HTMLInputElement>(null)
  const resultsPanel = useRef<HTMLDivElement>(null)

  const { hits, omitted } = useMemo(() => searchPalette(query), [query])
  const searching = query.trim().length > 0

  const showsFormulas = activeTab === FORMULA_TAB_INDEX
  const group = paletteGroups[activeTab] ?? paletteGroups[0]
  const formulaGroup = formulaGroups[activeFormulaTab] ?? formulaGroups[0]

  const tabs = [...paletteGroups.map((candidate) => candidate.name), messages.formulaTab]

  /** 結果のボタン。矢印キーは折り返しを見ず、並び順の前後として扱う。 */
  const resultButtons = () =>
    Array.from(resultsPanel.current?.querySelectorAll<HTMLButtonElement>('.palette__item') ?? [])

  const focusResult = (index: number) => {
    const buttons = resultButtons()
    if (buttons.length === 0) return
    buttons[(index + buttons.length) % buttons.length].focus()
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const [first] = hits
      if (first === undefined) return
      event.preventDefault()
      onInsert(hitSnippet(first))
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusResult(0)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      // 空のままのEscapeは「パレットから出たい」の意味に取る。
      if (query === '') onFocusEditor()
      else setQuery('')
    }
  }

  const handleResultsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = resultButtons()
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if (index < 0) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      focusResult(index + 1)
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      focusResult(index - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      searchInput.current?.focus()
    }
  }

  /** 検索結果では、どのグループの記号かをtooltipに添える。 */
  const withGroup = (description: string, from?: Text) =>
    from === undefined ? description : pick(messages.inGroup(description, pick(from, lang)), lang)

  const symbolButton = (item: PaletteItem, from?: Text) => {
    const description = withGroup(describeInsertion(item, lang), from)
    return (
      <button
        key={item.label}
        type="button"
        className="palette__item"
        title={description}
        aria-label={description}
        // フォーカスがtextareaから外れると選択範囲を失うので、押下前に既定動作を止める。
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onInsert(item.snippet)}
        dangerouslySetInnerHTML={{ __html: rendered.get(item.label) ?? '' }}
      />
    )
  }

  const formulaButton = (formula: Formula, from?: Text) => {
    const description = withGroup(
      describeInsertion(
        { label: formula.preview, snippet: formula.snippet, title: formula.name },
        lang,
      ),
      from,
    )
    return (
      <button
        key={formula.name.en}
        type="button"
        className="palette__item palette__item--formula"
        title={description}
        aria-label={description}
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
  }

  return (
    <section className="palette" aria-label={pick(messages.paletteLabel, lang)}>
      {/* タブと検索欄を同じ行に並べる。検索欄に行を与えると、狭い画面で
          パレットが更に高くなる（0032）。display:contents でタブは
          この行の直接の子として並びつつ、role="tablist" の入れ物は残す。 */}
      <div className="palette__bar">
        <div className="palette__tabs" role="tablist">
          {tabs.map((name, index) => (
            <button
              key={name.en}
              type="button"
              role="tab"
              // 横断検索の最中は「このタブを見ている」が嘘になるので、どれも選ばない。
              aria-selected={!searching && index === activeTab}
              className={
                !searching && index === activeTab
                  ? 'palette__tab palette__tab--active'
                  : 'palette__tab'
              }
              onClick={() => {
                setQuery('')
                setActiveTab(index)
              }}
            >
              {pick(name, lang)}
            </button>
          ))}
        </div>
        <input
          ref={searchInput}
          type="search"
          className="palette__search"
          value={query}
          placeholder={pick(messages.searchPlaceholder, lang)}
          aria-label={pick(messages.searchLabel, lang)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      {searching ? (
        <div
          className="palette__items palette__items--results"
          ref={resultsPanel}
          aria-label={pick(messages.searchResults, lang)}
          onKeyDown={handleResultsKeyDown}
        >
          {hits.length === 0 ? (
            <p className="palette__empty">{pick(messages.searchEmpty, lang)}</p>
          ) : (
            // 記号と公式が同じ一覧に並ぶので、キーは種別を含めたものにする。
            hits.map((hit) => (
              <Fragment key={hitKey(hit)}>
                {hit.kind === 'symbol'
                  ? symbolButton(hit.item, hit.group)
                  : formulaButton(hit.formula, hit.group)}
              </Fragment>
            ))
          )}
          {omitted > 0 && (
            <p className="palette__empty">{pick(messages.searchOmitted(omitted), lang)}</p>
          )}
        </div>
      ) : showsFormulas ? (
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
            {formulaGroup.formulas.map((formula) => formulaButton(formula))}
          </div>
        </div>
      ) : (
        <div className="palette__items" role="tabpanel" aria-label={pick(group.name, lang)}>
          {group.items.map((item) => symbolButton(item))}
        </div>
      )}
    </section>
  )
}
