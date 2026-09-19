/**
 * public/favicon.svg から PNG を書き出す。
 *
 *   node scripts/make-icons.mjs
 *
 * PNGを手で作らないのは、SVGを直したときにPNGだけ古くなるため（同じものを
 * 2か所で持たない）。生成物はコミットする。ビルド時に生成しないのは、
 * devcontainerの外でもChromiumが要ることになるから。
 *
 * executablePath を指定していないのは検証スクリプトと同じ理由で、
 * PLAYWRIGHT_BROWSERS_PATH から playwright-core が自力で見つけるため。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const SVG = 'public/favicon.svg'

/**
 * apple-touch-icon だけ角丸を落とす。iOSが自分で角を丸めるので、
 * 角丸付きを渡すと角が二重に落ちる。
 */
const TARGETS = [
  { path: 'public/favicon-32.png', size: 32, square: false },
  { path: 'public/apple-touch-icon.png', size: 180, square: true },
  { path: 'public/icon-192.png', size: 192, square: false },
  { path: 'public/icon-512.png', size: 512, square: false },
]

const svg = await readFile(SVG, 'utf8')
/** 角丸を消す。rx を持つのは背景の rect だけ。 */
const squared = svg.replace(/\s+rx="[\d.]+"/g, '')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage()

for (const { path, size, square } of TARGETS) {
  const source = square ? squared : svg
  // 実寸のdivにSVGを流し込んで撮る。デバイスピクセル比を1に固定し、
  // 指定サイズちょうどのPNGが出るようにする。
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0"><div style="width:${size}px;height:${size}px">${source.replace(
      /width="32" height="32"/,
      `width="${size}" height="${size}"`,
    )}</div></body></html>`,
  )
  const png = await page.screenshot({ omitBackground: true })
  await writeFile(path, png)
  console.log(`${path} — ${size}x${size} / ${png.length}バイト`)
}

await browser.close()
