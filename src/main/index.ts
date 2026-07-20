import { app, BrowserWindow, nativeImage } from 'electron'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createMainWindow, registerThemeIpc } from './window'
import { registerIpc, pushAuthState } from './ipc'
import { restoreAuthFromDisk, armExpiryWatch } from './auth-service'
import { store } from './store'
import { startMcpServer, stopMcpServer } from './mcp-server'

// Single-instance lock — second launch focuses the existing window
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.smoothyedit.studio')

    if (is.dev && process.platform === 'darwin' && app.dock) {
      const devIcon = nativeImage.createFromPath(
        path.join(app.getAppPath(), 'build', 'icon.png'),
      )
      if (!devIcon.isEmpty()) app.dock.setIcon(devIcon)
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpc()
    registerThemeIpc()

    // Restore the signed-in session before the first paint so the renderer
    // doesn't flash "signed out" and then correct itself.
    const restored = await restoreAuthFromDisk()
    if (restored === 'expired') {
      store.setState({ signedIn: false, user: null, sessionExpired: true })
    } else if (restored?.user) {
      store.setState({ signedIn: true, user: restored.user })
      armExpiryWatch(() =>
        store.setState({ signedIn: false, user: null, sessionExpired: true }),
      )
    }

    const mainWindow = createMainWindow()
    mainWindow.webContents.on('did-finish-load', () => pushAuthState(mainWindow))

    // The MCP server renders through this window, so it starts only once one
    // exists. A failure here is logged rather than fatal — the app is fully
    // usable without an agent attached.
    try {
      await startMcpServer(mainWindow)
    } catch (err) {
      console.error('[main] failed to start MCP server', err)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const w = createMainWindow()
        w.webContents.on('did-finish-load', () => pushAuthState(w))
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('quit', () => {
    void stopMcpServer()
  })
}
