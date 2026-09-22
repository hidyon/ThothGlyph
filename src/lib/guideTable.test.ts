import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { guideCommands, guideEnvironments } from './guideCommands'
import { buildCommandTable, guideCategories } from './guideTable'

describe('コマンド一覧のデータ', () => {
  // 954件はREADMEにも書いてある（0035と同じ形）。数が変わったらここが落ちるので、
  // README側の「算式記載ガイド」の行も直すこと。
  it('954件のコマンドと33件の環境を持つ', () => {
    expect(guideCommands).toHaveLength(954)
    expect(guideEnvironments).toHaveLength(33)
  })

  it('すべての行がコマンド・描画用のLaTeX・分類を持つ', () => {
    for (const command of guideCommands) {
      expect(command.name, 'コマンド名').toMatch(/^\\/)
      expect(command.latex, `${command.name} のLaTeX`).not.toBe('')
      expect(
        guideCategories.some((category) => category.id === command.category),
        `${command.name} の分類 ${command.category} が一覧にある`,
      ).toBe(true)
    }
  })

  /**
   * ガイドに載せた以上は描けることを保証する。載せたのに壊れる状態は、
   * 0063（未対応コマンドが黙って混ざる）をガイドが増やすことになる。
   */
  it('全件のLaTeXがKaTeXでエラーにならない', () => {
    for (const command of guideCommands) {
      expect(() =>
        katex.renderToString(command.latex, {
          throwOnError: true,
          strict: false,
          displayMode: command.displayMode === true,
        }),
      ).not.toThrow()
    }
  })

  it('環境の例がブロック数式としてエラーにならない', () => {
    for (const env of guideEnvironments) {
      expect(() =>
        katex.renderToString(env.latex, { throwOnError: true, strict: false, displayMode: true }),
      ).not.toThrow()
    }
  })

  /**
   * 内部用マクロと、KaTeXが同梱しているKhan由来の色マクロは載せない。
   * `\show` `\message` `\errmessage` はコンソールに出力を吐くので、
   * 混ざるとガイドを開くたびに汚れる。
   */
  it('内部用マクロと色マクロが一覧に出てこない', () => {
    const names = new Set(guideCommands.map((command) => command.name))

    for (const internal of ['\\show', '\\message', '\\errmessage', '\\@ifstar', '\\@char']) {
      expect(names.has(internal), `${internal} は載せない`).toBe(false)
    }
    for (const color of ['\\blueA', '\\goldD', '\\redE', '\\kaBlue']) {
      expect(names.has(color), `${color} は載せない`).toBe(false)
    }
    expect([...names].filter((name) => name.startsWith('\\@'))).toHaveLength(0)
  })

  it('コマンドが重複しない', () => {
    expect(new Set(guideCommands.map((command) => command.name)).size).toBe(guideCommands.length)
  })
})

describe('buildCommandTable', () => {
  for (const lang of ['ja', 'en'] as const) {
    it(`${lang}: 全件が表の行として出る`, () => {
      const table = buildCommandTable(lang)
      const rows = table.split('\n').filter((line) => line.startsWith('| `'))

      expect(rows).toHaveLength(guideCommands.length + guideEnvironments.length)
    })

    it(`${lang}: 分類の見出しが件数つきで出る`, () => {
      const table = buildCommandTable(lang)

      for (const category of guideCategories) {
        const count = guideCommands.filter((command) => command.category === category.id).length
        expect(table).toContain(`### ${category.name[lang]}（${count}）`)
      }
    })
  }

  it('名前の欄はパレットに名前があるものだけ埋まる', () => {
    const table = buildCommandTable('ja')

    // `\frac{a}{b}` はパレットの「分数」。`\eqsim` はパレットに無い。
    expect(table).toContain('| `\\frac{a}{b}` | $\\frac{a}{b}$ | 分数 |')
    expect(table).toContain('| `\\eqsim` | $\\eqsim$ |  |')
  })

  it('ブロック数式でしか描けないものは文言で代える', () => {
    expect(buildCommandTable('ja')).toContain('ブロック数式の中でのみ')
    expect(buildCommandTable('en')).toContain('In display math only')
  })
})
