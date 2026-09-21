/**
 * READMEに貼るスクリーンショットを撮り直す（0035）。
 *
 *   npm run dev                          # 別ターミナルで
 *   node scripts/make-screenshots.mjs
 *
 * 手で撮らないのは、画面を変えたあとに条件（文書・テーマ・画面幅・描画の待ち）を
 * 揃え直せないため。生成物を作り直す道具なので scripts/make-icons.mjs の隣に置く。
 *
 * executablePath を書かないのは verify-ui.mjs と同じ理由
 * （PLAYWRIGHT_BROWSERS_PATH から playwright-core が自力で見つける）。
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const URL = process.env.VERIFY_URL ?? 'http://localhost:5173'
const OUT = 'docs/screenshots'

/** 撮る条件。README側の説明と1対1で対応させる。 */
const shots = [
  { name: 'wide-light.png', width: 1440, height: 900, scheme: 'light' },
  { name: 'wide-dark.png', width: 1440, height: 900, scheme: 'dark' },
  { name: 'phone.png', width: 360, height: 667, scheme: 'light' },
]

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext()
// 画面の文言は日本語で撮る（リポジトリの文書が日本語なので揃える）。
await context.addInitScript(() =>
  window.localStorage.setItem('thothglyph:lang:v1', JSON.stringify({ version: 1, lang: 'ja' })),
)
const page = await context.newPage()

for (const shot of shots) {
  await page.emulateMedia({ colorScheme: shot.scheme })
  await page.setViewportSize({ width: shot.width, height: shot.height })
  // 前に撮ったときの文書が残っていると条件が変わる。毎回サンプル文書から撮る。
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.localStorage.removeItem('thothglyph:document:v1'))
  await page.reload({ waitUntil: 'networkidle' })
  // 数式が描けてから撮る（KaTeXは別チャンクなので、待たないと素のソースが写る）。
  await page.waitForSelector('.preview .katex')
  // パレットのラベルもKaTeXで描かれるまで待つ。
  await page.waitForFunction(() => document.querySelectorAll('.palette .katex').length > 0)
  await page.screenshot({ path: `${OUT}/${shot.name}` })
  console.log(`${OUT}/${shot.name}  ${shot.width}×${shot.height}  ${shot.scheme}`)
}

await browser.close()
