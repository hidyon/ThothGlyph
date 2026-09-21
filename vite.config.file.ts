import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * file:// で開ける出力を作る設定（0074）。出力は `dist-file/`。
 *
 * **`vite.config.ts`（HTTP向け）とは別に持つ。** あちらは0024で初期チャンクを
 * 268.9 kB + 遅延332.6 kB に分けてあり、その分割は `準備中…`（エンジンが届く前でも
 * 打てる）と要求仕様N10（初期JSは300 kB以下）の土台になっている。ここで1本に
 * まとめるのは file:// の制約のためで、HTTPで配る形は変えない。
 *
 * file:// で ES モジュールが使えないのはパスの問題ではない。origin が `null` に
 * なるため、モジュールの取得そのものがCORSで拒否される（`--base=./` でも同じ）。
 * そこで1本のIIFEにまとめ、classic script として読む。
 */
const forFileProtocol = () => ({
  name: 'for-file-protocol',
  /**
   * 生成されたHTMLの参照を file:// でも通る形に直す。
   *
   * `crossorigin` は origin が null だと邪魔になるので外す。
   * **`defer` は必須。** classic script は module と違って defer されないので、
   * 付けないと `#root` より先に走って React が落ちる（実際に踏んだ。
   * `Minified React error #299`）。
   */
  transformIndexHtml: {
    order: 'post' as const,
    handler: (html: string) =>
      html
        .replace(
          /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
          '<script defer src="$1"></script>',
        )
        .replace(
          /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
          '<link rel="stylesheet" href="$1">',
        ),
  },
})

export default defineConfig({
  plugins: [react(), forFileProtocol()],
  // index.html から見て隣を指すようにする（絶対パスだとルートを見にいく）。
  base: './',
  build: {
    outDir: 'dist-file',
    // CSSも1つにまとめる。file:// では取得の回数を減らすほうが素直。
    cssCodeSplit: false,
    modulePreload: false,
    // データURIに埋めずファイルとして置く（フォントと同じ扱いにする）。
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: 'iife',
        // 動的importも1本に含める。file:// では import() も同じCORSで止まる。
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
