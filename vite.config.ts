import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // devcontainer内で動かすため、0.0.0.0にバインドしないとホストの
    // ブラウザから届かない。npm run dev のまま動かしたいので設定に書く。
    host: true,
  },
})
