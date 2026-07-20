import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installMcpBridge } from './lib/mcp-bridge'
import './styles.css'

// Expose the render surface before the first paint — the MCP server in main
// reaches it via executeJavaScript and may be asked to render immediately.
installMcpBridge()

// Forward any uncaught renderer error to main stdout so a crash shows up in
// the terminal instead of a silent gray window.
window.addEventListener('error', (e) => {
  console.error('[renderer-uncaught]', e.message, e.error?.stack ?? '')
})
window.addEventListener('unhandledrejection', (e) => {
  const reason = (e.reason && (e.reason.stack || e.reason.message)) || String(e.reason)
  console.error('[renderer-unhandled-rejection]', reason)
})

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
