import { renderStudioDoc, type StudioDoc } from './studio'
import { measureDoc, type DocMeasurement } from './studio-measure'

/**
 * Numeric vision: what an agent needs to *judge* a design without pulling the
 * pixels back.
 *
 * A rendered PNG round-trip is megabytes and still leaves the reader to
 * eyeball contrast and balance. These are the checks a thumbnail designer
 * actually performs, computed from the same renderer that draws the export:
 * is the text readable against what is really behind it, does it survive at
 * feed size, where is the visual weight, do layers collide, what is the
 * palette. Numbers first; fetch the image only when something looks wrong.
 */

export interface TextLegibility {
  id: string
  /** WCAG-style contrast ratio between the text colour and the pixels actually
   *  behind its box (1–21; ≥4.5 is comfortably readable). */
  contrast: number
  /** The text box's height when the whole design is shrunk to a 168px-wide
   *  feed tile — YouTube's smallest real display. <10px is unreadable. */
  heightAtFeedSize: number
  /** Convenience verdict from the two numbers above. */
  readable: boolean
}

export interface QuadrantBalance {
  /** Share of total visual weight per quadrant, 0–1, [TL, TR, BL, BR]. */
  quadrants: [number, number, number, number]
  /** Centre of visual mass, offset from canvas centre in -1…1 of half-size. */
  centerX: number
  centerY: number
}

export interface PaletteEntry {
  hex: string
  /** Fraction of canvas pixels within this colour bucket, 0–1. */
  share: number
}

export interface OverlapReport {
  a: string
  b: string
  /** Intersection area as a fraction of the smaller box, 0–1. */
  fraction: number
}

export interface DocAnalysis {
  measurement: DocMeasurement
  legibility: TextLegibility[]
  balance: QuadrantBalance
  palette: PaletteEntry[]
  overlaps: OverlapReport[]
  /** Layers whose box crosses the safe-zone margin. */
  safeAreaViolations: string[]
  /** Fraction of the canvas covered by any layer ink, 0–1 — a clutter proxy. */
  coverage: number
}

/* ── Colour math ───────────────────────────────────────────────────────── */

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of an sRGB colour. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG contrast ratio between two luminances (1–21). */
export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/* ── Pure pixel passes (testable against raw RGBA arrays) ──────────────── */

/** Mean luminance of the opaque pixels inside a box of an RGBA buffer. */
export function regionLuminance(
  px: Uint8ClampedArray,
  imgW: number,
  box: { x: number; y: number; width: number; height: number },
): number {
  let sum = 0
  let n = 0
  const x1 = Math.max(0, Math.floor(box.x))
  const y1 = Math.max(0, Math.floor(box.y))
  const x2 = Math.floor(box.x + box.width)
  const y2 = Math.floor(box.y + box.height)
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2 && (y * imgW + x) * 4 + 3 < px.length; x++) {
      const i = (y * imgW + x) * 4
      if (px[i + 3] < 8) continue
      sum += relativeLuminance(px[i], px[i + 1], px[i + 2])
      n++
    }
  }
  return n ? sum / n : 0
}

/**
 * Visual-weight distribution. Weight is each pixel's deviation from the mean
 * luminance — flat background contributes nothing, whatever stands out (bright
 * on dark or dark on bright) carries the mass, which matches where the eye
 * goes.
 */
export function visualBalance(px: Uint8ClampedArray, w: number, h: number): QuadrantBalance {
  const lum = new Float32Array(w * h)
  let mean = 0
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255
    lum[i] = relativeLuminance(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) * a
    mean += lum[i]
  }
  mean /= w * h
  const q: [number, number, number, number] = [0, 0, 0, 0]
  let total = 0
  let mx = 0
  let my = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wgt = Math.abs(lum[y * w + x] - mean)
      total += wgt
      mx += wgt * x
      my += wgt * y
      q[(y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1)] += wgt
    }
  }
  if (total === 0) return { quadrants: [0.25, 0.25, 0.25, 0.25], centerX: 0, centerY: 0 }
  return {
    quadrants: q.map((v) => v / total) as [number, number, number, number],
    centerX: (mx / total / w) * 2 - 1,
    centerY: (my / total / h) * 2 - 1,
  }
}

/** Dominant colours by 4-bit-per-channel histogram, top `count` buckets. */
export function dominantColors(px: Uint8ClampedArray, count = 5): PaletteEntry[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  let total = 0
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 8) continue
    total++
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4)
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    b.n++
    b.r += px[i]
    b.g += px[i + 1]
    b.b += px[i + 2]
    buckets.set(key, b)
  }
  if (!total) return []
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((b) => ({
      hex:
        '#' +
        [b.r / b.n, b.g / b.n, b.b / b.n]
          .map((v) => Math.round(v).toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase(),
      share: b.n / total,
    }))
}

/** Box-pair overlaps above `minFraction` of the smaller box. */
export function boxOverlaps(
  boxes: Array<{ id: string; x: number; y: number; width: number; height: number; empty: boolean }>,
  minFraction = 0.05,
): OverlapReport[] {
  const out: OverlapReport[] = []
  const real = boxes.filter((b) => !b.empty && b.width > 0 && b.height > 0)
  for (let i = 0; i < real.length; i++) {
    for (let j = i + 1; j < real.length; j++) {
      const a = real[i]
      const b = real[j]
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (w <= 0 || h <= 0) continue
      const frac = (w * h) / Math.min(a.width * a.height, b.width * b.height)
      if (frac >= minFraction) out.push({ a: a.id, b: b.id, fraction: Number(frac.toFixed(3)) })
    }
  }
  return out
}

/* ── The full analysis ─────────────────────────────────────────────────── */

/** Every text-ish layer with a configured fill colour, for legibility checks. */
function textLayers(doc: StudioDoc): Array<{ id: string; color: string }> {
  const out: Array<{ id: string; color: string }> = []
  if (doc.layers.text && doc.text.trim()) out.push({ id: 'text', color: doc.font.color })
  for (const t of doc.extraTexts ?? []) {
    if (t.enabled && t.text.trim()) out.push({ id: t.id, color: t.color })
  }
  return out
}

export function analyzeDoc(doc: StudioDoc, sampleWidth = 480): DocAnalysis {
  const { width, height } = doc.canvas
  const scale = Math.min(1, sampleWidth / Math.max(1, width))
  const sw = Math.max(1, Math.round(width * scale))
  const sh = Math.max(1, Math.round(height * scale))

  const composite = document.createElement('canvas')
  composite.width = sw
  composite.height = sh
  const cctx = composite.getContext('2d', { willReadFrequently: true })
  if (!cctx) throw new Error('canvas 2d unavailable')
  cctx.scale(scale, scale)
  renderStudioDoc(cctx, doc)
  const compPx = cctx.getImageData(0, 0, sw, sh).data

  const measurement = measureDoc(doc, sampleWidth)
  const byId = new Map(measurement.layers.map((l) => [l.id, l]))

  // Legibility: contrast of each text layer's colour against the composite
  // WITHOUT that layer — i.e. what is really behind the letters.
  const legibility: TextLegibility[] = []
  for (const t of textLayers(doc)) {
    const box = byId.get(t.id)
    const rgb = hexToRgb(t.color)
    if (!box || box.empty || !rgb) continue
    const behind = document.createElement('canvas')
    behind.width = sw
    behind.height = sh
    const bctx = behind.getContext('2d', { willReadFrequently: true })
    if (!bctx) continue
    bctx.scale(scale, scale)
    // Render everything except this layer: flip it off on a copy.
    const docWithout: StudioDoc =
      t.id === 'text'
        ? { ...doc, layers: { ...doc.layers, text: false } }
        : { ...doc, extraTexts: (doc.extraTexts ?? []).filter((e) => e.id !== t.id) }
    renderStudioDoc(bctx, docWithout)
    const bg = regionLuminance(
      bctx.getImageData(0, 0, sw, sh).data,
      sw,
      { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale },
    )
    const contrast = contrastRatio(relativeLuminance(rgb.r, rgb.g, rgb.b), bg)
    const heightAtFeedSize = (box.height / width) * 168
    legibility.push({
      id: t.id,
      contrast: Number(contrast.toFixed(2)),
      heightAtFeedSize: Number(heightAtFeedSize.toFixed(1)),
      readable: contrast >= 4.5 && heightAtFeedSize >= 10,
    })
  }

  // Coverage: how much of the frame carries any layer ink at all.
  let inked = 0
  const bgless = document.createElement('canvas')
  bgless.width = sw
  bgless.height = sh
  const gctx = bgless.getContext('2d', { willReadFrequently: true })
  if (gctx) {
    gctx.scale(scale, scale)
    renderStudioDoc(gctx, {
      ...doc,
      canvas: { ...doc.canvas, bg: 'transparent' },
      layers: { ...doc.layers, canvasBg: false },
    })
    const p = gctx.getImageData(0, 0, sw, sh).data
    for (let i = 3; i < p.length; i += 4) if (p[i] > 8) inked++
  }

  const safe = measurement.safeArea
  const safeAreaViolations = measurement.layers
    .filter((l) => !l.empty)
    .filter(
      (l) =>
        // Border and logo hug edges by design; flagging them would be noise.
        l.id !== 'border' &&
        l.id !== 'logo' &&
        (l.x < safe.x ||
          l.y < safe.y ||
          l.x + l.width > safe.x + safe.width ||
          l.y + l.height > safe.y + safe.height),
    )
    .map((l) => l.id)

  return {
    measurement,
    legibility,
    balance: visualBalance(compPx, sw, sh),
    palette: dominantColors(compPx),
    overlaps: boxOverlaps(measurement.layers.filter((l) => l.id !== 'border')),
    safeAreaViolations,
    coverage: Number((inked / (sw * sh)).toFixed(3)),
  }
}
