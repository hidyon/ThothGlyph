import { describe, expect, it } from 'vitest'

import { mirrorHtml } from './mirrorHtml'

describe('mirrorHtml', () => {
  it('指定した行の先頭にだけ span を置く', () => {
    expect(mirrorHtml('a\nb\nc', [2])).toBe('a\n<span data-line="2"></span>b\nc\n')
  })

  it('複数の行に置ける', () => {
    expect(mirrorHtml('a\nb', [1, 2])).toBe(
      '<span data-line="1"></span>a\n<span data-line="2"></span>b\n',
    )
  })

  it('行番号を1つも渡さなければ本文だけになる', () => {
    expect(mirrorHtml('a\nb', [])).toBe('a\nb\n')
  })

  it('存在しない行番号は無視する', () => {
    expect(mirrorHtml('a', [5])).toBe('a\n')
  })

  it('末尾に改行を足す（pre-wrapでは末尾の改行が行にならないため）', () => {
    expect(mirrorHtml('a', [])).toBe('a\n')
    // 元から改行で終わっていれば、空の最終行のぶんと合わせて2つになる。
    expect(mirrorHtml('a\n', [])).toBe('a\n\n')
  })

  it('& と < をエスケープする（> 単体はタグにならないので触らない）', () => {
    expect(mirrorHtml('<script>a & b', [])).toBe('&lt;script>a &amp; b\n')
  })

  it('エスケープしても文字数の対応が崩れない（行の数が変わらない）', () => {
    const source = '<a>\n&amp;\nふつうの行'
    expect(mirrorHtml(source, []).split('\n')).toHaveLength(4)
  })

  it('空文字列でも改行1つを返す', () => {
    expect(mirrorHtml('', [])).toBe('\n')
  })
})
