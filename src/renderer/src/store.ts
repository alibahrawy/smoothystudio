import { create } from 'zustand'
import type { AppState, BrandTheme, PublicUser } from '@shared/state'

/**
 * Renderer state. Unlike SmoothyDesktop this app does not use zubridge — its
 * shared surface is four fields, so a plain Zustand store hydrated over IPC is
 * far less machinery than bridging a whole main-process store.
 */
export type Tab = 'studio' | 'photos'

interface RendererState extends Pick<AppState, 'theme' | 'signedIn' | 'user' | 'hydrated'> {
  credits: { credits: number; tier: 'free' | 'pro' } | null
  tab: Tab
  /**
   * Handoff slot for "Send to Studio". AI Photos drops a data URL here and
   * switches tabs; Studio picks it up and clears it. A one-slot queue rather
   * than a callback because the two views are siblings that never unmount, and
   * a data URL is the only thing they need to exchange.
   */
  pendingStudioImage: string | null
  /**
   * Documents an agent rendered over MCP, waiting to be opened as canvases so
   * the user can finish them by hand. A queue rather than a slot because a run
   * can produce several before Studio picks any up.
   */
  pendingStudioDocs: Array<{ name: string; doc: unknown }>
  setAuth: (v: { signedIn: boolean; user: PublicUser | null }) => void
  setTheme: (t: BrandTheme) => void
  setCredits: (c: { credits: number; tier: 'free' | 'pro' } | null) => void
  setHydrated: (h: boolean) => void
  setTab: (t: Tab) => void
  sendImageToStudio: (dataUrl: string) => void
  clearPendingStudioImage: () => void
  openDocInStudio: (name: string, doc: unknown) => void
  takePendingStudioDocs: () => Array<{ name: string; doc: unknown }>
}

export const useAppStore = create<RendererState>((set, get) => ({
  theme: 'white',
  signedIn: false,
  user: null,
  hydrated: false,
  credits: null,
  tab: 'studio',
  pendingStudioImage: null,
  pendingStudioDocs: [],
  setAuth: ({ signedIn, user }) => set({ signedIn, user }),
  setTheme: (theme) => set({ theme }),
  setCredits: (credits) => set({ credits }),
  setHydrated: (hydrated) => set({ hydrated }),
  setTab: (tab) => set({ tab }),
  sendImageToStudio: (dataUrl) => set({ pendingStudioImage: dataUrl, tab: 'studio' }),
  clearPendingStudioImage: () => set({ pendingStudioImage: null }),
  openDocInStudio: (name, doc) =>
    set((s) => ({ pendingStudioDocs: [...s.pendingStudioDocs, { name, doc }], tab: 'studio' })),
  takePendingStudioDocs: () => {
    const queued = get().pendingStudioDocs
    if (queued.length) set({ pendingStudioDocs: [] })
    return queued
  },
}))
