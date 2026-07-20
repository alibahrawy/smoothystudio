import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { store } from './store'
import { signIn, signOut, getAuthState, restoreAuthFromDisk, armExpiryWatch } from './auth-service'
import { getCredits } from './credits-service'
import { removeBackgroundLocal } from './bg-service'
import {
  generateReaction,
  removeBackground,
  upscale,
  listReactions,
  setFavorite,
  deleteReaction,
} from './ai-photos-service'

/**
 * Push the current auth slice to a renderer. SmoothyDesktop mirrors its whole
 * main-process store through zubridge; this app's shared surface is small
 * enough that an explicit push on load plus on change is simpler and has no
 * extra dependency.
 */
export function pushAuthState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const s = store.getState()
  win.webContents.send('auth:changed', {
    signedIn: s.signedIn,
    user: s.user,
    sessionExpired: s.sessionExpired,
  })
}

function broadcastAuth(): void {
  for (const w of BrowserWindow.getAllWindows()) pushAuthState(w)
}

export function registerIpc(): void {
  // Synchronous because preload reads the workspace file before the renderer
  // starts, and needs the directory to do it.
  ipcMain.on('studio:userData-path', (e) => {
    e.returnValue = app.getPath('userData')
  })

  /* ── Auth ──────────────────────────────────────────────────────────── */

  ipcMain.handle('auth:signIn', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('no-window')
    const result = await signIn(win)
    if (result.user) {
      store.setState({ signedIn: true, user: result.user, sessionExpired: false })
      armExpiryWatch(() => {
        store.setState({ signedIn: false, user: null, sessionExpired: true })
        broadcastAuth()
      })
    }
    broadcastAuth()
    return result
  })

  ipcMain.handle('auth:signOut', async () => {
    await signOut()
    store.setState({ signedIn: false, user: null, sessionExpired: false })
    broadcastAuth()
  })

  ipcMain.handle('auth:restore', async () => {
    const restored = await restoreAuthFromDisk()
    if (restored === 'expired') {
      store.setState({ signedIn: false, user: null, sessionExpired: true })
    } else if (restored?.user) {
      store.setState({ signedIn: true, user: restored.user, sessionExpired: false })
    }
    broadcastAuth()
    return getAuthState()
  })

  ipcMain.handle('auth:state', () => getAuthState())

  /* ── Credits ───────────────────────────────────────────────────────── */

  ipcMain.handle('credits:get', async () => await getCredits())

  /* ── AI Photos ─────────────────────────────────────────────────────── */

  ipcMain.handle('aiphotos:generate', async (_e, args: Parameters<typeof generateReaction>[0]) => {
    return await generateReaction(args)
  })
  ipcMain.handle('aiphotos:remove-bg', async (_e, args: Parameters<typeof removeBackground>[0]) => {
    return await removeBackground(args)
  })
  ipcMain.handle('aiphotos:upscale', async (_e, args: Parameters<typeof upscale>[0]) => {
    return await upscale(args)
  })
  ipcMain.handle('aiphotos:list', async (_e, args: Parameters<typeof listReactions>[0]) => {
    return await listReactions(args)
  })
  ipcMain.handle('aiphotos:favorite', async (_e, args: Parameters<typeof setFavorite>[0]) => {
    return await setFavorite(args)
  })
  ipcMain.handle('aiphotos:delete', async (_e, args: Parameters<typeof deleteReaction>[0]) => {
    return await deleteReaction(args)
  })

  /**
   * Save a generated image to disk. The renderer cannot do this itself: the
   * images live on another origin, where Chromium ignores an anchor's
   * `download` attribute and navigates to the file instead — which in a
   * frameless app means the picture replaces the entire UI with no way back.
   */
  ipcMain.handle(
    'aiphotos:save-image',
    async (e, args: { imageUrl: string; suggestedName: string }) => {
      if (!args?.imageUrl) return { error: 'no-image-url' }
      const win = BrowserWindow.fromWebContents(e.sender)
      const urlExt = (args.imageUrl.split('?')[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[1] ?? 'png').toLowerCase()
      const ext = urlExt === 'jpg' ? 'jpeg' : urlExt
      const safe = args.suggestedName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'image'
      const options: Electron.SaveDialogOptions = {
        title: 'Save image',
        defaultPath: path.join(app.getPath('downloads'), `${safe}.${urlExt}`),
        filters: [{ name: 'Image', extensions: [ext, urlExt].filter((v, i, a) => a.indexOf(v) === i) }],
      }
      const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (res.canceled || !res.filePath) return null
      try {
        const r = await fetch(args.imageUrl)
        if (!r.ok) return { error: `download-failed-${r.status}` }
        fs.writeFileSync(res.filePath, Buffer.from(await r.arrayBuffer()))
        return { filePath: res.filePath }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  /**
   * Fetch a remote image as a data URL so the renderer can hand it straight to
   * a Studio picture layer. Studio documents embed their images, and the
   * renderer can't fetch cross-origin bytes, so main does it.
   */
  ipcMain.handle('aiphotos:fetch-data-url', async (_e, args: { imageUrl: string }) => {
    if (!args?.imageUrl) return { error: 'no-image-url' }
    try {
      const r = await fetch(args.imageUrl)
      if (!r.ok) return { error: `fetch-failed-${r.status}` }
      const type = r.headers.get('content-type') ?? 'image/png'
      const b64 = Buffer.from(await r.arrayBuffer()).toString('base64')
      return { dataUrl: `data:${type};base64,${b64}` }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  /**
   * Background removal, on device.
   *
   * Deliberately not the hosted endpoint: that caps request bodies at a few
   * megabytes and a full-resolution PNG data URL exceeds it before it starts
   * (`413 FUNCTION_PAYLOAD_TOO_LARGE`). Local also means no per-image cost and
   * the user's photos never leave the machine.
   */
  ipcMain.handle(
    'studio:remove-bg',
    async (e, args: { imageDataUrl: string; edgeSoftness?: number; runId: string }) => {
      const sender = e.sender
      try {
        const imageDataUrl = await removeBackgroundLocal(args, (p) => {
          if (!sender.isDestroyed()) sender.send('studio:remove-bg:progress', { runId: args.runId, ...p })
        })
        return { ok: true as const, imageDataUrl }
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  /* ── Studio workspace persistence ──────────────────────────────────── */

  /**
   * Canvases live in a file under userData, not localStorage.
   *
   * Documents embed their images as data URLs, so a couple of generated
   * pictures blows past localStorage's ~5 MB quota — and `setItem` then throws
   * on every subsequent save. Silently losing a designer's work is the worst
   * possible failure, so this path has no cap and reports errors instead of
   * swallowing them.
   */
  ipcMain.handle('studio:save-workspace', async (_e, json: string) => {
    try {
      const file = path.join(app.getPath('userData'), 'studio-workspace.json')
      // Write-then-rename so a crash mid-write can't truncate the real file.
      const tmp = `${file}.tmp`
      await fs.promises.writeFile(tmp, json, 'utf8')
      await fs.promises.rename(tmp, file)
      return { ok: true as const, bytes: Buffer.byteLength(json, 'utf8') }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[studio] failed to save workspace', message)
      return { ok: false as const, error: message }
    }
  })

  /* ── Studio export ─────────────────────────────────────────────────── */

  ipcMain.handle(
    'studio:save-png',
    async (e, args: { dataBase64: string; suggestedName: string }) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const safe = args.suggestedName.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'title'
      const options: Electron.SaveDialogOptions = {
        title: 'Export PNG',
        defaultPath: path.join(app.getPath('downloads'), `${safe}.png`),
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      }
      const res = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)
      if (res.canceled || !res.filePath) return null
      try {
        fs.writeFileSync(res.filePath, Buffer.from(args.dataBase64, 'base64'))
        return { filePath: res.filePath }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle(
    'studio:export-batch',
    async (e, args: { files: Array<{ name: string; dataBase64: string }> }) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options: Electron.OpenDialogOptions = {
        title: 'Choose a folder',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: app.getPath('downloads'),
      }
      const res = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (res.canceled || !res.filePaths[0]) return null
      const folderPath = res.filePaths[0]
      const failed: string[] = []
      let count = 0
      for (const f of args.files) {
        try {
          fs.writeFileSync(path.join(folderPath, f.name), Buffer.from(f.dataBase64, 'base64'))
          count += 1
        } catch {
          failed.push(f.name)
        }
      }
      return { folderPath, count, failed }
    },
  )
}
