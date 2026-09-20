import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadEngine } from './lib/previewEngine'

// 数式の描画エンジンの取得は、Reactのマウントを待たずにここで始める（0024）。
// マウント後に始めると、初期チャンクの評価とエンジンの取得が直列になり、
// 細い回線でプレビューが出るまでが伸びる。Appも同じ Promise を受け取る。
loadEngine().catch(() => {
  // 失敗しても起動は続ける。プレビューは「準備中…」のまま、エディタは使える。
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
