/**
 * AI Photos main-process bridge. Talks to the site's image endpoints
 * the same way the rest of the desktop talks to /api: x-member-id +
 * optional Bearer JWT. The site's image routes ignore the Bearer (only
 * x-member-id is read), but we forward both for consistency.
 *
 * Endpoints:
 *   POST /api/generate-reaction   — text/image → image
 *   POST /api/remove-background   — image → image (transparent bg)
 *   POST /api/upscale             — image → upscaled image
 *   GET  /api/reactions           — paginated history list
 *   PATCH /api/reactions          — toggle isFavorite by id
 *   DELETE /api/reactions/[id]    — remove single item (also wipes Blob)
 */
import { getAuthState, getAccessToken } from './auth-service'

const AS_URL = process.env['SMOOTHYEDIT_BASE_URL'] ?? 'https://smoothyedit.com'

export type AiPhotoImageType =
  | 'reaction'
  | 'text-to-image'
  | 'remove-bg'
  | 'upscale'
  | 'vertical-thumbnail'

export interface AiPhotoItem {
  id: string
  memberId: string
  reactionId: string | null
  reactionLabel: string | null
  imageUrl: string
  fileName: string | null
  model: string | null
  aspectRatio: string | null
  prompt: string | null
  imageType: AiPhotoImageType | string
  isFavorite: boolean
  createdAt: string
}

interface AiPhotosFetchInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

async function aiPhotosFetch(path: string, init: AiPhotosFetchInit = {}): Promise<unknown> {
  const auth = getAuthState()
  if (!auth.signedIn || !auth.user) throw new Error('not-signed-in')
  const access = getAccessToken()

  const res = await fetch(`${AS_URL}${path}`, {
    method: init.method ?? 'GET',
    signal: init.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      'x-member-id': auth.user.id,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`aiphotos-failed: ${res.status} ${text}`.trim())
  }
  return await res.json()
}

export interface GenerateReactionArgs {
  prompt: string
  images?: string[]
  reactionId?: string | null
  reactionLabel?: string | null
  fileName?: string | null
  model?: string
  aspectRatio?: string
  imageSize?: '1K' | '2K' | '4K'
  imageType?: AiPhotoImageType | string
}

export async function generateReaction(args: GenerateReactionArgs): Promise<{
  imageUrl: string
  success: true
  savedReactionId: string | null
}> {
  if (!args.prompt?.trim()) throw new Error('aiphotos-missing-prompt')
  return (await aiPhotosFetch('/api/generate-reaction', {
    method: 'POST',
    body: {
      prompt: args.prompt.trim(),
      ...(args.images?.length ? { images: args.images } : {}),
      ...(args.reactionId ? { reactionId: args.reactionId } : {}),
      ...(args.reactionLabel ? { reactionLabel: args.reactionLabel } : {}),
      ...(args.fileName ? { fileName: args.fileName } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
      ...(args.imageSize ? { imageSize: args.imageSize } : {}),
      ...(args.imageType ? { imageType: args.imageType } : {}),
    },
  })) as { imageUrl: string; success: true; savedReactionId: string | null }
}

export async function removeBackground(args: {
  imageUrl: string
  model?: string
}): Promise<{ imageUrl: string; success: true }> {
  if (!args.imageUrl) throw new Error('aiphotos-missing-image')
  return (await aiPhotosFetch('/api/remove-background', {
    method: 'POST',
    body: { imageUrl: args.imageUrl, ...(args.model ? { model: args.model } : {}) },
  })) as { imageUrl: string; success: true }
}

export async function upscale(args: {
  imageUrl: string
  model?: string
}): Promise<{ imageUrl: string; success: true }> {
  if (!args.imageUrl) throw new Error('aiphotos-missing-image')
  return (await aiPhotosFetch('/api/upscale', {
    method: 'POST',
    body: { imageUrl: args.imageUrl, ...(args.model ? { model: args.model } : {}) },
  })) as { imageUrl: string; success: true }
}

export interface ListReactionsArgs {
  page?: number
  limit?: number
  imageType?: AiPhotoImageType | string
  favoritesOnly?: boolean
}

export async function listReactions(args: ListReactionsArgs = {}): Promise<{
  reactions: AiPhotoItem[]
  totalItems: number
  totalPages: number
  currentPage: number
}> {
  const params = new URLSearchParams({
    page: String(args.page ?? 1),
    limit: String(args.limit ?? 30),
  })
  if (args.imageType) params.set('imageType', args.imageType)
  if (args.favoritesOnly) params.set('favorites', 'true')
  return (await aiPhotosFetch(`/api/reactions?${params.toString()}`)) as {
    reactions: AiPhotoItem[]
    totalItems: number
    totalPages: number
    currentPage: number
  }
}

export async function setFavorite(args: {
  id: string
  isFavorite: boolean
}): Promise<{ success: true; isFavorite: boolean }> {
  return (await aiPhotosFetch('/api/reactions', {
    method: 'PATCH',
    body: { id: args.id, isFavorite: args.isFavorite },
  })) as { success: true; isFavorite: boolean }
}

export async function deleteReaction(args: {
  id: string
}): Promise<{ message: string }> {
  return (await aiPhotosFetch(`/api/reactions/${encodeURIComponent(args.id)}`, {
    method: 'DELETE',
  })) as { message: string }
}
