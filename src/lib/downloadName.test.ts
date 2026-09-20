import { describe, expect, it } from 'vitest'
import { contentFor, fileNameFor, isEmptySource } from './downloadName'

describe('fileNameFor', () => {
  it('先頭の見出しを名前にする', () => {
    expect(fileNameFor('# 二次方程式の解の公式\n\n本文')).toBe('二次方程式の解の公式.md')
  })

  it('英語の見出しでも同じ', () => {
    expect(fileNameFor('# The quadratic formula\n')).toBe('The quadratic formula.md')
  })

  it('見出しが途中にしかなければそれを使う', () => {
    expect(fileNameFor('前書き\n\n## 導出\n')).toBe('導出.md')
  })

  it('見出しがなければ document.md', () => {
    expect(fileNameFor('本文だけの文書')).toBe('document.md')
  })

  it('空の文書でも document.md', () => {
    expect(fileNameFor('')).toBe('document.md')
  })

  it('`#` のあとに空白がない行は見出しとして扱わない', () => {
    expect(fileNameFor('#タグのような行\n')).toBe('document.md')
  })

  it('使えない文字を - に置き換える', () => {
    expect(fileNameFor('# a/b:c*d?e"f<g>h|i\n')).toBe('a-b-c-d-e-f-g-h-i.md')
  })

  it('記法を剥がす処理は入れない（$ は残る）が、使えない文字は置き換わる', () => {
    // `*` はWindowsで使えないので `-` になる。剥がしているのではなく置き換えの結果。
    expect(fileNameFor('# **強調**と $x^2$\n')).toBe('--強調--と $x^2$.md')
  })

  it('前後の空白と . を落とす', () => {
    expect(fileNameFor('#    ... 余白あり ...   \n')).toBe('余白あり.md')
  })

  it('置き換えの結果が区切り文字だけになれば document.md', () => {
    expect(fileNameFor('# ///\n')).toBe('document.md')
    expect(fileNameFor('# - . -\n')).toBe('document.md')
  })

  it('50文字で切る', () => {
    const name = fileNameFor(`# ${'あ'.repeat(80)}\n`)
    expect(name).toBe(`${'あ'.repeat(50)}.md`)
  })
})

describe('contentFor', () => {
  it('末尾に改行がなければ足す', () => {
    expect(contentFor('# 見出し')).toBe('# 見出し\n')
  })

  it('末尾に改行があればそのまま', () => {
    expect(contentFor('# 見出し\n')).toBe('# 見出し\n')
  })

  it('空文字は空のまま（書き出す前に断る）', () => {
    expect(contentFor('')).toBe('')
  })

  it('途中の改行を触らない', () => {
    expect(contentFor('a\n\nb')).toBe('a\n\nb\n')
  })
})

describe('isEmptySource', () => {
  it('空白だけなら空とみなす', () => {
    expect(isEmptySource('   \n\t\n')).toBe(true)
    expect(isEmptySource('')).toBe(true)
  })

  it('文字があれば空ではない', () => {
    expect(isEmptySource('  a  ')).toBe(false)
  })
})
