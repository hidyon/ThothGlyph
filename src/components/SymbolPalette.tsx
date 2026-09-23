import type { KeyboardEvent, ReactNode } from 'react'
import { Fragment, useMemo, useRef, useState } from 'react'
import type { Formula } from '../lib/formulas'
import { allFormulas, formulaGroups } from '../lib/formulas'
import type { Lang, Text } from '../lib/i18n'
import { pick } from '../lib/i18n'
import { messages } from '../lib/messages'
import { PaneIcon } from './PaneIcon'
import type { PaletteItem } from '../lib/palette'
import { FORMULA_TAB_ICON, describeInsertion, paletteGroups } from '../lib/palette'
import type { PersonalSnippet } from '../lib/personalSnippets'
import { hitKey, hitSnippet, searchPalette } from '../lib/search'

type Props = {
  onInsert: (snippet: string) => void
  onFocusEditor: () => void
  onOpenGuide: () => void
  snippets: PersonalSnippet[]
  selectedText: () => string
  onSaveSnippet: (name: string, body: string, id?: string) => boolean
  onDeleteSnippet: (id: string) => boolean
  onExportSnippets: () => void
  onImportSnippets: (files: FileList | null) => void
  lang: Lang
  renderLatex?: (latex: string) => string
}

type Draft = { id?: string; name: string; body: string }

const FORMULA_TAB_INDEX = paletteGroups.length
const PERSONAL_TAB_INDEX = paletteGroups.length + 1
const GUIDE_TAB_INDEX = paletteGroups.length + 2

function useRenderedLatex(render: ((latex: string) => string) | undefined) {
  return useMemo(() => {
    if (render === undefined) return new Map<string, string>()

    return new Map([
      ...paletteGroups.flatMap((group) =>
        group.items.map((item) => [item.label, render(item.label)] as const),
      ),
      ...allFormulas.map((formula) => [formula.preview, render(formula.preview)] as const),
    ])
  }, [render])
}

export function SymbolPalette({
  onInsert,
  onFocusEditor,
  onOpenGuide,
  snippets,
  selectedText,
  onSaveSnippet,
  onDeleteSnippet,
  onExportSnippets,
  onImportSnippets,
  lang,
  renderLatex,
}: Props) {
  const [activeTab, setActiveTab] = useState(0)
  const [activeFormulaTab, setActiveFormulaTab] = useState(0)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftError, setDraftError] = useState('')
  const rendered = useRenderedLatex(renderLatex)
  const searchInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const resultsPanel = useRef<HTMLDivElement>(null)

  const { hits, omitted } = useMemo(() => searchPalette(query), [query])
  const searching = query.trim().length > 0
  const showsFormulas = activeTab === FORMULA_TAB_INDEX
  const showsPersonal = activeTab === PERSONAL_TAB_INDEX
  const group = paletteGroups[activeTab] ?? paletteGroups[0]
  const formulaGroup = formulaGroups[activeFormulaTab] ?? formulaGroups[0]
  const tabs = [
    ...paletteGroups.map((candidate) => ({ name: candidate.name, icon: candidate.icon })),
    { name: messages.formulaTab, icon: FORMULA_TAB_ICON },
    { name: messages.personalTab, icon: '★' },
    { name: messages.guide, icon: '?' },
  ]

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

  const withGroup = (description: string, from?: Text) =>
    from === undefined ? description : pick(messages.inGroup(description, pick(from, lang)), lang)

  const labelOf = (
    latex: string,
  ): {
    children?: ReactNode
    dangerouslySetInnerHTML?: { __html: string }
  } => {
    const html = rendered.get(latex)
    return html === undefined
      ? { children: <span className="palette__source">{latex}</span> }
      : { dangerouslySetInnerHTML: { __html: html } }
  }

  const symbolButton = (item: PaletteItem, from?: Text) => {
    const description = withGroup(describeInsertion(item, lang), from)
    return (
      <button
        key={item.label}
        type="button"
        className="palette__item"
        title={description}
        aria-label={description}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onInsert(item.snippet)}
        {...labelOf(item.label)}
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
        <span className="palette__formula-preview" {...labelOf(formula.preview)} />
      </button>
    )
  }

  const startSavingSelection = () => {
    const body = selectedText()
    if (body === '') {
      setDraftError(pick(messages.personalNeedSelection, lang))
      return
    }
    setDraft({ name: '', body })
    setDraftError('')
  }

  const submitDraft = () => {
    if (draft === null) return
    if (draft.name.trim() === '') {
      setDraftError(pick(messages.personalNameRequired, lang))
      return
    }
    if (draft.body === '') {
      setDraftError(pick(messages.personalBodyRequired, lang))
      return
    }
    if (onSaveSnippet(draft.name, draft.body, draft.id)) {
      setDraft(null)
      setDraftError('')
    }
  }

  const personalPanel = (
    <div className="personal-snippets" role="tabpanel" aria-label={pick(messages.personalTab, lang)}>
      <button
        type="button"
        className="button button--quiet personal-snippets__save-selection"
        onMouseDown={(event) => event.preventDefault()}
        onClick={startSavingSelection}
      >
        {pick(messages.personalSaveSelection, lang)}
      </button>
      <div className="personal-snippets__backup">
        <button type="button" className="button button--quiet" onClick={onExportSnippets}>
          {pick(messages.personalExport, lang)}
        </button>
        <button
          type="button"
          className="button button--quiet"
          onClick={() => importInput.current?.click()}
        >
          {pick(messages.personalImport, lang)}
        </button>
        <input
          ref={importInput}
          className="personal-snippets__file"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            onImportSnippets(event.target.files)
            event.target.value = ''
          }}
        />
      </div>
      {draftError !== '' && <p className="personal-snippets__error">{draftError}</p>}
      {draft !== null && (
        <form
          className="personal-snippets__form"
          onSubmit={(event) => {
            event.preventDefault()
            submitDraft()
          }}
        >
          <label>
            {pick(messages.personalName, lang)}
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              autoFocus
            />
          </label>
          <label>
            {pick(messages.personalBody, lang)}
            <textarea
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              rows={4}
            />
          </label>
          <div className="personal-snippets__actions">
            <button type="submit" className="button">
              {pick(draft.id === undefined ? messages.personalSave : messages.personalUpdate, lang)}
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                setDraft(null)
                setDraftError('')
              }}
            >
              {pick(messages.personalCancel, lang)}
            </button>
          </div>
        </form>
      )}
      {snippets.length === 0 ? (
        <p className="personal-snippets__empty">{pick(messages.personalEmpty, lang)}</p>
      ) : (
        <ul className="personal-snippets__list">
          {snippets.map((snippet) => (
            <li key={snippet.id} className="personal-snippets__item">
              <button
                type="button"
                className="personal-snippets__insert"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsert(snippet.body)}
              >
                {snippet.name}
              </button>
              <div className="personal-snippets__item-actions">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    setDraft(snippet)
                    setDraftError('')
                  }}
                >
                  {pick(messages.personalEdit, lang)}
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    if (
                      window.confirm(pick(messages.personalDeleteConfirm(snippet.name), lang)) &&
                      onDeleteSnippet(snippet.id)
                    ) {
                      setDraft((current) => (current?.id === snippet.id ? null : current))
                    }
                  }}
                >
                  {pick(messages.personalDelete, lang)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <section className="palette" aria-label={pick(messages.paletteLabel, lang)}>
      <header className="pane__header pane__header--palette">
        <span className="pane__heading"><PaneIcon name="palette" />{pick(messages.paletteHeader, lang)}</span>
        <div className="palette__menu">
          <button
            type="button"
            className="palette__menu-button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{tabs[activeTab]?.icon}</span>
            {pick(tabs[activeTab]?.name ?? messages.paletteLabel, lang)}
            <span aria-hidden="true">⌄</span>
          </button>
          {menuOpen && (
            <div className="palette__menu-list" role="menu">
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
              {tabs.map(({ name, icon }, index) => (
                <button
                  key={name.en}
                  type="button"
                  role="menuitem"
                  className="palette__menu-item"
                  onClick={() => {
                    setQuery('')
                    setMenuOpen(false)
                    if (index === GUIDE_TAB_INDEX) {
                      onOpenGuide()
                      return
                    }
                    setActiveTab(index)
                  }}
                >
                  <span aria-hidden="true">{icon}</span>
                  {pick(name, lang)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
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
      ) : showsPersonal ? (
        personalPanel
      ) : (
        <div className="palette__items" role="tabpanel" aria-label={pick(group.name, lang)}>
          {group.items.map((item) => symbolButton(item))}
        </div>
      )}
    </section>
  )
}
