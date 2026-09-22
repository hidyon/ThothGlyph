// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { guideDocument, guidePartOne } from './guideDocument'
import { renderMarkdown } from './lib/renderMarkdown'

describe('第1部', () => {
  for (const lang of ['ja', 'en'] as const) {
    it(`${lang}: 13項目の見出しがある`, () => {
      const headings = guidePartOne(lang)
        .split('\n')
        .filter((line) => /^### \d+\. /.test(line))

      expect(headings).toHaveLength(13)
      for (const heading of headings) {
        expect(heading.replace(/^### \d+\.\s*/, ''), '見出しの文言').not.toBe('')
      }
    })
  }

  it('日英で項目の並びが同じ番号になっている', () => {
    const numbers = (lang: 'ja' | 'en') =>
      guidePartOne(lang)
        .split('\n')
        .filter((line) => /^### \d+\. /.test(line))
        .map((line) => line.match(/^### (\d+)\./)?.[1])

    expect(numbers('ja')).toEqual(numbers('en'))
  })
})

describe('ガイド全文の描画', () => {
  for (const lang of ['ja', 'en'] as const) {
    /**
     * 載せたコマンドが描けないまま出ると、0063（未対応コマンドが本文に混ざる）を
     * ガイドが増やすことになる。KaTeXは `throwOnError: false` で呼ばれるので、
     * 落ちずに赤字のクラスが付く。それが1件も無いことを見る。
     */
    it(`${lang}: katex-error が1件も出ない`, () => {
      const html = renderMarkdown(guideDocument(lang), lang)

      expect(html).not.toContain('katex-error')
    })

    it(`${lang}: グラフがSVGとして描かれる`, () => {
      expect(renderMarkdown(guideDocument(lang), lang)).toContain('<svg')
    })

    it(`${lang}: 第1部の式の番号と参照が働く`, () => {
      const html = renderMarkdown(guideDocument(lang), lang)

      // `\tag` を書いた式に番号が出て、本文の参照がその式を指す。
      expect(html).toContain('id="eq-')
      expect(html).toContain('href="#eq-')
    })
  }
})
