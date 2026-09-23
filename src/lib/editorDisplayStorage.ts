export type EditorDisplay = { lineNumbers: boolean; syntaxHighlight: boolean }

const KEY = 'thothglyph:editor-display:v1'
const DEFAULT: EditorDisplay = { lineNumbers: true, syntaxHighlight: true }

export function loadEditorDisplay(): EditorDisplay {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '')
    if (typeof value !== 'object' || value === null) return DEFAULT
    const item = value as Record<string, unknown>
    if (item.version !== 1 || typeof item.lineNumbers !== 'boolean' || typeof item.syntaxHighlight !== 'boolean') return DEFAULT
    return { lineNumbers: item.lineNumbers, syntaxHighlight: item.syntaxHighlight }
  } catch { return DEFAULT }
}

export function saveEditorDisplay(value: EditorDisplay): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify({ version: 1, ...value })); return true } catch { return false }
}
