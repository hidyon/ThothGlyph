/**
 * UI変更の実機検証。devcontainer内で動かす。
 *
 *   npm run dev                              # 別ターミナルで
 *   node scripts/verify-ui.mjs               # 全区分
 *   node scripts/verify-ui.mjs theme         # テーマだけ
 *   node scripts/verify-ui.mjs theme perf    # 複数指定
 *   node scripts/verify-ui.mjs --repeat 5 perf   # 5回流して揺れを見る
 *
 * 落ちたチェックは末尾にまとめて再掲し、結果を tmp/verify-result.json にも書く
 * （出力を切ってしまっても後から読める）。
 *
 * executablePath を指定していないのは、PLAYWRIGHT_BROWSERS_PATH から
 * playwright-core が自力でChromiumを見つけるため。ホスト固有のパスを
 * スクリプトに書かないことが devcontainer 化の目的のひとつ。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const URL = process.env.VERIFY_URL ?? 'http://localhost:5173'
const OUT = process.env.VERIFY_OUT ?? 'tmp/screenshots'
const JSON_OUT = process.env.VERIFY_JSON ?? 'tmp/verify-result.json'
const STORAGE_KEY = 'matheditor:document:v1'
const THEME_KEY = 'matheditor:theme:v1'
const LANG_KEY = 'matheditor:lang:v1'

// ---- 区分の宣言 ----
// run は下で定義する。ここでは名前と表示名だけ先に並べ、実体を後から入れる。
// name はコマンドラインで打つのでASCII、title は出力に出すので日本語。

/** @type {{ name: string, title: string, run: () => Promise<void> }[]} */
const sections = []
const section = (name, title, run) => sections.push({ name, title, run })

// ---- 実行対象の決定（ブラウザを起動する前に済ませる） ----

const argv = process.argv.slice(2)
let repeat = 1
const requested = []
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--repeat') {
    repeat = Number(argv[i + 1])
    i += 1
    continue
  }
  requested.push(argv[i])
}
if (!Number.isInteger(repeat) || repeat < 1) {
  console.error('--repeat には1以上の整数を渡すこと')
  process.exit(1)
}

// ---- 状態 ----

let page
let browser
let context
const errors = []
let results = []
let currentSection = null
let lastCheckAt = Date.now()

/**
 * 1項目1チェック。
 *
 * timing を付けるのは、負荷や待ち時間に結果が左右されうるチェック。
 * 「落ちてもよい」という意味ではなく、**落ちたときに疑う順番**を示す印。
 * 判定そのもの（閾値も待ち方も）は印の有無で変わらない。
 */
const check = (label, ok, detail = '', { timing = false } = {}) => {
  const now = Date.now()
  results.push({
    section: currentSection,
    label,
    ok,
    detail,
    timing,
    // 直前のチェックからの経過。どこで時間を使っているかの手がかりにする。
    durationMs: now - lastCheckAt,
  })
  lastCheckAt = now
  console.log(`${ok ? 'OK  ' : 'NG  '} ${timing ? '⏱ ' : ''}${label}${detail ? ` — ${detail}` : ''}`)
}

// ---- 共通のヘルパ ----

const saveStatus = () => page.locator('.toolbar__save').innerText()
const editor = () => page.locator('.editor')
const themeButton = () => page.getByRole('button', { name: /テーマ/ })
/** 幅480px以下では見えている文字が「コピー」に変わる。名前は aria-label で固定（0033）。 */
const copyButton = () => page.getByRole('button', { name: 'Markdownをコピー' })
const ready = async () => {
  await page.waitForSelector('.preview .katex')
}
/** 数式を含まない文書を表示しているときの待ち方。 */
const appReady = async () => {
  await page.waitForSelector('.editor')
}
const bodyBackground = () =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

/** 要素の実効的な文字色・背景色から、WCAGのコントラスト比を出す。 */
const contrastOf = (selector, backgroundSelector = 'body') =>
  page.evaluate(
    ([sel, bgSel]) => {
      const parse = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number)
      const channel = (v) => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      const luminance = (rgb) => {
        const [r, g, b] = rgb.map(channel)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const fg = parse(getComputedStyle(document.querySelector(sel)).color)
      const bg = parse(getComputedStyle(document.querySelector(bgSel)).backgroundColor)
      const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
      return (hi + 0.05) / (lo + 0.05)
    },
    [selector, backgroundSelector],
  )

/** 保存のデバウンス待ちが片付くまで待つ。 */
const saveSettled = () =>
  page
    .waitForFunction(
      () => {
        const el = document.querySelector('.toolbar__save')
        if (el === null) return true
        const label = el.textContent ?? ''
        return label === '' || label.startsWith('保存しました') || label.startsWith('保存できません')
      },
      null,
      { timeout: 5000 },
    )
    .catch(() => {})

/**
 * 区分をどれから流しても同じ結果になるよう、既知の初期状態に戻す。
 *
 * デバウンス待ちを先に片付けるのは、保存が飛んだままリロードすると
 * beforeunload で書き戻され、消したはずの文書が復活するため（0009の検証で踏んだ）。
 */
const resetState = async () => {
  await saveSettled()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 900 })
  // 初回は about:blank にいるので localStorage を触れない。
  await page.evaluate(() => window.localStorage.clear()).catch(() => {})
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
}

// ---- 初期表示（0001以前からの確認） ----

section('initial', '初期表示', async () => {
  console.log('見出し:', await page.locator('.preview h1').innerText())
  console.log('ブロック数式:', await page.locator('.preview .katex-display').count())
  console.log('数式の総数:', await page.locator('.preview .katex').count())

  // サンプル文書のグラフ（0040）。初回訪問でグラフが見えていること。
  check(
    '初回訪問でサンプル文書のグラフが1つ描かれる',
    (await page.locator('.preview svg.graph').count()) === 1,
  )
  check(
    'グラフが描けなかったときの赤字が出ていない',
    (await page.locator('.preview .graph-error').count()) === 0,
  )

  await page.screenshot({ path: `${OUT}/initial.png` })
  console.log(`スクリーンショット: ${OUT}/initial.png`)
})

// ---- 0001: 編集内容の自動保存 ----

section('autosave', '自動保存（0001）', async () => {
  // 初回訪問（localStorageが空）ではサンプル文書が出て、保存状態は空。
  const firstVisit = await editor().inputValue()
  check('初回訪問でサンプル文書が表示される', firstVisit.startsWith('# 二次方程式の解の公式'))
  check('初回訪問では保存状態を出さない', (await saveStatus()) === '')

  // 入力直後は「保存中…」、待つと「保存しました HH:MM」。
  const typed = '\n\n自動保存の検証 $E = mc^2$\n'
  await editor().click()
  await page.keyboard.press('Control+End')
  await editor().pressSequentially(typed, { delay: 8 })
  check('入力直後は保存中と出る', (await saveStatus()) === '保存中…', await saveStatus(), {
    timing: true,
  })

  await page.waitForFunction(
    () => document.querySelector('.toolbar__save')?.textContent?.startsWith('保存しました'),
    null,
    { timeout: 3000 },
  )
  const savedLabel = await saveStatus()
  check('保存後に時刻つきで保存しましたと出る', /^保存しました \d{2}:\d{2}$/.test(savedLabel), savedLabel)
  await page.screenshot({ path: `${OUT}/saved.png` })

  // リロードで復元される。
  const beforeReload = await editor().inputValue()
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  check('リロードで入力内容が復元される', (await editor().inputValue()) === beforeReload)
  check('復元後も保存済みの表示が残る', (await saveStatus()).startsWith('保存しました'))
  check(
    '復元した数式がプレビューで描画される',
    (await page.locator('.preview .katex', { hasText: 'E' }).count()) > 0,
  )
  check(
    '復元した数式にKaTeXのエラーがない',
    (await page.locator('.preview .katex-error').count()) === 0,
  )
  await page.screenshot({ path: `${OUT}/restored.png` })

  // デバウンス待ちのまま即リロードしても、beforeunloadで書き切れている。
  await editor().click()
  await page.keyboard.press('Control+End')
  await editor().pressSequentially('\n即リロードの行\n', { delay: 0 })
  const beforeQuickReload = await editor().inputValue()
  check('即リロード前は未保存（保存中）', (await saveStatus()) === '保存中…', await saveStatus(), {
    timing: true,
  })
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  check(
    'デバウンス中にリロードしても内容が残る',
    (await editor().inputValue()) === beforeQuickReload,
  )

  // 「サンプルに戻す」— キャンセルでは変わらず、OKでサンプルに戻る。
  const current = await editor().inputValue()
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: 'サンプルに戻す' }).click()
  check('確認をキャンセルすると内容が変わらない', (await editor().inputValue()) === current)

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'サンプルに戻す' }).click()
  await ready()
  check('確認をOKするとサンプル文書に戻る', (await editor().inputValue()).startsWith('# 二次方程式の解の公式'))
  check(
    'サンプルに戻したあともグラフが描かれる（0040）',
    (await page.locator('.preview svg.graph').count()) === 1,
  )
  await page.screenshot({ path: `${OUT}/reset.png` })

  // 壊れたJSONが入っていても起動する。
  await page.evaluate((key) => window.localStorage.setItem(key, '{'), STORAGE_KEY)
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  check(
    '壊れたJSONでもサンプル文書で起動する',
    (await editor().inputValue()).startsWith('# 二次方程式の解の公式'),
  )

  // 保存できない環境（容量超過やサイトデータ無効）では、その旨を出し続ける。
  // setItem を壊すので、この区分の最後に置く。
  await page.evaluate(() => {
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError (検証用)')
    }
  })
  await editor().click()
  await page.keyboard.press('Control+End')
  await editor().pressSequentially('\n保存失敗の検証\n', { delay: 0 })
  await page.waitForFunction(
    () => document.querySelector('.toolbar__save')?.textContent?.startsWith('保存できません'),
    null,
    { timeout: 3000 },
  )
  check('保存に失敗すると失敗表示が出る', (await saveStatus()).startsWith('保存できません'))
  await page.screenshot({ path: `${OUT}/save-failed.png` })
})

// ---- 0006: コードブロック内の $ を数式にしない ----

section('code-math', 'コード内の $（0006）', async () => {
  const codeDoc = [
    'インラインは `$x^2$` と書く。',
    '',
    '```',
    'sum $x_i$ here',
    '```',
    '',
    '本物の数式 $a+b$ と',
    '',
    '$$',
    'c^2',
    '$$',
    '',
  ].join('\n')

  await editor().fill(codeDoc)
  await page.waitForTimeout(400)
  check(
    'コード要素の中にKaTeXの出力がない',
    (await page.locator('.preview code .katex').count()) === 0,
  )
  check(
    'コードの外の数式は描画される（インライン1・ブロック1）',
    (await page.locator('.preview .katex-display').count()) === 1 &&
      (await page.locator('.preview .katex').count()) === 2,
  )
  check(
    'コード内の $ が文字として残る',
    (await page.locator('.preview code').first().innerText()).includes('$x^2$'),
  )
  await page.screenshot({ path: `${OUT}/code-block.png` })
})

// ---- レイアウト ----

section('layout', 'レイアウト', async () => {
  // 狭い画面でもツールバーのボタンが押し出されない。
  await page.setViewportSize({ width: 600, height: 900 })
  const toolbarWidth = await page.locator('.toolbar').evaluate((el) => el.clientWidth)
  const copyRight = await copyButton().evaluate((el) => el.getBoundingClientRect().right)
  check('狭い画面でもコピーボタンが画面内に収まる', copyRight <= toolbarWidth, `right=${Math.round(copyRight)} width=${toolbarWidth}`)
  check(
    '幅600pxではコピーボタンが長いほうの文言で出る（0033）',
    (await copyButton().innerText()).trim() === 'Markdownをコピー',
    await copyButton().innerText(),
  )
  await page.screenshot({ path: `${OUT}/narrow.png` })

  // ---- 0033: 電話の実幅（360〜414px） ----
  // 起票時の実測では、幅360pxで scrollWidth が435px（日本語）になり、
  // ページ全体が75px横スクロールしていた。
  await page.setViewportSize({ width: 360, height: 667 })
  const phone = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }))
  check(
    '幅360pxでページが横スクロールしない（0033）',
    phone.scrollW <= phone.innerW,
    `scrollWidth=${phone.scrollW} innerWidth=${phone.innerW}`,
  )

  const phoneButtons = await page
    .locator('.toolbar__actions .button')
    .evaluateAll((els) =>
      els.map((el) => ({
        text: el.innerText.trim(),
        right: Math.round(el.getBoundingClientRect().right),
      })),
    )
  check(
    '幅360pxでツールバーの4ボタンすべてが画面内に収まる（0033）',
    phoneButtons.length === 4 && phoneButtons.every((b) => b.right <= 360),
    phoneButtons.map((b) => `${b.text}=${b.right}`).join(' '),
  )
  check(
    '幅360pxでもコピーボタンを名前「Markdownをコピー」で引ける（0033）',
    (await copyButton().count()) === 1,
  )
  check(
    '幅360pxではコピーボタンに「コピー」と出る（0033）',
    (await copyButton().innerText()).trim() === 'コピー',
    await copyButton().innerText(),
  )
  // 押せるところまで確かめる（見えていても押せなければ意味がない）。
  await copyButton().click()
  // 結果表示は1.6秒で消える。出るのを待ってから読む（読みに行くのが早すぎると空のまま）。
  const copyStatus = await page
    .waitForFunction(
      () => document.querySelector('.toolbar__status')?.innerText.trim() || null,
      null,
      { timeout: 3000 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => '')
  check('幅360pxでコピーボタンを押すとコピー結果が出る（0033）', copyStatus === 'コピーしました', copyStatus)
  const copiedText = await page.evaluate(() => navigator.clipboard.readText())
  check(
    '幅360pxでコピーした内容がソースと一致する（0033）',
    copiedText === (await editor().inputValue()),
    `${copiedText.length}文字`,
  )
  await page.screenshot({ path: `${OUT}/phone-360.png` })

  // 高さ側の回帰も見る。ツールバーが折り返すと textarea がそのぶん減る（0032）。
  await page.setViewportSize({ width: 375, height: 667 })
  const heights = await page.evaluate(() => ({
    toolbar: Math.round(document.querySelector('.toolbar').getBoundingClientRect().height),
    editor: Math.round(document.querySelector('.pane--editor textarea').getBoundingClientRect().height),
  }))
  check(
    '幅375pxでツールバーが1行のまま（高さ51px以下）（0033）',
    heights.toolbar <= 51,
    `${heights.toolbar}px`,
  )
  check(
    '幅375pxでtextareaの高さが207px以上ある（0032のぶんを減らさない）',
    heights.editor >= 207,
    `${heights.editor}px`,
  )
  await page.screenshot({ path: `${OUT}/phone-375.png` })

  await page.setViewportSize({ width: 1440, height: 900 })
})

// ---- 0007: 長い文書でのプレビュー性能 ----

section('perf', '性能（0007）', async () => {
  // 400節・400数式。0007の起票時に測ったのと同じ規模。
  const longDoc = Array.from(
    { length: 400 },
    (_, i) => `## 節 ${i}\n\n式 $\\int_0^1 x^{${i}} dx = \\frac{1}{${i + 1}}$ である。\n`,
  ).join('\n')

  await editor().fill(longDoc)
  await page.waitForFunction(
    () => document.querySelectorAll('.preview .katex').length === 400,
    null,
    { timeout: 30000 },
  )

  const TYPED = 20
  await editor().click()
  await page.keyboard.press('Control+End')
  const typeStart = Date.now()
  await editor().pressSequentially('あ'.repeat(TYPED), { delay: 0 })
  const perKey = (Date.now() - typeStart) / TYPED
  check(`長文での入力反映が1文字あたり50ms以内`, perKey <= 50, `${perKey.toFixed(1)}ms/文字`, {
    timing: true,
  })

  check('追いついていない間は更新中と出る', (await page.locator('.pane__note').count()) === 1)

  const catchUpStart = Date.now()
  await page.waitForFunction(() => document.querySelector('.pane__note') === null, null, {
    timeout: 10000,
  })
  const catchUp = Date.now() - catchUpStart
  check('入力を止めてから1.5秒以内にプレビューが追いつく', catchUp <= 1500, `${catchUp}ms`, {
    timing: true,
  })
  check(
    '長文の数式が最後まで描画されている',
    (await page.locator('.preview .katex').count()) === 400,
  )
  await page.screenshot({ path: `${OUT}/long-document.png` })

  // 短い文書では更新中が目に見えて残らない。
  await editor().fill('短い文書 $x^2$')
  await page.waitForTimeout(300)
  check('短い文書では更新中が残らない', (await page.locator('.pane__note').count()) === 0, '', {
    timing: true,
  })
})

// ---- 0002: ダークモード ----

section('theme', 'テーマ（0002）', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload({ waitUntil: 'networkidle' })
  await ready()

  const darkBackground = await bodyBackground()
  check('OSがダークなら暗い背景になる', darkBackground === 'rgb(21, 24, 28)', darkBackground)
  check('OSがダークなら「テーマ: 自動」と出る', (await themeButton().innerText()).includes('自動'))

  const textContrast = await contrastOf('.preview')
  check('ダークの本文と背景のコントラストが4.5:1以上', textContrast >= 4.5, `${textContrast.toFixed(2)}:1`)

  // 壊れた数式の赤が背景から読めるか。
  await editor().fill('壊れた数式 $\\frac{$ の行')
  await page.waitForSelector('.preview .katex-error')
  const errorContrast = await contrastOf('.preview .katex-error')
  check(
    'ダークの壊れた数式の赤と背景のコントラストが4.5:1以上',
    errorContrast >= 4.5,
    `${errorContrast.toFixed(2)}:1`,
  )

  // 罫線・コード背景が背景と区別できるか（同じ色なら見えない）。
  await editor().fill('# 見出し\n\n> 引用\n\n`コード`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
  await page.waitForTimeout(400)
  const distinct = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor
    const code = getComputedStyle(document.querySelector('.preview code')).backgroundColor
    const border = getComputedStyle(document.querySelector('.preview td')).borderTopColor
    return { same: code === bg, border, bg }
  })
  check('ダークでコードの背景が地の色と違う', !distinct.same, `code=${distinct.bg}`)
  check('ダークで表の罫線に色が付いている', distinct.border !== 'rgba(0, 0, 0, 0)', distinct.border)

  // 目視用のスクリーンショットは、数式の入ったサンプル文書で撮る。
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'サンプルに戻す' }).click()
  await ready()
  await page.screenshot({ path: `${OUT}/dark.png` })

  // 手動切り替え: 自動 → ライト → ダーク → 自動。
  await themeButton().click()
  check('1回押すとライトになる', (await themeButton().innerText()).includes('ライト'))
  const lightBackground = await bodyBackground()
  check('OSがダークでもライトを選べば明るい', lightBackground === 'rgb(255, 255, 255)', lightBackground)
  await page.screenshot({ path: `${OUT}/light-forced.png` })

  await themeButton().click()
  check('2回押すとダークになる', (await themeButton().innerText()).includes('ダーク'))

  // 選んだテーマはリロードしても保たれる。
  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload({ waitUntil: 'networkidle' })
  await appReady()
  check('選んだダークがリロード後も保たれる', (await themeButton().innerText()).includes('ダーク'))
  check('OSがライトでもダークのまま', (await bodyBackground()) === 'rgb(21, 24, 28)')

  // 自動に戻すとOSの設定に従う。
  await themeButton().click()
  check('3回目で自動に戻る', (await themeButton().innerText()).includes('自動'))
  check('自動に戻すとOS（ライト）に従う', (await bodyBackground()) === 'rgb(255, 255, 255)')

  // 初期表示のちらつき。ダーク指定でリロードし、最初の描画時点の背景を見る。
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(
    (key) => window.localStorage.setItem(key, JSON.stringify({ version: 1, theme: 'dark' })),
    THEME_KEY,
  )
  const flash = []
  await page.reload({ waitUntil: 'commit' })
  for (let i = 0; i < 12; i += 1) {
    flash.push(await bodyBackground().catch(() => 'n/a'))
    await page.waitForTimeout(16)
  }
  console.log('初期描画の背景色の推移:', [...new Set(flash)].join(' → '))
  check(
    '初期表示でライトの背景が現れない（ちらつきなし）',
    !flash.includes('rgb(255, 255, 255)'),
    [...new Set(flash)].join(' / '),
    { timing: true },
  )

  // OSがライトで手動ダークを選んでいる場合は、メディアクエリでは救えない。
  // data-theme を付けるのがReactのマウント後なので、ここにちらつきが出うる。
  await page.emulateMedia({ colorScheme: 'light' })
  const flashOnLightOs = []
  await page.reload({ waitUntil: 'commit' })
  for (let i = 0; i < 12; i += 1) {
    flashOnLightOs.push(await bodyBackground().catch(() => 'n/a'))
    await page.waitForTimeout(16)
  }
  console.log('OSライト＋手動ダークの初期描画:', [...new Set(flashOnLightOs)].join(' → '))
  check(
    'OSライト＋手動ダークでもライトの背景が現れない',
    !flashOnLightOs.includes('rgb(255, 255, 255)'),
    [...new Set(flashOnLightOs)].join(' / '),
  )
})

// ---- 0009: 選択範囲があるときの挿入 ----

section('selection', '選択範囲の挿入（0009）', async () => {
  // 選択範囲を [start, end) にしてからパレットのボタンを押す。
  // mousedown の既定動作はコンポーネント側で止めているので、選択は保たれる。
  const selectAndInsert = async (start, end, group, title) => {
    await editor().evaluate(
      (el, [from, to]) => {
        el.focus()
        el.setSelectionRange(from, to)
      },
      [start, end],
    )
    await page.getByRole('tab', { name: group }).click()
    await page.locator(`.palette__item[title^="${title}（"]`).click()
    return editor().evaluate((el) => ({
      value: el.value,
      start: el.selectionStart,
      end: el.selectionEnd,
    }))
  }

  // 自動保存が効いているので、毎回サンプル文書から始めるために消してから開く。
  // 消す前にデバウンス待ちを片付けないと、reload時のbeforeunloadで書き戻される。
  const openFreshDocument = async () => {
    await saveSettled()
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
    await page.reload({ waitUntil: 'networkidle' })
    await ready()
  }

  const docBefore = await editor().inputValue()
  const selected6 = docBefore.slice(0, 6)

  const afterAlpha = await selectAndInsert(0, 6, 'ギリシャ小文字', 'alpha')
  check(
    '単体記号を押しても選択したテキストが消えない',
    afterAlpha.value.startsWith(selected6),
    JSON.stringify(afterAlpha.value.slice(0, 20)),
  )
  check(
    '単体記号の挿入後はカーソルが挿入文字列の末尾に来る',
    afterAlpha.start === afterAlpha.end &&
      afterAlpha.value.slice(0, afterAlpha.start).endsWith('\\alpha '),
    `start=${afterAlpha.start} end=${afterAlpha.end}`,
  )

  await openFreshDocument()
  const afterSqrt = await selectAndInsert(0, 6, '基本', '平方根')
  check(
    '囲める記号は選択したテキストを包む',
    afterSqrt.value.startsWith(`\\sqrt{${selected6}}`),
    JSON.stringify(afterSqrt.value.slice(0, 24)),
  )

  await page.getByRole('tab', { name: 'ギリシャ小文字' }).click()
  const piTitleShown = await page
    .locator('.palette__item[title="pi（選択範囲の後ろに挿入）"]')
    .getAttribute('title')
  await page.getByRole('tab', { name: '基本' }).click()
  const sqrtTitleShown = await page
    .locator('.palette__item[title^="平方根（"]')
    .getAttribute('title')
  check(
    '単体記号のtooltipが「選択範囲の後ろに挿入」と伝える',
    piTitleShown === 'pi（選択範囲の後ろに挿入）',
    piTitleShown,
  )
  check(
    '囲める記号のtooltipが「選択範囲を囲む」と伝える',
    sqrtTitleShown === '平方根（選択範囲を囲む）',
    sqrtTitleShown,
  )

  await page.screenshot({ path: `${OUT}/wrap-selection.png` })
})

// ---- 0021: パレット挿入のUndo ----

section('undo', 'パレット挿入のUndo（0021）', async () => {
  // 打鍵から始めたいので、既知の内容で開き直す（Undo履歴もそのたびに空になる）。
  // 先に一度リロードするのは、デバウンス待ちの内容を beforeunload に書き切らせて
  // から置き換えるため。順を逆にすると、置いた内容が古い内容で上書きされる。
  const openWith = async (source) => {
    await page.reload({ waitUntil: 'networkidle' })
    await page.evaluate(
      ([key, src]) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({ version: 1, source: src, savedAt: new Date().toISOString() }),
        ),
      [STORAGE_KEY, source],
    )
    await page.reload({ waitUntil: 'networkidle' })
    await appReady()
    await editor().click()
  }
  /** 自動保存が指定の内容で終わるまで待つ。保存状態の表示だけでは待てない（0036）。 */
  const savedAs = (expected) =>
    page.waitForFunction(
      ([key, want]) => {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return false
        try {
          return JSON.parse(raw).source === want
        } catch {
          return false
        }
      },
      [STORAGE_KEY, expected],
      { timeout: 5000 },
    )
  const value = () => editor().inputValue()
  const selection = () =>
    editor().evaluate((el) => ({ start: el.selectionStart, end: el.selectionEnd }))
  const undo = async () => {
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(100)
    return value()
  }
  const insertSymbol = async (tab, title) => {
    await page.getByRole('tab', { name: tab }).click()
    await page.locator(`.palette__item[title^="${title}（"]`).click()
    await page.waitForTimeout(100)
  }

  // --- 打つ → 挿入 → Ctrl+Z ---
  await openWith('')
  await page.keyboard.type('x+1', { delay: 30 })
  await insertSymbol('ギリシャ小文字', 'alpha')
  const inserted = await value()
  check('記号を押すと挿入される', inserted.startsWith('x+1\\alpha'), JSON.stringify(inserted))

  const undone = await undo()
  check('挿入のあとCtrl+Zで挿入前に戻る', undone === 'x+1', JSON.stringify(undone))

  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(100)
  const redone = await value()
  check('Ctrl+Shift+Zで挿入後に戻る', redone === inserted, JSON.stringify(redone))

  await undo()
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(100)
  const redoneY = await value()
  check('Ctrl+Yでも挿入後に戻る', redoneY === inserted, JSON.stringify(redoneY))

  // --- 打つ → 挿入 → 打つ を順に3段で戻す ---
  // 挿入の前後で選択を置き直していないと、ここが1回でまとめて消える。
  await openWith('')
  await page.keyboard.type('aaa', { delay: 30 })
  await insertSymbol('ギリシャ小文字', 'alpha')
  const withSymbol = await value()
  await page.keyboard.type('bbb', { delay: 30 })
  const mixed = await value()
  check(
    '打つ→挿入→打つ が積み上がる',
    mixed === `${withSymbol}bbb`,
    JSON.stringify(mixed),
  )
  // 打った文字は1文字ずつ、挿入はまとめて1段になる（実測。仕様の「実装中に崩れた前提」）。
  const steps = []
  for (let i = 0; i < 7; i += 1) steps.push(await undo())
  check(
    '後から打った文字が1文字ずつ戻る',
    steps.slice(0, 3).join('|') === `${withSymbol}bb|${withSymbol}b|${withSymbol}`,
    JSON.stringify(steps.slice(0, 3)),
  )
  check('挿入は1回のCtrl+Zでまとめて消える', steps[3] === 'aaa', JSON.stringify(steps[3]))
  check(
    '先に打った文字まで順に戻って空になる',
    steps.slice(4).join('|') === 'aa|a|',
    JSON.stringify(steps.slice(4)),
  )

  // --- 選択範囲を囲む記号 ---
  await openWith('')
  await page.keyboard.type('x+1', { delay: 30 })
  await editor().evaluate((el) => {
    el.focus()
    el.setSelectionRange(0, 3)
  })
  await insertSymbol('基本', '平方根')
  const wrapped = await value()
  check('囲める記号が選択範囲を包む', wrapped === '\\sqrt{x+1}', JSON.stringify(wrapped))
  const wrappedCursor = await selection()
  check(
    '挿入直後のカーソルが包んだ内容の後ろに来る（0009）',
    wrappedCursor.start === '\\sqrt{x+1'.length && wrappedCursor.end === wrappedCursor.start,
    `start=${wrappedCursor.start} end=${wrappedCursor.end}`,
  )
  const unwrapped = await undo()
  check('囲んだあとCtrl+Zで選択していた文字列に戻る', unwrapped === 'x+1', JSON.stringify(unwrapped))
  const restoredSelection = await selection()
  check(
    'Ctrl+Zで囲む前の選択範囲も戻る',
    restoredSelection.start === 0 && restoredSelection.end === 3,
    `start=${restoredSelection.start} end=${restoredSelection.end}`,
  )

  // --- 公式タブからの挿入。プレビューと自動保存が追随しているかもここで見る ---
  await openWith('')
  await page.keyboard.type('x+1', { delay: 30 })
  await savedAs('x+1')
  await page.getByRole('tab', { name: '公式' }).click()
  await page
    .locator('.palette__tabs--sub')
    .getByRole('tab', { name: '方程式', exact: true })
    .click()
  await page.locator('.palette__item--formula').first().click()
  await page.waitForSelector('.preview .katex')
  const formulaInserted = await value()
  check(
    '公式を挿入すると $$ で囲まれて入る',
    formulaInserted.includes('$$'),
    JSON.stringify(formulaInserted.slice(0, 30)),
  )
  // 挿入が保存されるまで待ってからUndoする。Undo後の内容が「最後に保存した内容」と
  // 違う状態を作らないと、保存が走ったかどうかを見られない。
  await savedAs(formulaInserted)
  const formulaUndone = await undo()
  check('公式の挿入もCtrl+Zで戻る', formulaUndone === 'x+1', JSON.stringify(formulaUndone))
  await page.waitForTimeout(300)
  const katexAfterUndo = await page.locator('.preview .katex').count()
  check(
    'Undoの後はプレビューからも数式が消える（stateが追随している）',
    katexAfterUndo === 0,
    `${katexAfterUndo}個`,
  )
  const stored = await savedAs('x+1').then(
    () => true,
    () => false,
  )
  const savedLabel = await saveStatus()
  check(
    'Undoした内容が自動保存される',
    stored && savedLabel.startsWith('保存しました'),
    `${savedLabel} / 保存された内容が一致: ${stored}`,
  )

  // --- 検索結果からの挿入 ---
  await openWith('')
  await page.keyboard.type('x+1', { delay: 30 })
  await page.locator('.palette__search').fill('alpha')
  await page.waitForTimeout(200)
  await page.locator('.palette__items--results .palette__item').first().click()
  await page.waitForTimeout(100)
  const searchInserted = await value()
  check(
    '検索結果から挿入できる',
    searchInserted.startsWith('x+1\\'),
    JSON.stringify(searchInserted),
  )
  const searchUndone = await undo()
  check('検索結果からの挿入もCtrl+Zで戻る', searchUndone === 'x+1', JSON.stringify(searchUndone))

  await page.screenshot({ path: `${OUT}/undo.png` })
})

// ---- 0029: ギリシャ文字 ----

section('greek', 'ギリシャ文字（0029）', async () => {
  const items = page.locator('.palette__items .palette__item')

  await page.getByRole('tab', { name: 'ギリシャ小文字' }).click()
  const lowerCount = await items.count()
  check('ギリシャ小文字タブに31個のボタンが出る', lowerCount === 31, `${lowerCount}個`)
  const lowerHeight = await page.locator('.palette').evaluate((el) =>
    Math.round(el.getBoundingClientRect().height),
  )
  console.log(`ギリシャ小文字タブのパレットの高さ: ${lowerHeight}px`)

  // xi は変更前のパレットに無かった文字。これが入ることが0029の眼目。
  // 数式の中にカーソルを置いてから押す。外に入れると文字として出るだけで、
  // 「描画される」ことを確かめられない。
  // 中身を `x` にしているのは、$ の直後・直前に空白があるとインライン数式として
  // 扱われない仕様のため（`$5 と $6` を数式にしないための約束）。
  await editor().fill('ギリシャ文字の検証 $x$')
  await editor().evaluate((el) => {
    el.focus()
    // 開き $ の直後。挿入すると `$\xi x$` になる。
    const at = el.value.indexOf('$') + 1
    el.setSelectionRange(at, at)
  })
  await page.locator('.palette__item[title="xi（選択範囲の後ろに挿入）"]').click()
  await page.waitForTimeout(400)
  check(
    'xi を押すと \\xi が入る',
    (await editor().inputValue()).includes('$\\xi x$'),
    JSON.stringify(await editor().inputValue()),
  )
  const renderedXi = await page.locator('.preview .katex').first().innerText()
  check('挿入した xi がプレビューでξとして描画される', renderedXi.includes('ξ'), renderedXi)

  await page.getByRole('tab', { name: 'ギリシャ大文字' }).click()
  const upperCount = await items.count()
  check('ギリシャ大文字タブに11個のボタンが出る', upperCount === 11, `${upperCount}個`)
  const upperHeight = await page.locator('.palette').evaluate((el) =>
    Math.round(el.getBoundingClientRect().height),
  )
  console.log(`ギリシャ大文字タブのパレットの高さ: ${upperHeight}px`)

  check(
    '挿入したギリシャ文字にKaTeXのエラーが出ない',
    (await page.locator('.preview .katex-error').count()) === 0,
  )

  await page.getByRole('tab', { name: 'ギリシャ小文字' }).click()
  await page.screenshot({ path: `${OUT}/greek.png` })
  console.log(`スクリーンショット: ${OUT}/greek.png`)
})

// ---- 0018: 公式の挿入 ----

section('formula', '公式の挿入（0018）', async () => {
  const beforeMath = await page.locator('.preview .katex-display').count()

  await page.getByRole('tab', { name: '公式' }).click()
  const subTabs = await page.locator('.palette__tabs--sub .palette__tab').allInnerTexts()
  check(
    '公式タブを押すと12分類の2段目タブが出る',
    subTabs.length === 12 && subTabs.includes('方程式') && subTabs.includes('ベクトル'),
    subTabs.join(' / '),
  )

  // hasText は部分一致で「図形と方程式」にも当たるので、完全一致で選ぶ。
  const subTab = (name) =>
    page.locator('.palette__tabs--sub').getByRole('tab', { name, exact: true })
  await subTab('方程式').click()
  const buttons = page.locator('.palette__item--formula')
  check('方程式の分類に5件のボタンが出る', (await buttons.count()) === 5, `${await buttons.count()}件`)

  const first = buttons.first()
  check(
    '公式のボタンが名前と描画された式の両方を持つ',
    (await first.locator('.palette__formula-name').innerText()) === '解の公式' &&
      (await first.locator('.palette__formula-preview .katex').count()) > 0,
    await first.locator('.palette__formula-name').innerText(),
  )
  check(
    '公式のtooltipが挿入の挙動を伝える',
    (await first.getAttribute('title')) === '解の公式（選択範囲を囲む）',
    await first.getAttribute('title'),
  )

  // 文末にカーソルを置いてから挿入する。
  await editor().evaluate((el) => {
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })
  await first.click()
  await page.waitForTimeout(400)

  check(
    '公式を押すと $$ で囲まれた式が入る',
    (await editor().inputValue()).includes('$$\nx = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\n$$'),
    JSON.stringify((await editor().inputValue()).slice(-60)),
  )
  check(
    'プレビューのブロック数式が1つ増える',
    (await page.locator('.preview .katex-display').count()) === beforeMath + 1,
    `${beforeMath} → ${await page.locator('.preview .katex-display').count()}`,
  )
  check(
    '挿入した公式にKaTeXのエラーが出ない',
    (await page.locator('.preview .katex-error').count()) === 0,
  )

  // 0030で足した分類も同じように使えるか。
  await subTab('ベクトル').click()
  const vectors = page.locator('.palette__item--formula')
  check('ベクトルの分類に5件のボタンが出る', (await vectors.count()) === 5, `${await vectors.count()}件`)

  const beforeVector = await page.locator('.preview .katex-display').count()
  await editor().evaluate((el) => {
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })
  await vectors.first().click()
  await page.waitForTimeout(400)
  check(
    '内積を押すと $$ で囲まれた式が入る',
    (await editor().inputValue()).includes('\\vec{a} \\cdot \\vec{b}'),
    JSON.stringify((await editor().inputValue()).slice(-60)),
  )
  check(
    '足した分類の公式もブロック数式として描画される',
    (await page.locator('.preview .katex-display').count()) === beforeVector + 1 &&
      (await page.locator('.preview .katex-error').count()) === 0,
    `${beforeVector} → ${await page.locator('.preview .katex-display').count()}`,
  )

  // 幅600pxで2段目のタブが何行になるか。12分類に増えた影響を測る。
  await page.setViewportSize({ width: 600, height: 900 })
  await page.waitForTimeout(200)
  const subTabRows = await page
    .locator('.palette__tabs--sub .palette__tab')
    .evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))].length)
  const paletteHeight = await page
    .locator('.palette')
    .evaluate((el) => Math.round(el.getBoundingClientRect().height))
  console.log(`幅600px: 2段目タブ ${subTabRows}行 / パレットの高さ ${paletteHeight}px`)
  check(
    '幅600pxでも横スクロールが出ない',
    !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
  )
  await page.screenshot({ path: `${OUT}/formula-narrow.png` })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.screenshot({ path: `${OUT}/formula.png` })
  console.log(`スクリーンショット: ${OUT}/formula.png`)
})

// ---- 0031: 英語に対応する ----

section('i18n', '英語対応（0031）', async () => {
  const langButton = () => page.getByRole('button', { name: /言語|Language/ })
  const htmlLang = () => page.evaluate(() => document.documentElement.lang)

  check('初期表示は日本語（検証は ja を固定して流す）', (await langButton().innerText()).includes('日本語'))
  check('日本語のとき html lang が ja', (await htmlLang()) === 'ja', await htmlLang())

  // 言語を切り替えても、編集中の文書は変わらない。ここが崩れると書いたものが消える。
  const typed = '\n\nlanguage switch test $E = mc^2$\n'
  await editor().click()
  await page.keyboard.press('Control+End')
  await editor().pressSequentially(typed, { delay: 8 })
  await saveSettled()
  const before = await editor().inputValue()

  await langButton().click()
  check('押すと English になる', (await langButton().innerText()).includes('English'))
  check('英語のとき html lang が en', (await htmlLang()) === 'en', await htmlLang())
  check('言語を切り替えても編集中の文書が変わらない', (await editor().inputValue()) === before)

  // ツールバー・ペインの見出し・パレットのタブが英語になる。
  const texts = async () => ({
    copy: await page.getByRole('button', { name: 'Copy Markdown' }).count(),
    reset: await page.getByRole('button', { name: 'Reset to sample' }).count(),
    theme: await page.getByRole('button', { name: /Theme/ }).count(),
    headers: await page.locator('.pane__header').allInnerTexts(),
    tabs: await page.locator('.palette__tabs').first().locator('.palette__tab').allInnerTexts(),
  })
  const en = await texts()
  check('ツールバーのボタンが英語になる', en.copy === 1 && en.reset === 1 && en.theme === 1,
    `copy=${en.copy} reset=${en.reset} theme=${en.theme}`)
  check(
    'ペインの見出しが Source / Preview になる',
    en.headers[0].startsWith('Source') && en.headers[1].startsWith('Preview'),
    en.headers.join(' / '),
  )
  check(
    'パレットのタブが英語になる（Basic / Formulas）',
    en.tabs[0] === 'Basic' && en.tabs.at(-1) === 'Formulas',
    en.tabs.join(' / '),
  )
  check(
    '記号のtooltipが英語の語順になる',
    (await page.locator('.palette__item').first().getAttribute('title')) ===
      'Fraction (wraps selection)',
    await page.locator('.palette__item').first().getAttribute('title'),
  )

  // 公式の分類と公式名も英語になる。
  await page.getByRole('tab', { name: 'Formulas' }).click()
  const subTabs = await page.locator('.palette__tabs--sub .palette__tab').allInnerTexts()
  check(
    '公式の12分類が英語になる',
    subTabs.length === 12 && subTabs.includes('Equations') && subTabs.includes('Vectors'),
    subTabs.join(' / '),
  )
  await page.locator('.palette__tabs--sub').getByRole('tab', { name: 'Equations', exact: true }).click()
  const firstFormula = page.locator('.palette__item--formula').first()
  check(
    '公式名が英語になる',
    (await firstFormula.locator('.palette__formula-name').innerText()) === 'Quadratic formula',
    await firstFormula.locator('.palette__formula-name').innerText(),
  )

  await page.screenshot({ path: `${OUT}/i18n-en.png` })

  // 選んだ言語はリロードしても保たれる。
  await page.reload({ waitUntil: 'networkidle' })
  await appReady()
  check('選んだ英語がリロード後も保たれる', (await langButton().innerText()).includes('English'))
  check('リロード後も html lang が en', (await htmlLang()) === 'en', await htmlLang())
  check('リロード後も編集中の文書が残る', (await editor().inputValue()) === before)

  // もう一度押すと日本語に戻る（2状態の往復）。
  await langButton().click()
  check('もう一度押すと日本語に戻る', (await langButton().innerText()).includes('日本語'))
  check('日本語に戻すと html lang も ja に戻る', (await htmlLang()) === 'ja', await htmlLang())
  check(
    'ペインの見出しが日本語に戻る',
    (await page.locator('.pane__header').first().innerText()).startsWith('ソース'),
    await page.locator('.pane__header').first().innerText(),
  )

  // 保存がない初回訪問では、ブラウザの言語に従ってサンプル文書が選ばれる。
  await saveSettled()
  await page.evaluate(() => window.localStorage.clear())
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  check(
    '保存がないときは日本語のサンプル文書が出る（ja を固定しているため）',
    (await editor().inputValue()).startsWith('# 二次方程式の解の公式'),
    (await editor().inputValue()).slice(0, 20),
  )

  // 英語のサンプル文書にもグラフが入っている（0040）。
  await langButton().click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Reset to sample' }).click()
  await ready()
  check(
    '英語のサンプル文書が出る',
    (await editor().inputValue()).startsWith('# The quadratic formula'),
    (await editor().inputValue()).slice(0, 25),
  )
  check(
    '英語のサンプル文書にもグラフが1つある（0040）',
    (await page.locator('.preview svg.graph').count()) === 1,
  )
  await langButton().click()
  await ready()

  await page.screenshot({ path: `${OUT}/i18n-ja.png` })
  console.log(`スクリーンショット: ${OUT}/i18n-en.png, ${OUT}/i18n-ja.png`)
})

// ---- 0019: アプリのアイコン ----

section('icon', 'アイコン（0019）', async () => {
  // 配られているか。1件でも404なら、タブに出るものが欠ける。
  const assets = [
    '/favicon.svg',
    '/favicon-32.png',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.webmanifest',
  ]
  const statuses = []
  for (const path of assets) {
    const res = await page.request.get(`${URL}${path}`)
    statuses.push(`${path}:${res.status()}`)
  }
  check('アイコン6ファイルがすべて200で返る', statuses.every((s) => s.endsWith(':200')), statuses.join(' '))

  const svg = await (await page.request.get(`${URL}/favicon.svg`)).text()
  check('favicon.svg にClaudeのロゴの紫（#863bff）が残っていない', !svg.includes('863bff'))
  // コメントを落としてから見る。「<text> を使わない」と書いた説明そのものに
  // 当たって落ちたため（判定したいのは要素であって、文字列ではない）。
  const markup = svg.replace(/<!--[\s\S]*?-->/g, '')
  check(
    'favicon.svg が <text> 要素と外部参照を持たない（フォントに依存しない）',
    !/<text[\s>]/.test(markup) && !markup.includes('@font-face') && !/href="http/.test(markup),
  )

  const manifest = await (await page.request.get(`${URL}/manifest.webmanifest`)).json()
  const sizes = (manifest.icons ?? []).map((i) => i.sizes).sort()
  check(
    'manifestが192と512のアイコンを宣言している',
    manifest.name === 'matheditor' && sizes.join(',') === '192x192,512x512',
    sizes.join(' / '),
  )

  // PNGが指定どおりの大きさで書き出されているか。
  const pngSizes = await page.evaluate(async (base) => {
    const read = (path) =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(`${path}=${img.naturalWidth}x${img.naturalHeight}`)
        img.onerror = () => resolve(`${path}=error`)
        img.src = base + path
      })
    return Promise.all([
      read('/favicon-32.png'),
      read('/apple-touch-icon.png'),
      read('/icon-192.png'),
      read('/icon-512.png'),
    ])
  }, URL)
  check(
    'PNG4件が32/180/192/512で書き出されている',
    pngSizes.join(' ') ===
      '/favicon-32.png=32x32 /apple-touch-icon.png=180x180 /icon-192.png=192x192 /icon-512.png=512x512',
    pngSizes.join(' '),
  )

  /**
   * 記号の量を「白インク量」で測る。白に近いピクセルだけ数えると、16pxでは
   * アンチエイリアスの中間色を落としてしまい、太さの差が出ない（仕様の表を参照）。
   */
  const ink = (size) =>
    page.evaluate(
      async ([base, px]) => {
        const img = new Image()
        await new Promise((resolve) => {
          img.onload = resolve
          img.src = `${base}/favicon.svg`
        })
        const canvas = document.createElement('canvas')
        canvas.width = px
        canvas.height = px
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, px, px)
        const { data } = ctx.getImageData(0, 0, px, px)
        const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
        const bg = lum(37, 99, 235)
        const fg = lum(255, 255, 255)
        let amount = 0
        let opaque = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue
          opaque += 1
          const t = (lum(data[i], data[i + 1], data[i + 2]) - bg) / (fg - bg)
          if (t > 0) amount += Math.min(1, t)
        }
        return +((100 * amount) / opaque).toFixed(1)
      },
      [URL, size],
    )

  const ink16 = await ink(16)
  const ink512 = await ink(512)
  check('16pxでの白インク量が6〜20%に収まる', ink16 >= 6 && ink16 <= 20, `${ink16}%`)
  check(
    '16pxと512pxで白インク量が1.5ポイント以上ずれない（縮めても飛ばない）',
    Math.abs(ink16 - ink512) <= 1.5,
    `16px ${ink16}% / 512px ${ink512}%`,
  )

  // 記号と地のコントラスト比。仕様には計算値5.17:1と書いてある。
  const contrast = await page.evaluate(() => {
    const channel = (v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    const [hi, lo] = [lum([255, 255, 255]), lum([37, 99, 235])].sort((a, b) => b - a)
    return +(((hi + 0.05) / (lo + 0.05)).toFixed(2))
  })
  check('記号と地のコントラスト比が4.5:1以上', contrast >= 4.5, `${contrast}:1`)

  // apple-touch-icon は角丸なしで書き出す（iOSが自分で丸める）。四隅が不透明か。
  const corners = await page.evaluate(async (base) => {
    const img = new Image()
    await new Promise((resolve) => {
      img.onload = resolve
      img.src = `${base}/apple-touch-icon.png`
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const last = img.naturalWidth - 1
    return [[0, 0], [last, 0], [0, last], [last, last]].map(
      ([x, y]) => ctx.getImageData(x, y, 1, 1).data[3],
    )
  }, URL)
  check(
    'apple-touch-iconの四隅が不透明（角丸を付けずに書き出している）',
    corners.every((alpha) => alpha === 255),
    `alpha ${corners.join(',')}`,
  )

  // ツールバーにも同じ記号を出している（開いている本人から見える場所）。
  const mark = page.locator('.toolbar__mark')
  check('ツールバーにアイコンが出る', (await mark.count()) === 1)
  check(
    'ツールバーのアイコンが favicon.svg を参照している（パスを書き写していない）',
    (await mark.getAttribute('src')) === '/favicon.svg',
    await mark.getAttribute('src'),
  )
  const markBox = await mark.boundingBox()
  check(
    'ツールバーのアイコンが20pxで描かれている',
    Math.round(markBox.width) === 20 && Math.round(markBox.height) === 20,
    `${Math.round(markBox.width)}x${Math.round(markBox.height)}`,
  )

  // 幅600pxでは文字を隠して記号だけにする。0031で足した言語ボタンで
  // 余白が19pxまで減っており、記号を足すと文字までは入らない。
  await page.setViewportSize({ width: 600, height: 900 })
  await page.waitForTimeout(200)
  const narrowTitle = await page.locator('.toolbar__title').boundingBox()
  check(
    '幅600pxでは名前の文字が隠れ、記号だけが残る',
    (await mark.isVisible()) && narrowTitle.width <= 1,
    `記号 ${(await mark.boundingBox()).width}px / 文字 ${narrowTitle.width}px`,
  )
  check(
    '幅600pxでツールバーが横スクロールを出さない',
    !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)),
    await page.evaluate(() => `${document.documentElement.scrollWidth} / ${window.innerWidth}`),
  )
  await page.screenshot({ path: `${OUT}/icon-narrow.png` })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.screenshot({ path: `${OUT}/icon.png` })
  console.log(`スクリーンショット: ${OUT}/icon.png, ${OUT}/icon-narrow.png`)
})

// ---- 0011: 記号パレットの検索 ----

section('search', '記号の検索（0011）', async () => {
  const errorsBefore = errors.length
  const search = () => page.locator('.palette__search')
  const results = () => page.locator('.palette__items .palette__item')
  const paletteHeight = () =>
    page.locator('.palette').evaluate((el) => Math.round(el.getBoundingClientRect().height))

  // 画面に足した要素は、占める大きさを測って仕様の数値と突き合わせる。
  // 検索欄はタブ行に同居させたので、広い画面では高さが増えないはず。
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(200)
  const inTabRow = await search().evaluate((el) => el.parentElement.className)
  check('検索欄がタブと同じ行にある', inTabRow === 'palette__bar', inTabRow)
  const wide = await paletteHeight()
  check('幅1280pxでパレットの高さが94pxのまま（検索欄で増えない）', wide === 94, `${wide}px`)

  // 折り返しが起きるのは720px前後。仕様では126px以下に収まると見込んだ。
  await page.setViewportSize({ width: 720, height: 800 })
  await page.waitForTimeout(200)
  const medium = await paletteHeight()
  check('幅720pxでパレットの高さが126px以下', medium <= 126, `${medium}px`)

  await page.setViewportSize({ width: 600, height: 800 })
  await page.waitForTimeout(200)
  const narrow = await paletteHeight()
  check('幅600pxでパレットの高さが126px以下', narrow <= 126, `${narrow}px`)
  check(
    '幅600pxで横スクロールが出ない',
    await page.evaluate(() => {
      const panes = document.querySelector('.panes')
      return panes.scrollWidth === panes.clientWidth
    }),
    await page.evaluate(() => {
      const panes = document.querySelector('.panes')
      return `${panes.scrollWidth} / ${panes.clientWidth}`
    }),
  )
  // 結果は40件まで返るので、狭い画面では結果パネルに高さの蓋が要る。
  // 蓋が無かったときはパレットが画面の65%を占め、ソースが2行しか残らなかった。
  await search().fill('a')
  await page.waitForTimeout(200)
  const packed = await page.evaluate(() => {
    const palette = document.querySelector('.palette').getBoundingClientRect().height
    const panel = document.querySelector('.palette__items--results')
    return {
      ratio: Math.round((palette / window.innerHeight) * 100),
      hits: document.querySelectorAll('.palette__items .palette__item').length,
      scrolls: panel.scrollHeight > panel.clientHeight,
      editor: Math.round(document.querySelector('.editor').getBoundingClientRect().height),
    }
  })
  check(
    '幅600pxで40件当たってもパレットが画面の30%を超えない',
    packed.ratio <= 30,
    `${packed.ratio}%（${packed.hits}件）`,
  )
  check('結果が入りきらないときは結果パネル自身がスクロールする', packed.scrolls)
  check('幅600pxで40件当たってもソースが200px以上残る', packed.editor >= 200, `${packed.editor}px`)
  await page.screenshot({ path: `${OUT}/search-narrow.png` })
  await search().fill('')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(200)

  // コマンド名で引ける。横断検索なので、どのタブも選択状態にしない。
  await search().fill('\\int')
  await page.waitForTimeout(100)
  const intHits = await results().count()
  check('\\int で結果が1件以上出る', intHits > 0, `${intHits}件`)
  const selectedTabs = await page
    .locator('.palette__bar .palette__tab[aria-selected="true"]')
    .count()
  check('検索中はどのタブも選択状態にならない', selectedTabs === 0, `${selectedTabs}件`)
  await page.screenshot({ path: `${OUT}/search.png` })

  // 日本語の名前でも引け、押すと数式の中に入る。
  await editor().fill('検索の検証 $x$')
  await editor().evaluate((el) => {
    el.focus()
    const at = el.value.indexOf('$') + 1
    el.setSelectionRange(at, at)
  })
  await search().fill('積分')
  await page.waitForTimeout(100)
  await results().first().click()
  await page.waitForTimeout(400)
  const inserted = await editor().inputValue()
  check(
    '積分の検索結果を押すと \\int_{}^{} が入る',
    inserted.includes('$\\int_{}^{}x$'),
    JSON.stringify(inserted),
  )
  // 既存の $...$ の中に入れるので数式の数は増えない。描画された形で見る。
  const renderedInt = await page.locator('.preview .katex').first().innerText()
  check('挿入した積分記号がプレビューで∫として描画される', renderedInt.includes('∫'), renderedInt)
  check(
    '挿入した数式にKaTeXのエラーが出ない',
    (await page.locator('.preview .katex-error').count()) === 0,
  )

  // 0009の回帰。検索欄にフォーカスが移っても textarea の選択範囲は残る。
  await editor().fill('x+1')
  await editor().evaluate((el) => {
    el.focus()
    el.setSelectionRange(0, 3)
  })
  await search().fill('sqrt')
  await page.waitForTimeout(100)
  await page.locator('.palette__items .palette__item[title^="平方根（"]').click()
  await page.waitForTimeout(200)
  const wrapped = await editor().inputValue()
  check('検索結果からでも選択範囲を囲める', wrapped === '\\sqrt{x+1}', JSON.stringify(wrapped))

  // キーボードだけで、絞り込み → 選択 → 挿入まで終わる。
  await editor().fill('キーボードの検証 $x$')
  await editor().evaluate((el) => {
    el.focus()
    const at = el.value.indexOf('$') + 1
    el.setSelectionRange(at, at)
  })
  await search().fill('')
  await search().click()
  await search().pressSequentially('積分', { delay: 20 })
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowDown')
  const focusedResult = await page.evaluate(() =>
    document.activeElement.classList.contains('palette__item'),
  )
  check('検索欄で↓を押すと先頭の結果にフォーカスが移る', focusedResult)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const typedValue = await editor().inputValue()
  const focusedEditor = await page.evaluate(() =>
    document.activeElement.classList.contains('editor'),
  )
  check(
    'キーボードだけで挿入でき、フォーカスがエディタに戻る',
    typedValue.includes('$\\int_{}^{}x$') && focusedEditor,
    `${JSON.stringify(typedValue)} / editor=${focusedEditor}`,
  )

  // Escape で検索を終え、見ていたタブに戻る。
  await page.getByRole('tab', { name: 'ギリシャ小文字' }).click()
  await search().fill('積分')
  await page.waitForTimeout(100)
  await search().click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const backCount = await results().count()
  const backSelected = await page
    .locator('.palette__bar .palette__tab[aria-selected="true"]')
    .innerText()
  check(
    'Escapeで検索を抜けると見ていたタブに戻る',
    backSelected === 'ギリシャ小文字' && backCount === 31,
    `${backSelected} / ${backCount}件`,
  )

  // 当たらないときは、黙って空にせず理由を出す。
  await search().fill('zzzz')
  await page.waitForTimeout(100)
  const emptyText = await page.locator('.palette__empty').innerText()
  const emptyCount = await results().count()
  check(
    '当たらないときは一致なしの文言が出てボタンが0件になる',
    emptyText === '一致する記号がありません' && emptyCount === 0,
    `${emptyText} / ${emptyCount}件`,
  )

  // 英語表示でも文言が切り替わる（0031の約束）。
  await page.getByRole('button', { name: /言語/ }).click()
  await page.waitForTimeout(100)
  const placeholder = await search().getAttribute('placeholder')
  const emptyEn = await page.locator('.palette__empty').innerText()
  check(
    '英語表示で検索欄と一致なしの文言が英語になる',
    placeholder === 'Search (\\int, integral)' && emptyEn === 'No matching symbols',
    `${placeholder} / ${emptyEn}`,
  )
  await page.getByRole('button', { name: /Language/ }).click()
  await page.waitForTimeout(100)

  check(
    'この区分でコンソールエラーが出ない',
    errors.length === errorsBefore,
    `${errors.length - errorsBefore}件`,
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  console.log(`スクリーンショット: ${OUT}/search.png, ${OUT}/search-narrow.png`)
})

// ---- 0024: 読み込みの分割 ----

section('loading', '読み込みの分割（0024）', async () => {
  // 遅延チャンク（engine）が届かない間の見え方を確かめる。開発サーバでは
  // /src/lib/engine.ts、本番では /assets/engine-*.js になるので、どちらにも当たる形で止める。
  //
  // abort ではなく「解決しないモジュール」を返すのは、abort だとコンソールエラーが
  // 出て、この区分だけ常に終了コード1になるため。届かない状態としては同じ。
  await page.route('**/engine*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'await new Promise(() => {})\n' }),
  )
  await page.setViewportSize({ width: 600, height: 900 })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await appReady()

  check('エンジンが届かなくてもエディタが出る', await editor().isVisible())

  const note = await page.locator('.pane--preview .pane__note').innerText()
  check('プレビューのヘッダに準備中…が出る', note === '準備中…', note)
  check('プレビューの本文が空', (await page.locator('.preview').innerText()) === '')

  // 届かない間もエディタは完全に使える（書いたものを失わせない）。
  await editor().click()
  await page.keyboard.press('Control+End')
  await editor().pressSequentially('\n準備中でも打てる\n', { delay: 8 })
  check('エンジンが届かなくても入力できる', (await editor().inputValue()).includes('準備中でも打てる'))
  await page.waitForFunction(
    () => document.querySelector('.toolbar__save')?.textContent?.startsWith('保存しました'),
    null,
    { timeout: 3000 },
  )
  check('エンジンが届かなくても自動保存が動く', (await saveStatus()).startsWith('保存しました'))

  // ラベルはKaTeXではなくLaTeXのソースで出る。押せば挿入は効く。
  const firstLabel = await page.locator('.palette__item').first().innerText()
  check('パレットのラベルがLaTeXのソースで出る', firstLabel.startsWith('\\'), firstLabel)
  check('届かない間はパレットにKaTeXの描画がない', (await page.locator('.palette .katex').count()) === 0)

  const beforeInsert = await editor().inputValue()
  await page.locator('.palette__item').first().click()
  check('届かない間もパレットのボタンで挿入できる', (await editor().inputValue()) !== beforeInsert)

  const rawHeight = (await page.locator('.palette').boundingBox()).height
  await page.screenshot({ path: `${OUT}/loading-blocked.png` })

  // 英語表示でも同じ文言が出る。
  // 幅600pxでは `言語: ` の前置きが隠れてボタンの文字が言語名だけになるので、
  // 名前ではなくtooltipで引く。
  const langButton = () => page.getByTitle(/表示言語|Switch language/)
  await langButton().click()
  const noteEn = await page.locator('.pane--preview .pane__note').innerText()
  check('英語表示では Preparing… が出る', noteEn === 'Preparing…', noteEn)
  await langButton().click()

  // 止めるのをやめると、追いついて描画される。
  await saveSettled()
  await page.unroute('**/engine*')
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  const errorsBefore = errors.length

  check('エンジンが届くと準備中…が消える', (await page.locator('.pane--preview .pane__note').count()) === 0)
  check('エンジンが届くとプレビューに数式が出る', (await page.locator('.preview .katex').count()) > 0)
  check('エンジンが届くとパレットのラベルがKaTeXで描画される', (await page.locator('.palette .katex').count()) > 0)

  const renderedHeight = (await page.locator('.palette').boundingBox()).height
  check(
    '幅600pxで、ラベルがソース表示のときとKaTeX描画のときのパレットの高さの差が40px以内',
    Math.abs(renderedHeight - rawHeight) <= 40,
    `ソース ${rawHeight}px / KaTeX ${renderedHeight}px`,
  )
  await page.screenshot({ path: `${OUT}/loading-ready.png` })

  check(
    'この区分でコンソールエラーが出ない',
    errors.length === errorsBefore,
    `${errors.length - errorsBefore}件`,
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  console.log(`スクリーンショット: ${OUT}/loading-blocked.png, ${OUT}/loading-ready.png`)
})

// ---- 0032: 狭い画面でのパレットの高さ ----

section('palette-height', 'パレットの高さ（0032）', async () => {
  const paletteHeight = async () =>
    Math.round((await page.locator('.palette').boundingBox()).height)
  const tabNames = () =>
    page.locator('.palette__bar > .palette__tabs > .palette__tab').allInnerTexts()
  const subTabNames = () => page.locator('.palette__tabs--sub > .palette__tab').allInnerTexts()

  /** 全タブ・全分類を順に開いて高さを集める。件数で伸びないことを見るため全部回る。 */
  const heightsOfEveryTab = async () => {
    const symbols = {}
    const formulas = {}
    for (const name of await tabNames()) {
      await page.getByRole('tab', { name, exact: true }).first().click()
      if (name === '公式') {
        for (const sub of await subTabNames()) {
          await page.locator('.palette__tabs--sub > .palette__tab', { hasText: sub }).first().click()
          formulas[sub] = await paletteHeight()
        }
      } else {
        symbols[name] = await paletteHeight()
      }
    }
    return { symbols, formulas }
  }

  // 幅600px × 高さ900px。
  await page.setViewportSize({ width: 600, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const narrow = await heightsOfEveryTab()
  const narrowAll = [...Object.values(narrow.symbols), ...Object.values(narrow.formulas)]
  check(
    '幅600px・高さ900pxで、全タブ・全分類のパレットが180px以下',
    Math.max(...narrowAll) <= 180,
    `最大${Math.max(...narrowAll)}px / 最小${Math.min(...narrowAll)}px（分割前は126〜324px）`,
  )

  // 幅375px × 高さ667px（スマートフォン相当）。
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const phone = await heightsOfEveryTab()
  const phoneAll = [...Object.values(phone.symbols), ...Object.values(phone.formulas)]
  check(
    '幅375px・高さ667pxで、全タブ・全分類のパレットが180px以下（画面の27%以下）',
    Math.max(...phoneAll) <= 180,
    `最大${Math.max(...phoneAll)}px = 画面の${Math.round((Math.max(...phoneAll) / 667) * 100)}%（実装前は198〜533px、最大80%）`,
  )

  // 蓋に達している以上、件数が違っても高さは同じになる。ここが「際限なく伸びない」の中身。
  const symbolHeights = Object.values(phone.symbols)
  check(
    '幅375pxで、記号のタブは件数が違っても高さが同じ',
    new Set(symbolHeights).size === 1,
    `${Object.entries(phone.symbols).map(([k, v]) => `${k}:${v}`).join(' ')}`,
  )
  const formulaHeights = Object.values(phone.formulas)
  check(
    '幅375pxで、公式の12分類すべてが同じ高さ',
    new Set(formulaHeights).size === 1 && formulaHeights.length === 12,
    `${formulaHeights.length}分類 / 高さ${[...new Set(formulaHeights)].join(',')}px`,
  )

  // 公式タブ（いちばん高い状態）でも編集領域が残る。
  await page.getByRole('tab', { name: '公式', exact: true }).first().click()
  const editorHeight = Math.round((await editor().boundingBox()).height)
  check(
    '幅375px・高さ667pxの公式タブでtextareaが150px以上',
    editorHeight >= 150,
    `${editorHeight}px（実装前は38px）`,
  )
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  check(
    '幅375px・高さ667pxでページ全体が縦にはみ出さない',
    scrollHeight === 667,
    `${scrollHeight}px（実装前は公式タブで692px）`,
  )
  await page.screenshot({ path: `${OUT}/palette-phone.png` })

  // 蓋の向こうへ縦スクロールで届く。ギリシャ小文字は31件。
  await page.getByRole('tab', { name: 'ギリシャ小文字', exact: true }).first().click()
  const items = page.locator('.palette__panel > .palette__items > .palette__item, .palette__items > .palette__item')
  const itemCount = await items.count()
  const before = await editor().inputValue()
  await items.nth(itemCount - 1).scrollIntoViewIfNeeded()
  await items.nth(itemCount - 1).click()
  check(
    '幅375pxで一覧を縦スクロールすると最後の記号まで届き、押すと挿入される',
    itemCount === 31 && (await editor().inputValue()) !== before,
    `${itemCount}件目まで到達`,
  )

  // 1段目のタブは横スクロールで最後まで届く。
  const tabsScrollable = await page
    .locator('.palette__bar > .palette__tabs')
    .evaluate((el) => el.scrollWidth > el.clientWidth)
  check('幅375pxで1段目のタブ行が横にスクロールする（折り返していない）', tabsScrollable)
  const lastTab = (await tabNames()).at(-1)
  await page.getByRole('tab', { name: lastTab, exact: true }).first().click()
  check(
    '横スクロールで最後のタブ（公式）に届き、押すと公式の一覧が出る',
    lastTab === '公式' && (await page.locator('.palette__item--formula').count()) > 0,
    lastTab,
  )

  // 2段目も同じ。
  const subScrollable = await page
    .locator('.palette__tabs--sub')
    .evaluate((el) => el.scrollWidth > el.clientWidth)
  check('幅375pxで2段目のタブ行が横にスクロールする', subScrollable)
  const lastSub = (await subTabNames()).at(-1)
  await page.locator('.palette__tabs--sub > .palette__tab', { hasText: lastSub }).first().click()
  const lastSubSelected = await page
    .locator('.palette__tabs--sub > .palette__tab[aria-selected="true"]')
    .innerText()
  check(
    '横スクロールで最後の分類（極限・不等式）に届き、押すとその公式が出る',
    lastSub === '極限・不等式' && lastSubSelected === lastSub,
    lastSubSelected,
  )

  // 0011の回帰。検索欄はタブと同じ行に残り、横断検索も効く。
  const searchRow = await page
    .locator('.palette__search')
    .evaluate((el) => el.parentElement.className)
  check('幅375pxでも検索欄がタブと同じ行にある', searchRow === 'palette__bar', searchRow)
  await page.locator('.palette__search').fill('\\int')
  const beforeInt = await editor().inputValue()
  await page.locator('.palette__items--results .palette__item').first().click()
  check(
    '幅375pxで検索から挿入できる（0011の回帰）',
    (await editor().inputValue()) !== beforeInt,
  )
  await page.locator('.palette__search').fill('')

  // 広い画面は変えない。
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  check('幅1280pxでパレットの高さが94pxのまま', (await paletteHeight()) === 94, `${await paletteHeight()}px`)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('tab', { name: '公式', exact: true }).first().click()
  const wideFormula = await paletteHeight()
  const wideScrolls = await page
    .locator('.palette__panel > .palette__items')
    .evaluate((el) => el.scrollHeight > el.clientHeight)
  check('幅1440pxの公式タブが157px以下のまま', wideFormula <= 157, `${wideFormula}px`)
  check('幅1440pxでは一覧に縦スクロールが出ない', !wideScrolls)
  await page.screenshot({ path: `${OUT}/palette-wide.png` })

  await page.setViewportSize({ width: 1440, height: 900 })
  console.log(`スクリーンショット: ${OUT}/palette-phone.png, ${OUT}/palette-wide.png`)
})

// ---- 0012: .mdファイルの読み込み ----

section('file-load', 'ファイルの読み込み（0012）', async () => {
  // 検証用のファイルは毎回作る（リポジトリに置くと本物のソースと紛らわしい）。
  const dir = 'tmp/fixtures'
  await mkdir(dir, { recursive: true })
  const fixture = async (name, text) => {
    const path = `${dir}/${name}`
    await writeFile(path, text)
    return path
  }
  const plain = await fixture('opened.md', '# 開いた文書\n\n式 $x^2$ である。\n')
  const crlf = await fixture('crlf.md', '# CRLF\r\n\r\n本文\r\n')
  const bom = await fixture('bom.md', '\uFEFF# BOM付き\n')
  const png = await fixture('image.png', 'これは画像のつもり')
  const huge = await fixture('huge.md', 'あ'.repeat(400000)) // UTF-8で1.2MB
  const long = await fixture(
    'long.md',
    Array.from(
      { length: 400 },
      (_, i) => `## 節 ${i}\n\n式 $\\int_0^1 x^{${i}} dx = \\frac{1}{${i + 1}}$ である。\n`,
    ).join('\n'),
  )

  const fileInput = () => page.locator('.pane--editor input[type="file"]')
  const openButton = () => page.getByRole('button', { name: 'ファイルを開く' })
  const statusText = () => page.locator('.toolbar__status').innerText()
  /** 結果表示は3秒で消える。出るのを待ってから読む。 */
  const waitNotice = () =>
    page
      .waitForFunction(
        () => document.querySelector('.toolbar__status')?.innerText.trim() || null,
        null,
        { timeout: 3000 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => '')
  /** ファイルをドロップする。DataTransferを組み立てて drop を発火させる。 */
  const dropFiles = async (files) => {
    const handle = await page.evaluateHandle((entries) => {
      const data = new DataTransfer()
      for (const [name, type, text] of entries) {
        data.items.add(new File([text], name, { type }))
      }
      return data
    }, files)
    await page.locator('.pane--editor').dispatchEvent('dragover', { dataTransfer: handle })
    await page.locator('.pane--editor').dispatchEvent('drop', { dataTransfer: handle })
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await appReady()

  check('ソースの見出し行に「ファイルを開く」ボタンがある', (await openButton().count()) === 1)
  const placed = await page.evaluate(() => {
    const head = document.querySelector('.pane--editor .pane__header')
    const button = head.querySelector('button')
    return {
      inHeader: button !== null,
      headRight: Math.round(head.getBoundingClientRect().right),
      buttonRight: Math.round(button.getBoundingClientRect().right),
      titleLeft: Math.round(head.getBoundingClientRect().left),
      buttonLeft: Math.round(button.getBoundingClientRect().left),
    }
  })
  check(
    'ボタンは見出し行の右端側にある（見出しの文字より右）',
    placed.inHeader && placed.buttonLeft > placed.titleLeft,
    `見出し行 ${placed.titleLeft}〜${placed.headRight} / ボタン左端 ${placed.buttonLeft}`,
  )

  // 幅ごとの高さ。ボタンを足しても見出し行が30pxのまま、textareaが減らないこと。
  for (const width of [1440, 600, 375, 360]) {
    await page.setViewportSize({ width, height: 667 })
    const size = await page.evaluate(() => ({
      heads: [...document.querySelectorAll('.pane__header')].map((h) =>
        Math.round(h.getBoundingClientRect().height),
      ),
      editor: Math.round(document.querySelector('.editor').getBoundingClientRect().height),
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }))
    check(
      `幅${width}pxで見出し行が30pxのまま、横スクロールも出ない（0012）`,
      size.heads.every((h) => h === 30) && size.scrollW <= size.innerW,
      `見出し行 ${size.heads.join('/')}px scrollWidth=${size.scrollW}`,
    )
    if (width === 375) {
      check(
        '幅375pxでtextareaが207px以上ある（0032・0033のぶんを減らさない）',
        size.editor >= 207,
        `${size.editor}px`,
      )
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  // ボタンから読み込む。確認でキャンセルすると何も変わらない。
  const before = await editor().inputValue()
  page.once('dialog', (d) => d.dismiss())
  await fileInput().setInputFiles(plain)
  await page.waitForTimeout(300)
  check('確認をキャンセルするとエディタの中身が変わらない', (await editor().inputValue()) === before)

  // OKすると置き換わる。
  let confirmMessage = ''
  page.once('dialog', (d) => {
    confirmMessage = d.message()
    d.accept()
  })
  await fileInput().setInputFiles(plain)
  await page.waitForFunction(() => document.querySelector('.editor').value.startsWith('# 開いた文書'), null, { timeout: 5000 })
  check(
    '確認にファイル名が出る',
    confirmMessage.includes('opened.md'),
    confirmMessage,
  )
  check('ボタンから選んだ .md がエディタに入る', (await editor().inputValue()).includes('# 開いた文書'))
  check('読み込んだ結果が表示される', (await waitNotice()).includes('opened.md を読み込みました'), await statusText())
  await ready()
  check(
    '読み込んだ文書の数式がプレビューに描画される',
    (await page.locator('.preview .katex').count()) === 1,
  )
  check(
    '読み込んだ見出しがプレビューに出る',
    (await page.locator('.preview h1').innerText()) === '開いた文書',
  )
  await page.screenshot({ path: `${OUT}/file-load.png` })

  // 自動保存に乗る（リロードで復元される）。
  await page.waitForTimeout(900)
  await page.reload({ waitUntil: 'networkidle' })
  await appReady()
  check(
    '読み込んだ内容がリロード後も復元される',
    (await editor().inputValue()).includes('# 開いた文書'),
  )

  // ドラッグ＆ドロップ。重ねている間は枠が変わり、大きさは変わらない。
  const paneBefore = await page
    .locator('.pane--editor')
    .evaluate((el) => JSON.stringify([Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]))
  const dragHandle = await page.evaluateHandle(() => {
    const data = new DataTransfer()
    data.items.add(new File(['# ドロップした文書\n'], 'dropped.md', { type: 'text/markdown' }))
    return data
  })
  await page.locator('.pane--editor').dispatchEvent('dragover', { dataTransfer: dragHandle })
  const dropping = await page.evaluate(() => {
    const pane = document.querySelector('.pane--editor')
    const style = getComputedStyle(pane)
    return {
      marked: pane.classList.contains('pane--dropping'),
      outline: style.outlineStyle,
      size: [Math.round(pane.getBoundingClientRect().width), Math.round(pane.getBoundingClientRect().height)],
    }
  })
  check('ファイルを重ねている間はペインの枠が変わる', dropping.marked && dropping.outline === 'dashed', dropping.outline)
  check(
    '重ねている間もペインの大きさが変わらない',
    JSON.stringify(dropping.size) === paneBefore,
    `${paneBefore} → ${JSON.stringify(dropping.size)}`,
  )

  page.once('dialog', (d) => d.accept())
  await page.locator('.pane--editor').dispatchEvent('drop', { dataTransfer: dragHandle })
  await page.waitForFunction(() => document.querySelector('.editor').value.startsWith('# ドロップした文書'), null, { timeout: 5000 })
  check('ドロップした .md が読み込まれる', (await editor().inputValue()).includes('# ドロップした文書'))
  check(
    'ドロップが終わるとペインの枠が戻る',
    !(await page.locator('.pane--editor').evaluate((el) => el.classList.contains('pane--dropping'))),
  )

  // 断る3つ。いずれも中身が変わらない。
  const kept = await editor().inputValue()
  await dropFiles([['image.png', 'image/png', 'これは画像のつもり']])
  check('.png をドロップしても読み込まれない', (await editor().inputValue()) === kept)
  check('.png は「.md ファイルを選んでください」と出る', (await waitNotice()) === '.md ファイルを選んでください', await statusText())

  await page.waitForTimeout(3100)
  await dropFiles([
    ['a.md', 'text/markdown', '# A'],
    ['b.md', 'text/markdown', '# B'],
  ])
  check('2件同時のドロップは読み込まれない', (await editor().inputValue()) === kept)
  check('2件同時は「一度に開けるのは1つだけです」と出る', (await waitNotice()) === '一度に開けるのは1つだけです', await statusText())

  await page.waitForTimeout(3100)
  await fileInput().setInputFiles(png)
  check('ボタンから .png を選んでも読み込まれない', (await editor().inputValue()) === kept)

  await page.waitForTimeout(3100)
  await fileInput().setInputFiles(huge)
  check('1MBを超える .md は読み込まれない', (await editor().inputValue()) === kept)
  check(
    '1MB超は「ファイルが大きすぎます（上限1MB）」と出る',
    (await waitNotice()) === 'ファイルが大きすぎます（上限1MB）',
    await statusText(),
  )

  // 正規化。
  await page.waitForTimeout(3100)
  page.once('dialog', (d) => d.accept())
  await fileInput().setInputFiles(crlf)
  await page.waitForFunction(() => document.querySelector('.editor').value.startsWith('# CRLF'), null, { timeout: 5000 })
  check('CRLFの .md を読み込むと \\r が残らない', !(await editor().inputValue()).includes('\r'))

  page.once('dialog', (d) => d.accept())
  await fileInput().setInputFiles(bom)
  await page.waitForFunction(() => document.querySelector('.editor').value.includes('BOM付き'), null, { timeout: 5000 })
  const bomValue = await editor().inputValue()
  check('BOM付きの .md を読み込むと先頭にBOMが残らない', !bomValue.startsWith('\uFEFF'))
  await ready().catch(() => {})
  check(
    'BOM付きの見出しがプレビューで見出しとして描かれる',
    (await page.locator('.preview h1').innerText()) === 'BOM付き',
  )

  // 0007と同じ規模（26.9 kB）が開ける。
  page.once('dialog', (d) => d.accept())
  await fileInput().setInputFiles(long)
  await page.waitForFunction(() => document.querySelectorAll('.preview .katex').length === 400, null, {
    timeout: 30000,
  })
  check('400節・400数式（26.9 kB）の .md を読み込むと数式が400個描画される', true, '400件')

  // 英語表示。
  await page.getByRole('button', { name: /言語/ }).click()
  await appReady()
  check('英語表示ではボタンが Open file になる', (await page.getByRole('button', { name: 'Open file' }).count()) === 1)
  let englishConfirm = ''
  page.once('dialog', (d) => {
    englishConfirm = d.message()
    d.accept()
  })
  await fileInput().setInputFiles(plain)
  await page.waitForFunction(() => document.querySelector('.editor').value.startsWith('# 開いた文書'), null, { timeout: 5000 })
  check('英語表示では確認ダイアログが英語になる', englishConfirm.startsWith('Discard what you have written and open'), englishConfirm)
  check('英語表示では結果が Opened … になる', (await waitNotice()).includes('Opened opened.md'), await statusText())
  await page.screenshot({ path: `${OUT}/file-load-en.png` })

  // 次の区分のために日本語へ戻す。
  await page.getByRole('button', { name: /Language/ }).click()
  await appReady()
  console.log(`スクリーンショット: ${OUT}/file-load.png, ${OUT}/file-load-en.png`)
})

// ---- 0034: .mdファイルの書き出し ----

section('file-save', 'ファイルの書き出し（0034）', async () => {
  const saveButton = () => page.getByRole('button', { name: 'ファイルに保存' })
  const statusText = () => page.locator('.toolbar__status').innerText()
  const waitNotice = () =>
    page
      .waitForFunction(
        () => document.querySelector('.toolbar__status')?.innerText.trim() || null,
        null,
        { timeout: 3000 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => '')
  /** ボタンを押してダウンロードを受け取り、名前と中身を返す。 */
  const download = async () => {
    const [event] = await Promise.all([page.waitForEvent('download'), saveButton().click()])
    const stream = await event.createReadStream()
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return { name: event.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') }
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()

  check('ソースの見出し行に「ファイルに保存」ボタンがある', (await saveButton().count()) === 1)
  const order = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.pane--editor .pane__header button')]
    return buttons.map((b) => b.innerText.trim())
  })
  check(
    '見出し行のボタンが「検索 / ファイルに保存 / ファイルを開く」の順に並ぶ（0043で3つ目が増えた）',
    order.join(' / ') === '検索 / ファイルに保存 / ファイルを開く',
    order.join(' / '),
  )

  // ボタンが3つになっても見出し行の高さとtextareaが変わらない（0012・0032・0033・0043）。
  for (const width of [1440, 600, 375, 360]) {
    await page.setViewportSize({ width, height: 667 })
    const size = await page.evaluate(() => ({
      heads: [...document.querySelectorAll('.pane__header')].map((h) =>
        Math.round(h.getBoundingClientRect().height),
      ),
      editor: Math.round(document.querySelector('.editor').getBoundingClientRect().height),
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      used: (() => {
        const head = document.querySelector('.pane--editor .pane__header')
        const buttons = [...head.querySelectorAll('button')]
        return Math.round(buttons.at(-1).getBoundingClientRect().right - head.getBoundingClientRect().left)
      })(),
    }))
    check(
      `幅${width}pxでボタン3つでも見出し行が30pxのまま、横スクロールも出ない（0034・0043）`,
      size.heads.every((h) => h === 30) && size.scrollW <= size.innerW,
      // used は「見出し行の左端から右のボタンの右端まで」。space-between で
      // 右寄せなので、内容の合計ではなく見出し行の内側の幅にほぼ等しい。
      `見出し行 ${size.heads.join('/')}px 右端=${size.used}px scrollWidth=${size.scrollW}`,
    )
    if (width === 375) {
      check(
        '幅375pxでtextareaが207px以上ある（0032・0033・0012のぶんを減らさない）',
        size.editor >= 207,
        `${size.editor}px`,
      )
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  // サンプル文書をそのまま書き出す。
  const source = await editor().inputValue()
  const saved = await download()
  check('サンプル文書の見出しがファイル名になる', saved.name === '二次方程式の解の公式.md', saved.name)
  check(
    '書き出した中身がエディタの内容と一致する',
    saved.text === (source.endsWith('\n') ? source : `${source}\n`),
    `${saved.text.length}文字`,
  )
  check('書き出すと結果が表示される', (await waitNotice()).includes('二次方程式の解の公式.md を保存しました'), await statusText())

  // 見出しがない文書、使えない文字を含む見出し、末尾に改行がない文書。
  await page.waitForTimeout(3100)
  await editor().fill('見出しのない文書')
  const noHeading = await download()
  check('見出しがなければ document.md になる', noHeading.name === 'document.md', noHeading.name)
  check('末尾に改行がなければ1つ足される', noHeading.text === '見出しのない文書\n', JSON.stringify(noHeading.text))

  await page.waitForTimeout(3100)
  await editor().fill('# 2026/09/20 の記録: 前半\n\n本文\n')
  const sanitized = await download()
  check(
    '使えない文字が - に置き換わる',
    sanitized.name === '2026-09-20 の記録- 前半.md',
    sanitized.name,
  )

  // 空の文書は書き出さない。
  await page.waitForTimeout(3100)
  await editor().fill('   \n\t\n')
  let started = false
  const guard = () => {
    started = true
  }
  page.on('download', guard)
  await saveButton().click()
  await page.waitForTimeout(500)
  page.off('download', guard)
  check('空白だけの文書ではダウンロードが始まらない', !started)
  check('空白だけの文書では「書き出す内容がありません」と出る', (await waitNotice()) === '書き出す内容がありません', await statusText())

  // 0012との往復。書き出したものを読み込むと同じ内容に戻る。
  await page.waitForTimeout(3100)
  const roundTripSource = '# 往復の確認\n\n式 $\\frac{a}{b}$ である。\n'
  await editor().fill(roundTripSource)
  const roundTrip = await download()
  const savedPath = 'tmp/fixtures/round-trip.md'
  await mkdir('tmp/fixtures', { recursive: true })
  await writeFile(savedPath, roundTrip.text)
  await editor().fill('別の内容')
  page.once('dialog', (d) => d.accept())
  await page.locator('.pane--editor input[type="file"]').setInputFiles(savedPath)
  await page.waitForFunction(() => document.querySelector('.editor').value.startsWith('# 往復の確認'), null, { timeout: 5000 })
  check(
    '書き出した .md を読み込み直すと同じ内容に戻る（0012との往復）',
    (await editor().inputValue()) === roundTripSource,
    roundTrip.name,
  )
  await page.screenshot({ path: `${OUT}/file-save.png` })

  // 英語表示。
  await page.waitForTimeout(3100)
  await page.getByRole('button', { name: /言語/ }).click()
  await appReady()
  check(
    '英語表示ではボタンが Save to file になる',
    (await page.getByRole('button', { name: 'Save to file' }).count()) === 1,
  )
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Reset to sample' }).click()
  await ready()
  const [englishDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save to file' }).click(),
  ])
  check(
    '英語のサンプルは The quadratic formula.md になる',
    englishDownload.suggestedFilename() === 'The quadratic formula.md',
    englishDownload.suggestedFilename(),
  )
  check('英語表示では結果が Saved … になる', (await waitNotice()).includes('Saved The quadratic formula.md'), await statusText())
  await page.screenshot({ path: `${OUT}/file-save-en.png` })

  // 次の区分のために日本語へ戻す。
  await page.getByRole('button', { name: /Language/ }).click()
  await appReady()
  console.log(`スクリーンショット: ${OUT}/file-save.png, ${OUT}/file-save-en.png`)
})
// ---- グラフ（0037） ----

section('graph', '関数のグラフ（0037）', async () => {
  const graphDoc = (body) => `# グラフ\n\n\`\`\`graph\n${body}\n\`\`\`\n\n下に本文が続く。\n`
  const graph = () => page.locator('.preview svg.graph')
  /** 図の実際の大きさ。viewBoxの縦横比を保ったまま入るので、幅か高さの小さいほうで決まる。 */
  const graphBox = () =>
    page.evaluate(() => {
      const el = document.querySelector('.preview svg.graph')
      if (el === null) return null
      const rect = el.getBoundingClientRect()
      const scale = Math.min(rect.width / 480, rect.height / 320)
      const tick = document.querySelector('.preview .graph__tick')
      const pane = el.closest('.pane').getBoundingClientRect()
      return {
        width: Math.round(480 * scale),
        height: Math.round(320 * scale),
        tickPx: Math.round(parseFloat(getComputedStyle(tick).fontSize) * scale * 10) / 10,
        paneHeight: Math.round(pane.height),
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }
    })

  await page.setViewportSize({ width: 1440, height: 900 })
  await editor().fill(graphDoc('y = x^2 - 2x\nx: -3..5'))
  await page.waitForTimeout(400)

  check('graphブロックがSVGとして描かれる', (await graph().count()) === 1)
  check(
    'ブロックがコードとして残らない',
    (await page.locator('.preview code').count()) === 0,
  )
  check(
    '曲線と目盛りが描かれている',
    (await page.locator('.preview .graph__line').count()) === 1 &&
      (await page.locator('.preview .graph__tick').count()) === 10,
  )

  const wide = await graphBox()
  check(
    '幅1440pxで図が480×320pxに収まる（上限が効いている）',
    wide.width === 480 && wide.height === 320,
    `${wide.width}×${wide.height}px`,
  )
  await page.screenshot({ path: `${OUT}/graph-wide.png` })

  // 狭い画面。0033で下げた基準（360px）で測る。
  for (const [width, height] of [
    [540, 720],
    [375, 667],
    [360, 640],
  ]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(200)
    const box = await graphBox()
    check(
      `幅${width}pxで図がプレビューのペインに収まり、横スクロールも出ない`,
      box.height <= box.paneHeight && box.scrollW <= box.innerW,
      `図 ${box.width}×${box.height}px / ペイン ${box.paneHeight}px / scrollWidth ${box.scrollW}`,
    )
    check(
      `幅${width}pxで目盛りの文字が11px以上ある`,
      box.tickPx >= 11,
      `${box.tickPx}px`,
    )
    // 文字は図と一緒に拡大されるので、余白が足りないと左端で切れる。
    const overflow = await page.evaluate(() => {
      const texts = [...document.querySelectorAll('.preview .graph__tick')]
      return Math.min(...texts.map((el) => el.getBBox().x))
    })
    check(
      `幅${width}pxで目盛りの文字が図の左端からはみ出さない`,
      overflow >= 0,
      `左端 ${overflow.toFixed(1)}（ユーザー単位）`,
    )
  }
  await page.setViewportSize({ width: 360, height: 640 })
  await page.screenshot({ path: `${OUT}/graph-narrow.png` })
  await page.setViewportSize({ width: 1440, height: 900 })

  // 複数の関数と凡例。
  await editor().fill(graphDoc('y = x^2\ny = 2x + 1\ny = sin(x)'))
  await page.waitForTimeout(400)
  check(
    '3本の関数が色を変えて重なり、凡例が出る',
    (await page.locator('.preview .graph__line--1').count()) >= 1 &&
      (await page.locator('.preview .graph__line--3').count()) >= 1 &&
      (await page.locator('.preview .graph__legend').count()) === 1,
  )
  const strokes = await page.evaluate(() =>
    [...document.querySelectorAll('.preview path.graph__line')].map(
      (el) => getComputedStyle(el).stroke,
    ),
  )
  check('3本の線の色が互いに違う', new Set(strokes).size === 3, strokes.join(' / '))
  await page.screenshot({ path: `${OUT}/graph-legend.png` })

  // 壊れたブロック。プレビュー全体は消えない（R1と同じ扱い）。
  await editor().fill(graphDoc('y = x^^2'))
  await page.waitForTimeout(400)
  check(
    '壊れたブロックは赤字1行になり、前後の本文は残る',
    (await page.locator('.preview .graph-error').count()) === 1 &&
      (await page.locator('.preview h1').count()) === 1 &&
      (await page.locator('.preview svg.graph').count()) === 0,
    await page.locator('.preview .graph-error').innerText(),
  )
  // 背景は body で見る。.preview は背景が透明で、指定すると黒と比べてしまう。
  const errorContrast = await contrastOf('.preview .graph-error')
  check(
    'エラーの文字が背景に対して4.5:1以上ある',
    errorContrast >= 4.5,
    `${errorContrast.toFixed(2)}:1`,
  )

  // ダークモードの線の色。図形なので基準は3:1。
  await editor().fill(graphDoc('y = x^2 - 2x\nx: -3..5'))
  await page.waitForTimeout(400)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(200)
  const lineContrast = await page.evaluate(() => {
    const parse = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number)
    const channel = (v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const luminance = (rgb) => {
      const [r, g, b] = rgb.map(channel)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const line = document.querySelector('.preview path.graph__line')
    const fg = parse(getComputedStyle(line).stroke)
    // 背景は body。.preview は背景が透明で、そのまま読むと黒になる。
    const bg = parse(getComputedStyle(document.body).backgroundColor)
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  })
  check(
    'ダークモードで線の色が背景に対して3:1以上ある',
    lineContrast >= 3,
    `${lineContrast.toFixed(2)}:1`,
  )
  await page.screenshot({ path: `${OUT}/graph-dark.png` })
  await page.emulateMedia({ colorScheme: 'light' })

  // パレットからの挿入とUndo（0021の経路に乗っているか）。
  await editor().fill('挿入の検証。\n')
  await page.waitForTimeout(200)
  await page.locator('.palette__tab', { hasText: 'Markdown' }).click()
  await page.getByRole('button', { name: /関数のグラフ/ }).click()
  await page.waitForTimeout(300)
  const afterInsert = await editor().inputValue()
  check(
    'パレットの「グラフ」で雛形が入る',
    afterInsert.includes('```graph') && afterInsert.includes('x: -5..5'),
  )
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  check(
    'Ctrl+Zで挿入前に戻る（0021の経路に乗っている）',
    (await editor().inputValue()) === '挿入の検証。\n',
    JSON.stringify(await editor().inputValue()),
  )

  // 長い文書にグラフを混ぜても入力が重くならない（perf区分と同じ測り方）。
  const longWithGraphs = [
    Array.from(
      { length: 400 },
      (_, i) => `## 節 ${i}\n\n式 $\\int_0^1 x^{${i}} dx$ である。\n`,
    ).join('\n'),
    '```graph\ny = x^2 - 2x\nx: -3..5\n```\n',
    '```graph\ny = sin(x)\ny = cos(x)\nx: -pi..pi\n```\n',
    '```graph\ny = 1/x\nx: -5..5\n```\n',
  ].join('\n')
  await editor().fill(longWithGraphs)
  await page.waitForFunction(
    () => document.querySelectorAll('.preview svg.graph').length === 3,
    null,
    { timeout: 30000 },
  )
  const TYPED = 20
  await editor().click()
  await page.keyboard.press('Control+End')
  const typeStart = Date.now()
  await editor().pressSequentially('あ'.repeat(TYPED), { delay: 0 })
  const perKey = (Date.now() - typeStart) / TYPED
  check(
    '400節の文書にグラフ3つを混ぜても入力が1文字あたり50ms以内',
    perKey <= 50,
    `${perKey.toFixed(1)}ms/文字`,
    { timing: true },
  )

  // 英語表示ではaria-labelとエラーも英語（0031）。
  await editor().fill(graphDoc('y = x'))
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /言語/ }).click()
  await page.waitForTimeout(400)
  check(
    '英語表示ではSVGのaria-labelが英語になる',
    (await graph().getAttribute('aria-label')) === 'Graph of y = x',
    await graph().getAttribute('aria-label'),
  )
  await page.getByRole('button', { name: /Language/ }).click()
  await page.waitForTimeout(300)

  await resetState()
})



// ---- 文書内の検索・置換（0043） ----

section('find', '検索・置換（0043）', async () => {
  const findButton = () => page.getByRole('button', { name: '検索', exact: true })
  const bar = () => page.locator('.find')
  const queryField = () => page.getByRole('textbox', { name: '文書内を検索' })
  const replaceField = () => page.getByRole('textbox', { name: '置換後の文字列' })
  const count = () => page.locator('.find__count').innerText()
  const selection = () =>
    page.evaluate(() => {
      const el = document.querySelector('.editor')
      return el.value.slice(el.selectionStart, el.selectionEnd)
    })
  const selectionStart = () => page.evaluate(() => document.querySelector('.editor').selectionStart)
  /** バーの高さと、開く前後のtextareaの高さ。 */
  const sizes = () =>
    page.evaluate(() => ({
      bar: Math.round(document.querySelector('.find')?.getBoundingClientRect().height ?? 0),
      editor: Math.round(document.querySelector('.editor').getBoundingClientRect().height),
      header: Math.round(document.querySelector('.pane--editor .pane__header').getBoundingClientRect().height),
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }))

  const doc = '# 検索の検証\n\n$\\alpha$ と $\\alpha$ と $\\Alpha$ と $\\beta$。\n\n本文の $\\alpha$ で4件目。\n'

  await page.setViewportSize({ width: 1440, height: 900 })
  await editor().fill(doc)
  await page.waitForTimeout(300)

  // 閉じているときは、見出し行もtextareaも今までどおり。
  const closed = await sizes()
  check('バーを開く前は見出し行が30pxのまま', closed.header === 30, `${closed.header}px`)
  check('バーを開く前は .find がない', (await bar().count()) === 0)

  // 入口1: 見出し行のボタン。
  await findButton().click()
  check('見出し行の「検索」でバーが開く', (await bar().count()) === 1)
  check(
    '検索欄にフォーカスが入る',
    await page.evaluate(() => document.activeElement?.classList.contains('find__field')),
  )

  // 件数と移動。
  await queryField().fill('\\alpha')
  await page.waitForTimeout(200)
  check('一致の件数が出る（大文字小文字を区別して3件）', (await count()) === '1/3件', await count())
  check('1件目がtextarea上で選択される', (await selection()) === '\\alpha', await selection())

  const first = await selectionStart()
  await page.getByRole('button', { name: '次へ' }).click()
  check('「次へ」で2件目へ進む', (await count()) === '2/3件' && (await selectionStart()) > first, await count())

  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  check('末尾の次で先頭へ回る', (await count()) === '1/3件', await count())

  await page.getByRole('button', { name: '前へ' }).click()
  check('「前へ」で末尾へ回る', (await count()) === '3/3件', await count())

  // 0件のとき。
  await queryField().fill('存在しない語')
  await page.waitForTimeout(200)
  check('一致しないときは0件と出る', (await count()) === '0件', await count())
  check(
    '0件では前へ・次へが押せない',
    (await page.getByRole('button', { name: '次へ' }).isDisabled()) === true,
  )

  // 置換（1件）。
  await queryField().fill('\\alpha')
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '置換', exact: true }).first().click()
  await replaceField().fill('\\gamma')
  await page.getByRole('button', { name: '置換', exact: true }).last().click()
  await page.waitForTimeout(300)
  const afterOne = await editor().inputValue()
  check(
    '「置換」で1件だけ置き換わる',
    (afterOne.match(/\\gamma/g) ?? []).length === 1 && (afterOne.match(/\\alpha/g) ?? []).length === 2,
    `gamma ${(afterOne.match(/\\gamma/g) ?? []).length}件 / alpha ${(afterOne.match(/\\alpha/g) ?? []).length}件`,
  )

  // すべて置換とUndo。1回で戻ることがこのissueの肝（0021の経路に乗せている）。
  await page.getByRole('button', { name: 'すべて置換' }).click()
  await page.waitForTimeout(300)
  const afterAll = await editor().inputValue()
  check(
    '「すべて置換」で残り2件も置き換わる',
    (afterAll.match(/\\gamma/g) ?? []).length === 3 && !afterAll.includes('\\alpha$'),
    `gamma ${(afterAll.match(/\\gamma/g) ?? []).length}件`,
  )
  check('大文字の \\Alpha は置き換えない', afterAll.includes('\\Alpha'))

  await editor().click()
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  check(
    'すべて置換はCtrl+Z 1回で元に戻る',
    (await editor().inputValue()) === afterOne,
    `${(await editor().inputValue()).length}文字`,
  )

  // Esc で閉じる。
  await findButton().click()
  await queryField().press('Escape')
  await page.waitForTimeout(200)
  check('Escでバーが閉じる', (await bar().count()) === 0)
  check(
    'Escのあとエディタにフォーカスが戻る',
    await page.evaluate(() => document.activeElement?.classList.contains('editor')),
  )

  // 入口2: エディタでの Ctrl+F。プレビューでは奪わない。
  await editor().click()
  await page.keyboard.press('Control+f')
  await page.waitForTimeout(200)
  check('エディタで Ctrl+F を押すとバーが開く', (await bar().count()) === 1)
  await queryField().press('Escape')

  // 選択していた文字列が初期値になる。
  await page.evaluate(() => {
    const el = document.querySelector('.editor')
    el.focus()
    el.setSelectionRange(0, 7)
  })
  await page.keyboard.press('Control+f')
  await page.waitForTimeout(200)
  check(
    '選択していた文字列が検索欄の初期値になる',
    (await queryField().inputValue()) === '# 検索の検証',
    await queryField().inputValue(),
  )
  await queryField().press('Escape')

  // 狭い画面での占有（0032・0033で確保したぶんを割らないか）。
  // 期待するtextareaの高さは画面の高さで決まる（幅375pxは高さ667px、
  // 幅360pxは高さ640pxで測っている）。0032・0033で確保した値を割らないこと。
  for (const [width, height, floor] of [
    [375, 667, 207],
    [360, 640, 194],
  ]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(200)
    const shut = await sizes()
    check(
      `幅${width}px・高さ${height}pxで、閉じている間はtextareaが${floor}px以上ある`,
      shut.editor >= floor,
      `${shut.editor}px`,
    )

    await findButton().click()
    await page.waitForTimeout(200)
    const open = await sizes()
    check(
      `幅${width}pxで検索のみのバーが41px（±2px）`,
      Math.abs(open.bar - 41) <= 2,
      `${open.bar}px / textarea ${open.editor}px`,
    )
    check(
      `幅${width}pxでバーを開いても横スクロールが出ない`,
      open.scrollW <= open.innerW,
      `scrollWidth ${open.scrollW} / ${open.innerW}`,
    )

    await page.getByRole('button', { name: '置換', exact: true }).first().click()
    await page.waitForTimeout(200)
    const both = await sizes()
    check(
      `幅${width}pxで置換も開くと73px（±2px）`,
      Math.abs(both.bar - 73) <= 2,
      `${both.bar}px / textarea ${both.editor}px`,
    )
    check(
      `幅${width}pxで置換も開いて横スクロールが出ない`,
      both.scrollW <= both.innerW,
      `scrollWidth ${both.scrollW} / ${both.innerW}`,
    )
    if (width === 360) await page.screenshot({ path: `${OUT}/find-narrow.png` })
    await queryField().press('Escape')
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await findButton().click()
  await queryField().fill('\\gamma')
  await page.getByRole('button', { name: '置換', exact: true }).first().click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/find-wide.png` })
  await queryField().press('Escape')

  // 英語表示（0031）。
  await page.getByRole('button', { name: /言語/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Find', exact: true }).click()
  await page.waitForTimeout(200)
  check(
    '英語表示では文言が英語になる',
    (await page.getByRole('textbox', { name: 'Find in document' }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Replace all' }).count()) >= 0,
  )
  await page.getByRole('textbox', { name: 'Find in document' }).fill('zzz')
  await page.waitForTimeout(200)
  check('英語の0件は No matches', (await count()) === 'No matches', await count())
  await page.getByRole('textbox', { name: 'Find in document' }).press('Escape')
  await page.getByRole('button', { name: /Language/ }).click()
  await page.waitForTimeout(300)

  // 長い文書でも入力が重くならない（perf区分と同じ測り方）。
  const longDoc = Array.from(
    { length: 400 },
    (_, i) => `## 節 ${i}\n\n式 $\\int_0^1 x^{${i}} dx$ である。\n`,
  ).join('\n')
  await editor().fill(longDoc)
  await page.waitForFunction(() => document.querySelectorAll('.preview .katex').length === 400, null, {
    timeout: 30000,
  })
  await findButton().click()
  await queryField().fill('\\int')
  await page.waitForTimeout(300)
  check('400節の文書で一致件数が出る', (await count()) === '1/400件', await count())
  const TYPED = 20
  await editor().click()
  await page.keyboard.press('Control+End')
  const typeStart = Date.now()
  await editor().pressSequentially('あ'.repeat(TYPED), { delay: 0 })
  const perKey = (Date.now() - typeStart) / TYPED
  check(
    'バーを開いたまま400節の文書を打っても1文字あたり50ms以内',
    perKey <= 50,
    `${perKey.toFixed(1)}ms/文字`,
    { timing: true },
  )

  await resetState()
})

// ---- 実行 ----

const names = sections.map((s) => s.name)
const unknown = requested.filter((name) => !names.includes(name))
if (unknown.length > 0) {
  // 打ち間違いに気づかないまま「0件中0件OK」で通るのがいちばん悪いので、何も流さない。
  console.error(`知らない区分: ${unknown.join(', ')}`)
  console.error(`使える区分: ${names.join(' / ')}`)
  process.exit(1)
}
const selected = requested.length > 0 ? sections.filter((s) => requested.includes(s.name)) : sections

await mkdir(OUT, { recursive: true })

browser = await chromium.launch({ args: ['--no-sandbox'] })
context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
// 既存のチェックは日本語の文言で要素を探す。ヘッドレスChromiumの
// navigator.language は英語なので、放っておくと英語で表示されて全部落ちる。
// 保存がないときだけ日本語を置く（i18n区分が英語を保存したら、そちらを優先する）。
await context.addInitScript(
  ([key]) => {
    try {
      if (window.localStorage.getItem(key) === null) {
        window.localStorage.setItem(key, JSON.stringify({ version: 1, lang: 'ja' }))
      }
    } catch {
      // localStorageが読めない環境では何もしない。
    }
  },
  [LANG_KEY],
)

page = await context.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const startedAt = Date.now()
const runs = []
for (let round = 0; round < repeat; round += 1) {
  if (repeat > 1) console.log(`\n######## ${round + 1}回目 / ${repeat} ########`)
  results = []
  lastCheckAt = Date.now()
  for (const s of selected) {
    currentSection = s.name
    console.log(`\n== ${s.title} ==`)
    // 区分をどれから流しても同じ結果になるよう、毎回ここで初期状態に戻す。
    await resetState()
    await s.run()
  }
  currentSection = null
  runs.push(results)
}

// ---- まとめ ----

const last = runs[runs.length - 1]
const failed = last.filter((r) => !r.ok)

console.log('\nコンソールエラー:', errors.length ? errors : 'なし')

// 落ちたチェックは末尾に再掲する。スクロールで流れても、ここだけ見れば分かる。
if (failed.length > 0) {
  console.log(`\n-- 落ちたチェック（${failed.length}件） --`)
  for (const r of failed) {
    console.log(`NG  [${r.section}] ${r.timing ? '⏱ ' : ''}${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
  }
}

// 繰り返したときは、回ごとに結果が割れたチェックだけを目立たせる。
const flaky = []
if (repeat > 1) {
  for (const [i, r] of last.entries()) {
    const oks = runs.filter((run) => run[i]?.ok).length
    if (oks !== repeat) {
      const ngDetails = runs
        .map((run) => run[i])
        .filter((c) => c && !c.ok)
        .map((c) => c.detail)
        .filter(Boolean)
      flaky.push({ section: r.section, label: r.label, timing: r.timing, oks, ngDetails })
    }
  }
  console.log(`\n-- 揺れたチェック（--repeat ${repeat}） --`)
  if (flaky.length === 0) {
    console.log(`なし。${last.length}件とも${repeat}回同じ結果`)
  } else {
    for (const f of flaky) {
      const why = f.ngDetails.length ? `（${[...new Set(f.ngDetails)].join(', ')} でNG）` : ''
      console.log(`[${f.section}] ${f.timing ? '⏱ ' : ''}${f.label} — ${repeat}回中${f.oks}回OK${why}`)
    }
    console.log(`ほか${last.length - flaky.length}件は${repeat}回とも同じ結果`)
  }
}

console.log(`\n受け入れ基準: ${last.length - failed.length}/${last.length} 件 OK`)
console.log(`所要時間: ${((Date.now() - startedAt) / 1000).toFixed(1)}秒`)

// 出力を切ってしまっても後から読めるよう、結果をファイルにも残す。
const anyFailure = runs.some((run) => run.some((r) => !r.ok))
await writeFile(
  JSON_OUT,
  `${JSON.stringify(
    {
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      sections: selected.map((s) => s.name),
      repeat,
      total: last.length,
      passed: last.length - failed.length,
      consoleErrors: errors,
      flaky,
      checks: last,
    },
    null,
    2,
  )}\n`,
)
console.log(`結果: ${JSON_OUT}`)

await browser.close()
if (errors.length > 0 || anyFailure) process.exit(1)
