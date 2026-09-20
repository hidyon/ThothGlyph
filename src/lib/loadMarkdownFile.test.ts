import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES, checkFile, normalizeText } from './loadMarkdownFile'

describe('checkFile', () => {
  it('.md を受け入れる', () => {
    expect(checkFile('memo.md', 100)).toEqual({ ok: true })
  })

  it('.markdown と .txt も受け入れる', () => {
    expect(checkFile('memo.markdown', 100)).toEqual({ ok: true })
    expect(checkFile('memo.txt', 100)).toEqual({ ok: true })
  })

  it('拡張子の大文字小文字を問わない', () => {
    expect(checkFile('MEMO.MD', 100)).toEqual({ ok: true })
  })

  it('それ以外の拡張子は断る', () => {
    expect(checkFile('image.png', 100)).toEqual({ ok: false, reason: 'extension' })
    expect(checkFile('拡張子なし', 100)).toEqual({ ok: false, reason: 'extension' })
  })

  it('名前に .md を含んでも末尾でなければ断る', () => {
    expect(checkFile('memo.md.png', 100)).toEqual({ ok: false, reason: 'extension' })
  })

  it('上限ちょうどは受け入れ、1バイト超えたら断る', () => {
    expect(checkFile('memo.md', MAX_FILE_BYTES)).toEqual({ ok: true })
    expect(checkFile('memo.md', MAX_FILE_BYTES + 1)).toEqual({ ok: false, reason: 'size' })
  })

  it('拡張子と大きさの両方が外れていたら拡張子を先に返す（読む前に断れるほう）', () => {
    expect(checkFile('image.png', MAX_FILE_BYTES + 1)).toEqual({ ok: false, reason: 'extension' })
  })
})

describe('normalizeText', () => {
  it('先頭のBOMを落とす', () => {
    expect(normalizeText('﻿# 見出し')).toBe('# 見出し')
  })

  it('途中のU+FEFFは残す（本文の一部かもしれない）', () => {
    expect(normalizeText('a﻿b')).toBe('a﻿b')
  })

  it('CRLFをLFに揃える', () => {
    expect(normalizeText('a\r\nb\r\n')).toBe('a\nb\n')
  })

  it('CRだけの改行もLFにする', () => {
    expect(normalizeText('a\rb')).toBe('a\nb')
  })

  it('LFだけの文書は変えない', () => {
    expect(normalizeText('a\nb\n')).toBe('a\nb\n')
  })

  it('BOMと改行の両方を一度に直す', () => {
    expect(normalizeText('﻿# 見出し\r\n本文\r\n')).toBe('# 見出し\n本文\n')
  })

  it('数式の中の記号を壊さない', () => {
    expect(normalizeText('$\\frac{a}{b}$')).toBe('$\\frac{a}{b}$')
  })
})
