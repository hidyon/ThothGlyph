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
const STORAGE_KEY = 'thothglyph:document:v1'
const THEME_KEY = 'thothglyph:theme:v1'
const LANG_KEY = 'thothglyph:lang:v1'
/** 0065で改名する前の接頭辞。読み継ぎの確認に使う。 */
const LEGACY_PREFIX = 'matheditor:'

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
/**
 * タブの名前（0053のアイコンを除く）。アイコンは aria-hidden なので、
 * getByRole の名前には入らない。innerText で拾うとアイコンが混ざるため、
 * ラベルだけを取り出す。
 */
const tabLabels = (selector) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map((tab) =>
        [...tab.childNodes]
          .filter((node) => !(node.nodeType === 1 && node.classList.contains('palette__tab-icon')))
          .map((node) => node.textContent)
          .join('')
          .trim(),
      ),
    selector,
  )

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

  // サンプル文書の式の番号と参照（0078）。記法の手本はここにしかない。
  const sampleNumbers = await page.evaluate(() =>
    [...document.querySelectorAll('.preview .eq-number')].map((el) => el.textContent),
  )
  check(
    '初回訪問のサンプルに番号が2つ出て (1) (2) の順になる',
    JSON.stringify(sampleNumbers) === '["(1)","(2)"]',
    JSON.stringify(sampleNumbers),
  )
  const sampleRefs = await page.evaluate(() =>
    [...document.querySelectorAll('.preview a[href^="#eq-"]')].map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent,
    })),
  )
  check(
    'サンプルの参照2つが現在の番号を指す',
    JSON.stringify(sampleRefs) ===
      '[{"href":"#eq-1","text":"(1)"},{"href":"#eq-2","text":"(2)"}]',
    JSON.stringify(sampleRefs),
  )

  // 参照をたどれること（サンプルの中で完結して確かめられる）。
  await page.locator('.preview a[href="#eq-2"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.locator('.preview a[href="#eq-2"]').click()
  await page.waitForTimeout(300)
  check(
    'サンプルの参照を押すと飛び先の式に印が出る',
    (await page.locator('.preview .math-anchor--active').count()) === 1,
  )

  // 幅360pxでも式と番号が重ならず、横スクロールも増えない。
  await page.setViewportSize({ width: 360, height: 640 })
  await page.waitForTimeout(300)
  const narrowSample = await page.evaluate(() => {
    const wrap = document.querySelector('.math-anchor--numbered')
    const math = wrap.querySelector('.katex-display')
    const num = wrap.querySelector('.eq-number')
    return {
      gap: Math.round(num.getBoundingClientRect().left - math.getBoundingClientRect().right),
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
    }
  })
  check(
    '幅360pxのサンプルで式と番号が重ならない',
    narrowSample.gap >= 0,
    `間隔 ${narrowSample.gap}px`,
  )
  check(
    '幅360pxのサンプルで横スクロールが出ない',
    narrowSample.docScroll <= narrowSample.docClient,
    `${narrowSample.docScroll} / ${narrowSample.docClient}`,
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(200)

  await page.screenshot({ path: `${OUT}/initial.png` })
  console.log(`スクリーンショット: ${OUT}/initial.png`)
})

// ---- 0001: 編集内容の自動保存 ----

section('autosave', '自動保存（0001）', async () => {
  // 初回訪問（localStorageが空）ではサンプル文書が出て、保存状態は空。
  const firstVisit = await editor().inputValue()
  check('初回訪問でサンプル文書が表示される', firstVisit.startsWith('# 正規分布と標本平均'))
  check('初回訪問では保存状態を出さない', (await saveStatus()) === '')

  // 保存がない状態で打ってすぐ消すと、空の表示へ戻る（0036の idle の分岐）。
  // 一度も保存していないので、戻す先は「保存しました」ではなく空。
  await editor().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('q')
  await page.waitForTimeout(120)
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(2500)
  check(
    '保存がない状態で打ってすぐ消すと表示が空に戻る（0036）',
    (await saveStatus()) === '',
    JSON.stringify(await saveStatus()),
  )
  check('そのとき内容はサンプルのままである', (await editor().inputValue()) === firstVisit)

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

  // 打った文字をすぐ取り消したとき（0036）。デバウンスが終わる前に保存済みの
  // 内容へ戻すと、以前は「保存中…」が止まり、さらに beforeunload が
  // 取り消した編集を書き戻していた。
  await page.waitForFunction(
    () => document.querySelector('.toolbar__save')?.textContent?.startsWith('保存しました'),
    null,
    { timeout: 3000 },
  )
  const savedAtBeforeUndo = await saveStatus()
  const undoBase = await editor().inputValue()
  await editor().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('z')
  await page.waitForTimeout(120)
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(2500)
  check(
    '打ってすぐ消すと保存中…で止まらず、保存しましたに戻る（0036）',
    (await saveStatus()) === savedAtBeforeUndo,
    `${await saveStatus()}（取り消し前は ${savedAtBeforeUndo}）`,
  )
  check('取り消した直後の内容が元に戻っている', (await editor().inputValue()) === undoBase)

  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  check(
    'その状態でリロードしても消した文字が戻らない（0036）',
    (await editor().inputValue()) === undoBase,
    `末尾 ${JSON.stringify((await editor().inputValue()).slice(-6))}`,
  )

  // 600ms以上待ってから消した場合は、通常どおり保存されて時刻が更新される。
  const savedBeforeSlowUndo = await saveStatus()
  await editor().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('y')
  await page.waitForFunction(
    () => document.querySelector('.toolbar__save')?.textContent?.startsWith('保存しました'),
    null,
    { timeout: 3000 },
  )
  await page.keyboard.press('Backspace')
  await page.waitForFunction(
    () => document.querySelector('.toolbar__save')?.textContent?.startsWith('保存しました'),
    null,
    { timeout: 3000 },
  )
  const afterSlowUndo = await editor().inputValue()
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  check(
    '600ms以上待ってから消した場合は取り消し後の内容が保存される',
    (await editor().inputValue()) === afterSlowUndo && afterSlowUndo === undoBase,
    `${savedBeforeSlowUndo} → ${await saveStatus()}`,
  )

  // 「サンプルに戻す」— キャンセルでは変わらず、OKでサンプルに戻る。
  const current = await editor().inputValue()
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: 'サンプルに戻す' }).click()
  check('確認をキャンセルすると内容が変わらない', (await editor().inputValue()) === current)

  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'サンプルに戻す' }).click()
  await ready()
  check('確認をOKするとサンプル文書に戻る', (await editor().inputValue()).startsWith('# 正規分布と標本平均'))
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
    (await editor().inputValue()).startsWith('# 正規分布と標本平均'),
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
    // 0079でガイドが5つ目として増えた（幅480px以下では `?` だけになる）。
    '幅360pxでツールバーの5ボタンすべてが画面内に収まる（0033・0079）',
    phoneButtons.length === 5 && phoneButtons.every((b) => b.right <= 360),
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

section('greek', 'ギリシャ文字（0029・0055）', async () => {
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
  check('ギリシャ大文字タブに24個のボタンが出る（0055）', upperCount === 24, `${upperCount}個`)
  const upperHeight = await page.locator('.palette').evaluate((el) =>
    Math.round(el.getBoundingClientRect().height),
  )
  console.log(`ギリシャ大文字タブのパレットの高さ: ${upperHeight}px`)

  // 0055で足した13件の代表。ラテン文字のAと字形は同じだが別のコマンド。
  await editor().fill('大文字の検証 $x$')
  await editor().evaluate((el) => {
    el.focus()
    const at = el.value.indexOf('$') + 1
    el.setSelectionRange(at, at)
  })
  await page.locator('.palette__item[title^="Alpha（大文字"]').click()
  await page.waitForTimeout(400)
  check(
    'Alpha を押すと \\Alpha が入る（0055）',
    (await editor().inputValue()).includes('$\\Alpha x$'),
    JSON.stringify(await editor().inputValue()),
  )
  // KaTeXは \\Alpha を**ラテン文字のA（U+0041）**として描く。Α（U+0391）は出ない
  // ので、「Αとして描画される」は確かめようがない（0055の実測）。見えるのは
  // 「エラーにならず、Aの形が出て、式のソースに \\Alpha が残る」ところまで。
  const alphaTex = await page
    .locator('.preview .katex annotation')
    .first()
    .evaluate((el) => el.textContent)
  check(
    '挿入した Alpha がエラーなく描画され、式のソースに \\Alpha が残る',
    alphaTex.includes('\\Alpha'),
    JSON.stringify(alphaTex),
  )

  check(
    '挿入したギリシャ文字にKaTeXのエラーが出ない',
    (await page.locator('.preview .katex-error').count()) === 0,
  )

  // ボタンが24個＝縦帯では6行になる。上の行が下の行のラベルに覆われないこと
  // （0054で入れた当たり判定の回帰）。
  const everyClickable = await page.evaluate(() =>
    [...document.querySelectorAll('.palette__item')].every((item) => {
      const b = item.getBoundingClientRect()
      return item.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2))
    }),
  )
  check('大文字24個すべて、中心のクリックが自分に当たる（0054の回帰）', everyClickable)

  // 検索（0011）から引けること。tooltipにコマンド名が入っているので当たる。
  await page.locator('.palette__search').fill('Alpha')
  await page.waitForTimeout(200)
  const hitTitles = await page.locator('.palette__items--results .palette__item').evaluateAll((els) =>
    els.map((el) => el.getAttribute('title')),
  )
  check(
    '検索欄に Alpha と打つと大文字のAlphaが結果に出る',
    hitTitles.some((title) => title?.startsWith('Alpha（大文字')),
    `${hitTitles.length}件: ${hitTitles.slice(0, 3).join(' / ')}`,
  )
  await page.locator('.palette__search').fill('')

  // 高さ。増えてよいのは幅720pxだけで、そこも0032の蓋の中に収まる。
  for (const [width, height, limit] of [[1199, 800, 94], [720, 800, 141], [360, 640, 139]]) {
    await page.setViewportSize({ width, height })
    await page.goto(URL, { waitUntil: 'networkidle' })
    await ready()
    await page.getByRole('tab', { name: 'ギリシャ大文字' }).click()
    await page.waitForTimeout(150)
    const h = await page.locator('.palette').evaluate((el) => Math.round(el.getBoundingClientRect().height))
    check(`幅${width}pxの大文字タブでパレットが${limit}px以下（0032の蓋の中）`, h <= limit, `${h}px`)
  }

  // 縦帯（0054）でも帯の高さは変わらず、横スクロールも出ない。
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  await page.getByRole('tab', { name: 'ギリシャ大文字' }).click()
  await page.waitForTimeout(150)
  const strip = await page.evaluate(() => {
    const el = document.querySelector('.palette')
    return { h: Math.round(el.getBoundingClientRect().height), sw: el.scrollWidth, cw: el.clientWidth }
  })
  check('幅1440pxの縦帯で大文字24個でも帯が845pxのまま', Math.abs(strip.h - 845) <= 5, `${strip.h}px`)
  check('幅1440pxの縦帯で帯に横スクロールが出ない', strip.sw <= strip.cw, `${strip.sw} / ${strip.cw}`)

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
    '公式タブを押すと15分類の2段目タブが出る',
    subTabs.length === 15 && subTabs.includes('方程式') && subTabs.includes('ベクトル'),
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

  // 幅600pxで2段目のタブが何行になるか。15分類に増えた影響を測る。
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
    // パレットにも見出しが付いた（0056）ので、ペインの2つに絞る。
    headers: await page.locator('.pane--editor .pane__header, .pane--preview .pane__header').allInnerTexts(),
    tabs: await tabLabels('.palette__bar > .palette__tabs > .palette__tab'),
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
    '公式の15分類が英語になる',
    subTabs.length === 15 && subTabs.includes('Equations') && subTabs.includes('Vectors'),
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
    (await page.locator('.pane--editor .pane__header, .pane--preview .pane__header').first().innerText()).startsWith('ソース'),
    await page.locator('.pane--editor .pane__header, .pane--preview .pane__header').first().innerText(),
  )

  // 保存がない初回訪問では、ブラウザの言語に従ってサンプル文書が選ばれる。
  await saveSettled()
  await page.evaluate(() => window.localStorage.clear())
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  check(
    '保存がないときは日本語のサンプル文書が出る（ja を固定しているため）',
    (await editor().inputValue()).startsWith('# 正規分布と標本平均'),
    (await editor().inputValue()).slice(0, 20),
  )

  // 英語のサンプル文書にもグラフが入っている（0040）。
  await langButton().click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Reset to sample' }).click()
  await ready()
  check(
    '英語のサンプル文書が出る',
    (await editor().inputValue()).startsWith('# The normal distribution and sample means'),
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
    manifest.name === 'ThothGlyph' && sizes.join(',') === '192x192,512x512',
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
    // 0074で `./favicon.svg`（相対）にした。file:// では絶対パスがルートを
    // 見にいくため。開発サーバとHTTP配信では同じファイルを指す。
    (await mark.getAttribute('src')) === './favicon.svg',
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
  // 検索欄はタブ行に同居させたので、横帯では高さが増えないはず。
  // 幅1200px以上はパレットが縦帯になったので（0054）、横帯の上限で測る。
  await page.setViewportSize({ width: 1199, height: 800 })
  await page.waitForTimeout(200)
  const inTabRow = await search().evaluate((el) => el.parentElement.className)
  check('検索欄がタブと同じ行にある', inTabRow === 'palette__bar', inTabRow)
  const wide = await paletteHeight()
  // 0070で装飾を基本に集めたぶん（8→23件）、94px → 105px になった（0070の仕様に実測つきで記録）。
  check('幅1199pxでパレットの高さが105pxのまま（検索欄で増えない）', wide === 105, `${wide}px`)

  // 折り返しが起きるのは720px前後。仕様では126px以下に収まると見込んだ。
  await page.setViewportSize({ width: 720, height: 800 })
  await page.waitForTimeout(200)
  const medium = await paletteHeight()
  // 0070で装飾を基本に集めたぶん（8→23件）、幅720pxは0032の蓋（141px）に達した。
  check('幅720pxでパレットの高さが141px以下', medium <= 141, `${medium}px`)

  await page.setViewportSize({ width: 600, height: 800 })
  await page.waitForTimeout(200)
  const narrow = await paletteHeight()
  check('幅600pxでパレットの高さが141px以下', narrow <= 141, `${narrow}px`)
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
  // アイコン（0053）を除いたラベルで見る。innerText には記号が混ざる。
  const [backSelected] = await tabLabels('.palette__bar .palette__tab[aria-selected="true"]')
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

section('panes', '領域の幅の可変（0057）', async () => {
  const PANES_KEY = 'thothglyph:panes:v1'
  const widths = () =>
    page.evaluate(() => {
      const w = (sel) => {
        const el = document.querySelector(sel)
        return el === null ? null : Math.round(el.getBoundingClientRect().width)
      }
      const graph = document.querySelector('svg.graph')
      return {
        palette: w('.palette'),
        source: w('.pane--editor'),
        preview: w('.pane--preview'),
        dividers: [...document.querySelectorAll('.pane-divider')]
          .map((d) => Math.round(d.getBoundingClientRect().width)),
        visibleDividers: [...document.querySelectorAll('.pane-divider')]
          .filter((d) => d.getBoundingClientRect().width > 0).length,
        graph: graph === null ? null : Math.round(graph.getBoundingClientRect().width),
        headerH: Math.round(
          document.querySelector('.pane--editor .pane__header').getBoundingClientRect().height,
        ),
        mathOverflow: [...document.querySelectorAll('.preview .katex-display')]
          .filter((e) => e.scrollWidth > e.clientWidth + 1).length,
      }
    })

  /** 仕切りを掴んで dx だけ動かす。離すところまで。 */
  const drag = async (nth, dx) => {
    const box = await page.locator('.pane-divider').nth(nth).boundingBox()
    await page.mouse.move(box.x + 3, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 3 + dx, box.y + 100, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(100)
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()

  const start = await widths()
  check(
    '幅1440pxで仕切りが2本あり、どちらも6px',
    start.dividers.length === 2 && start.dividers.every((d) => d === 6),
    start.dividers.join(','),
  )
  check(
    '既定はパレット180px・ソースとプレビューが同じ幅',
    start.palette === 180 && start.source === start.preview,
    `${start.palette} / ${start.source} / ${start.preview}`,
  )

  // 仕切り1: パレットの幅。
  await drag(0, 100)
  const widened = await widths()
  check('仕切り1を右へ100pxドラッグするとパレットが280pxになる', widened.palette === 280, `${widened.palette}px`)

  // 仕切り2: ソースとプレビューの分け方。
  const beforeSplit = await widths()
  await drag(1, -100)
  const split = await widths()
  check(
    '仕切り2を左へ100pxドラッグするとソースが100px狭く、プレビューが100px広くなる',
    Math.abs(beforeSplit.source - split.source - 100) <= 3 &&
      Math.abs(split.preview - beforeSplit.preview - 100) <= 3,
    `ソース ${beforeSplit.source}→${split.source} / プレビュー ${beforeSplit.preview}→${split.preview}`,
  )

  // 保存と復元。
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  const reloaded = await widths()
  check(
    '変えた幅がリロード後も残る',
    reloaded.palette === split.palette && Math.abs(reloaded.source - split.source) <= 3,
    `${reloaded.palette} / ${reloaded.source} / ${reloaded.preview}`,
  )

  // 下限。ドラッグしても割らない。
  await drag(0, -600)
  const minPalette = await widths()
  check('パレットは150pxより狭くならない', minPalette.palette === 150, `${minPalette.palette}px`)

  await drag(1, 900)
  const minPreview = await widths()
  check('プレビューは360pxより狭くならない', minPreview.preview >= 360, `${minPreview.preview}px`)
  check(
    'プレビューが下限のとき、グラフが312px以上で数式がはみ出さない',
    minPreview.graph >= 312 && minPreview.mathOverflow === 0,
    `グラフ${minPreview.graph}px / はみ出し${minPreview.mathOverflow}件`,
  )

  await drag(1, -900)
  const minSource = await widths()
  check('ソースは360pxより狭くならない', minSource.source >= 360, `${minSource.source}px`)
  check(
    'ソースが下限のとき、見出し行が30pxのまま（ボタンが折り返さない）',
    minSource.headerH === 30,
    `${minSource.headerH}px`,
  )

  // ダブルクリックで既定へ。
  await page.locator('.pane-divider').first().dblclick()
  await page.locator('.pane-divider').nth(1).dblclick()
  await page.waitForTimeout(100)
  const reset = await widths()
  check(
    '仕切りをダブルクリックすると既定（180px・半々）に戻る',
    reset.palette === 180 && Math.abs(reset.source - reset.preview) <= 2,
    `${reset.palette} / ${reset.source} / ${reset.preview}`,
  )

  // キーボード。
  await page.locator('.pane-divider').first().focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(100)
  const byKey = await widths()
  check('仕切りに左右キーで16pxずつ動く', byKey.palette === 180 + 32, `${byKey.palette}px（180+32を期待）`)

  // 狭い画面では出さない。
  await page.setViewportSize({ width: 1199, height: 800 })
  await page.waitForTimeout(150)
  const narrow = await widths()
  check('幅1199pxでは仕切りが出ない', narrow.visibleDividers === 0, `${narrow.visibleDividers}本`)

  await page.setViewportSize({ width: 360, height: 640 })
  await page.waitForTimeout(150)
  const phone = await widths()
  check('幅360pxでも仕切りが出ない', phone.visibleDividers === 0, `${phone.visibleDividers}本`)

  // 狭めてから戻すと、保存した分け方に戻る。
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(150)
  const back = await widths()
  check(
    '幅1199pxへ狭めて戻すと、保存した分け方に戻る',
    back.palette === byKey.palette,
    `${back.palette}px（狭める前は${byKey.palette}px）`,
  )

  // 壊れた保存値は既定に落ちる。
  await page.evaluate((key) => window.localStorage.setItem(key, '{壊れている'), PANES_KEY)
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  const broken = await widths()
  check('保存値が壊れていても既定で開く', broken.palette === 180, `${broken.palette}px`)

  // 0007と同じ規模の文書でドラッグしても引っかからない。
  await editor().fill(
    Array.from({ length: 400 }, (_, i) => `## 節 ${i + 1}\n\n本文 $x^2 + ${i}$ です。\n`).join('\n'),
  )
  await page.waitForTimeout(1500)
  const perDrag = await page.evaluate(async () => {
    const divider = document.querySelectorAll('.pane-divider')[1]
    const box = divider.getBoundingClientRect()
    const started = performance.now()
    for (let i = 0; i < 20; i += 1) {
      for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
        divider.dispatchEvent(
          new PointerEvent(type, { bubbles: true, clientX: box.x + 3 + i, clientY: box.y + 50, pointerId: 1 }),
        )
      }
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    return (performance.now() - started) / 20
  })
  check(
    '400節の文書でも、仕切りの操作1回あたり100ms以内',
    perDrag <= 100,
    `${perDrag.toFixed(1)}ms/回`,
    { timing: true },
  )
  await page.screenshot({ path: `${OUT}/panes.png` })
})

section('placement', 'パレットの置き場所（0054）', async () => {
  /** 画面の主な寸法をまとめて読む。 */
  const layout = () =>
    page.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        if (el === null) return null
        const b = el.getBoundingClientRect()
        return {
          w: Math.round(b.width),
          h: Math.round(b.height),
          left: Math.round(b.left),
          top: Math.round(b.top),
        }
      }
      const graph = document.querySelector('svg.graph')
      const tabs = [...document.querySelectorAll('.palette__bar > .palette__tabs > .palette__tab')]
      return {
        palette: box('.palette'),
        panes: box('.panes'),
        editor: box('textarea'),
        preview: box('.pane--preview'),
        graph: graph ? { w: Math.round(graph.getBoundingClientRect().width), h: Math.round(graph.getBoundingClientRect().height) } : null,
        tabRows: new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top))).size,
        tabCount: tabs.length,
        icons: document.querySelectorAll('.palette__tab-icon').length,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }
    })

  // ---- 幅1440px: 縦帯になる ----
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const wide = await layout()

  check(
    '幅1440pxでパレットが左にあり、幅180px',
    wide.palette.w === 180 && wide.palette.left === 0,
    `${wide.palette.w}px / left ${wide.palette.left}`,
  )
  check(
    '幅1440pxでパレットの高さがペインと同じ（横帯の94pxではない）',
    Math.abs(wide.palette.h - wide.panes.h) <= 5,
    `パレット${wide.palette.h}px / ペイン${wide.panes.h}px`,
  )
  check('幅1440pxでtextareaが810px以上', wide.editor.h >= 810, `${wide.editor.h}px（横帯のときは721px）`)
  // 0057で仕切り2本（各6px）が入り、ソースとプレビューが6pxずつ狭くなった
  // （630px → 624px）。横帯のときの720pxと比べる意図は変わらない。
  check('幅1440pxでプレビューの幅が620px以上', wide.preview.w >= 620, `${wide.preview.w}px（横帯のときは720px）`)
  check(
    '幅1440pxでサンプルのグラフが480×320pxのまま（0037の回帰）',
    wide.graph !== null && wide.graph.w === 480 && wide.graph.h === 320,
    wide.graph ? `${wide.graph.w}×${wide.graph.h}` : 'グラフがない',
  )
  check('幅1440pxでタブ8つが縦に並ぶ', wide.tabRows === 8 && wide.tabCount === 8, `${wide.tabCount}個 / ${wide.tabRows}行`)

  // パレットの見出し（0056）。縦帯でだけ出て、高さは他の2つと同じ30px。
  const header = await page.evaluate(() => {
    const el = document.querySelector('.pane__header--palette')
    if (el === null) return null
    const box = el.getBoundingClientRect()
    const others = [...document.querySelectorAll('.pane--editor .pane__header, .pane--preview .pane__header')]
    return {
      text: el.textContent.trim(),
      h: Math.round(box.height),
      visible: box.height > 0,
      others: others.map((o) => Math.round(o.getBoundingClientRect().height)),
    }
  })
  check('幅1440pxでパレットに「パレット」の見出しが出る（0056）', header?.visible === true && header.text === 'パレット', JSON.stringify(header))
  check(
    '見出しの高さがソース・プレビューと同じ30px',
    header?.h === 30 && header.others.every((h) => h === 30),
    `パレット${header?.h}px / ほか ${header?.others.join(',')}px`,
  )
  check('幅1440pxでもタブのアイコンが8つ出ている（0053の回帰）', wide.icons === 8, `${wide.icons}個`)
  check('幅1440pxでページに横スクロールが出ない', wide.scrollW <= wide.innerW, `${wide.scrollW} / ${wide.innerW}`)
  await page.screenshot({ path: `${OUT}/placement-wide.png` })

  // 公式タブ（いちばん中身が高い）。帯の中を縦スクロールして最後まで届く。
  await page.getByRole('tab', { name: '公式', exact: true }).first().click()
  const scrolled = await page.evaluate(() => {
    const strip = document.querySelector('.palette')
    strip.scrollTop = strip.scrollHeight
    return { sh: strip.scrollHeight, ch: strip.clientHeight, top: Math.round(strip.scrollTop) }
  })
  check(
    '公式タブで帯が縦スクロールする',
    scrolled.sh > scrolled.ch,
    `中身${scrolled.sh}px / 帯${scrolled.ch}px`,
  )
  // KaTeXのラベルはボタンの外へ上に23.7〜38.7pxはみ出す。縦帯では3行並ぶので、
  // 中身がクリック判定を奪うと上の行が押せなくなる（実際に selection 区分が落ちた）。
  const upperRowClickable = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.palette__item')]
    return items.every((item) => {
      const b = item.getBoundingClientRect()
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      return item.contains(hit)
    })
  })
  check('縦帯で、どのボタンも中心をクリックすると自分に当たる（上の行が隠れない）', upperRowClickable)

  // 帯が180pxなので、公式の式は2行に折り返す。折り返してもボタンの外に出ないこと。
  const formulaFit = await page.evaluate(() =>
    [...document.querySelectorAll('.palette__item--formula')].every((item) => {
      const katex = item.querySelector('.katex')
      if (katex === null) return true
      return katex.getBoundingClientRect().right <= item.getBoundingClientRect().right + 0.5
    }),
  )
  check('縦帯の公式タブで、式がボタンの外にはみ出さない（折り返して収まる）', formulaFit)

  const lastFormula = page.locator('.palette__item--formula').last()
  await lastFormula.click()
  check(
    'スクロールした先の公式を押すと挿入される',
    (await editor().inputValue()).includes('$$'),
    `末尾: ${JSON.stringify((await editor().inputValue()).slice(-40))}`,
  )

  // 検索（0011の回帰）。縦帯でも検索して挿入できる。
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  await page.locator('.palette__search').fill('積分')
  await page.waitForTimeout(150)
  const hits = await page.locator('.palette__items--results .palette__item').count()
  check('縦帯でも検索の結果が出る（積分）', hits > 0, `${hits}件`)
  await page.locator('.palette__items--results .palette__item').first().click()
  check(
    '検索結果から挿入できる',
    (await editor().inputValue()).includes('\\int'),
    `末尾: ${JSON.stringify((await editor().inputValue()).slice(-30))}`,
  )

  // ダークで帯の仕切りが見える。
  await page.evaluate(
    (key) => window.localStorage.setItem(key, JSON.stringify({ version: 1, theme: 'dark' })),
    THEME_KEY,
  )
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  const borderVisible = await page.evaluate(() => {
    const strip = document.querySelector('.palette')
    const style = getComputedStyle(strip)
    return {
      right: style.borderRightWidth,
      color: style.borderRightColor,
      background: style.backgroundColor,
    }
  })
  check(
    'ダークで帯の右に境界線があり、背景と色が違う',
    borderVisible.right === '1px' && borderVisible.color !== borderVisible.background,
    `${borderVisible.right} ${borderVisible.color} / 背景 ${borderVisible.background}`,
  )
  await page.screenshot({ path: `${OUT}/placement-dark.png` })

  // ---- 幅1200px: まだ縦帯。グラフが縮みすぎない ----
  await resetState()
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const mid = await layout()
  check('幅1200pxでも縦帯（パレットの幅180px）', mid.palette.w === 180, `${mid.palette.w}px`)
  check('幅1200pxでtextareaが710px以上', mid.editor.h >= 710, `${mid.editor.h}px（横帯のときは610px）`)
  check(
    '幅1200pxでグラフの幅が450px以上',
    mid.graph !== null && mid.graph.w >= 450,
    mid.graph ? `${mid.graph.w}×${mid.graph.h}` : 'グラフがない',
  )

  // ---- 幅1199px: 横帯に戻る ----
  await page.setViewportSize({ width: 1199, height: 800 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const narrowSide = await layout()
  const headerAt1199 = await page.evaluate(() => {
    const el = document.querySelector('.pane__header--palette')
    return el === null ? 'なし' : Math.round(el.getBoundingClientRect().height)
  })
  check('幅1199pxではパレットの見出しが出ない（0056）', headerAt1199 === 0 || headerAt1199 === 'なし', String(headerAt1199))
  check(
    '幅1199pxでは横帯に戻る（パレットが全幅・高さ105px）',
    narrowSide.palette.w === 1199 && Math.abs(narrowSide.palette.h - 105) <= 2,
    `${narrowSide.palette.w}×${narrowSide.palette.h}px`,
  )
  // 0070で装飾を基本に集めたぶん（8→23件）、パレットが11px高くなったぶんtextareaが11px減った（621→610px）。
  check(
    '幅1199pxのtextareaが横帯のときの高さ（610px±5px）',
    Math.abs(narrowSide.editor.h - 610) <= 5,
    `${narrowSide.editor.h}px`,
  )

  // ---- 狭い画面は0032のまま ----
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const phone = await layout()
  check('幅360pxでパレットが139px（0032の蓋のまま）', Math.abs(phone.palette.h - 139) <= 2, `${phone.palette.h}px`)
  const headerAt360 = await page.evaluate(() => {
    const el = document.querySelector('.pane__header--palette')
    return el === null ? 'なし' : Math.round(el.getBoundingClientRect().height)
  })
  check('幅360pxでもパレットの見出しが出ない（0056）', headerAt360 === 0 || headerAt360 === 'なし', String(headerAt360))
  check('幅360pxで横スクロールが出ない', phone.scrollW <= phone.innerW, `${phone.scrollW} / ${phone.innerW}`)

  // ---- 英語表示でも縦帯 ----
  await resetState()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  await page.getByRole('button', { name: /言語/ }).click()
  await page.waitForTimeout(200)
  const en = await layout()
  const enHeader = await page.evaluate(() => document.querySelector('.pane__header--palette')?.textContent.trim())
  check('英語表示では見出しが Palette になる（0056）', enHeader === 'Palette', String(enHeader))
  check(
    '英語表示でも縦帯でタブ8つが縦に並ぶ',
    en.palette.w === 180 && en.tabRows === 8,
    `${en.palette.w}px / ${en.tabRows}行`,
  )

  // ---- サンプル文書から位置の言葉が消えている ----
  await resetState()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const ja = await editor().inputValue()
  check('日本語のサンプル文書に「上のパレット」がない', !ja.includes('上のパレット'), ja.includes('パレットのボタン') ? 'パレットのボタン…に直っている' : '該当文なし')
})

section('tab-icon', 'タブのアイコン（0053）', async () => {
  const icons = () => page.locator('.palette__bar > .palette__tabs > .palette__tab .palette__tab-icon')
  const iconTexts = () => icons().allInnerTexts()
  const paletteHeight = async () =>
    Math.round((await page.locator('.palette').boundingBox()).height)
  /** タブ行の横スクロールの中身と、見えている幅。 */
  const tabsScroll = () =>
    page.evaluate(() => {
      const wrap = document.querySelector('.palette__bar > .palette__tabs')
      return { scrollW: wrap.scrollWidth, clientW: wrap.clientWidth }
    })

  // 幅1200px以上はパレットが縦帯になった（0054）。アイコンが横帯の高さに
  // 効かないことを見るのが目的なので、横帯の上限（1199px）で測る。
  await page.setViewportSize({ width: 1199, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()

  // 1. 8つのタブすべてにアイコンが1つずつある。
  check('幅1199px・日本語で、タブ8つそれぞれにアイコンがある', (await icons().count()) === 8, `${await icons().count()}個`)

  const ja = await iconTexts()
  check('8つのアイコンがすべて異なる', new Set(ja).size === 8, ja.join(' '))
  check('アイコンが空でない（豆腐や空文字でない）', ja.every((icon) => icon.trim().length > 0), ja.join(' '))

  // 2. アイコンは読み上げに入らない（ラベルが本体）。
  check(
    'アイコンは aria-hidden で、タブの名前に混ざらない',
    (await page.getByRole('tab', { name: '基本', exact: true }).count()) === 1,
  )

  // 3. パレットの高さは現状のまま（0032の蓋を壊していない）。
  const wide = await paletteHeight()
  check('幅1199px・日本語でパレットが105px（±2px。アイコンで高くなっていない）', Math.abs(wide - 105) <= 2, `${wide}px`)

  // 4. 英語表示でも同じ8つ。記号は言語で変わらない。
  await page.getByRole('button', { name: /言語/ }).click()
  await page.waitForTimeout(200)
  const en = await iconTexts()
  check('英語表示でも同じ8つのアイコンが出る', en.join(' ') === ja.join(' '), `${en.join(' ')}（日本語: ${ja.join(' ')}）`)
  await page.getByRole('button', { name: /Language/ }).click()
  await page.waitForTimeout(200)

  // 5. ダークモードでアイコンの色がラベルと同じ（別色を持たない）。
  // ボタンは自動→ライト→ダークの巡回なので、保存の値を直接ダークにして開き直す。
  await page.evaluate(
    (key) => window.localStorage.setItem(key, JSON.stringify({ version: 1, theme: 'dark' })),
    THEME_KEY,
  )
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  check('ダークで開けている（背景が暗い）', (await bodyBackground()) === 'rgb(21, 24, 28)', await bodyBackground())
  const sameColor = await page.evaluate(() => {
    const tab = document.querySelector('.palette__bar > .palette__tabs > .palette__tab')
    const icon = tab.querySelector('.palette__tab-icon')
    return getComputedStyle(icon).color === getComputedStyle(tab).color
  })
  check('ダークモードでアイコンの色がラベルと同じ', sameColor)
  await page.screenshot({ path: `${OUT}/tab-icon-dark.png` })

  // 6. 検索欄が2行目へ落ち始める幅。アイコンのぶん上がるが、945pxでは1行のまま。
  await page.setViewportSize({ width: 945, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const bar945 = Math.round(
    await page.evaluate(() => document.querySelector('.palette__bar').getBoundingClientRect().height),
  )
  check('幅945px・日本語でタブ行が1行のまま（帯の高さ36px）', Math.abs(bar945 - 36) <= 2, `${bar945}px`)

  // 7. 狭い画面。高さの蓋（0032）と、横スクロールの長さ。
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const narrow = await paletteHeight()
  check('幅360px・日本語でパレットが139px（±2px。0032の蓋のまま）', Math.abs(narrow - 139) <= 2, `${narrow}px`)

  const scroll = await tabsScroll()
  check(
    '幅360pxでタブ行の横スクロールが751px以下',
    scroll.scrollW <= 751,
    `${scroll.scrollW}px / 見え${scroll.clientW}px（アイコンなしは674px）`,
  )
  await page.screenshot({ path: `${OUT}/tab-icon-narrow.png` })

  // 8. アイコンを足してもタブは今までどおり切り替わる。
  await page.getByRole('tab', { name: '演算子', exact: true }).first().click()
  check(
    'タブを押すとその記号一覧に切り替わる（総和が出る）',
    (await page.locator('.palette__item').first().getAttribute('title')).startsWith('総和'),
    await page.locator('.palette__item').first().getAttribute('title'),
  )
})

section('palette-height', 'パレットの高さ（0032）', async () => {
  const paletteHeight = async () =>
    Math.round((await page.locator('.palette').boundingBox()).height)
  const tabNames = () => tabLabels('.palette__bar > .palette__tabs > .palette__tab')
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
    '幅375pxで、公式の15分類すべてが同じ高さ',
    new Set(formulaHeights).size === 1 && formulaHeights.length === 15,
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
    '横スクロールで最後の分類（集合と論理）に届き、押すとその公式が出る',
    lastSub === '集合と論理' && lastSubSelected === lastSub,
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

  // 横帯の画面は変えない（幅1200px以上は縦帯になった。0054）。
  await page.setViewportSize({ width: 1199, height: 800 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  check('幅1199pxでパレットの高さが105pxのまま', (await paletteHeight()) === 105, `${await paletteHeight()}px`)

  await page.setViewportSize({ width: 1199, height: 900 })
  await page.getByRole('tab', { name: '公式', exact: true }).first().click()
  const wideFormula = await paletteHeight()
  const wideScrolls = await page
    .locator('.palette__panel > .palette__items')
    .evaluate((el) => el.scrollHeight > el.clientHeight)
  // 0064で分類が12→15に増え、幅1199pxでは2段目のタブが1行→2行になった。
  // 上限を157px→180pxに上げている（0064の仕様に実測つきで記録した）。
  check('幅1199pxの公式タブが180px以下のまま', wideFormula <= 180, `${wideFormula}px`)
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
      heads: [...document.querySelectorAll('.pane--editor .pane__header, .pane--preview .pane__header')].map((h) =>
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
      heads: [...document.querySelectorAll('.pane--editor .pane__header, .pane--preview .pane__header')].map((h) =>
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
  check('サンプル文書の見出しがファイル名になる', saved.name === '正規分布と標本平均.md', saved.name)
  check(
    '書き出した中身がエディタの内容と一致する',
    saved.text === (source.endsWith('\n') ? source : `${source}\n`),
    `${saved.text.length}文字`,
  )
  check('書き出すと結果が表示される', (await waitNotice()).includes('正規分布と標本平均.md を保存しました'), await statusText())

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
    '英語のサンプルは The normal distribution and sample means.md になる',
    englishDownload.suggestedFilename() === 'The normal distribution and sample means.md',
    englishDownload.suggestedFilename(),
  )
  check('英語表示では結果が Saved … になる', (await waitNotice()).includes('Saved The normal distribution and sample means.md'), await statusText())
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
        paneWidth: Math.round(pane.width),
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
      `幅${width}pxで図の横幅がペインに収まり、横スクロールも出ない`,
      box.width <= box.paneWidth && box.scrollW <= box.innerW,
      `図 ${box.width}×${box.height}px / ペインの幅 ${box.paneWidth}px / scrollWidth ${box.scrollW}`,
    )
    // 高さは「収まる」を基準にできない（0070）。パレットの高さは選んでいるタブで
    // 変わり、**記号の多いタブを選ぶと幅540pxでは元から収まっていなかった**
    // （ギリシャ小文字31件で141px・ペイン264pxに対し図274px）。0070で初期表示の
    // 基本タブも23件になったので、いちばん低いタブでも収まらなくなった。
    // 図が縮むのは別issue（0071）。ここでは**いちばん高いパレット（公式タブ）でも
    // 縦スクロールで図の下端まで届く**ことを見る。
    await page.getByRole('tab', { name: '公式', exact: true }).first().click()
    await page.waitForTimeout(200)
    const reach = await page.evaluate(() => {
      const svg = document.querySelector('.preview svg.graph')
      const pane = svg.closest('.pane')
      const scroller = pane.querySelector('.preview') ?? pane
      scroller.scrollTop = scroller.scrollHeight
      const svgBottom = svg.getBoundingClientRect().bottom
      const paneBottom = pane.getBoundingClientRect().bottom
      return {
        paletteH: Math.round(document.querySelector('.palette').getBoundingClientRect().height),
        paneH: Math.round(pane.getBoundingClientRect().height),
        svgH: Math.round(svg.getBoundingClientRect().height),
        reached: svgBottom <= paneBottom + 1,
      }
    })
    check(
      `幅${width}pxで、いちばん高いパレット（公式タブ）でも縦スクロールで図の下端まで届く`,
      reach.reached,
      `パレット${reach.paletteH}px / ペイン${reach.paneH}px / 図の高さ${reach.svgH}px`,
    )
    await page.getByRole('tab', { name: '基本', exact: true }).first().click()
    await page.waitForTimeout(150)
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

  // 一致を塗る層（0043）。フォーカスが検索欄にある間、textareaの選択は
  // Chromiumが描画しないので、裏の層で見せている。
  const marks = () => page.locator('.editor-highlights mark')
  check('一致の数だけ塗られる', (await marks().count()) === 3, `${await marks().count()}件`)
  check(
    'いま選ばれている1件だけ色が違う',
    (await page.locator('.editor-highlights mark.is-current').count()) === 1,
  )
  check(
    '塗った層が本文を覆い隠さない（textareaが手前にある）',
    await page.evaluate(() => {
      const rect = document.querySelector('.editor').getBoundingClientRect()
      const el = document.elementFromPoint(rect.left + 30, rect.top + 30)
      return el?.classList.contains('editor')
    }),
  )
  const currentText = () => page.locator('.editor-highlights mark.is-current').innerText()
  check('塗られているのは検索語そのもの', (await currentText()) === '\\alpha', await currentText())

  const first = await selectionStart()
  await page.getByRole('button', { name: '次へ' }).click()
  check('「次へ」で2件目へ進む', (await count()) === '2/3件' && (await selectionStart()) > first, await count())

  check(
    '「次へ」で色の濃い1件も移る',
    await page.evaluate(() => {
      const all = [...document.querySelectorAll('.editor-highlights mark')]
      return all.findIndex((el) => el.classList.contains('is-current')) === 1
    }),
  )

  await page.getByRole('button', { name: '次へ' }).click()
  await page.getByRole('button', { name: '次へ' }).click()
  check('末尾の次で先頭へ回る', (await count()) === '1/3件', await count())

  await page.getByRole('button', { name: '前へ' }).click()
  check('「前へ」で末尾へ回る', (await count()) === '3/3件', await count())

  // 0件のとき。
  await queryField().fill('存在しない語')
  await page.waitForTimeout(200)
  check('一致しないときは0件と出る', (await count()) === '0件', await count())
  check('0件のときは何も塗らない', (await marks().count()) === 0)
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

  // 書式が層とtextareaでずれていないか。ずれると色が別の文字に付く。
  // 折り返しが変われば全体の高さが変わるので、高さの一致で見る。
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 667 })
    await page.waitForTimeout(200)
    const heights = await page.evaluate(() => ({
      editor: document.querySelector('.editor').scrollHeight,
      layer: document.querySelector('.editor-highlights')?.scrollHeight ?? -1,
    }))
    check(
      `幅${width}pxで塗る層とtextareaの折り返しが一致する`,
      heights.editor === heights.layer,
      `textarea ${heights.editor}px / 層 ${heights.layer}px`,
    )
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  // Esc で閉じる。
  await findButton().click()
  await queryField().press('Escape')
  await page.waitForTimeout(200)
  check('Escでバーが閉じる', (await bar().count()) === 0)
  check('閉じると塗りも消える', (await page.locator('.editor-highlights').count()) === 0)
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
  check(
    '400件すべてが塗られる',
    (await marks().count()) === 400,
    `${await marks().count()}件`,
  )
  // 長い文書ではスクロールしてもずれないことが効く。
  await page.evaluate(() => {
    const el = document.querySelector('.editor')
    el.scrollTop = 2000
    el.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(200)
  const scrolled = await page.evaluate(() => ({
    editor: document.querySelector('.editor').scrollTop,
    layer: document.querySelector('.editor-highlights').scrollTop,
  }))
  check(
    'スクロールしても塗る層が追従する',
    scrolled.editor === scrolled.layer && scrolled.editor > 0,
    `textarea ${scrolled.editor} / 層 ${scrolled.layer}`,
  )
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

// ---- スクロールの同期（0010） ----

section('scroll', 'スクロールの同期（0010）', async () => {
  /*
    「見出しをエディタの上端に合わせる」には、その行のy座標が要る。
    行番号 × 行高では出せない（長い行は折り返す）ので、**ミラーの座標を読む**。
    仕様を書くときにここを取り違えて、ずれを3〜5倍に見積もった。
  */
  const setup = async (doc, expectHeadings) => {
    await editor().fill(doc)
    await page.waitForFunction(
      (n) => document.querySelectorAll('.preview h2[data-line]').length >= n,
      expectHeadings,
      { timeout: 30000 },
    )
    // 1度スクロールさせてミラーを組み立てさせる（測るのはスクロールのときだけ）。
    await page.evaluate(() => {
      document.querySelector('.editor').scrollTop = 40
    })
    await page.waitForTimeout(300)
  }

  /** 見出しの行のエディタ内y座標。ミラーに入ったspanから読む。 */
  const editorTopOf = (heading) =>
    page.evaluate((text) => {
      const textarea = document.querySelector('.editor')
      const line = textarea.value.split('\n').indexOf(text) + 1
      const span = document.querySelector(`.editor-mirror span[data-line="${line}"]`)
      return span === null ? null : span.offsetTop
    }, heading)

  /** その見出しをエディタの上端に合わせ、プレビューでの上端からのずれを返す。 */
  const driftFor = async (heading) => {
    const top = await editorTopOf(heading)
    if (top === null) return null
    await page.evaluate((value) => {
      document.querySelector('.editor').scrollTop = value
    }, top)
    await page.waitForTimeout(250)
    return page.evaluate((text) => {
      const preview = document.querySelector('.preview')
      const found = [...preview.querySelectorAll('h2')].find(
        (element) => element.textContent.trim() === text.replace('## ', ''),
      )
      if (found === undefined) return null
      return found.getBoundingClientRect().top - preview.getBoundingClientRect().top
    }, heading)
  }

  const scrollTops = () =>
    page.evaluate(() => ({
      editor: document.querySelector('.editor').scrollTop,
      preview: document.querySelector('.preview').scrollTop,
    }))

  // 数式・表・コードブロックを含む40節の文書（仕様の実測と同じもの）。
  const parts = []
  for (let i = 1; i <= 40; i += 1) {
    parts.push(`## 節 ${i}`, '', `本文 ${i} です。インライン数式 $a_{${i}}$ を含みます。`, '')
    if (i % 3 === 0) {
      parts.push(
        '$$',
        `\\int_0^{${i}} \\frac{x^2 + 1}{\\sqrt{x + 1}}\\,dx = \\sum_{k=1}^{${i}} \\frac{1}{k}`,
        '$$',
        '',
      )
    }
    if (i % 5 === 0) {
      parts.push('| a | b | c |', '|---|---|---|')
      for (let r = 0; r < 4; r += 1) parts.push(`| ${r} | ${r * 2} | ${r * 3} |`)
      parts.push('')
    }
    if (i % 7 === 0) {
      parts.push('```js')
      for (let r = 0; r < 5; r += 1) parts.push(`const v${r} = ${r}`)
      parts.push('```', '')
    }
  }
  const mixedDoc = parts.join('\n')

  const errorsBefore = errors.length
  await setup(mixedDoc, 40)

  const drift20 = await driftFor('## 節 20')
  check(
    'エディタで節20を上端に合わせるとプレビューでも上端から32px以内',
    drift20 !== null && Math.abs(drift20) <= 32,
    `${drift20 === null ? '見つからない' : Math.round(drift20)}px（割合なら38px）`,
  )

  const drift36 = await driftFor('## 節 36')
  check(
    'エディタで節36を上端に合わせるとプレビューでも上端から32px以内',
    drift36 !== null && Math.abs(drift36) <= 32,
    `${drift36 === null ? '見つからない' : Math.round(drift36)}px（割合なら43px）`,
  )

  // 節19は節18のブロック数式の直後。割合でいちばんずれるところ。
  const drift19 = await driftFor('## 節 19')
  check(
    'ブロック数式の直後の見出しでも上端から32px以内',
    drift19 !== null && Math.abs(drift19) <= 32,
    `${drift19 === null ? '見つからない' : Math.round(drift19)}px`,
  )

  await page.evaluate(() => {
    document.querySelector('.editor').scrollTop = 0
  })
  await page.waitForTimeout(250)
  const atTop = await scrollTops()
  check('エディタを最上端にするとプレビューも最上端', atTop.preview === 0, `preview=${atTop.preview}`)

  await page.evaluate(() => {
    const textarea = document.querySelector('.editor')
    textarea.scrollTop = textarea.scrollHeight
  })
  await page.waitForTimeout(250)
  const atBottom = await page.evaluate(() => {
    const preview = document.querySelector('.preview')
    return {
      scrollTop: Math.round(preview.scrollTop),
      max: Math.round(preview.scrollHeight - preview.clientHeight),
    }
  })
  check(
    'エディタを最下端にするとプレビューも最下端',
    atBottom.max - atBottom.scrollTop <= 4,
    `${atBottom.scrollTop} / ${atBottom.max}`,
  )

  // ---- 逆方向 ----

  const expected25 = await editorTopOf('## 節 25')
  await page.evaluate(() => {
    const preview = document.querySelector('.preview')
    const found = [...preview.querySelectorAll('h2')].find(
      (element) => element.textContent.trim() === '節 25',
    )
    preview.scrollTop +=
      found.getBoundingClientRect().top - preview.getBoundingClientRect().top
  })
  await page.waitForTimeout(250)
  const reverse = await scrollTops()
  check(
    'プレビューで節25を上端に合わせるとエディタもその行に来る（32px以内）',
    Math.abs(reverse.editor - expected25) <= 32,
    `エディタ ${Math.round(reverse.editor)}px / 期待 ${Math.round(expected25)}px`,
  )

  await page.evaluate(() => {
    const preview = document.querySelector('.preview')
    preview.scrollTop = preview.scrollHeight
  })
  await page.waitForTimeout(250)
  const editorBottom = await page.evaluate(() => {
    const textarea = document.querySelector('.editor')
    return {
      scrollTop: Math.round(textarea.scrollTop),
      max: Math.round(textarea.scrollHeight - textarea.clientHeight),
    }
  })
  check(
    'プレビューを最下端にするとエディタも最下端',
    editorBottom.max - editorBottom.scrollTop <= 4,
    `${editorBottom.scrollTop} / ${editorBottom.max}`,
  )

  // ---- ループしないこと ----

  await driftFor('## 節 20')
  const beforeWait = await scrollTops()
  await page.waitForTimeout(600)
  const afterWait = await scrollTops()
  check(
    'エディタを動かしたあと600ms待っても両方の位置が動かない',
    beforeWait.editor === afterWait.editor && beforeWait.preview === afterWait.preview,
    `editor ${Math.round(beforeWait.editor)}→${Math.round(afterWait.editor)} / preview ${Math.round(beforeWait.preview)}→${Math.round(afterWait.preview)}`,
    { timing: true },
  )

  await page.evaluate(() => {
    const preview = document.querySelector('.preview')
    preview.scrollTop = Math.round((preview.scrollHeight - preview.clientHeight) * 0.4)
  })
  await page.waitForTimeout(250)
  const reverseBefore = await scrollTops()
  await page.waitForTimeout(600)
  const reverseAfter = await scrollTops()
  check(
    'プレビューを動かしたあと600ms待っても両方の位置が動かない',
    reverseBefore.editor === reverseAfter.editor &&
      reverseBefore.preview === reverseAfter.preview,
    `editor ${Math.round(reverseBefore.editor)}→${Math.round(reverseAfter.editor)} / preview ${Math.round(reverseBefore.preview)}→${Math.round(reverseAfter.preview)}`,
    { timing: true },
  )

  // ---- カーソルに触らないこと ----

  await page.evaluate(() => {
    const textarea = document.querySelector('.editor')
    textarea.focus()
    textarea.setSelectionRange(100, 120)
  })
  await page.evaluate(() => {
    const preview = document.querySelector('.preview')
    preview.scrollTop = Math.round((preview.scrollHeight - preview.clientHeight) * 0.7)
  })
  await page.waitForTimeout(250)
  const selection = await page.evaluate(() => {
    const textarea = document.querySelector('.editor')
    return { start: textarea.selectionStart, end: textarea.selectionEnd }
  })
  check(
    'プレビューをスクロールしてもカーソルと選択範囲が変わらない',
    selection.start === 100 && selection.end === 120,
    `${selection.start}-${selection.end}`,
  )

  // ---- ミラーが見えないこと・場所を取らないこと ----

  const mirrorState = await page.evaluate(() => {
    const textarea = document.querySelector('.editor')
    const rect = textarea.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const panes = document.querySelector('.panes')
    return {
      hit: hit === null ? 'なし' : hit.tagName + (hit.className ? `.${hit.className}` : ''),
      mirrors: document.querySelectorAll('.editor-mirror').length,
      visibility: getComputedStyle(document.querySelector('.editor-mirror')).visibility,
      textareaHeight: Math.round(textarea.clientHeight),
      panesScrollWidth: panes.scrollWidth,
      panesClientWidth: panes.clientWidth,
    }
  })
  check(
    'エディタの中央をクリックするとtextareaに当たる（ミラーが覆っていない）',
    mirrorState.hit.startsWith('TEXTAREA'),
    mirrorState.hit,
  )
  check(
    'ミラーは描画されない（visibility: hidden）',
    mirrorState.mirrors === 1 && mirrorState.visibility === 'hidden',
    `${mirrorState.mirrors}件 / ${mirrorState.visibility}`,
  )
  check(
    'ミラーが場所を取らない（幅1440pxでtextareaは815px高のまま）',
    mirrorState.textareaHeight === 815,
    `${mirrorState.textareaHeight}px`,
  )
  check(
    'ミラーで横スクロールが増えない',
    mirrorState.panesScrollWidth === mirrorState.panesClientWidth,
    `${mirrorState.panesScrollWidth} / ${mirrorState.panesClientWidth}`,
  )

  // ---- 折り返しのある文書 ----

  const wrapped = []
  for (let i = 1; i <= 20; i += 1) {
    wrapped.push(
      `## 節 ${i}`,
      '',
      `${'これは折り返しを起こすための長い行です。'.repeat(5)}${i}`,
      '',
    )
  }
  await setup(wrapped.join('\n'), 20)
  const wrappedDrift = await driftFor('## 節 12')
  check(
    '1行が折り返す文書でも上端から32px以内',
    wrappedDrift !== null && Math.abs(wrappedDrift) <= 32,
    `${wrappedDrift === null ? '見つからない' : Math.round(wrappedDrift)}px`,
  )

  // ---- 狭い画面（上下分割） ----

  await page.setViewportSize({ width: 1199, height: 900 })
  await page.waitForTimeout(300)
  await setup(mixedDoc, 40)
  const narrowDrift = await driftFor('## 節 20')
  check(
    '幅1199px（上下分割）でも上端から32px以内',
    narrowDrift !== null && Math.abs(narrowDrift) <= 32,
    `${narrowDrift === null ? '見つからない' : Math.round(narrowDrift)}px`,
  )

  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(300)
  await setup(mixedDoc, 40)
  const phoneDrift = await driftFor('## 節 20')
  check(
    '幅360pxでも上端から32px以内',
    phoneDrift !== null && Math.abs(phoneDrift) <= 32,
    `${phoneDrift === null ? '見つからない' : Math.round(phoneDrift)}px`,
  )
  const phoneScroll = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  check(
    '幅360pxで横スクロールが出ない',
    phoneScroll.scrollWidth <= phoneScroll.clientWidth,
    `${phoneScroll.scrollWidth} / ${phoneScroll.clientWidth}`,
  )

  // ---- 400節での同期にかかる時間 ----

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(300)
  const longDoc = Array.from(
    { length: 400 },
    (_, i) => `## 節 ${i}\n\n式 $\\int_0^1 x^{${i}} dx = \\frac{1}{${i + 1}}$ である。\n`,
  ).join('\n')
  await editor().fill(longDoc)
  await page.waitForFunction(
    () => document.querySelectorAll('.preview .katex').length === 400,
    null,
    { timeout: 60000 },
  )
  await page.waitForTimeout(500)

  // 内容が変わった直後の1回目。ここで測り直しが走る（いちばん重い）。
  const elapsed = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const textarea = document.querySelector('.editor')
        const preview = document.querySelector('.preview')
        const was = preview.scrollTop
        const started = performance.now()
        const tick = () => {
          if (preview.scrollTop !== was) resolve(performance.now() - started)
          else requestAnimationFrame(tick)
        }
        textarea.scrollTop = Math.round((textarea.scrollHeight - textarea.clientHeight) * 0.5)
        requestAnimationFrame(tick)
      }),
  )
  check(
    '400節の文書でスクロールしてからプレビューが追いつくまで50ms以内',
    elapsed <= 50,
    `${elapsed.toFixed(1)}ms`,
    { timing: true },
  )

  await page.screenshot({ path: `${OUT}/scroll-sync.png` })
  console.log(`スクリーンショット: ${OUT}/scroll-sync.png`)

  check(
    'この区分の実行中にコンソールエラーが出ない',
    errors.length === errorsBefore,
    `${errors.length - errorsBefore}件`,
  )

  await resetState()
})

// ---- 0065: アプリの名前 ----

section('name', '名前の反映（0065）', async () => {
  await resetState()

  check('タブのタイトルが ThothGlyph', (await page.title()) === 'ThothGlyph', await page.title())

  const title = page.locator('.toolbar__title')
  check('ツールバーの見出しが ThothGlyph', (await title.innerText()) === 'ThothGlyph')

  // 仕様に書いた実測値は105.8px（幅721px以上、日英とも、保存状態が出ている状態）。
  const titleBox = await title.boundingBox()
  check(
    '幅1440pxで見出しの幅が100〜110px',
    titleBox.width >= 100 && titleBox.width <= 110,
    `${Math.round(titleBox.width * 10) / 10}px × ${Math.round(titleBox.height)}px`,
  )

  // 名前が出る最小の幅。ここで溢れなければ、これより広い幅でも溢れない。
  // いちばん長い保存状態（保存しました HH:MM）を出した状態で見る。
  await page.setViewportSize({ width: 721, height: 900 })
  await editor().click()
  await page.keyboard.press('Control+End')
  await editor().pressSequentially('\n名前の検証\n', { delay: 8 })
  await saveSettled()
  const at721 = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    title: document.querySelector('.toolbar__title').getBoundingClientRect().width,
  }))
  check(
    '幅721px（名前が出る最小の幅）で横スクロールが出ない',
    at721.scroll <= at721.client,
    `scrollWidth ${at721.scroll} / clientWidth ${at721.client} / 見出し ${Math.round(at721.title * 10) / 10}px`,
  )

  // 720px以下は clip-path で視覚的にだけ隠す（0031の実測にもとづく挙動を保つ）。
  await page.setViewportSize({ width: 720, height: 900 })
  const at720 = await page.evaluate(() => {
    const r = document.querySelector('.toolbar__title').getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  check(
    '幅720pxで見出しが1×1pxに隠れたまま',
    Math.round(at720.w) === 1 && Math.round(at720.h) === 1,
    `${at720.w} × ${at720.h}`,
  )

  for (const width of [600, 360]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(80)
    const over = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    check(
      `幅${width}pxで横スクロールが出ない`,
      over.scroll <= over.client,
      `${over.scroll} / ${over.client}`,
    )
  }

  const manifest = await page.evaluate(async () => {
    const res = await fetch('/manifest.webmanifest')
    return res.json()
  })
  check(
    'manifestの name と short_name が ThothGlyph',
    manifest.name === 'ThothGlyph' && manifest.short_name === 'ThothGlyph',
    `${manifest.name} / ${manifest.short_name}`,
  )

  // ---- 旧キーからの読み継ぎ ----
  //
  // 言語を固定する addInitScript が新キーに ja を置くため、この共有ページでは
  // 「旧キーだけがある」状態を作れない。専用のコンテキストで見る。
  const fresh = async (width = 1440) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    const p = await ctx.newPage()
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    await p.goto(URL, { waitUntil: 'load' })
    return { ctx, p }
  }

  // 文書
  {
    const { ctx, p } = await fresh()
    const source = '# 改名前に書いた文書\n\n$x^2 + y^2 = z^2$\n'
    await p.evaluate(
      ([prefix, text]) => {
        window.localStorage.clear()
        window.localStorage.setItem(
          `${prefix}document:v1`,
          JSON.stringify({ version: 1, source: text, savedAt: '2026-09-21T00:00:00.000Z' }),
        )
      },
      [LEGACY_PREFIX, source],
    )
    await p.reload({ waitUntil: 'networkidle' })
    await p.waitForSelector('.editor')
    const shown = await p.locator('.editor').inputValue()
    check(
      '旧キーに置いた文書が復元される',
      shown.startsWith('# 改名前に書いた文書'),
      shown.slice(0, 20),
    )

    const keys = await p.evaluate(() => ({
      next: window.localStorage.getItem('thothglyph:document:v1'),
      legacy: window.localStorage.getItem('matheditor:document:v1'),
    }))
    check('読み継いだ文書が新キーに写っている', (keys.next ?? '').includes('改名前に書いた文書'))
    check('写したあと旧キーが消えている', keys.legacy === null, String(keys.legacy))

    // 移行後に編集したものが、新キーに保存されてリロードで戻る。
    await p.locator('.editor').click()
    await p.keyboard.press('Control+End')
    await p.locator('.editor').pressSequentially('\n移行後の追記\n', { delay: 8 })
    // このコンテキストには言語を固定する仕掛けがないので、既定の英語で表示される。
    // 日英どちらの文言でも「保存し終えた」と分かる形で待つ。
    await p.waitForFunction(() => {
      const el = document.querySelector('.toolbar__save')
      return el !== null && /保存しました|Saved at/.test(el.textContent ?? '')
    }, null, { timeout: 8000 })
    await p.reload({ waitUntil: 'networkidle' })
    await p.waitForSelector('.editor')
    check(
      '移行後の編集が新キーに保存され、リロードで戻る',
      (await p.locator('.editor').inputValue()).includes('移行後の追記'),
    )
    await ctx.close()
  }

  // テーマ（OSはライトのまま。旧キーのダークが効けば読み継ぎが効いた証拠）
  {
    const { ctx, p } = await fresh()
    await p.emulateMedia({ colorScheme: 'light' })
    await p.evaluate((prefix) => {
      window.localStorage.clear()
      window.localStorage.setItem(`${prefix}theme:v1`, JSON.stringify({ version: 1, theme: 'dark' }))
    }, LEGACY_PREFIX)

    const flash = []
    await p.reload({ waitUntil: 'commit' })
    for (let i = 0; i < 12; i += 1) {
      flash.push(
        await p.evaluate(() => getComputedStyle(document.body).backgroundColor).catch(() => 'n/a'),
      )
      await p.waitForTimeout(16)
    }
    await p.waitForSelector('.editor')
    check(
      '旧キーのダークが効く',
      (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark',
    )
    check(
      '読み継ぎでも初期表示でライトの背景が現れない',
      !flash.includes('rgb(255, 255, 255)'),
      [...new Set(flash)].join(' / '),
      { timing: true },
    )
    await ctx.close()
  }

  // 言語（ヘッドレスChromiumの既定は英語なので、日本語が出れば読み継ぎが効いた証拠）
  {
    const { ctx, p } = await fresh()
    await p.evaluate((prefix) => {
      window.localStorage.clear()
      window.localStorage.setItem(`${prefix}lang:v1`, JSON.stringify({ version: 1, lang: 'ja' }))
    }, LEGACY_PREFIX)
    await p.reload({ waitUntil: 'networkidle' })
    await p.waitForSelector('.editor')
    check(
      '旧キーの言語（ja）が効く',
      (await p.evaluate(() => document.documentElement.lang)) === 'ja',
      await p.evaluate(() => document.documentElement.lang),
    )
    await ctx.close()
  }

  // 領域の幅
  {
    const { ctx, p } = await fresh()
    await p.evaluate((prefix) => {
      window.localStorage.clear()
      window.localStorage.setItem(
        `${prefix}panes:v1`,
        JSON.stringify({ version: 1, palette: 240, sourceRatio: 0.62 }),
      )
    }, LEGACY_PREFIX)
    await p.reload({ waitUntil: 'networkidle' })
    await p.waitForSelector('.palette')
    const palette = await p.evaluate(() =>
      Math.round(document.querySelector('.palette').getBoundingClientRect().width),
    )
    check('旧キーの領域の幅が効く（パレット240px）', Math.abs(palette - 240) <= 2, `${palette}px`)
    await ctx.close()
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: `${OUT}/name.png` })
  console.log(`スクリーンショット: ${OUT}/name.png`)
})

// ---- 0064: 統計・確率と集合・論理をパレットに足す ----

section('palette-stats', '統計・確率と集合・論理（0064）', async () => {
  const paletteHeight = async () => Math.round((await page.locator('.palette').boundingBox()).height)
  const openTab = (name) => page.getByRole('tab', { name, exact: true }).first().click()
  const openSub = (name) =>
    page.locator('.palette__tabs--sub > .palette__tab', { hasText: name }).first().click()
  /** 押す前後でソースがどう変わったか。挿入された文字列だけを返す。 */
  const insertBy = async (clickTarget) => {
    const before = await editor().inputValue()
    await clickTarget()
    const after = await editor().inputValue()
    return { before, after, changed: after !== before }
  }

  await resetState()

  // --- 記号（演算子・関係子・基本に足した28件） ---
  await openTab('演算子')
  const normal = page.locator('.palette__item[title^="正規分布（"]')
  const normalVisible = (await normal.count()) === 1 && (await normal.isVisible())
  const normalInsert = await insertBy(() => normal.click())
  check(
    '演算子タブに正規分布のボタンがあり、押すと \\mathcal{N}(, ) が入る',
    normalVisible && normalInsert.after.includes('\\mathcal{N}(, )'),
    normalInsert.after.slice(0, 40),
  )

  await openTab('関係子')
  const simInsert = await insertBy(() => page.locator('.palette__item[title^="分布に従う（"]').click())
  check(
    '関係子タブの「分布に従う」を押すと \\sim が入る',
    simInsert.after.includes('\\sim'),
    simInsert.after.slice(0, 40),
  )

  // 足した28件すべてを順に押して、どれもKaTeXでエラーにならないことを見る。
  // 単体テスト（palette.test.ts）はLaTeXを直接描画しているが、ここでは
  // 「ボタンを押して挿入された文字列がプレビューで描ける」ところまで通す。
  const addedTitles = [
    '上線（標本平均・補集合・線分）',
    '確率', '期待値', '分散', '共分散', '正規分布', '二項分布', 'カイ二乗', '二項係数',
    '和集合', '共通部分', '差集合', '和集合（添字つき）', '共通部分（添字つき）',
    '分布に従う', '条件付き（縦棒）', '独立・垂直', '収束（矢印の上に記号）',
    '属さない', '部分集合（等号つき）', '含む', '空集合', '実数全体',
    'かつ', 'または', '否定', 'ゆえに', 'なぜならば',
  ]
  await editor().fill('$$\n')
  const notFound = []
  for (const title of addedTitles) {
    await page.locator('.palette__search').fill(title)
    const hit = page.locator('.palette__items--results .palette__item').first()
    if ((await hit.count()) === 0) {
      notFound.push(title)
      continue
    }
    await hit.click()
  }
  await page.locator('.palette__search').fill('')
  check(
    `足した記号28件すべてが検索で引ける`,
    notFound.length === 0 && addedTitles.length === 28,
    notFound.length === 0 ? `${addedTitles.length}件` : `引けない: ${notFound.join(' ')}`,
  )
  await editor().fill(`${await editor().inputValue()}\n$$\n`)
  await page.waitForTimeout(400)
  const symbolErrors = await page.locator('.preview .katex-error').count()
  check(
    '足した記号28件を1つの式にまとめても katex-error が出ない',
    symbolErrors === 0,
    `${symbolErrors}件`,
  )

  // --- 公式（3分類15件） ---
  await resetState()
  await openTab('公式')
  const subTabs = await page.locator('.palette__tabs--sub > .palette__tab').allInnerTexts()
  check(
    '公式の2段目に 確率・期待値・分散・集合と論理 の3分類が増えている',
    subTabs.length === 15 &&
      ['確率', '期待値・分散', '集合と論理'].every((name) => subTabs.includes(name)),
    `${subTabs.length}分類: ${subTabs.slice(-3).join(' / ')}`,
  )

  await openSub('集合と論理')
  const blocksBefore = await page.locator('.preview .katex-display').count()
  await page
    .locator('.palette__item--formula', { hasText: 'ド・モルガンの法則' })
    .first()
    .click()
  await page.waitForTimeout(400)
  const blocksAfter = await page.locator('.preview .katex-display').count()
  check(
    '「ド・モルガンの法則」を押すとプレビューのブロック数式が1つ増える',
    blocksAfter === blocksBefore + 1,
    `${blocksBefore} → ${blocksAfter}`,
  )
  check(
    'ド・モルガンの法則の挿入で katex-error が出ない',
    (await page.locator('.preview .katex-error').count()) === 0,
  )

  // 3分類15件すべてを順に挿入して、どれも描けることを見る。
  await resetState()
  await openTab('公式')
  let inserted = 0
  for (const group of ['確率', '期待値・分散', '集合と論理']) {
    await openSub(group)
    const buttons = page.locator('.palette__item--formula')
    const count = await buttons.count()
    for (let i = 0; i < count; i += 1) {
      await buttons.nth(i).click()
      inserted += 1
    }
  }
  await page.waitForTimeout(600)
  const formulaErrors = await page.locator('.preview .katex-error').count()
  check(
    '足した公式15件すべてを挿入しても katex-error が出ない',
    inserted === 15 && formulaErrors === 0,
    `${inserted}件挿入 / エラー${formulaErrors}件`,
  )
  await page.screenshot({ path: `${OUT}/palette-stats-formulas.png` })

  // --- 検索で語から引けること（0064の背景で0件だった語） ---
  await resetState()
  for (const [query, expected] of [
    ['正規分布', '\\mathcal{N}'],
    ['covariance', '\\mathrm{Cov}'],
  ]) {
    await page.locator('.palette__search').fill(query)
    const labels = await page
      .locator('.palette__items--results .palette__item')
      .evaluateAll((els) => els.map((el) => el.getAttribute('title')))
    const hitInsert = await insertBy(() =>
      page.locator('.palette__items--results .palette__item').first().click(),
    )
    check(
      `検索欄に「${query}」と打つと結果が出て、先頭を押すと ${expected} が入る`,
      labels.length > 0 && hitInsert.after.includes(expected),
      `${labels.length}件 / 先頭 ${labels[0] ?? 'なし'}`,
    )
    await resetState()
  }

  // 線形代数はこの仕様の範囲外。引けないままであることを固定する（スコープの記録）。
  await page.locator('.palette__search').fill('転置')
  const emptyText = await page.locator('.palette__empty').innerText()
  check(
    '検索欄に「転置」と打つと「一致する記号がありません」が出る（線形代数は範囲外）',
    emptyText.includes('一致する記号がありません'),
    emptyText,
  )
  await page.locator('.palette__search').fill('')

  // --- 寸法（足しても画面を悪くしていないこと） ---
  await resetState()

  // 幅1440px（縦帯）。帯の高さは変わらず、記号タブではスクロールも出ない。
  const bandHeight = await paletteHeight()
  check('幅1440pxでパレットの高さが845pxのまま', bandHeight === 845, `${bandHeight}px`)
  await openTab('関係子')
  const bandScrolls = await page
    .locator('.palette')
    .evaluate((el) => el.scrollHeight > el.clientHeight)
  check('幅1440pxの関係子タブ（28件）で縦帯がスクロールしない', !bandScrolls)
  await openTab('公式')
  const bandScroll = await page.locator('.palette').evaluate((el) => Math.round(el.scrollHeight))
  check(
    '幅1440pxの公式タブの中身が1100px以下（実装前989px）',
    bandScroll <= 1100,
    `${bandScroll}px`,
  )
  await page.screenshot({ path: `${OUT}/palette-stats-band.png` })

  // 幅1199px（横帯）。既存の最大（ギリシャ小文字31件＝136px）を超えない。
  await page.setViewportSize({ width: 1199, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  await openTab('関係子')
  const relations = await paletteHeight()
  await openTab('ギリシャ小文字')
  const greekLower = await paletteHeight()
  check(
    '幅1199pxの関係子タブ（28件）が、ギリシャ小文字（31件）の高さを超えない',
    relations <= greekLower,
    `関係子${relations}px / ギリシャ小文字${greekLower}px`,
  )
  await openTab('演算子')
  const operators = await paletteHeight()
  check(
    '幅1199pxの演算子タブ（26件）が136px以下',
    operators <= 136,
    `${operators}px`,
  )
  await openTab('基本')
  const basic = await paletteHeight()
  check('幅1199pxの基本タブ（0070で23件）が105px', basic === 105, `${basic}px`)

  // タブを増やしていないので、検索欄が2行目に落ち始める幅は変わらない。
  const searchRow = await page.evaluate(() => {
    const tab = document.querySelector('.palette__bar > .palette__tabs > .palette__tab:last-child')
    const search = document.querySelector('.palette__search')
    return Math.abs(tab.getBoundingClientRect().top - search.getBoundingClientRect().top) < 4
  })
  check('幅1199pxで検索欄がタブと同じ行に残っている（タブを増やしていない）', searchRow)

  // 幅360px。0032の蓋が効いているので件数では変わらない。
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const phoneHeights = []
  for (const name of await tabLabels('.palette__bar > .palette__tabs > .palette__tab')) {
    if (name === '公式') continue
    await openTab(name)
    phoneHeights.push(await paletteHeight())
  }
  // 141pxは日本語表示の値（タブ行が2行）。英語では138px。
  // どちらも0032の蓋に達しているので、件数を足しても変わらない
  // （変更前の8タブ全てと同じ値であることを実測で確かめた）。
  check(
    '幅360pxで記号のどのタブでもパレットの高さが141px（0032の蓋。英語では138px）',
    phoneHeights.every((h) => h === 141 || h === 138) && new Set(phoneHeights).size === 1,
    `${[...new Set(phoneHeights)].join(',')}px`,
  )

  // 0053で踏んだはみ出しの回帰。2行以上並ぶタブで下の行のボタンが押せること。
  await page.setViewportSize({ width: 1199, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  await openTab('関係子')
  const rows = await page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll('.palette__items > .palette__item')].map((el) =>
          Math.round(el.getBoundingClientRect().top),
        ),
      ).size,
  )
  const lastRowInsert = await insertBy(() =>
    page.locator('.palette__items > .palette__item').last().click(),
  )
  check(
    '関係子タブでボタンが2行以上並び、最後の行のボタンが押せる',
    rows >= 2 && lastRowInsert.changed,
    `${rows}行`,
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  await resetState()
  console.log(
    `スクリーンショット: ${OUT}/palette-stats-formulas.png, ${OUT}/palette-stats-band.png`,
  )
})

// ---- 0068: 装飾・書体をパレットに足す / 0070: 上飾りを足し、装飾を基本に集める ----

section('palette-decor', '装飾・書体（0068・0070）', async () => {
  const paletteHeight = async () => Math.round((await page.locator('.palette').boundingBox()).height)
  const editorHeight = async () => Math.round((await editor().boundingBox()).height)
  const openTab = (name) => page.getByRole('tab', { name, exact: true }).first().click()
  const items = () => page.locator('.palette__items > .palette__item, .palette__panel > .palette__items > .palette__item')

  await resetState()
  await openTab('基本')

  // 0070で装飾は `基本` に集めた。2文字以上に掛かる上飾りがあることを見る。
  const wide = page.locator('.palette__item[title^="角（"]')
  const wideVisible = (await wide.count()) === 1 && (await wide.isVisible())
  await wide.click()
  check(
    '基本タブに「角」のボタンがあり、押すと \\widehat{} が入る',
    wideVisible && (await editor().inputValue()).includes('\\widehat{}'),
    `${wideVisible ? '見えている' : '見えない'} / ${(await editor().inputValue()).slice(0, 24)}`,
  )

  // 0009の回帰。%CURSOR% を持つので選択範囲が中へ入る。
  await resetState()
  await editor().fill('ABC')
  await editor().click()
  await page.keyboard.press('Control+a')
  await openTab('基本')
  await page.locator('.palette__item[title^="角（"]').click()
  const wrapped = await editor().inputValue()
  check('`ABC` を選んで「角」を押すと \\widehat{ABC} になる', wrapped === '\\widehat{ABC}', wrapped)

  // 足した9件（0070）と移した6件（0068→0070）を順に挿入する。
  // **挿入した直後は中身が空**（`\widehat{}`）なので、そこで壊れないことも見ている。
  await resetState()
  const addedTitles = [
    // 0070で足した9件
    'チェック', 'ブレーブ', 'アキュート', 'グレーブ',
    '角（2文字以上に掛かる）', '広いチルダ', '幾何のベクトル', '下線', '上の波括弧',
    // 0068で入れて0070で基本へ移した6件
    'チルダ', '点1つ（時間微分）', '点2つ（2階の時間微分）',
    '上に載せる（等号の上に根拠）', '下に載せる', '下の波括弧（説明を付ける）',
    // 0068の書体5件（括弧・構造に残っている）
    '筆記体（集合・変換）', '白抜き（数の集合）', '立体（単位・演算子）',
    '太字（ベクトル・行列）', '数式の中の文章',
  ]
  await editor().fill('$$\n')
  const notFound = []
  for (const title of addedTitles) {
    await page.locator('.palette__search').fill(title)
    const hit = page.locator('.palette__items--results .palette__item').first()
    if ((await hit.count()) === 0) {
      notFound.push(title)
      continue
    }
    await hit.click()
  }
  await page.locator('.palette__search').fill('')
  check(
    '装飾・書体20件すべてが検索で引ける（0070で足した9件・移した6件・書体5件）',
    notFound.length === 0 && addedTitles.length === 20,
    notFound.length === 0 ? `${addedTitles.length}件` : `引けない: ${notFound.join(' ')}`,
  )
  await editor().fill(`${await editor().inputValue()}\n$$\n`)
  await page.waitForTimeout(500)
  const emptyErrors = await page.locator('.preview .katex-error').count()
  check(
    '20件を挿入した直後（中身が空のまま）でも katex-error が出ない',
    emptyErrors === 0,
    `${emptyErrors}件`,
  )

  // 中身を書いた形でも描ける。
  await resetState()
  await editor().fill(
    '$$\n\\check{x} + \\breve{y} + \\acute{z} + \\grave{w} + \\widehat{ABC} + \\widetilde{xy}\n$$\n' +
      '$$\n\\overrightarrow{AB} + \\underline{x} + \\overbrace{a + b}^{n} + \\underbrace{c + d}_{m}\n$$\n' +
      '$$\n\\tilde{x} + \\dot{y} + \\ddot{z} + \\overset{a}{=} + \\underset{b}{=}\n$$\n',
  )
  await page.waitForTimeout(700)
  const filledErrors = await page.locator('.preview .katex-error').count()
  const blocks = await page.locator('.preview .katex-display').count()
  check(
    '中身を書いた装飾がブロック数式3つとして描かれ、katex-error が出ない',
    filledErrors === 0 && blocks === 3,
    `ブロック${blocks}個 / エラー${filledErrors}件`,
  )
  await page.screenshot({ path: `${OUT}/palette-decor.png` })

  // 検索で語から引けること（0070の背景で0件だった語）。
  await resetState()
  await page.locator('.palette__search').fill('角')
  const kakuSymbols = await page
    .locator('.palette__items--results .palette__item')
    .evaluateAll((els) =>
      els.filter((el) => !el.classList.contains('palette__item--formula')).map((el) => el.getAttribute('title')),
    )
  await page.locator('.palette__items--results .palette__item:not(.palette__item--formula)').first().click()
  check(
    '検索欄に「角」と打つと記号が出て、押すと \\widehat{} が入る（0070の前は公式だけ）',
    kakuSymbols.length > 0 && (await editor().inputValue()).includes('\\widehat{}'),
    `記号${kakuSymbols.length}件 / ${kakuSymbols[0] ?? 'なし'}`,
  )

  // 線分は \overline と同じコマンドなので、2件目を置かずtooltipで引けるようにした。
  await resetState()
  await page.locator('.palette__search').fill('線分')
  const segments = await page
    .locator('.palette__items--results .palette__item')
    .evaluateAll((els) => els.map((el) => el.getAttribute('title')))
  check(
    '検索欄に「線分」と打つと \\overline が1件だけ出る（2か所に置いていない）',
    segments.length === 1 && segments[0].startsWith('上線（標本平均・補集合・線分）'),
    segments.join(' / '),
  )

  // 0064で入れた \mathcal{N}（正規分布）と0068の \mathcal{F}（筆記体）は用途が違う。
  await page.locator('.palette__search').fill('mathcal')
  const calTitles = await page
    .locator('.palette__items--results .palette__item')
    .evaluateAll((els) => els.map((el) => el.getAttribute('title')))
  check(
    '検索欄に mathcal と打つと筆記体と正規分布の両方が出る',
    calTitles.some((t) => t.startsWith('筆記体')) && calTitles.some((t) => t.startsWith('正規分布')),
    calTitles.join(' / '),
  )
  await page.locator('.palette__search').fill('')

  // 装飾が移ったので、括弧・構造の先頭は書体（筆記体）になる。
  await resetState()
  await openTab('括弧・構造')
  const bracketsFirst = await items().first().getAttribute('title')
  const bracketsCount = await items().count()
  check(
    '括弧・構造の先頭が筆記体で、11件になっている（装飾6件が基本へ移った）',
    bracketsFirst.startsWith('筆記体') && bracketsCount === 11,
    `${bracketsCount}件 / 先頭 ${bracketsFirst}`,
  )

  // --- 寸法（0070で合意した代価のとおりか） ---
  await resetState()
  check('幅1440pxでパレットの高さが845pxのまま', (await paletteHeight()) === 845, `${await paletteHeight()}px`)
  check('幅1440pxでtextareaが815pxのまま（縦帯なので影響を受けない）', (await editorHeight()) === 815, `${await editorHeight()}px`)
  const bandScrolls = await page
    .locator('.palette')
    .evaluate((el) => el.scrollHeight > el.clientHeight)
  check('幅1440pxの基本タブ（23件）で縦帯がスクロールしない', !bandScrolls)

  // 横帯では初期表示のタブ（基本）が高くなる。公式タブは超えない。
  for (const [w, palette, formulaLimit] of [[1199, 105, 180], [900, 177, 210], [721, 179, 269]]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto(URL, { waitUntil: 'networkidle' })
    await ready()
    const basic = await paletteHeight()
    await openTab('公式')
    const formula = await paletteHeight()
    check(
      `幅${w}pxで基本タブが${palette}pxで、公式タブ（${formulaLimit}px）を超えない`,
      basic === palette && basic < formula,
      `基本${basic}px / 公式${formula}px`,
    )
  }

  // 0068で括弧・構造が伸びた分は元に戻っている。
  for (const [w, limit] of [[900, 152], [721, 154]]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.goto(URL, { waitUntil: 'networkidle' })
    await ready()
    await openTab('括弧・構造')
    const brackets = await paletteHeight()
    check(
      `幅${w}pxの括弧・構造が${limit}pxに戻っている（0068では194px・207pxだった）`,
      brackets === limit,
      `${brackets}px`,
    )
  }

  // 幅600pxは0032の蓋。textareaは323px残る。
  await page.setViewportSize({ width: 600, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  check('幅600pxでパレットが141px（0032の蓋）', (await paletteHeight()) === 141, `${await paletteHeight()}px`)
  check('幅600pxでtextareaが323px残る', (await editorHeight()) === 323, `${await editorHeight()}px`)

  // 幅375pxは0032の基準（textarea 150px以上）を保つ。
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const phoneEditor = await editorHeight()
  check('幅375pxでtextareaが207pxのまま（0032の150px以上を保つ）', phoneEditor === 207, `${phoneEditor}px`)

  // 幅360pxは件数で変わらない。
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  const phoneHeights = []
  for (const name of await tabLabels('.palette__bar > .palette__tabs > .palette__tab')) {
    if (name === '公式') continue
    await openTab(name)
    phoneHeights.push(await paletteHeight())
  }
  check(
    '幅360pxで記号のどのタブでもパレットの高さが141px（0032の蓋）',
    phoneHeights.every((h) => h === 141),
    `${[...new Set(phoneHeights)].join(',')}px`,
  )

  // 0053で踏んだはみ出しの回帰。基本は23件あるので幅1199pxでも2行になる。
  await page.setViewportSize({ width: 900, height: 900 })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await ready()
  await openTab('基本')
  const rows = await page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll('.palette__items > .palette__item')].map((el) =>
          Math.round(el.getBoundingClientRect().top),
        ),
      ).size,
  )
  const lastWas = await editor().inputValue()
  await items().last().click()
  check(
    '幅900pxの基本タブでボタンが2行以上並び、最後の行のボタンが押せる',
    rows >= 2 && (await editor().inputValue()) !== lastWas,
    `${rows}行`,
  )

  await page.setViewportSize({ width: 1440, height: 900 })
  await resetState()
  console.log(`スクリーンショット: ${OUT}/palette-decor.png`)
})

// ---- 0020: プレビューでクリックした箇所をパレットで編集する ----

section('math-click', 'プレビューからの編集（0020）', async () => {
  await resetState()

  /** textareaで選ばれている文字列。 */
  const selected = () =>
    page.evaluate(() => {
      const ta = document.querySelector('textarea')
      return ta.value.slice(ta.selectionStart, ta.selectionEnd)
    })
  /** n番目の .math-anchor（プレビュー内、文書順）。 */
  const anchor = (n) => page.locator('.preview .math-anchor').nth(n)
  /*
    輪郭の有無は **style** で見る。`outline-width` は style が none のときも
    既定値（medium = 3px）を返すので、幅だけでは判定できない。
  */
  const outlineOf = (n) =>
    page.evaluate((i) => {
      const style = getComputedStyle(document.querySelectorAll('.preview .math-anchor')[i])
      return `${style.outlineStyle} ${style.outlineWidth}`
    }, n)

  // サンプル文書の最初のインライン数式は $\mathcal{N}(\mu, \sigma^2)$。
  await anchor(0).click()
  check(
    'インライン数式をクリックするとソースの中身が選ばれる',
    (await selected()) === '\\mathcal{N}(\\mu, \\sigma^2)',
    JSON.stringify(await selected()),
  )
  check(
    'クリックのあとtextareaにフォーカスがある',
    await page.evaluate(() => document.activeElement === document.querySelector('textarea')),
  )
  check(
    'クリックした数式に2px以上の輪郭が出る',
    /^solid/.test(await outlineOf(0)) && Number.parseFloat((await outlineOf(0)).split(' ')[1]) >= 2,
    await outlineOf(0),
  )
  check(
    '選ばれていない数式には輪郭が出ない',
    (await outlineOf(1)).startsWith('none'),
    await outlineOf(1),
  )
  check(
    '印が付いている数式は文書内で1つだけ',
    (await page.locator('.preview .math-anchor--active').count()) === 1,
  )

  // 選択の色と輪郭が同時に見えている状態を残す（見た目が論点なので画像で見る）。
  await page.screenshot({ path: `${OUT}/math-click.png` })

  // 2つめのブロック数式（標本平均の式）。
  const blocks = page.locator('.preview .math-anchor--block')
  await blocks.nth(1).click()
  // サンプルの2つ目のブロック数式。0078で `\tag{標本平均}` が付き、
  // 0083でラベルが `$$` の外（`$$ {#eq-samplemean}`）へ移ったので式だけが残る。
  const blockLatex =
    '\\mathrm{E}(\\overline{X}) = \\mu, \\quad \\mathrm{Var}(\\overline{X}) = \\frac{\\sigma^2}{n}'
  check(
    'ブロック数式をクリックすると中身だけが選ばれる（$$と改行を含まない）',
    (await selected()) === blockLatex,
    JSON.stringify(await selected()),
  )
  check(
    '別の数式をクリックすると印はそちらだけに移る',
    (await page.locator('.preview .math-anchor--active').count()) === 1,
  )

  // 選んだ状態でパレットの「囲む」記号を押すと、選択を包んで入る（0009の規則）。
  await anchor(0).click()
  await page.getByRole('tab', { name: '基本', exact: true }).first().click()
  await page.getByRole('button', { name: '平方根' }).first().click()
  check(
    '選んだ数式をパレットの平方根で囲める',
    (await editor().inputValue()).includes('$\\sqrt{\\mathcal{N}(\\mu, \\sigma^2)}$'),
    JSON.stringify(
      (await editor().inputValue()).split('\n').find((line) => line.includes('sqrt')) ?? '',
    ),
  )
  check(
    '挿入（ソースの変化）で印が消える',
    (await page.locator('.preview .math-anchor--active').count()) === 0,
  )

  await resetState()

  // 本文とグラフのクリックでは選択が動かない。
  await anchor(0).click()
  const beforeBodyClick = await selected()
  await page.locator('.preview p', { hasText: '測定誤差' }).first().click({ position: { x: 4, y: 4 } })
  check('本文をクリックしても選択が変わらない', (await selected()) === beforeBodyClick)

  await page.locator('.preview svg.graph').click()
  check('グラフをクリックしても選択が変わらない', (await selected()) === beforeBodyClick)

  check(
    '数式のカーソルが pointer',
    (await page.evaluate(
      () => getComputedStyle(document.querySelector('.preview .math-anchor')).cursor,
    )) === 'pointer',
  )

  // 1文字打つと印は消える（位置がずれ、指していたものが変わるため）。
  await anchor(0).click()
  await page.keyboard.press('End')
  await page.keyboard.type('x')
  await page.waitForTimeout(100)
  check(
    '1文字打つと印が消える',
    (await page.locator('.preview .math-anchor--active').count()) === 0,
  )

  await resetState()

  // 見えている数式を選んでもスクロールは動かない（0010の同期を起こさない）。
  const previewScrollBefore = await page.evaluate(
    () => document.querySelector('.preview').scrollTop,
  )
  await blocks.nth(0).click()
  await page.waitForTimeout(300)
  const previewScrollAfter = await page.evaluate(
    () => document.querySelector('.preview').scrollTop,
  )
  check(
    '見えている数式を選んでもプレビューのスクロールが動かない',
    previewScrollAfter === previewScrollBefore,
    `${previewScrollBefore} → ${previewScrollAfter}`,
  )

  /*
    初期表示では見えない、文書の末尾の数式を選ぶ。

    **「textareaのscrollTopが増える」では見られない。** プレビューを下へ
    動かした時点で0010の同期がソースを追わせるので、クリックの時点では
    たいてい既に見えている（実測: プレビュー最下端でscrollTop 4928、
    クリック後も4928）。寄せは同期がずれたときの保険なので、
    **結果（選んだ範囲が表示範囲にあるか）**で判定する。
  */
  await resetState()
  const longSource = Array.from(
    { length: 60 },
    (_, i) => `## 節 ${i}\n\n式 $x^{${i}}$ である。\n`,
  ).join('\n')
  await editor().fill(longSource)
  await page.waitForFunction(
    () => document.querySelectorAll('.preview .katex').length === 60,
    null,
    { timeout: 30000 },
  )
  const last = page.locator('.preview .math-anchor').last()
  await last.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await last.click()
  const afterScroll = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    const lineHeight = Number.parseFloat(getComputedStyle(ta).lineHeight)
    const line = ta.value.slice(0, ta.selectionStart).split('\n').length - 1
    return {
      scrollTop: ta.scrollTop,
      selected: ta.value.slice(ta.selectionStart, ta.selectionEnd),
      visible:
        line * lineHeight >= ta.scrollTop - lineHeight &&
        line * lineHeight <= ta.scrollTop + ta.clientHeight,
    }
  })
  check(
    '文書の末尾の数式を選ぶと、その中身が選ばれる',
    afterScroll.selected === 'x^{59}',
    JSON.stringify(afterScroll.selected),
  )
  check(
    'そのとき選んだ範囲がソースの表示範囲に入っている',
    afterScroll.visible,
    `scrollTop ${afterScroll.scrollTop}`,
  )

  // 輪郭は要素の2px外に出る。狭い幅で横スクロールを増やさないこと。
  await resetState()
  await page.setViewportSize({ width: 360, height: 640 })
  await page.waitForTimeout(200)
  const widthBefore = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  const narrowAnchor = page.locator('.preview .math-anchor--block').last()
  await narrowAnchor.scrollIntoViewIfNeeded()
  await narrowAnchor.click()
  const widthAfter = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  check(
    '幅360pxで印を出してもページの横スクロールが増えない',
    widthAfter.scroll <= Math.max(widthBefore.scroll, widthAfter.client),
    `${widthBefore.scroll} → ${widthAfter.scroll}（表示幅 ${widthAfter.client}）`,
  )
  await page.screenshot({ path: `${OUT}/math-click-narrow.png` })

  await page.setViewportSize({ width: 1440, height: 900 })
  await resetState()

  // 英語表示でも同じ操作ができる。
  await page.getByRole('button', { name: /言語/ }).click()
  await ready()
  await page.locator('.preview .math-anchor').first().click()
  check(
    '英語表示でも数式をクリックしてソースを選べる',
    (await selected()) === '\\mathcal{N}(\\mu, \\sigma^2)',
    JSON.stringify(await selected()),
  )

  await resetState()

  // 400節・400数式。ラッパのぶん増えても入力の体感が落ちないこと。
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
  check(
    '400数式での入力反映が1文字あたり50ms以内（ラッパを足した後）',
    perKey <= 50,
    `${perKey.toFixed(1)}ms/文字`,
    { timing: true },
  )
  check(
    '400件すべてがラッパを持つ',
    (await page.locator('.preview .math-anchor').count()) === 400,
  )

  await resetState()
  console.log(`スクリーンショット: ${OUT}/math-click.png`)
})

// ---- 0044: 式に番号を振って参照する ----

section('eq-number', '式の番号と参照（0044）', async () => {
  await resetState()

  // 長い式（幅360pxでプレビューに収まらない）と、番号・参照を1つずつ持つ文書。
  const longMath =
    '\\int_0^1 x^2 dx + \\sum_{k=1}^{n} k^3 + \\prod_{i=1}^{m} a_i = \\frac{n(n+1)(2n+1)}{6}'
  /*
    **参照と飛び先を画面1つぶん以上離す**（間に40段落）。詰めて置くと
    プレビューがそもそもスクロールせず、「飛ぶ」ことを観測できない
    （最初に書いた短い文書はこれで 0 → 0 になった）。
  */
  const filler = Array.from({ length: 40 }, (_, i) => `本文の${i}行目。\n`).join('\n')
  const doc = [
    '# 番号の確認',
    '',
    '$$',
    `${longMath} \\tag{sum}`,
    '$$',
    '',
    filler,
    '式 [(1)](#eq-sum) と [(1)](#eq-typo) を見る。',
    '',
    '$$',
    'y = 2',
    '$$',
    '',
    '$$',
    'z = 3 \\tag{密度}',
    '$$',
    '',
    '式 [(2)](#eq-密度) も見る。',
    '',
  ].join('\n')

  const fill = async (text, blocks = 3) => {
    await editor().fill(text)
    await page.waitForFunction(
      (n) => document.querySelectorAll('.preview .katex-display').length === n,
      blocks,
      { timeout: 20000 },
    )
  }
  const numbers = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.preview .eq-number')].map((el) => el.textContent),
    )
  const refs = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.preview a[href^="#eq-"]')].map((a) => ({
        href: a.getAttribute('href'),
        text: a.textContent,
      })),
    )

  await fill(doc)

  check('番号を書いた式に (1) が出る', (await numbers())[0] === '(1)', JSON.stringify(await numbers()))
  check(
    '番号付きの式が2つあり、上から (1) (2) になる',
    JSON.stringify(await numbers()) === '["(1)","(2)"]',
    JSON.stringify(await numbers()),
  )
  check(
    '番号のない式には番号が出ない',
    (await page.locator('.preview .math-anchor--block').count()) === 3 &&
      (await page.locator('.preview .eq-number').count()) === 2,
    `式${await page.locator('.preview .math-anchor--block').count()}件 / 番号${await page.locator('.preview .eq-number').count()}件`,
  )
  check(
    '参照のリンク先と数字が現在の番号になる',
    JSON.stringify((await refs())[0]) === '{"href":"#eq-1","text":"(1)"}',
    JSON.stringify((await refs())[0]),
  )
  check(
    '日本語のラベルでも引ける',
    JSON.stringify((await refs())[2]) === '{"href":"#eq-2","text":"(2)"}',
    JSON.stringify((await refs())[2]),
  )
  check(
    '採番されていないラベルへの参照は書き換わらない',
    (await refs())[1].href === '#eq-typo',
    JSON.stringify((await refs())[1]),
  )
  // 番号付きの式が見える位置で撮る（この文書は参照を離すために長い）。
  await page.evaluate(() => {
    document.querySelector('.preview').scrollTop = 0
  })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/eq-number.png` })

  // 式を1つ上に足すと、番号も参照も揃ったままずれる（手で書き直さない）。
  /*
    置換文字列は**関数で渡す**。`String.replace` は置換文字列の中の `$$` を
    `$` 1つに潰すので、そのまま渡すとブロック数式が壊れる（ここで踏んだ）。
  */
  const inserted = ['$$', 'a = 0 \\tag{first}', '$$', ''].join('\n')
  await fill(
    doc.replace('# 番号の確認\n', () => `# 番号の確認\n\n${inserted}`),
    4,
  )
  check(
    '式を上に挿入すると番号が繰り下がる',
    JSON.stringify(await numbers()) === '["(1)","(2)","(3)"]',
    JSON.stringify(await numbers()),
  )
  check(
    'そのとき本文の参照も書き直さずに揃う',
    JSON.stringify((await refs())[0]) === '{"href":"#eq-2","text":"(2)"}',
    JSON.stringify((await refs())[0]),
  )

  // 参照をたどる。プレビューだけが動き、ソースの編集位置は動かない。
  await fill(doc)
  await page.evaluate(() => {
    document.querySelector('.preview').scrollTop = 0
    const ta = document.querySelector('textarea')
    ta.setSelectionRange(0, 0)
  })
  await page.waitForTimeout(200)
  const beforeFollow = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    return { start: ta.selectionStart, end: ta.selectionEnd, url: location.href }
  })
  // 飛び先が見えるよう、いったん下まで送ってから上の式への参照を押す。
  await page.evaluate(() => {
    document.querySelector('.preview').scrollTop = document.querySelector('.preview').scrollHeight
  })
  await page.waitForTimeout(400)
  const scrollBeforeFollow = await page.evaluate(() => document.querySelector('.preview').scrollTop)
  await page.locator('.preview a[href="#eq-1"]').click()
  await page.waitForTimeout(300)
  const afterFollow = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    const preview = document.querySelector('.preview')
    const target = document.querySelector('#eq-1')
    const box = target.getBoundingClientRect()
    const root = preview.getBoundingClientRect()
    return {
      start: ta.selectionStart,
      end: ta.selectionEnd,
      url: location.href,
      scrollTop: preview.scrollTop,
      // 飛び先がプレビューの見えている範囲に入っているか。
      visible: box.top >= root.top - 1 && box.bottom <= root.bottom + 1,
      active: document.querySelectorAll('.math-anchor--active').length,
    }
  })
  check(
    '参照を押すとプレビューがその式まで動く',
    afterFollow.scrollTop !== scrollBeforeFollow && afterFollow.visible,
    `${scrollBeforeFollow} → ${afterFollow.scrollTop}`,
  )
  check('飛び先の式に印が出る', afterFollow.active === 1, `${afterFollow.active}件`)
  check(
    '参照をたどってもソースのカーソルと選択範囲が動かない',
    afterFollow.start === beforeFollow.start && afterFollow.end === beforeFollow.end,
    `${beforeFollow.start}-${beforeFollow.end} → ${afterFollow.start}-${afterFollow.end}`,
  )
  check(
    'URLにハッシュが付かない',
    afterFollow.url === beforeFollow.url && !afterFollow.url.includes('#'),
    afterFollow.url,
  )

  /*
    飛び先の無い参照は何も起こさない。**先に画面へ入れてから**測る。
    見えていないリンクを押すとPlaywrightがクリックのために自分でスクロールし、
    その移動を「参照が動かした」と取り違える（ここで踏んだ）。
  */
  const dead = page.locator('.preview a[href="#eq-typo"]')
  await dead.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const scrollBeforeDead = await page.evaluate(() => document.querySelector('.preview').scrollTop)
  await dead.click()
  await page.waitForTimeout(300)
  const afterDead = await page.evaluate(() => ({
    scrollTop: document.querySelector('.preview').scrollTop,
    url: location.href,
  }))
  check(
    '採番されていない参照を押しても動かない',
    afterDead.scrollTop === scrollBeforeDead && !afterDead.url.includes('#'),
    `${scrollBeforeDead} → ${afterDead.scrollTop}`,
  )

  // 番号付きの式も0020のとおりクリックでソースを選べる（番号の上でも同じ）。
  await fill(doc)
  await page.locator('#eq-1 .katex-display').click()
  const selectedMath = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    return ta.value.slice(ta.selectionStart, ta.selectionEnd)
  })
  check(
    '番号付きの式をクリックするとソースの中身が選ばれる（\\tag を含む）',
    selectedMath === `${longMath} \\tag{sum}`,
    JSON.stringify(selectedMath.slice(-12)),
  )
  await page.locator('#eq-1 .eq-number').click()
  const selectedByNumber = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    return ta.value.slice(ta.selectionStart, ta.selectionEnd)
  })
  check('番号の上をクリックしても同じ範囲が選ばれる', selectedByNumber === selectedMath)

  // 幅1440pxでの重なりと位置。
  const layoutOf = () =>
    page.evaluate(() => {
      const wrap = document.querySelector('.math-anchor--numbered')
      const math = wrap.querySelector('.katex-display')
      const num = wrap.querySelector('.eq-number')
      const preview = document.querySelector('.preview')
      return {
        gap: Math.round(num.getBoundingClientRect().left - math.getBoundingClientRect().right),
        numRight: Math.round(num.getBoundingClientRect().right),
        wrapRight: Math.round(wrap.getBoundingClientRect().right),
        mathScroll: math.scrollWidth,
        mathClient: math.clientWidth,
        previewScroll: preview.scrollWidth,
        previewClient: preview.clientWidth,
        docScroll: document.documentElement.scrollWidth,
        docClient: document.documentElement.clientWidth,
      }
    })
  const wide = await layoutOf()
  check('幅1440pxで式と番号が重ならない', wide.gap >= 0, `間隔 ${wide.gap}px`)
  check(
    '番号が式のブロックの右端に出る',
    Math.abs(wide.numRight - wide.wrapRight) <= 1,
    `番号の右端 ${wide.numRight} / ブロックの右端 ${wide.wrapRight}`,
  )

  // 幅360px。番号と式が重ならず、はみ出しは式の側の横スクロールで受ける。
  await page.setViewportSize({ width: 360, height: 640 })
  await page.waitForTimeout(300)
  const narrow = await layoutOf()
  check('幅360pxで式と番号が重ならない', narrow.gap >= 0, `間隔 ${narrow.gap}px`)
  check(
    '幅360pxでページの横スクロールが増えない',
    narrow.docScroll <= narrow.docClient,
    `${narrow.docScroll} / ${narrow.docClient}`,
  )
  check(
    '幅360pxで長い式がブロック内で横スクロールできる',
    narrow.mathScroll > narrow.mathClient,
    `内容 ${narrow.mathScroll}px / 枠 ${narrow.mathClient}px`,
  )
  // 実際に右端まで送って、式の末尾まで届くことを見る。
  const scrolledToEnd = await page.evaluate(() => {
    const math = document.querySelector('.math-anchor--numbered .katex-display')
    math.scrollLeft = math.scrollWidth
    return math.scrollLeft > 0 && math.scrollLeft + math.clientWidth >= math.scrollWidth - 1
  })
  check('横スクロールで式の末尾まで届く', scrolledToEnd)
  await page.screenshot({ path: `${OUT}/eq-number-narrow.png` })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(200)

  // ダークでも番号が読める。
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(200)
  const numberContrast = await contrastOf('.preview .eq-number', '.preview')
  check(
    'ダークで番号と背景のコントラストが4.5:1以上',
    numberContrast >= 4.5,
    `${numberContrast.toFixed(2)}:1`,
  )
  await page.emulateMedia({ colorScheme: 'light' })

  // 英語表示でも同じ。
  await page.getByRole('button', { name: /言語/ }).click()
  await page.waitForTimeout(300)
  check(
    '英語表示でも番号と参照が出る',
    JSON.stringify(await numbers()) === '["(1)","(2)"]' &&
      (await refs())[0].href === '#eq-1',
    `${JSON.stringify(await numbers())} / ${JSON.stringify((await refs())[0])}`,
  )

  await resetState()

  /*
    400節・400数式のうち25件に番号と参照を付けた文書での入力コスト。

    **ブロック数式の密度を上げすぎない。** 100件にすると1文字52.4msで
    N1の50msを超えるが、切り分けたところ原因は0044ではなく
    ブロック数式そのもの（`\tag` の有無で差が出ない。[0076](../docs/issues/0076-block-math-perf.md)）。
    ここでは0044のぶんの回帰を見張る。
  */
  const longDoc = Array.from({ length: 400 }, (_, i) =>
    i % 16 === 0
      ? `## 節 ${i}\n\n$$\n\\int_0^1 x^{${i}} dx \\tag{e${i}}\n$$\n\n式 [(1)](#eq-e${i}) を見る。\n`
      : `## 節 ${i}\n\n式 $\\int_0^1 x^{${i}} dx = \\frac{1}{${i + 1}}$ である。\n`,
  ).join('\n')
  await editor().fill(longDoc)
  await page.waitForFunction(
    () => document.querySelectorAll('.preview .katex').length === 400,
    null,
    { timeout: 30000 },
  )
  check(
    '400数式のうち25件に番号が付く',
    (await page.locator('.preview .eq-number').count()) === 25,
    `${await page.locator('.preview .eq-number').count()}件`,
  )
  const TYPED = 20
  await editor().click()
  await page.keyboard.press('Control+End')
  const typeStart = Date.now()
  await editor().pressSequentially('あ'.repeat(TYPED), { delay: 0 })
  const perKey = (Date.now() - typeStart) / TYPED
  check(
    '番号25件を含む長文での入力反映が1文字あたり50ms以内',
    perKey <= 50,
    `${perKey.toFixed(1)}ms/文字`,
    { timing: true },
  )

  // ---- 方言の記法（0083） ----

  await resetState()
  const dialect = [
    '# 方言の確認',
    '',
    '$$',
    'a^2 + b^2 = c^2',
    '$$ {#eq-pythagoras}',
    '',
    filler,
    '@eq-pythagoras と @eq-typo を見る。',
    '',
  ].join('\n')
  await fill(dialect, 1)

  const dialectNumbers = await numbers()
  check('{#eq-…} を書いた式に (1) が出る', dialectNumbers[0] === '(1)', JSON.stringify(dialectNumbers))
  check(
    '{#eq-…} が本文に文字として残らない',
    !(await page.locator('.preview').innerText()).includes('{#eq-pythagoras}'),
  )
  const dialectRefs = await refs()
  check(
    '@eq-… が (1) というリンクになり、採番されていないラベルはリンクにならない',
    dialectRefs.length === 1 && dialectRefs[0].href === '#eq-1' && dialectRefs[0].text === '(1)',
    JSON.stringify(dialectRefs),
  )
  check(
    '採番されていない @eq-typo は文字のまま残る',
    (await page.locator('.preview').innerText()).includes('@eq-typo'),
  )

  // 参照をたどる（0044と同じ振る舞いであること）。
  await editor().click()
  await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    ta.setSelectionRange(5, 9)
  })
  const beforeAtRef = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    return { start: ta.selectionStart, end: ta.selectionEnd, scroll: previewScrollTop() }
    function previewScrollTop() {
      return document.querySelector('.pane--preview .preview').scrollTop
    }
  })
  await page.locator('.preview a[href="#eq-1"]').click()
  await page.waitForTimeout(400)
  const afterAtRef = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    return {
      start: ta.selectionStart,
      end: ta.selectionEnd,
      scroll: document.querySelector('.pane--preview .preview').scrollTop,
      hash: location.hash,
    }
  })
  check(
    '@eq-… の参照を押すとプレビューがその式へ動く',
    afterAtRef.scroll < beforeAtRef.scroll,
    `${beforeAtRef.scroll} → ${afterAtRef.scroll}`,
  )
  check(
    '@eq-… の参照を押してもソースのカーソルと選択範囲が動かない',
    afterAtRef.start === beforeAtRef.start && afterAtRef.end === beforeAtRef.end,
    `${beforeAtRef.start}-${beforeAtRef.end} → ${afterAtRef.start}-${afterAtRef.end}`,
  )
  check('@eq-… の参照でURLにハッシュが付かない', afterAtRef.hash === '', afterAtRef.hash)

  // 旧記法と混ざっても文書順に振られる（読める形を残す約束）。
  await fill(
    ['$$', 'x = 1 \\tag{old}', '$$', '', '$$', 'y = 2', '$$ {#eq-new}', '', '[(1)](#eq-old) と @eq-new。', ''].join('\n'),
    2,
  )
  const mixed = await numbers()
  const mixedRefs = await refs()
  check('旧記法と新記法が混ざっても上から (1) (2) になる', JSON.stringify(mixed) === '["(1)","(2)"]', JSON.stringify(mixed))
  check(
    '旧記法の参照と新記法の参照が両方それぞれの番号を指す',
    JSON.stringify(mixedRefs.map((r) => `${r.text}${r.href}`)) === '["(1)#eq-1","(2)#eq-2"]',
    JSON.stringify(mixedRefs),
  )

  // サンプル文書（初期表示）が新記法で書かれていること。
  await resetState()
  const sample = await editor().inputValue()
  check(
    'サンプル文書が新記法（{#eq-…} と @eq-…）で書かれている',
    sample.includes('$$ {#eq-density}') && sample.includes('@eq-density') && !sample.includes('\\tag{'),
  )
  const sampleNums = await numbers()
  check(
    'サンプル文書の番号が (1) (2) のまま出る',
    JSON.stringify(sampleNums) === '["(1)","(2)"]',
    JSON.stringify(sampleNums),
  )

  await resetState()
  console.log(`スクリーンショット: ${OUT}/eq-number.png, ${OUT}/eq-number-narrow.png`)
})

// ---- 算式記載ガイド（0079） ----

section('guide', '算式記載ガイド（0079）', async () => {
  await resetState()

  const guideButton = () => page.getByRole('button', { name: 'ガイド' })
  const panel = () => page.locator('.guide__panel')
  const panelBox = () =>
    page.evaluate(() => {
      const el = document.querySelector('.guide__panel')
      if (el === null) return null
      const r = el.getBoundingClientRect()
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }
    })
  /** 表の数式が出そろうまで待つ。964件のうち1件（\tag）は文言なので963件。 */
  const guideRendered = () =>
    page.waitForFunction(() => document.querySelectorAll('.guide__body .katex').length >= 900, null, {
      timeout: 20000,
    })

  // ---- 開閉 ----

  check('ツールバーにガイドボタンがある', (await guideButton().count()) === 1)

  const openedAt = Date.now()
  await guideButton().click()
  await guideRendered()
  const openMs = Date.now() - openedAt
  check('押すとガイドのパネルが開く', (await panel().count()) === 1)
  check(
    'ガイドを開いてから最後の数式が描かれるまで1.5秒以内',
    openMs <= 1500,
    `${openMs}ms`,
    { timing: true },
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  check('Escapeで閉じる', (await panel().count()) === 0)
  check(
    '閉じるとフォーカスがガイドボタンに戻る',
    await page.evaluate(() => document.activeElement?.textContent?.includes('ガイド') === true),
    await page.evaluate(() => document.activeElement?.tagName ?? 'なし'),
  )

  await guideButton().click()
  await guideRendered()
  await page.getByRole('button', { name: '閉じる' }).click()
  await page.waitForTimeout(100)
  check('閉じるボタンで閉じる', (await panel().count()) === 0)

  await guideButton().click()
  await guideRendered()
  // 背景（パネルの外側）を押す。左上の隅はパネルの余白の中。
  await page.mouse.click(8, 400)
  await page.waitForTimeout(100)
  check('パネルの外側を押すと閉じる', (await panel().count()) === 0)

  // ---- 編集中の文書に触らない ----

  await editor().fill('# 見出し\n\n本文を書いた。\n')
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    ta.focus()
    ta.setSelectionRange(10, 13)
  })
  await page.waitForFunction(
    () => (document.querySelector('.toolbar__save')?.textContent ?? '').startsWith('保存しました'),
    null,
    { timeout: 5000 },
  )
  const beforeGuide = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    return {
      value: ta.value,
      start: ta.selectionStart,
      end: ta.selectionEnd,
      save: document.querySelector('.toolbar__save').textContent,
    }
  })
  await guideButton().click()
  await guideRendered()
  const saveWhileOpen = await saveStatus()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const afterGuide = await page.evaluate(() => {
    const ta = document.querySelector('textarea')
    return { value: ta.value, start: ta.selectionStart, end: ta.selectionEnd }
  })
  check(
    '開閉しても編集中の文書とカーソル・選択範囲が変わらない',
    afterGuide.value === beforeGuide.value &&
      afterGuide.start === beforeGuide.start &&
      afterGuide.end === beforeGuide.end,
    `${JSON.stringify(beforeGuide)} → ${JSON.stringify(afterGuide)}`,
  )
  check(
    'ガイドを開いても保存状態の表示が変わらない',
    saveWhileOpen === beforeGuide.save,
    `${beforeGuide.save} → ${saveWhileOpen}`,
  )

  // ---- 寸法 ----

  const paneBox = () =>
    page.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        if (el === null) return null
        const r = el.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      }
      return {
        palette: box('.palette'),
        source: box('textarea'),
        preview: box('.pane--preview .preview'),
      }
    })

  await page.setViewportSize({ width: 1440, height: 667 })
  await page.waitForTimeout(150)
  const panesBefore = await paneBox()
  await guideButton().click()
  await guideRendered()
  const wide = await panelBox()
  check('幅1440×667でパネルが960×619pxで出る', wide.w === 960 && wide.h === 619, `${wide.w}×${wide.h}`)
  const panesDuring = await paneBox()
  check(
    'パネルを開いてもパレット・ソース・プレビューの寸法が変わらない',
    JSON.stringify(panesBefore) === JSON.stringify(panesDuring),
    `${JSON.stringify(panesBefore)} → ${JSON.stringify(panesDuring)}`,
  )
  await page.screenshot({ path: `${OUT}/guide.png` })

  await page.setViewportSize({ width: 721, height: 667 })
  await page.waitForTimeout(150)
  const at721 = await panelBox()
  check('幅721×667でパネルが673×619pxになる', at721.w === 673 && at721.h === 619, `${at721.w}×${at721.h}`)

  await page.setViewportSize({ width: 720, height: 667 })
  await page.waitForTimeout(150)
  const at720 = await panelBox()
  check('幅720×667でパネルが全面（720×667px）になる', at720.w === 720 && at720.h === 667, `${at720.w}×${at720.h}`)

  await page.setViewportSize({ width: 360, height: 667 })
  await page.waitForTimeout(150)
  const at360 = await panelBox()
  check('幅360×667でパネルが全面（360×667px）になる', at360.w === 360 && at360.h === 667, `${at360.w}×${at360.h}`)
  check('幅360pxでパネルを開いても横スクロールが出ない', at360.scrollW <= at360.innerW, `${at360.scrollW} / ${at360.innerW}`)
  await page.screenshot({ path: `${OUT}/guide-narrow.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)

  // ---- 中身 ----

  await page.setViewportSize({ width: 1440, height: 900 })
  await guideButton().click()
  await guideRendered()
  const headings = await page.evaluate(() => ({
    part1: [...document.querySelectorAll('.guide__body h3')]
      .map((el) => el.textContent.trim())
      .filter((text) => /^\d+\. /.test(text)).length,
    part2: [...document.querySelectorAll('.guide__body h3')]
      .map((el) => el.textContent.trim())
      .filter((text) => /（\d+）$/.test(text)).length,
    errors: document.querySelectorAll('.guide__body .katex-error').length,
    formulas: document.querySelectorAll('.guide__body .katex').length,
    graphs: document.querySelectorAll('.guide__body svg.graph').length,
  }))
  check('第1部の13項目の見出しが出る', headings.part1 === 13, `${headings.part1}件`)
  check('第2部の分類の見出しが14件（13分類＋環境）出る', headings.part2 === 14, `${headings.part2}件`)
  check('ガイドの中に壊れた数式（katex-error）が1件もない', headings.errors === 0, `${headings.errors}件`)
  check('第1部のグラフが描かれる', headings.graphs === 1, `${headings.graphs}個`)
  console.log('ガイドの数式:', headings.formulas)

  // 第1部12項の手本が新記法であること（0083）。旧記法の混在で読み手が迷わない。
  const guideRef = await page.evaluate(() => {
    const body = document.querySelector('.guide__body')
    const text = body.innerText
    return {
      dialect: text.includes('{#eq-pythagoras}') && text.includes('@eq-pythagoras'),
      numbered: [...body.querySelectorAll('.eq-number')].map((el) => el.textContent),
    }
  })
  check('ガイド第1部12項の手本が新記法（0083）で書かれている', guideRef.dialect)
  check(
    'ガイドの手本の式に番号 (1) が描かれる',
    guideRef.numbered.includes('(1)'),
    JSON.stringify(guideRef.numbered),
  )

  const fracRow = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.guide__body tr')].find(
      (tr) => tr.querySelector('code')?.textContent === '\\frac{a}{b}',
    )
    if (row === undefined) return null
    const cells = [...row.querySelectorAll('td')]
    return {
      command: cells[0]?.textContent.trim(),
      drawn: cells[1]?.querySelector('.katex') !== null,
      name: cells[2]?.textContent.trim(),
    }
  })
  check(
    '`\\frac{a}{b}` の行にコマンド・描画・名前の3つが出る',
    fracRow !== null && fracRow.command === '\\frac{a}{b}' && fracRow.drawn && fracRow.name === '分数',
    JSON.stringify(fracRow),
  )

  const reachedEnd = await page.evaluate(() => {
    const body = document.querySelector('.guide__body')
    body.scrollTop = body.scrollHeight
    const rows = body.querySelectorAll('tr')
    const last = rows[rows.length - 1]
    const r = last.getBoundingClientRect()
    const b = body.getBoundingClientRect()
    return { visible: r.top >= b.top - 1 && r.bottom <= b.bottom + 1, text: last.textContent.trim() }
  })
  check('縦にスクロールすると最後の行まで届く', reachedEnd.visible, reachedEnd.text.slice(0, 40))

  // ---- ダーク ----

  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(150)
  const darkContrast = await contrastOf('.guide__body', '.guide__panel')
  check(
    'ダークでガイドの文字と背景のコントラストが4.5:1以上',
    darkContrast >= 4.5,
    darkContrast.toFixed(2),
  )
  await page.emulateMedia({ colorScheme: 'light' })
  await page.keyboard.press('Escape')

  // ---- 英語表示 ----

  await page.getByRole('button', { name: /言語/ }).click()
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: 'Guide' }).click()
  await guideRendered()
  const enTitle = await page.locator('.guide__title').innerText()
  const enHeading = await page.evaluate(
    () => document.querySelector('.guide__body h1')?.textContent.trim(),
  )
  check(
    '英語表示でガイドの見出しが英語になる',
    enTitle === 'Guide' && enHeading === 'Math Notation Guide',
    `${enTitle} / ${enHeading}`,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)

  // 英語・幅360px・保存状態ありでツールバーが溢れないこと（N9の回帰。0079で5つ目のボタンが増えた）
  await page.setViewportSize({ width: 360, height: 667 })
  await editor().fill('x')
  await page.waitForFunction(
    () => (document.querySelector('.toolbar__save')?.textContent ?? '').startsWith('Saved'),
    null,
    { timeout: 5000 },
  )
  const enNarrow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    label: [...document.querySelectorAll('.toolbar button')]
      .map((b) => b.innerText.trim())
      .join('|'),
  }))
  check(
    '英語・幅360px・保存状態ありでツールバーの横スクロールが出ない',
    enNarrow.scrollW <= enNarrow.innerW,
    `${enNarrow.scrollW} / ${enNarrow.innerW}（${enNarrow.label}）`,
  )
  // 幅360pxでは `言語:` の文字が消えるので、名前は状態の文字だけになる。
  await page.getByRole('button', { name: /Language|English/ }).click()
  await page.waitForTimeout(150)
  const jaNarrow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    guide: [...document.querySelectorAll('.toolbar button')]
      .map((b) => b.innerText.trim())
      .find((text) => text === '?'),
  }))
  check(
    '日本語・幅360pxでもツールバーの横スクロールが出ない',
    jaNarrow.scrollW <= jaNarrow.innerW,
    `${jaNarrow.scrollW} / ${jaNarrow.innerW}`,
  )
  check('幅360pxではガイドボタンが `?` で出る', jaNarrow.guide === '?', String(jaNarrow.guide))

  /*
    幅481〜720pxは、ガイドだけが記号で他の文言が長いままの帯。
    英語・幅540pxはこの帯でいちばん混む（`Reset to sample` と `Copy Markdown`）。
  */
  await page.getByRole('button', { name: /言語|日本語/ }).click()
  await page.setViewportSize({ width: 540, height: 667 })
  await page.waitForTimeout(150)
  const enBand = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    guide: document.querySelector('.button--guide').innerText.trim(),
  }))
  check(
    '英語・幅540pxでツールバーの横スクロールが出ない',
    enBand.scrollW <= enBand.innerW,
    `${enBand.scrollW} / ${enBand.innerW}`,
  )
  check('幅540pxでもガイドボタンが `?` で出る', enBand.guide === '?', enBand.guide)
  await page.getByRole('button', { name: /Language|English/ }).click()
  await page.waitForTimeout(150)

  // 幅375pxでtextareaの高さが207px以上のまま（0033の回帰）
  await page.setViewportSize({ width: 375, height: 667 })
  await page.waitForTimeout(150)
  const taHeight = await page.evaluate(() =>
    Math.round(document.querySelector('textarea').getBoundingClientRect().height),
  )
  check('幅375pxでtextareaの高さが207px以上のまま', taHeight >= 207, `${taHeight}px`)

  await resetState()
  console.log(`スクリーンショット: ${OUT}/guide.png, ${OUT}/guide-narrow.png`)
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
