/**
 * 初期バンドルの大きさと、読み込みにかかる時間の実測（0024）。
 *
 *   node scripts/measure-load.mjs
 *
 * verify-ui.mjs は開発サーバ（バンドルされていない）に向いているので、
 * 本番の値はこちらで測る。ビルド → vite preview で配る →
 * ヘッドレスChromiumで2条件×3回、の順に自分でやる。
 *
 * 結果は表で出し、下の基準と照らして OK / NG を出す。1件でも落ちたら終了コード1。
 * 結果は tmp/measure-load.json にも書く（出力を切ってしまっても後から読める）。
 *
 * verify-ui.mjs と同じく executablePath は書かない
 * （PLAYWRIGHT_BROWSERS_PATH から playwright-core が自力で見つける）。
 */
import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { promisify } from 'node:util'
import { chromium } from 'playwright-core'

const execFileAsync = promisify(execFile)

const PORT = Number(process.env.MEASURE_PORT ?? 4174)
const URL = `http://localhost:${PORT}/`
const JSON_OUT = process.env.MEASURE_JSON ?? 'tmp/measure-load.json'
const RUNS = 3

/** Chrome DevTools の Fast 3G 相当。CPUは4倍遅くする。 */
const SLOW = {
  network: {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  },
  cpuRate: 4,
}

/** 受け入れ基準（0024）。カッコ内は実装前の実測。 */
const LIMITS = {
  initialJs: 300 * 1024, //        579.98 kB
  initialJsGzip: 95 * 1024, //     180.50 kB
  initialCss: 10 * 1024, //         36.09 kB
  fastEditor: 250, //                229 ms
  fastPreview: 400, //               252 ms
  slowEditor: 1500, //              1964 ms
  slowPreview: 2400, //             2021 ms
  slowPalette: 2400, //             （実装前は数式と同時）
}

/** 遅延チャンクに入っているべき依存と、minify後も残る目印。 */
const MARKERS = [
  ['KaTeX', 'katex'],
  ['marked', 'markedjs'],
  ['DOMPurify', 'dompurify'],
]

const results = []
const check = (label, ok, detail = '') => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'OK  ' : 'NG  '} ${label}${detail ? ` — ${detail}` : ''}`)
}

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} kB`
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

// ---- 1. ビルドしてサイズを測る ----

console.log('== ビルド ==')
const build = await execFileAsync('npm', ['run', 'build'], { maxBuffer: 10 * 1024 * 1024 })
const buildOut = `${build.stdout}${build.stderr}`
check(
  'チャンクサイズの警告が出ない',
  !buildOut.includes('larger than'),
  buildOut.includes('larger than') ? '警告あり' : '',
)

const html = await readFile('dist/index.html', 'utf8')
const entryJs = html.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/)?.[1]
const entryCss = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/assets\/([^"]+\.css)"/g)].map(
  (m) => m[1],
)
if (entryJs === undefined) {
  console.error('dist/index.html からエントリのJSを見つけられない')
  process.exit(1)
}

const assets = await readdir('dist/assets')
const sizeOf = async (name) => {
  const body = await readFile(`dist/assets/${name}`)
  return { name, raw: body.length, gzip: gzipSync(body).length, body }
}
const initialJs = await sizeOf(entryJs)
const lazyJs = await Promise.all(
  assets.filter((n) => n.endsWith('.js') && n !== entryJs).map(sizeOf),
)
const initialCss = await Promise.all(entryCss.map(sizeOf))
const initialCssBytes = initialCss.reduce((sum, f) => sum + f.raw, 0)

console.log('\n== 成果物 ==')
console.log(`初期JS   ${initialJs.name}  ${kb(initialJs.raw)}  gzip ${kb(initialJs.gzip)}`)
for (const f of lazyJs) console.log(`遅延JS   ${f.name}  ${kb(f.raw)}  gzip ${kb(f.gzip)}`)
for (const f of initialCss) console.log(`初期CSS  ${f.name}  ${kb(f.raw)}  gzip ${kb(f.gzip)}`)

check(
  `初期チャンクのJSが ${kb(LIMITS.initialJs)} 以下`,
  initialJs.raw <= LIMITS.initialJs,
  kb(initialJs.raw),
)
check(
  `初期チャンクのJSが gzip ${kb(LIMITS.initialJsGzip)} 以下`,
  initialJs.gzip <= LIMITS.initialJsGzip,
  kb(initialJs.gzip),
)
check(`初期CSSが ${kb(LIMITS.initialCss)} 以下`, initialCssBytes <= LIMITS.initialCss, kb(initialCssBytes))

const initialText = initialJs.body.toString('latin1')
const lazyText = lazyJs.map((f) => f.body.toString('latin1')).join('')
for (const [name, marker] of MARKERS) {
  check(
    `${name} が遅延チャンクにあり、初期チャンクにない`,
    lazyText.includes(marker) && !initialText.includes(marker),
    `遅延 ${lazyText.includes(marker)} / 初期 ${initialText.includes(marker)}`,
  )
}

// ---- 2. 配って読み込み時間を測る ----

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
// 起動を待つ。配れていなければ測る意味がないので、待てなければ落とす。
const serverUp = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 15000)
  const onData = (chunk) => {
    if (String(chunk).includes(String(PORT))) {
      clearTimeout(timer)
      resolve(true)
    }
  }
  server.stdout.on('data', onData)
  server.stderr.on('data', onData)
})
if (!serverUp) {
  server.kill()
  console.error(`vite preview がポート${PORT}で起動しなかった`)
  process.exit(1)
}

/** 1回ぶんの計測。毎回まっさらなコンテキストで開く（キャッシュを持ち越さない）。 */
const measureOnce = async (browser, slow) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  if (slow) {
    await cdp.send('Network.emulateNetworkConditions', SLOW.network)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW.cpuRate })
  }

  const started = Date.now()
  await page.goto(URL, { waitUntil: 'commit' })
  await page.waitForSelector('textarea', { state: 'attached' })
  const editor = Date.now() - started
  await page.waitForSelector('.preview .katex')
  const preview = Date.now() - started
  await page.waitForFunction(() => document.querySelectorAll('.palette .katex').length > 0)
  const palette = Date.now() - started

  await context.close()
  return { editor, preview, palette }
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const measure = async (slow) => {
  const runs = []
  for (let i = 0; i < RUNS; i += 1) runs.push(await measureOnce(browser, slow))
  return {
    runs,
    editor: median(runs.map((r) => r.editor)),
    preview: median(runs.map((r) => r.preview)),
    palette: median(runs.map((r) => r.palette)),
  }
}

console.log('\n== 読み込み時間（3回の中央値） ==')
const fast = await measure(false)
const slow = await measure(true)
await browser.close()
server.kill()

const row = (title, m) =>
  console.log(
    `${title}  textarea ${m.editor} ms / プレビューの数式 ${m.preview} ms / パレットのラベル ${m.palette} ms` +
      `  （各回: ${m.runs.map((r) => `${r.editor}/${r.preview}/${r.palette}`).join('  ')}）`,
  )
row('スロットルなし     ', fast)
row('Fast 3G + CPU 4倍 ', slow)

check(`スロットルなしでtextareaまでが ${LIMITS.fastEditor} ms以下`, fast.editor <= LIMITS.fastEditor, `${fast.editor} ms`)
check(`スロットルなしでプレビューの数式までが ${LIMITS.fastPreview} ms以下`, fast.preview <= LIMITS.fastPreview, `${fast.preview} ms`)
check(`Fast 3G + CPU 4倍でtextareaまでが ${LIMITS.slowEditor} ms以下`, slow.editor <= LIMITS.slowEditor, `${slow.editor} ms`)
check(`Fast 3G + CPU 4倍でプレビューの数式までが ${LIMITS.slowPreview} ms以下`, slow.preview <= LIMITS.slowPreview, `${slow.preview} ms`)
check(`Fast 3G + CPU 4倍でパレットのラベルまでが ${LIMITS.slowPalette} ms以下`, slow.palette <= LIMITS.slowPalette, `${slow.palette} ms`)

// ---- まとめ ----

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 件OK`)
if (failed.length > 0) {
  console.log('\n落ちたチェック:')
  for (const r of failed) console.log(`  NG  ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
}

await mkdir('tmp', { recursive: true })
await writeFile(
  JSON_OUT,
  `${JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      limits: LIMITS,
      sizes: {
        initialJs: { name: initialJs.name, raw: initialJs.raw, gzip: initialJs.gzip },
        lazyJs: lazyJs.map((f) => ({ name: f.name, raw: f.raw, gzip: f.gzip })),
        initialCss: initialCss.map((f) => ({ name: f.name, raw: f.raw, gzip: f.gzip })),
      },
      timings: { fast, slow },
      results,
    },
    null,
    2,
  )}\n`,
)
console.log(`結果: ${JSON_OUT}`)

process.exit(failed.length > 0 ? 1 : 0)
