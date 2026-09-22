export type PersonalSnippet = { id: string; name: string; body: string }

const KEY = 'thothglyph:personal-snippets:v1'
const BACKUP_VERSION = 1

const valid = (value: unknown): value is PersonalSnippet => {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    item.name.trim() !== '' &&
    typeof item.body === 'string' &&
    item.body !== ''
  )
}

export const createPersonalSnippetsBackup = (items: PersonalSnippet[]): string =>
  JSON.stringify({ version: BACKUP_VERSION, snippets: items }, null, 2)

export const readPersonalSnippetsBackup = (text: string): PersonalSnippet[] | null => {
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null) return null
    const backup = value as Record<string, unknown>
    if (backup.version !== BACKUP_VERSION || !Array.isArray(backup.snippets)) return null
    return backup.snippets.every(valid) ? backup.snippets : null
  } catch {
    return null
  }
}

export const loadPersonalSnippets = (): PersonalSnippet[] => {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(valid) : []
  } catch {
    return []
  }
}

export const savePersonalSnippets = (items: PersonalSnippet[]): boolean => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items))
    return true
  } catch {
    return false
  }
}
