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
  const copyRight = await page
    .getByRole('button', { name: 'Markdownをコピー' })
    .evaluate((el) => el.getBoundingClientRect().right)
  check('狭い画面でもコピーボタンが画面内に収まる', copyRight <= toolbarWidth, `right=${Math.round(copyRight)} width=${toolbarWidth}`)
  await page.screenshot({ path: `${OUT}/narrow.png` })
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
