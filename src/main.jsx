import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PublicRoute, isPublicPath } from './PublicPages.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPublicPath() ? <PublicRoute /> : <App />}
  </StrictMode>,
)

// Убираем прелоадер после первого рендера React
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const loader = document.getElementById('app-loader')
    if (loader) {
      loader.classList.add('hidden')
      setTimeout(() => {
        loader.remove()
      }, 400)
    }
  })
})