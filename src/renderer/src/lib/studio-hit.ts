import { effectiveLayerOrder, renderStudioDoc, type StudioDoc } from './studio'
import { isolate } from './studio-measure'

/**
 * Picking a layer by clicking the canvas, and moving it by dragging.
 *
 * Hit testing is done against rendered pixels rather than bounding boxes: a
 * headline's box is mostly empty space between the glyphs, and a cut-out
 * subject's box is mostly transparent, so a box test would select the wrong
 * layer for most clicks inside it. Rendering each layer alone and reading the
 * alpha at the point is slower but picks what the eye picks.
 */

/** Alpha above this counts as a hit — enough to ignore a soft shadow's tail. */
const HIT_ALPHA = 24

/**
 * The topmost layer whose pixels cover `(x, y)`, in document coordinates, or
 * null for a click on empty canvas.
 *
 * Sampled at reduced resolution: a click only needs to resolve which layer it
 * landed on, and rendering every layer of a 1920×1080 document at full size on
 * each click is far more work than that needs.
 */
export function hitTestDoc(
  doc: StudioDoc,
  x: number,
  y: number,
  sampleWidth = 640,
): string | null {
  const { width, height } = doc.canvas
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  const scale = Math.min(1, sampleWidth / Math.max(1, width))
  const sw = Math.max(1, Math.round(width * scale))
  const sh = Math.max(1, Math.round(height * scale))
  const sx = Math.min(sw - 1, Math.max(0, Math.round(x * scale)))
  const sy = Math.min(sh - 1, Math.max(0, Math.round(y * scale)))

  // effectiveLayerOrder is front-to-back, so the first hit is the topmost.
  for (const id of effectiveLayerOrder(doc)) {
    const off = document.createElement('canvas')
    off.width = sw
    off.height = sh
    const ctx = off.getContext('2d', { willReadFrequently: true })
    if (!ctx) continue
    ctx.scale(scale, scale)
    renderStudioDoc(ctx, isolate(doc, id))
    try {
      if (ctx.getImageData(sx, sy, 1, 1).data[3] > HIT_ALPHA) return id
    } catch {
      // Tainted canvas — treat as a miss rather than throwing out of a click.
      continue
    }
  }
  return null
}

/**
 * Where a layer's position lives.
 *
 * Layers do not agree on this: the title text moves via its alignment offset,
 * shapes and pictures carry a plain x/y, and a logo is pinned to a corner and
 * nudged from there. Dragging needs one answer, so the mapping lives here
 * instead of being spread through the pointer handlers.
 */
type PosField = { obj: 'doc' | 'extra'; key: string; xField: string; yField: string }

const PRIMARY_POS: Record<string, PosField> = {
  // The title has no x/y of its own — it is laid out from its alignment, and
  // the offset is the part a drag is allowed to change.
  text: { obj: 'doc', key: 'align', xField: 'offsetX', yField: 'offsetY' },
  shape: { obj: 'doc', key: 'shape', xField: 'x', yField: 'y' },
  image: { obj: 'doc', key: 'image', xField: 'x', yField: 'y' },
  logo: { obj: 'doc', key: 'logo', xField: 'offsetX', yField: 'offsetY' },
}

/** Extra-layer collections, and which fields hold their position. */
const EXTRA_POS: Array<{ list: string; xField: string; yField: string }> = [
  { list: 'extraTexts', xField: 'x', yField: 'y' },
  { list: 'extraShapes', xField: 'x', yField: 'y' },
  { list: 'extraIcons', xField: 'x', yField: 'y' },
  { list: 'extraImages', xField: 'x', yField: 'y' },
  { list: 'extraLogos', xField: 'offsetX', yField: 'offsetY' },
]

/**
 * Whether a layer can be dragged at all.
 *
 * The icon is anchored to the title text and the border is measured inward from
 * the canvas edges — neither has a free position, so dragging them would either
 * do nothing or silently change something else.
 */
export function canMoveLayer(doc: StudioDoc, id: string): boolean {
  if (PRIMARY_POS[id]) return true
  if (id === 'icon' || id === 'border') return false
  return EXTRA_POS.some((e) =>
    ((doc as unknown as Record<string, Array<{ id: string }>>)[e.list] ?? []).some(
      (item) => item.id === id,
    ),
  )
}

/** The layer's current position, in the units its fields use. */
export function layerPosition(doc: StudioDoc, id: string): { x: number; y: number } | null {
  const d = doc as unknown as Record<string, Record<string, number>>
  const p = PRIMARY_POS[id]
  if (p) {
    const owner = d[p.key]
    if (!owner) return null
    return { x: Number(owner[p.xField]) || 0, y: Number(owner[p.yField]) || 0 }
  }
  for (const e of EXTRA_POS) {
    const list = (doc as unknown as Record<string, Array<Record<string, unknown>>>)[e.list] ?? []
    const item = list.find((i) => i.id === id)
    if (item) return { x: Number(item[e.xField]) || 0, y: Number(item[e.yField]) || 0 }
  }
  return null
}

/** A copy of the document with `id` moved to an absolute position. */
export function setLayerPosition(doc: StudioDoc, id: string, x: number, y: number): StudioDoc {
  const nx = Math.round(x)
  const ny = Math.round(y)
  const p = PRIMARY_POS[id]
  if (p) {
    const owner = (doc as unknown as Record<string, Record<string, unknown>>)[p.key]
    if (!owner) return doc
    return { ...doc, [p.key]: { ...owner, [p.xField]: nx, [p.yField]: ny } } as StudioDoc
  }
  for (const e of EXTRA_POS) {
    const list = (doc as unknown as Record<string, Array<Record<string, unknown>>>)[e.list]
    if (!list?.some((i) => i.id === id)) continue
    return {
      ...doc,
      [e.list]: list.map((i) => (i.id === id ? { ...i, [e.xField]: nx, [e.yField]: ny } : i)),
    } as StudioDoc
  }
  return doc
}

/** A copy of the document with `id` shifted by a delta in canvas pixels. */
export function moveLayerBy(doc: StudioDoc, id: string, dx: number, dy: number): StudioDoc {
  const at = layerPosition(doc, id)
  if (!at) return doc
  return setLayerPosition(doc, id, at.x + dx, at.y + dy)
}
