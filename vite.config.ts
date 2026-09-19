import react from '@vitejs/plugin-react'
// test 設定をViteの設定と同じ場所に書きたいので、defineConfigは vitest/config から取る。
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // テストは対象の隣に置く（src/lib/*.test.ts）。追随しやすさを優先し、
    // tests/ ディレクトリは切らない。
    include: ['src/**/*.test.ts'],
  },
  server: {
    // devcontainer内で動かすため、0.0.0.0にバインドしないとホストの
    // ブラウザから届かない。npm run dev のまま動かしたいので設定に書く。
    host: true,
  },
})
