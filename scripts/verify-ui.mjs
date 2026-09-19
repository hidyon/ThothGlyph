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

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.preview .katex')

console.log('見出し:', await page.locator('.preview h1').innerText())
console.log('ブロック数式:', await page.locator('.preview .katex-display').count())
console.log('数式の総数:', await page.locator('.preview .katex').count())

await page.screenshot({ path: `${OUT}/initial.png` })
console.log(`スクリーンショット: ${OUT}/initial.png`)

console.log('コンソールエラー:', errors.length ? errors : 'なし')

await browser.close()
if (errors.length > 0) process.exit(1)
