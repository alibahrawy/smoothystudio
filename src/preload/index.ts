import { contextBridge, ipcRenderer } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Read the saved canvases before the renderer starts.
 *
 * Studio initialises its document synchronously, so the workspace has to be
 * available at first render. Preload runs before the renderer script and has
 * Node access, so it reads the file directly — no async hydration and no
 * blocking sendSync round-trip.
 */
function readInitialWorkspace(): unknown {
  try {
    const file = path.join(
      ipcRenderer.sendSync('studio:userData-path') as string,
      'studio-workspace.json',
    )
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const authApi = {
  signIn: (): Promise<unknown> => ipcRenderer.invoke('auth:signIn'),
  signOut: (): Promise<void> => ipcRenderer.invoke('auth:signOut'),
  restore: (): Promise<unknown> => ipcRenderer.invoke('auth:restore'),
  state: (): Promise<unknown> => ipcRenderer.invoke('auth:state'),
  onChange: (cb: (s: unknown) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, s: unknown): void => cb(s)
    ipcRenderer.on('auth:changed', listener)
    return () => ipcRenderer.removeListener('auth:changed', listener)
  },
}

const creditsApi = {
  get: (): Promise<unknown> => ipcRenderer.invoke('credits:get'),
}

const aiPhotosApi = {
  generate: (args: {
    prompt: string
    images?: string[]
    reactionId?: string | null
    reactionLabel?: string | null
    fileName?: string | null
    model?: string
    aspectRatio?: string
    imageSize?: '1K' | '2K' | '4K'
    imageType?: string
  }): Promise<unknown> => ipcRenderer.invoke('aiphotos:generate', args),
  removeBg: (args: { imageUrl: string; model?: string }): Promise<unknown> =>
    ipcRenderer.invoke('aiphotos:remove-bg', args),
  upscale: (args: { imageUrl: string; model?: string }): Promise<unknown> =>
    ipcRenderer.invoke('aiphotos:upscale', args),
  list: (args: {
    page?: number
    limit?: number
    imageType?: string
    favoritesOnly?: boolean
  }): Promise<unknown> => ipcRenderer.invoke('aiphotos:list', args ?? {}),
  favorite: (args: { id: string; isFavorite: boolean }): Promise<unknown> =>
    ipcRenderer.invoke('aiphotos:favorite', args),
  delete: (args: { id: string }): Promise<unknown> =>
    ipcRenderer.invoke('aiphotos:delete', args),
  /** Save via a native dialog — main fetches the bytes, because the images are
   *  cross-origin and an in-renderer `<a download>` navigates instead. */
  saveImage: (args: {
    imageUrl: string
    suggestedName: string
  }): Promise<{ filePath: string } | { error: string } | null> =>
    ipcRenderer.invoke('aiphotos:save-image', args) as Promise<
      { filePath: string } | { error: string } | null
    >,
  /** Remote image → data URL, so it can be embedded in a Studio document. */
  fetchDataUrl: (args: {
    imageUrl: string
  }): Promise<{ dataUrl: string } | { error: string }> =>
    ipcRenderer.invoke('aiphotos:fetch-data-url', args) as Promise<
      { dataUrl: string } | { error: string }
    >,
}

const studioApi = {
  /** Canvases as they were on disk at launch, or null on a first run. */
  initialWorkspace: readInitialWorkspace(),
  /** Persist canvases. Unlike localStorage this has no size cap, so documents
   *  with embedded images save reliably; failures are reported, not swallowed. */
  saveWorkspace: (json: string): Promise<{ ok: true; bytes: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke('studio:save-workspace', json) as Promise<
      { ok: true; bytes: number } | { ok: false; error: string }
    >,
  savePng: (args: {
    dataBase64: string
    suggestedName: string
  }): Promise<{ filePath: string } | { error: string } | null> =>
    ipcRenderer.invoke('studio:save-png', args) as Promise<
      { filePath: string } | { error: string } | null
    >,
  exportBatch: (args: {
    files: Array<{ name: string; dataBase64: string }>
  }): Promise<{ folderPath: string; count: number; failed: string[] } | null> =>
    ipcRenderer.invoke('studio:export-batch', args) as Promise<{
      folderPath: string
      count: number
      failed: string[]
    } | null>,
}

const themeApi = {
  onChange: (cb: (isDark: boolean) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, isDark: boolean): void => cb(isDark)
    ipcRenderer.on('theme:changed', listener)
    return () => ipcRenderer.removeListener('theme:changed', listener)
  },
}

const platformApi = { platform: process.platform }

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('auth', authApi)
    contextBridge.exposeInMainWorld('credits', creditsApi)
    contextBridge.exposeInMainWorld('aiPhotos', aiPhotosApi)
    contextBridge.exposeInMainWorld('studioApi', studioApi)
    contextBridge.exposeInMainWorld('theme', themeApi)
    contextBridge.exposeInMainWorld('smoothy', platformApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore -- fallback when contextIsolation is off
  window.auth = authApi
  // @ts-ignore
  window.credits = creditsApi
  // @ts-ignore
  window.aiPhotos = aiPhotosApi
  // @ts-ignore
  window.studioApi = studioApi
  // @ts-ignore
  window.theme = themeApi
  // @ts-ignore
  window.smoothy = platformApi
}
