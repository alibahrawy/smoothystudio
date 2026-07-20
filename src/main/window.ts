import { BrowserWindow, nativeTheme, shell, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'

/**
 * Global UI scale. The renderer is built at a fixed "design size" using explicit
 * px tokens, so the clean way to make the whole app a little bigger is a single
 * uniform zoom — every proportion is preserved instead of hand-editing hundreds
 * of values. Applied (and re-clamped) on the webContents below. Bump this one
 * number to scale the entire UI up or down.
 */
const UI_ZOOM_FACTOR = 1.1

/**
 * Custom toolbar height. The renderer's `--titlebar-h` is 40px in the design,
 * but web zoom renders it at `TOOLBAR_HEIGHT * UI_ZOOM_FACTOR` on screen. Native
 * window chrome (macOS traffic lights, Windows caption buttons) is positioned in
 * unscaled points and is NOT affected by web zoom, so it must use the visual
 * (zoomed) height. Edit `--titlebar-h` in styles.css in lockstep.
 */
const TOOLBAR_HEIGHT = 44
const TOOLBAR_VISUAL_HEIGHT = Math.round(TOOLBAR_HEIGHT * UI_ZOOM_FACTOR)
const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'

/**
 * Native window backgrounds — set on the BrowserWindow so we never see a white
 * flash before vibrancy/CSS load. Track the theme tokens in styles.css.
 */
const LIGHT_BG = '#FAF9F5'
const DARK_BG = '#262624'

/** Traffic lights vertically centered in the *visual* toolbar (web zoom
 *  enlarges the 40px CSS bar): (44 − 14) / 2 = 15. */
const TRAFFIC_LIGHT_POSITION = {
  x: Math.round(14 * UI_ZOOM_FACTOR),
  y: Math.round((TOOLBAR_VISUAL_HEIGHT - 14) / 2),
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_BG : LIGHT_BG,
    roundedCorners: true,

    // macOS: hidden title bar with inset traffic lights vertically centered in
    // the *visual* toolbar (TOOLBAR_VISUAL_HEIGHT — web zoom enlarges the 40px
    // CSS bar): (44 - 14) / 2 = 15. `vibrancy: 'sidebar'` paints the whole window
    // with sidebar material — CSS masks the main content with an opaque surface
    // so vibrancy only shows through the actual sidebar/toolbar.
    // NOTE: `trafficLightPosition` is deliberately NOT set here — it is applied
    // after creation by `applyTrafficLightPosition` below, which knows to skip
    // it in fullscreen. See the crash guard for why.
    ...(isMac && {
      titleBarStyle: 'hiddenInset' as const,
      vibrancy: 'sidebar' as const,
      visualEffectState: 'active' as const,
    }),

    // Windows 11: Mica backdrop + Window Controls Overlay positioned to align
    // with our toolbar height. Symbol color flips with theme. On Win10 this
    // silently no-ops.
    ...(isWin && {
      frame: false,
      titleBarStyle: 'hidden' as const,
      backgroundMaterial: 'mica' as const,
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#E8E6E3' : '#1F1E1D',
        height: TOOLBAR_VISUAL_HEIGHT,
      },
    }),

    // Linux: keep a regular frame; no Mica, no vibrancy. (Most WMs handle
    // their own decorations and our frameless path is untested there.)
    ...(!isMac && !isWin && { frame: true }),

    webPreferences: {
      // electron-vite emits .mjs for the preload because the package is
      // `"type": "module"`. Electron 28+ supports ESM preloads with this
      // extension. The .js extension would load nothing and the renderer
      // would crash with `window.zubridge is undefined`.
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false, // false because preload uses Node (zubridge); we still have contextIsolation
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // macOS fullscreen crash guard. Electron's custom traffic-light positioning
  // assumes all three buttons are present, but macOS strips them from the
  // titlebar in fullscreen — the repositioning code then indexes past the end
  // of a one-element array and the app dies with
  // `NSRangeException: index 1 beyond bounds [0 .. 0]`.
  //
  // Setting the position in the BrowserWindow constructor is not safe: macOS
  // can restore the window straight into a leftover fullscreen Space, so the
  // custom position is already live during the very first layout pass and the
  // app crashes before any event handler runs. Applying it after creation, and
  // only while windowed, keeps us off that code path entirely.
  const applyTrafficLightPosition = (): void => {
    if (!isMac) return
    win.setWindowButtonPosition(win.isFullScreen() ? null : TRAFFIC_LIGHT_POSITION)
  }
  applyTrafficLightPosition()

  win.on('ready-to-show', () => {
    applyTrafficLightPosition()
    win.show()
  })

  if (isMac) {
    win.on('enter-full-screen', () => win.setWindowButtonPosition(null))
    win.on('leave-full-screen', () => win.setWindowButtonPosition(TRAFFIC_LIGHT_POSITION))
  }

  // Lock UI scale to UI_ZOOM_FACTOR: Chromium's built-in Cmd/Ctrl + +/-/0
  // shortcuts can zoom the renderer even without a menu entry. Swallow those
  // inputs and snap any drift back to our baseline so the layout always renders
  // at the intended design size.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = input.meta || input.control
    if (!mod || input.alt) return
    const key = input.key
    if (key === '+' || key === '-' || key === '=' || key === '_' || key === '0') {
      event.preventDefault()
    }
  })
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(UI_ZOOM_FACTOR)
  })
  win.webContents.on('zoom-changed', () => {
    win.webContents.setZoomFactor(UI_ZOOM_FACTOR)
  })

  // Forward renderer console messages to main stdout in dev so JS errors are
  // visible in the terminal alongside main-process logs. Without this, a
  // crashing renderer just shows a blank window.
  if (is.dev) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      const tag = ['log', 'warn', 'error'][Math.min(level, 2)]
      console.log(`[renderer:${tag}] ${source}:${line} ${message}`)
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[renderer] gone:', details)
    })
    // Open DevTools automatically the first time the window comes up.
    win.webContents.on('did-finish-load', () => win.webContents.openDevTools({ mode: 'detach' }))
  }

  // External links go to the default browser, not a new BrowserWindow
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Nothing may navigate the shell away from the app UI. Without this, one
  // stray anchor click (e.g. an `<a download>` pointing at a cross-origin
  // image, where Chromium ignores the download attribute and navigates
  // instead) replaces the whole window with that resource — and since we have
  // no browser chrome, there is no way back short of restarting the app.
  // Same-origin app navigation is left alone so the dev server and HMR work.
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    const isAppUrl = (() => {
      try {
        const target = new URL(url)
        const here = new URL(current)
        return target.origin === here.origin
      } catch {
        return false
      }
    })()
    if (isAppUrl) return
    event.preventDefault()
    if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url)
  })

  // Push native-theme changes to the renderer so document.documentElement can
  // flip the `dark` class in lockstep with the system theme.
  const broadcastTheme = (): void => {
    if (win.isDestroyed()) return
    win.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors)
    // Re-paint the title-bar overlay color on Windows so the WCO symbol stays legible.
    if (isWin) {
      win.setTitleBarOverlay({
        color: '#00000000',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#E8E6E3' : '#1F1E1D',
        height: TOOLBAR_VISUAL_HEIGHT,
      })
    }
  }
  nativeTheme.on('updated', broadcastTheme)
  win.on('closed', () => nativeTheme.removeListener('updated', broadcastTheme))

  // Dev: load from Vite dev server. Prod: load built HTML.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/**
 * Theme IPC: lets the renderer read the current native theme + override it
 * (light / dark / system). Call once from `index.ts` before window creation.
 */
let themeIpcRegistered = false
export function registerThemeIpc(): void {
  if (themeIpcRegistered) return
  themeIpcRegistered = true
  ipcMain.handle('theme:get', () => ({
    source: nativeTheme.themeSource,
    isDark: nativeTheme.shouldUseDarkColors,
  }))
  ipcMain.handle('theme:set', (_e, source: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = source
    return nativeTheme.shouldUseDarkColors
  })
}
