import type { PublicUser } from '@shared/state'

export interface AiPhotoItemDTO {
  id: string
  memberId: string
  reactionId: string | null
  reactionLabel: string | null
  imageUrl: string
  fileName: string | null
  model: string | null
  aspectRatio: string | null
  prompt: string | null
  imageType: 'reaction' | 'text-to-image' | 'remove-bg' | 'upscale' | 'vertical-thumbnail' | string
  isFavorite: boolean
  createdAt: string
}

declare global {
  interface Window {
    auth: {
      signIn: () => Promise<{ user: PublicUser | null; error?: string }>
      signOut: () => Promise<void>
      restore: () => Promise<{ signedIn: boolean; user: PublicUser | null }>
      state: () => Promise<{ signedIn: boolean; user: PublicUser | null }>
      onChange: (
        cb: (s: { signedIn: boolean; user: PublicUser | null; sessionExpired: boolean }) => void,
      ) => () => void
    }
    credits: {
      get: () => Promise<{ credits: number; tier: 'free' | 'pro'; daysRemaining?: number }>
    }
    aiPhotos: {
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
      }) => Promise<{ imageUrl: string; success: true; savedReactionId: string | null }>
      removeBg: (args: { imageUrl: string; model?: string }) => Promise<{
        imageUrl: string
        success: true
      }>
      upscale: (args: { imageUrl: string; model?: string }) => Promise<{
        imageUrl: string
        success: true
      }>
      list: (args: {
        page?: number
        limit?: number
        imageType?: string
        favoritesOnly?: boolean
      }) => Promise<{
        reactions: AiPhotoItemDTO[]
        totalItems: number
        totalPages: number
        currentPage: number
      }>
      favorite: (args: { id: string; isFavorite: boolean }) => Promise<{
        success: true
        isFavorite: boolean
      }>
      delete: (args: { id: string }) => Promise<{ message: string }>
      saveImage: (args: {
        imageUrl: string
        suggestedName: string
      }) => Promise<{ filePath: string } | { error: string } | null>
      fetchDataUrl: (args: {
        imageUrl: string
      }) => Promise<{ dataUrl: string } | { error: string }>
    }
    studioApi: {
      /** Canvases as they were on disk at launch, or null on a first run. */
      initialWorkspace: unknown
      saveWorkspace: (
        json: string,
      ) => Promise<{ ok: true; bytes: number } | { ok: false; error: string }>
      removeBackground: (
        args: { imageDataUrl: string; edgeSoftness?: number },
        onProgress?: (p: { ratio: number; note?: string }) => void,
      ) => Promise<{ ok: true; imageDataUrl: string } | { ok: false; error: string }>
      savePng: (args: {
        dataBase64: string
        suggestedName: string
      }) => Promise<{ filePath: string } | { error: string } | null>
      exportBatch: (args: {
        files: Array<{ name: string; dataBase64: string }>
      }) => Promise<{ folderPath: string; count: number; failed: string[] } | null>
    }
    theme: { onChange: (cb: (isDark: boolean) => void) => () => void }
    smoothy: { platform: NodeJS.Platform }
  }
}

export {}
