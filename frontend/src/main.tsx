import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import '@fontsource/mukta/400.css'
import '@fontsource/mukta/500.css'
import '@fontsource/mukta/600.css'
import './index.css'
import App from './App'
import { applyConsoleTheme } from './lib/theme'

// The dark theme belongs to the console only; apply it before first paint when the console is open.
applyConsoleTheme(window.location.pathname + window.location.hash)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
