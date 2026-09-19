/**
 * UI変更の実機検証。devcontainer内で動かす。
 *
 *   npm run dev            # 別ターミナルで
 *   node scripts/verify-ui.mjs
 *
 * executablePath を指定していないのは、PLAYWRIGHT_BROWSERS_PATH から
 * playwright-core が自力でChromiumを見つけるため。ホスト固有のパスを
 * スクリプトに書かないことが devcontainer 化の目的のひとつ。
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const URL = process.env.VERIFY_URL ?? 'http://localhost:5173'
const OUT = process.env.VERIFY_OUT ?? 'tmp/screenshots'
const STORAGE_KEY = 'matheditor:document:v1'

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const results = []
const check = (label, ok, detail = '') => {
  results.push({ label, ok })
  console.log(`${ok ? 'OK  ' : 'NG  '} ${label}${detail ? ` — ${detail}` : ''}`)
}

const saveStatus = () => page.locator('.toolbar__save').innerText()
const editor = () => page.locator('.editor')
const ready = async () => {
  await page.waitForSelector('.preview .katex')
}

// ---- 初期表示（0001以前からの確認） ----

await page.goto(URL, { waitUntil: 'networkidle' })
await ready()

console.log('見出し:', await page.locator('.preview h1').innerText())
console.log('ブロック数式:', await page.locator('.preview .katex-display').count())
console.log('数式の総数:', await page.locator('.preview .katex').count())

await page.screenshot({ path: `${OUT}/initial.png` })
console.log(`スクリーンショット: ${OUT}/initial.png`)

// ---- 0001: 編集内容の自動保存 ----

// 初回訪問（localStorageが空）ではサンプル文書が出て、保存状態は空。
await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
await page.reload({ waitUntil: 'networkidle' })
await ready()
const firstVisit = await editor().inputValue()
check('初回訪問でサンプル文書が表示される', firstVisit.startsWith('# 二次方程式の解の公式'))
check('初回訪問では保存状態を出さない', (await saveStatus()) === '')

// 入力直後は「保存中…」、待つと「保存しました HH:MM」。
const typed = '\n\n自動保存の検証 $E = mc^2$\n'
await editor().click()
await page.keyboard.press('Control+End')
await editor().pressSequentially(typed, { delay: 8 })
check('入力直後は保存中と出る', (await saveStatus()) === '保存中…', await saveStatus())

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
check('即リロード前は未保存（保存中）', (await saveStatus()) === '保存中…', await saveStatus())
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

// ---- 0006: コードブロック内の $ を数式にしない ----

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

// 保存できない環境（容量超過やサイトデータ無効）では、その旨を出し続ける。
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

// 狭い画面でもツールバーのボタンが押し出されない。
await page.setViewportSize({ width: 600, height: 900 })
const toolbarWidth = await page.locator('.toolbar').evaluate((el) => el.clientWidth)
const copyRight = await page
  .getByRole('button', { name: 'Markdownをコピー' })
  .evaluate((el) => el.getBoundingClientRect().right)
check('狭い画面でもコピーボタンが画面内に収まる', copyRight <= toolbarWidth, `right=${Math.round(copyRight)} width=${toolbarWidth}`)
await page.screenshot({ path: `${OUT}/narrow.png` })
await page.setViewportSize({ width: 1440, height: 900 })

// ---- 0007: 長い文書でのプレビュー性能 ----

// 直前の検証で localStorage.setItem を壊しているので、実際の保存込みで測るために
// ページを読み直す。自動保存のコストも入力の体感に効くため。
await page.reload({ waitUntil: 'networkidle' })
await ready()

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
check(`長文での入力反映が1文字あたり50ms以内`, perKey <= 50, `${perKey.toFixed(1)}ms/文字`)

check('追いついていない間は更新中と出る', (await page.locator('.pane__note').count()) === 1)

const catchUpStart = Date.now()
await page.waitForFunction(() => document.querySelector('.pane__note') === null, null, {
  timeout: 10000,
})
const catchUp = Date.now() - catchUpStart
check('入力を止めてから1.5秒以内にプレビューが追いつく', catchUp <= 1500, `${catchUp}ms`)
check(
  '長文の数式が最後まで描画されている',
  (await page.locator('.preview .katex').count()) === 400,
)
await page.screenshot({ path: `${OUT}/long-document.png` })

// 短い文書では更新中が目に見えて残らない。
await editor().fill('短い文書 $x^2$')
await page.waitForTimeout(300)
check('短い文書では更新中が残らない', (await page.locator('.pane__note').count()) === 0)

// ---- まとめ ----

console.log('コンソールエラー:', errors.length ? errors : 'なし')

const failed = results.filter((r) => !r.ok)
console.log(`受け入れ基準: ${results.length - failed.length}/${results.length} 件 OK`)

await browser.close()
if (errors.length > 0 || failed.length > 0) process.exit(1)
