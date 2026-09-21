/**
 * file:// で開ける出力（`npm run build:file`）の検証（0074）。devcontainer内で動かす。
 *
 *   node scripts/verify-file-build.mjs          # ビルドしてから確かめる
 *   node scripts/verify-file-build.mjs --skip-build   # できている dist-file を確かめる
 *
 * `verify-ui.mjs` は開発サーバ（http://localhost:5173）に向いているので分けてある。
 * ここで見るのは「**file:// で成り立つか**」だけで、画面の振る舞いは重複させない。
 *
 * 落ちたチェックは末尾にまとめて再掲し、結果を tmp/verify-file.json にも書く。
 */
import { execFile } from 'node:child_process'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const execFileAsync = promisify(execFile)

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = resolve(ROOT, 'dist-file')
const PAGE = `file://${OUT_DIR}/index.html`
const JSON_OUT = resolve(ROOT, 'tmp/verify-file.json')
/** 保存を共有することを確かめるための、別の置き場所。 */
const MOVED_DIR = resolve(ROOT, 'tmp/dist-file-moved')

const results = []
const check = (label, ok, detail = '') => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'OK  ' : 'NG  '} ${label}${detail ? ` — ${detail}` : ''}`)
}

// ---- ビルド ----

if (!process.argv.includes('--skip-build')) {
  console.log('npm run build:file …')
  try {
    await execFileAsync('npm', ['run', 'build:file'], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 })
    check('npm run build:file が通る', true)
  } catch (error) {
    check('npm run build:file が通る', false, String(error.message).split('\n')[0])
  }
}

// ---- 出力の形 ----

const html = await readTextOrNull(`${OUT_DIR}/index.html`)
const hasApp = (await readTextOrNull(`${OUT_DIR}/app.js`)) !== null
check('dist-file に index.html と app.js ができている', html !== null && hasApp)

// file:// で動く条件。type="module" と crossorigin が無く、defer が付いていること。
const scriptTag = html === null ? '' : (html.match(/<script[^>]*src="[^"]*app\.js"[^>]*>/) ?? [''])[0]
check(
  'script タグに type="module" と crossorigin が無く、defer が付いている',
  scriptTag.includes('defer') && !scriptTag.includes('type="module"') && !scriptTag.includes('crossorigin'),
  scriptTag,
)

// ---- file:// で開く ----

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

const consoleErrors = []
const failedRequests = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 120))
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 120)}`))
page.on('requestfailed', (request) =>
  failedRequests.push(`${request.url().split('/').at(-1)} (${request.failure()?.errorText})`),
)

const startedAt = Date.now()
await page.goto(PAGE, { waitUntil: 'commit' }).catch(() => {})
await page.waitForSelector('.editor', { timeout: 20000 }).catch(() => {})
const editorAt = Date.now() - startedAt
await page
  .waitForFunction(() => document.querySelectorAll('.preview .katex').length > 0, null, { timeout: 20000 })
  .catch(() => {})
const previewAt = Date.now() - startedAt
await page.waitForTimeout(1200)

check('取れなかったファイルが0件', failedRequests.length === 0, failedRequests.join(' | '))
check('コンソールエラーが0件', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

const state = await page.evaluate(() => {
  const katexLabel = document.querySelector('.preview .katex')
  const mark = document.querySelector('.toolbar__mark')
  return {
    editor: document.querySelector('.editor') !== null,
    katex: document.querySelectorAll('.preview .katex').length,
    graph: document.querySelectorAll('.preview svg.graph').length,
    palette: document.querySelectorAll('.palette__item').length,
    fontFamily: katexLabel === null ? '' : getComputedStyle(katexLabel).fontFamily,
    // 画像が実際に描かれたか。壊れた画像は naturalWidth が0になる。
    markWidth: mark === null ? null : mark.naturalWidth,
  }
})

check('エディタが出る', state.editor)
check('プレビューに数式が16個描かれる', state.katex === 16, `${state.katex}個`)
check('プレビューにグラフが1つ描かれる', state.graph === 1, `${state.graph}個`)
check('パレットのボタンが出る', state.palette > 0, `${state.palette}件（基本タブ）`)
check(
  'KaTeXのフォントが当たっている',
  state.fontFamily.startsWith('KaTeX_Main'),
  state.fontFamily.slice(0, 40),
)
check('ツールバーのロゴが描かれている', state.markWidth !== null && state.markWidth > 0, `naturalWidth ${state.markWidth}`)

// パレットから挿入できる（file:// でもReactのイベントが効いていること）。
const before = await page.locator('.editor').inputValue()
await page.locator('.palette__item').first().click()
check('パレットのボタンを押すと挿入される', (await page.locator('.editor').inputValue()) !== before)

// ---- 保存 ----

await page.locator('.editor').fill('# file:// で書いた\n\n$x^2$\n')
await page.waitForTimeout(1500)
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('.editor', { timeout: 20000 })
await page.waitForTimeout(800)
check(
  'リロードしても書いた内容が残る',
  (await page.locator('.editor').inputValue()).startsWith('# file:// で書いた'),
)

// 別の置き場所へコピーして開く。file:// のページは保存を共有する（0074で実測）。
await rm(MOVED_DIR, { recursive: true, force: true })
await mkdir(MOVED_DIR, { recursive: true })
await cp(OUT_DIR, MOVED_DIR, { recursive: true })
await page.goto(`file://${MOVED_DIR}/index.html`, { waitUntil: 'load' }).catch(() => {})
await page.waitForSelector('.editor', { timeout: 20000 })
await page.waitForTimeout(800)
check(
  '別のフォルダへコピーして開いても書いた内容が出る（保存を共有している）',
  (await page.locator('.editor').inputValue()).startsWith('# file:// で書いた'),
)

// ---- 速さ ----
// ローカルディスクから読むので回線の影響を受けない。要求仕様N10（細い回線で
// 1.5秒以内）はHTTP向けの出力に対するもので、ここでは素の速さだけを見る。
check('数式が出るまでが1秒以内', previewAt <= 1000, `textarea ${editorAt}ms / 数式 ${previewAt}ms`)

await page.screenshot({ path: 'tmp/verify-file.png' })
await browser.close()

// ---- まとめ ----

const failed = results.filter((result) => !result.ok)
console.log(`\n受け入れ基準: ${results.length - failed.length}/${results.length} 件 OK`)
if (failed.length > 0) {
  console.log(`\n-- 落ちたチェック（${failed.length}件） --`)
  for (const result of failed) console.log(`NG  ${result.label}${result.detail ? ` — ${result.detail}` : ''}`)
}
await mkdir(resolve(ROOT, 'tmp'), { recursive: true })
await writeFile(
  JSON_OUT,
  `${JSON.stringify({ page: PAGE, editorAt, previewAt, consoleErrors, failedRequests, checks: results }, null, 2)}\n`,
)
console.log(`結果: ${JSON_OUT}`)
console.log('スクリーンショット: tmp/verify-file.png')

if (failed.length > 0) process.exit(1)

async function readTextOrNull(path) {
  try {
    const { readFile } = await import('node:fs/promises')
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}
