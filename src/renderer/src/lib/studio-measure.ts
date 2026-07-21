import { effectiveLayerOrder, renderStudioDoc, type StudioDoc } from './studio'

/**
 * Where each layer actually lands.
 *
 * Positions in a document are anchors and offsets, not boxes — a title's
 * on-canvas rectangle depends on its text, face, size, line spacing and
 * alignment. Without this, placing anything relative to anything else is
 * guesswork: you render, look, nudge, repeat. That loop was the single largest
 * cost in composing a design, so measurement exists to replace it.
 *
 * Boxes are measured from the rendered pixels rather than recomputed from the
 * layout maths. That is slower, but it cannot drift out of sync with the
 * renderer, and it accounts for effects — a rotated or echoed layer reports the
 * space it really occupies.
 */
export interface LayerBox {
  /** Primary key ('text', 'image', …) or an extra layer's id. */
  id: string
  x: number
  y: number
  width: number
  height: number
  /** Box centre, in the same canvas-centre-relative units layers are placed in. */
  centerX: number
  centerY: number
  /** True when the layer drew nothing (disabled, empty, or off-canvas). */
  empty: boolean
}

export interface DocMeasurement {
  canvas: { width: number; height: number }
  /** Suggested inner rectangle, from the title's safe zone. */
  safeArea: { x: number; y: number; width: number; height: number }
  layers: LayerBox[]
}

const PRIMARIES = ['logo', 'border', 'image', 'shape', 'text', 'icon'] as const

/**
 * A document in which only `id` can draw.
 *
 * Setting `layerOrder: [id]` is NOT enough: `effectiveLayerOrder` is
 * deliberately self-healing and puts every missing primary back, so a
 * "one layer" render quietly drew the whole composition and every box came
 * back as the bounds of the entire design. Exclusion has to go through
 * `removedPrimaries`, which that function actually honours, plus emptying the
 * extras.
 */
export function isolate(doc: StudioDoc, id: string): StudioDoc {
  const isPrimary = (PRIMARIES as readonly string[]).includes(id)
  const keepExtra = <T extends { id: string }>(list: T[] | undefined): T[] =>
    (list ?? []).filter((e) => e.id === id)
  return {
    ...doc,
    canvas: { ...doc.canvas, bg: 'transparent', pattern: { ...doc.canvas.pattern, enabled: false } },
    layers: { ...doc.layers, canvasBg: false },
    removedPrimaries: PRIMARIES.filter((p) => p !== id),
    layerOrder: isPrimary ? [id] : [],
    extraTexts: keepExtra(doc.extraTexts),
    extraShapes: keepExtra(doc.extraShapes),
    extraIcons: keepExtra(doc.extraIcons),
    extraImages: keepExtra(doc.extraImages),
    extraBorders: keepExtra(doc.extraBorders),
    extraLogos: keepExtra(doc.extraLogos),
    canvasFx: undefined,
    canvasGrade: undefined,
  }
}

/** Tight bounding box of the non-transparent pixels on a canvas. */
function opaqueBounds(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): { x: number; y: number; width: number; height: number } | null {
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    return null
  }
  const px = data.data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Ignore near-transparent pixels so a soft shadow doesn't inflate the box.
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * Measure every layer by rendering each one alone and reading its extent.
 *
 * Downscaled: a box only needs to be accurate to a few pixels to place things
 * by, and measuring a 1920×1080 document layer by layer at full resolution is
 * far slower than it needs to be.
 */
export function measureLayer(doc: StudioDoc, id: string, sampleWidth = 640): LayerBox {
  const { width, height } = doc.canvas
  const scale = Math.min(1, sampleWidth / Math.max(1, width))
  const sw = Math.max(1, Math.round(width * scale))
  const sh = Math.max(1, Math.round(height * scale))
  const empty: LayerBox = { id, x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0, empty: true }

  const off = document.createElement('canvas')
  off.width = sw
  off.height = sh
  const ctx = off.getContext('2d', { willReadFrequently: true })
  if (!ctx) return empty
  ctx.scale(scale, scale)
  renderStudioDoc(ctx, isolate(doc, id))
  const b = opaqueBounds(ctx, sw, sh)
  if (!b) return empty

  const x = Math.round(b.x / scale)
  const y = Math.round(b.y / scale)
  const w = Math.round(b.width / scale)
  const h = Math.round(b.height / scale)
  return {
    id,
    x,
    y,
    width: w,
    height: h,
    centerX: Math.round(x + w / 2 - width / 2),
    centerY: Math.round(y + h / 2 - height / 2),
    empty: false,
  }
}

export function measureDoc(doc: StudioDoc, sampleWidth = 640): DocMeasurement {
  const { width, height } = doc.canvas
  const layers: LayerBox[] = effectiveLayerOrder(doc).map((id) =>
    measureLayer(doc, id, sampleWidth),
  )

  const safe = Math.max(0, doc.align?.safeZone ?? 0)
  return {
    canvas: { width, height },
    safeArea: {
      x: safe,
      y: safe,
      width: Math.max(0, width - safe * 2),
      height: Math.max(0, height - safe * 2),
    },
    layers,
  }
}

/* ── Anchors ───────────────────────────────────────────────────────────── */

export type AnchorEdge =
  | 'left' | 'right' | 'top' | 'bottom' | 'center'
  | 'below' | 'above' | 'left-of' | 'right-of'

/**
 * Place a layer relative to another layer or to the canvas, instead of by
 * absolute coordinate.
 *
 * `to` is a layer id or `'canvas'`. `edge` says how to relate to it: the side
 * alignments line the two up, while `below` / `above` / `left-of` / `right-of`
 * stack them with `gap` between.
 */
export interface Anchor {
  to: string
  edge: AnchorEdge
  gap?: number
  /** Nudge applied after the anchor resolves. */
  offsetX?: number
  offsetY?: number
}

/**
 * Resolve an anchor into the centre-relative x/y a layer field expects.
 * `self` is the size of the layer being placed, so it can be aligned by edge
 * rather than by centre.
 */
export function resolveAnchor(
  m: DocMeasurement,
  anchor: Anchor,
  self: { width: number; height: number },
): { x: number; y: number } {
  const halfW = m.canvas.width / 2
  const halfH = m.canvas.height / 2
  const target =
    anchor.to === 'canvas'
      ? { x: 0, y: 0, width: m.canvas.width, height: m.canvas.height, centerX: 0, centerY: 0, id: 'canvas', empty: false }
      : m.layers.find((l) => l.id === anchor.to)
  if (!target || target.empty) return { x: anchor.offsetX ?? 0, y: anchor.offsetY ?? 0 }

  const gap = anchor.gap ?? 0
  // Target edges in centre-relative units.
  const tLeft = target.x - halfW
  const tRight = target.x + target.width - halfW
  const tTop = target.y - halfH
  const tBottom = target.y + target.height - halfH

  let x = target.centerX
  let y = target.centerY
  switch (anchor.edge) {
    case 'left':
      x = tLeft + self.width / 2
      break
    case 'right':
      x = tRight - self.width / 2
      break
    case 'top':
      y = tTop + self.height / 2
      break
    case 'bottom':
      y = tBottom - self.height / 2
      break
    case 'below':
      y = tBottom + gap + self.height / 2
      break
    case 'above':
      y = tTop - gap - self.height / 2
      break
    case 'right-of':
      x = tRight + gap + self.width / 2
      break
    case 'left-of':
      x = tLeft - gap - self.width / 2
      break
    case 'center':
    default:
      break
  }
  return { x: Math.round(x + (anchor.offsetX ?? 0)), y: Math.round(y + (anchor.offsetY ?? 0)) }
}
