/**
 * SmoothyStudio — canvas title designer, ported from the standalone
 * smoothystudio-desktop app (née BobbaStudio). This module owns the document
 * model, the pure canvas renderer (shared by the live preview and the
 * full-resolution PNG export), and localStorage persistence.
 *
 * Ported faithfully from the original canvas.js, with three known original
 * bugs fixed: (1) bullet/batch layout now honors the safe zone instead of a
 * hardcoded 100 px margin; (2) the background box accounts for line spacing;
 * (3) numeric fields accept a real 0 (the original's `|| default` reads turned
 * an explicit 0 back into the default).
 */

import {
  applyLayerEffects,
  isFxActive,
  isNeutralGrade,
  normalizeFx,
  type EffectColorGrade,
  type LayerEffects,
} from './studio-effects'

export * from './studio-effects'

/* ── Types ─────────────────────────────────────────────────────────────── */

export type StudioMode = 'single' | 'bullet' | 'batch' | 'split'
export type MaterialType = 'solid' | 'gradient' | 'glass'
export type GradientDir = 'vertical' | 'horizontal' | 'diagonal'
export type HAlign = 'left' | 'center' | 'right'
export type VAlign = 'top' | 'middle' | 'bottom'
export type PatternType = 'grid' | 'dots' | 'lines'
export type ShapeType = 'circle' | 'square' | 'triangle' | 'star' | 'hexagon'
export type IconPosition = 'left' | 'right' | 'above' | 'below'
export type CanvasBgMode = 'transparent' | 'solid' | 'gradient' | 'image'
export type FontWeight = 400 | 500 | 600 | 700

export interface EffectStroke {
  enabled: boolean
  width: number
  color: string
}
export interface EffectShadow {
  enabled: boolean
  blur: number
  x: number
  y: number
  color: string
}
export interface EffectGlow {
  enabled: boolean
  blur: number
  strength: number
  color: string
}
export interface EffectPattern {
  enabled: boolean
  type: PatternType
  size: number
  dotSize: number
  color: string
  opacity: number
  angle: number
}

/** A decorative shape's full style — shared by the single primary `shape` and
 *  each entry in `extraShapes`. */
export interface ShapeStyle {
  enabled: boolean
  name?: string
  type: ShapeType
  /** Legacy uniform dimension. Still the fallback when width/height are unset
   *  (so shapes saved before independent sizing keep their look). */
  size: number
  /** Independent width/height in px. When unset, both fall back to `size`. */
  width?: number
  height?: number
  /** Corner rounding for straight-edged shapes (square/triangle/hexagon/star);
   *  no effect on circle, which is already round. */
  cornerRadius: number
  x: number
  y: number
  color: string
  opacity: number
  stroke: EffectStroke
  shadow: EffectShadow
  glow: EffectGlow
  pattern: EffectPattern
  grade?: EffectColorGrade
  fx?: LayerEffects
}

/**
 * A standalone free-floating text layer added via the "+ Text" toolbar
 * button — independent of the primary title text and its mode system
 * (single/bullets/batch/split). Positioned as a pixel offset from canvas
 * center; no letter-spacing or material fills — just solid color.
 */
export interface ExtraTextItem {
  id: string
  enabled: boolean
  name?: string
  text: string
  x: number
  y: number
  fontFamily: string
  fontWeight: FontWeight
  italic: boolean
  size: number
  color: string
  align: HAlign
  opacity: number
  stroke: EffectStroke
  shadow: EffectShadow
  glow: EffectGlow
  grade?: EffectColorGrade
  fx?: LayerEffects
}

/** A standalone decorative shape added via the "+ Shape" toolbar button.
 *  Positioned as a pixel offset from canvas center (unlike the primary
 *  `shape`, which is anchored to the title text position). */
export type ExtraShapeItem = ShapeStyle & { id: string }

/** A standalone icon/logo added via the "+ Icon" toolbar button — independent
 *  of the primary `icon`, which is anchored relative to the title text.
 *  Positioned as a pixel offset from canvas center. */
export interface ExtraIconItem {
  id: string
  enabled: boolean
  name?: string
  dataUrl: string | null
  x: number
  y: number
  size: number
  opacity: number
  tint: string | null
  stroke: EffectStroke
  shadow: EffectShadow
  glow: EffectGlow
  grade?: EffectColorGrade
  fx?: LayerEffects
}

/** A user-uploaded picture — the primary `image` and every duplicated copy in
 *  `extraImages` share this shape (extras just add an `id`). Centered on the
 *  canvas, offset by x/y, with optional local background removal. */
export interface PictureStyle {
  enabled: boolean
  name?: string
  /** Currently displayed image (possibly background-removed). */
  dataUrl: string | null
  /** The untouched upload, kept so "Remove background" can be re-run or undone. */
  originalDataUrl: string | null
  bgRemoved: boolean
  x: number
  y: number
  /** Display width in px; height follows the source aspect ratio. */
  width: number
  opacity: number
  stroke: EffectStroke
  shadow: EffectShadow
  glow: EffectGlow
  /** Post-process feather applied to the cutout edge, 0–100. */
  bgRemovalEdgeSoftness: number
  grade?: EffectColorGrade
  fx?: LayerEffects
}

/** A standalone picture added by duplicating the primary picture. */
export type ExtraImageItem = PictureStyle & { id: string }

/** A frame drawn inward from the canvas edges — the primary `border` and every
 *  duplicated copy in `extraBorders` share this shape. The ring is the area
 *  between two rounded rectangles, so the outer and inner corners round
 *  independently. */
export interface BorderStyle {
  enabled: boolean
  name?: string
  /** Ring thickness in px, measured inward from the outer edge. */
  thickness: number
  /** Gap between the canvas edge and the frame's outer edge. */
  inset: number
  /** Corner rounding of the frame's outer edge, in px. */
  outerRadius: number
  /** Corner rounding of the frame's inner edge (the hole), in px. */
  innerRadius: number
  material: 'solid' | 'gradient'
  color: string
  gradientColor2: string
  gradientDirection: GradientDir
  opacity: number
  shadow: EffectShadow
  glow: EffectGlow
  pattern: EffectPattern
  grade?: EffectColorGrade
  fx?: LayerEffects
}

/** A standalone frame added via the "+ Border" toolbar button or by duplicating
 *  the primary border — nest several for a double/triple frame. */
export type ExtraBorderItem = BorderStyle & { id: string }

export type LogoCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** A watermark pinned to one corner of the canvas. Unlike the icon layer (which
 *  is anchored to the title text) a logo hugs the canvas edge, so it stays put
 *  no matter how the title is laid out. Carries both an image and a text
 *  wordmark; `kind` picks which one renders. */
export interface LogoStyle {
  enabled: boolean
  name?: string
  kind: 'image' | 'text'
  corner: LogoCorner
  /** Distance from the two canvas edges the logo hugs. */
  margin: number
  /** Fine nudge away from the anchored corner, in px. */
  offsetX: number
  offsetY: number
  /** Image height in px (width follows the source aspect), or font size for a
   *  text wordmark. */
  size: number
  opacity: number
  dataUrl: string | null
  /** Recolors an image logo to a flat color — handy for a mono watermark. */
  tint: string | null
  text: string
  fontFamily: string
  fontWeight: 400 | 500 | 600 | 700
  italic: boolean
  color: string
  stroke: EffectStroke
  shadow: EffectShadow
  glow: EffectGlow
  grade?: EffectColorGrade
  fx?: LayerEffects
}

/** A standalone logo added via the "+ Logo" toolbar button or by duplicating
 *  the primary logo — e.g. a mark in one corner and a handle in another. */
export type ExtraLogoItem = LogoStyle & { id: string }

export interface StudioDoc {
  canvas: {
    width: number
    height: number
    bg: CanvasBgMode
    bgColor: string
    gradientColor2: string
    gradientDirection: GradientDir
    imageDataUrl: string | null
    imageZoom: number
    imageX: number
    imageY: number
    filterBlur: number
    filterBrightness: number
    filterSaturation: number
    filterContrast: number
    pattern: EffectPattern
  }
  mode: StudioMode
  text: string
  bullets: string[]
  batchText: string
  selectedBatchIndex: number
  split: { left: string; center: string; right: string }
  font: {
    family: string
    weight: FontWeight
    italic: boolean
    size: number
    color: string
  }
  material: {
    type: MaterialType
    gradientColor1: string
    gradientColor2: string
    gradientDirection: GradientDir
    glassOpacity: number
  }
  align: { h: HAlign; v: VAlign; safeZone: number; offsetX: number; offsetY: number }
  spacing: { letter: number; line: number; word: number }
  shadow: EffectShadow
  glow: EffectGlow
  stroke: EffectStroke
  box: {
    enabled: boolean
    material: MaterialType
    color: string
    opacity: number
    gradientColor2: string
    gradientDirection: GradientDir
    paddingX: number
    paddingY: number
    radius: number
    offsetX: number
    offsetY: number
    stroke: EffectStroke
    shadow: EffectShadow
  }
  /** The text item's own pattern effect (fills the glyph silhouette). */
  pattern: EffectPattern
  shape: ShapeStyle
  icon: {
    enabled: boolean
    dataUrl: string | null
    position: IconPosition
    size: number
    gap: number
    tint: string | null
    stroke: EffectStroke
    shadow: EffectShadow
    glow: EffectGlow
    pattern: EffectPattern
    grade?: EffectColorGrade
    fx?: LayerEffects
  }
  /** A user-uploaded picture — independent of the canvas background and the
   *  text-anchored icon. Centered on the canvas, offset by x/y. */
  image: PictureStyle
  /** A frame inset from the canvas edges. */
  border: BorderStyle
  /** A watermark pinned to a canvas corner. */
  logo: LogoStyle
  /** Free-floating layers added via the "+ Text" / "+ Shape" / "+ Icon" toolbar
   *  buttons or by duplicating a primary item — any number of each, independent
   *  of the single primary text/shape/icon/picture above. */
  extraTexts: ExtraTextItem[]
  extraShapes: ExtraShapeItem[]
  extraIcons: ExtraIconItem[]
  extraImages: ExtraImageItem[]
  extraBorders: ExtraBorderItem[]
  extraLogos: ExtraLogoItem[]
  /** User-customizable display names for the primary item cards. */
  labels: {
    text?: string
    shape?: string
    icon?: string
    image?: string
    border?: string
    logo?: string
  }
  layers: {
    canvasBg: boolean
    shape: boolean
    box: boolean
    text: boolean
    icon: boolean
    image: boolean
    border: boolean
    logo: boolean
  }
  layerOrder: string[]
  /** Color grade for the primary title text (the other layers carry their own
   *  `grade` inside their style object). */
  grade?: EffectColorGrade
  fx?: LayerEffects
  /** Primary kinds the user deleted outright. They stay out of the layer stack
   *  (and out of the sidebar) until re-added from the toolbar, which restores
   *  the kind at its factory defaults. */
  removedPrimaries?: string[]
}

/* ── Presets & fonts ───────────────────────────────────────────────────── */

export interface CanvasPreset {
  id: string
  label: string
  width: number
  height: number
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: '1080p', label: '1080p — 1920 × 1080', width: 1920, height: 1080 },
  { id: '4k', label: '4K — 3840 × 2160', width: 3840, height: 2160 },
  { id: 'vertical', label: 'Vertical — 1080 × 1920', width: 1080, height: 1920 },
  { id: 'square', label: 'Square — 1080 × 1080', width: 1080, height: 1080 },
  { id: '720p', label: '720p — 1280 × 720', width: 1280, height: 720 },
]

export const DEFAULT_FONTS: string[] = [
  'SF Pro Display',
  'Helvetica Neue',
  'Arial',
  'Arial Black',
  'American Typewriter',
  'Avenir Next',
  'Baskerville',
  'Bodoni 72',
  'Chalkboard SE',
  'Copperplate',
  'Courier New',
  'DIN Alternate',
  'DIN Condensed',
  'Futura',
  'Georgia',
  'Gill Sans',
  'Impact',
  'Marker Felt',
  'Menlo',
  'Optima',
  'Palatino',
  'Phosphate',
  'Rockwell',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]

/** Fresh, disabled pattern effect — shared default for text/shape/icon/canvas. */
function defaultPattern(): EffectPattern {
  return { enabled: false, type: 'grid', size: 60, dotSize: 4, color: '#FFFFFF', opacity: 20, angle: 0 }
}

export function defaultStudioDoc(): StudioDoc {
  return {
    canvas: {
      width: 1920,
      height: 1080,
      bg: 'transparent',
      bgColor: '#000000',
      gradientColor2: '#333333',
      gradientDirection: 'vertical',
      imageDataUrl: null,
      imageZoom: 100,
      imageX: 0,
      imageY: 0,
      filterBlur: 0,
      filterBrightness: 100,
      filterSaturation: 100,
      filterContrast: 100,
      pattern: defaultPattern(),
    },
    mode: 'single',
    text: 'Your Title',
    bullets: ['First point', 'Second point', 'Third point'],
    batchText: 'Episode 1\nEpisode 2\nEpisode 3',
    selectedBatchIndex: 0,
    split: { left: 'Left', center: 'Center', right: 'Right' },
    font: { family: 'SF Pro Display', weight: 700, italic: false, size: 120, color: '#FFFFFF' },
    material: {
      type: 'solid',
      gradientColor1: '#FFFFFF',
      gradientColor2: '#2DD4BF',
      gradientDirection: 'vertical',
      glassOpacity: 40,
    },
    align: { h: 'center', v: 'middle', safeZone: 100, offsetX: 0, offsetY: 0 },
    spacing: { letter: 0, line: 0, word: 0 },
    shadow: { enabled: true, blur: 24, x: 0, y: 8, color: '#000000' },
    glow: { enabled: false, blur: 20, strength: 3, color: '#2DD4BF' },
    stroke: { enabled: false, width: 4, color: '#000000' },
    box: {
      enabled: false,
      material: 'solid',
      color: '#000000',
      opacity: 70,
      gradientColor2: '#333333',
      gradientDirection: 'vertical',
      paddingX: 48,
      paddingY: 24,
      radius: 16,
      offsetX: 0,
      offsetY: 0,
      stroke: { enabled: false, width: 4, color: '#FFFFFF' },
      shadow: { enabled: false, blur: 20, x: 0, y: 8, color: '#000000' },
    },
    pattern: defaultPattern(),
    shape: {
      enabled: false,
      type: 'circle',
      size: 320,
      cornerRadius: 0,
      x: 0,
      y: 0,
      color: '#2DD4BF',
      opacity: 100,
      stroke: { enabled: false, width: 4, color: '#000000' },
      shadow: { enabled: false, blur: 20, x: 0, y: 8, color: '#000000' },
      glow: { enabled: false, blur: 20, strength: 3, color: '#FFFFFF' },
      pattern: defaultPattern(),
    },
    icon: {
      enabled: false,
      dataUrl: null,
      position: 'left',
      size: 100,
      gap: 24,
      tint: null,
      stroke: { enabled: false, width: 4, color: '#000000' },
      shadow: { enabled: false, blur: 10, x: 4, y: 4, color: '#000000' },
      glow: { enabled: false, blur: 20, strength: 3, color: '#2DD4BF' },
      pattern: defaultPattern(),
    },
    image: {
      enabled: false,
      dataUrl: null,
      originalDataUrl: null,
      bgRemoved: false,
      x: 0,
      y: 0,
      width: 600,
      opacity: 100,
      stroke: { enabled: false, width: 4, color: '#000000' },
      shadow: { enabled: false, blur: 20, x: 0, y: 8, color: '#000000' },
      glow: { enabled: false, blur: 20, strength: 3, color: '#2DD4BF' },
      bgRemovalEdgeSoftness: 0,
    },
    border: {
      enabled: false,
      thickness: 24,
      inset: 0,
      outerRadius: 0,
      innerRadius: 0,
      material: 'solid',
      color: '#FFFFFF',
      gradientColor2: '#2DD4BF',
      gradientDirection: 'vertical',
      opacity: 100,
      shadow: { enabled: false, blur: 20, x: 0, y: 8, color: '#000000' },
      glow: { enabled: false, blur: 20, strength: 3, color: '#2DD4BF' },
      pattern: defaultPattern(),
    },
    logo: {
      enabled: false,
      kind: 'image',
      corner: 'bottom-right',
      margin: 64,
      offsetX: 0,
      offsetY: 0,
      size: 120,
      opacity: 100,
      dataUrl: null,
      tint: null,
      text: 'Your brand',
      fontFamily: 'SF Pro Display',
      fontWeight: 600,
      italic: false,
      color: '#FFFFFF',
      stroke: { enabled: false, width: 4, color: '#000000' },
      shadow: { enabled: false, blur: 12, x: 0, y: 4, color: '#000000' },
      glow: { enabled: false, blur: 20, strength: 3, color: '#2DD4BF' },
    },
    extraTexts: [],
    extraShapes: [],
    extraIcons: [],
    extraImages: [],
    extraBorders: [],
    extraLogos: [],
    labels: {},
    layers: {
      canvasBg: true,
      shape: true,
      box: true,
      text: true,
      icon: true,
      image: true,
      border: true,
      logo: true,
    },
    layerOrder: ['logo', 'border', 'image', 'shape', 'text', 'icon'],
    removedPrimaries: [],
  }
}

/** A fresh standalone text layer, dropped at canvas center. */
export function newExtraText(): ExtraTextItem {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    text: 'Text',
    x: 0,
    y: 0,
    fontFamily: 'SF Pro Display',
    fontWeight: 700,
    italic: false,
    size: 80,
    color: '#FFFFFF',
    align: 'center',
    opacity: 100,
    stroke: { enabled: false, width: 4, color: '#000000' },
    shadow: { enabled: true, blur: 16, x: 0, y: 4, color: '#000000' },
    glow: { enabled: false, blur: 20, strength: 3, color: '#FFFFFF' },
  }
}

/** A fresh standalone decorative shape, dropped at canvas center. */
export function newExtraShape(): ExtraShapeItem {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    type: 'circle',
    size: 200,
    cornerRadius: 0,
    x: 0,
    y: 0,
    color: '#2DD4BF',
    opacity: 100,
    stroke: { enabled: false, width: 4, color: '#000000' },
    shadow: { enabled: false, blur: 20, x: 0, y: 8, color: '#000000' },
    glow: { enabled: false, blur: 20, strength: 3, color: '#FFFFFF' },
    pattern: defaultPattern(),
  }
}

/** A fresh standalone icon/logo, dropped at canvas center. `dataUrl` is
 *  filled in by the caller right after upload. */
export function newExtraIcon(): ExtraIconItem {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    dataUrl: null,
    x: 0,
    y: 0,
    size: 200,
    opacity: 100,
    tint: null,
    stroke: { enabled: false, width: 4, color: '#000000' },
    shadow: { enabled: false, blur: 10, x: 4, y: 4, color: '#000000' },
    glow: { enabled: false, blur: 20, strength: 3, color: '#2DD4BF' },
  }
}

/* ── Color helpers ─────────────────────────────────────────────────────── */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { r: 255, g: 255, b: 255 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

function gradientForBounds(
  ctx: CanvasRenderingContext2D,
  dir: GradientDir,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  c1: string,
  c2: string,
): CanvasGradient {
  let g: CanvasGradient
  if (dir === 'horizontal') g = ctx.createLinearGradient(x1, y1, x2, y1)
  else if (dir === 'diagonal') g = ctx.createLinearGradient(x1, y1, x2, y2)
  else g = ctx.createLinearGradient(x1, y1, x1, y2)
  g.addColorStop(0, c1)
  g.addColorStop(1, c2)
  return g
}

/* ── Image cache (canvas bg + icon) ────────────────────────────────────── */

const imageCache = new Map<string, HTMLImageElement>()

export function getCachedImage(url: string | null): HTMLImageElement | null {
  if (!url) return null
  const img = imageCache.get(url)
  return img && img.complete && img.naturalWidth > 0 ? img : null
}

/** Preload an image URL into the cache; calls onLoad when ready (or immediately
 *  if already cached). Used by the view to trigger a re-render on load. */
export function preloadImage(url: string | null, onLoad?: () => void): void {
  if (!url) return
  const existing = imageCache.get(url)
  if (existing) {
    if (existing.complete && existing.naturalWidth > 0) onLoad?.()
    return
  }
  const img = new Image()
  img.onload = () => onLoad?.()
  img.src = url
  imageCache.set(url, img)
}

/* ── Font string ───────────────────────────────────────────────────────── */

function fontString(doc: StudioDoc): string {
  const style = doc.font.italic ? 'italic ' : ''
  return `${style}${doc.font.weight} ${doc.font.size}px "${doc.font.family}", sans-serif`
}

/* ── Geometry helpers ──────────────────────────────────────────────────── */

/** Append a rounded rect to the current path — no beginPath, so several can be
 *  combined into one path (e.g. the two rects that bound a border ring). */
function roundRectSubPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  roundRectSubPath(ctx, x, y, w, h, r)
}

/* ── Canvas background ─────────────────────────────────────────────────── */

function drawCanvasBg(ctx: CanvasRenderingContext2D, doc: StudioDoc): void {
  const { width, height } = doc.canvas
  const c = doc.canvas
  if (c.bg === 'solid') {
    ctx.fillStyle = c.bgColor
    ctx.fillRect(0, 0, width, height)
  } else if (c.bg === 'gradient') {
    ctx.fillStyle = gradientForBounds(
      ctx,
      c.gradientDirection,
      0,
      0,
      width,
      height,
      c.bgColor,
      c.gradientColor2,
    )
    ctx.fillRect(0, 0, width, height)
  } else if (c.bg === 'image') {
    const img = getCachedImage(c.imageDataUrl)
    if (!img) {
      // Not yet loaded — leave transparent; the view re-renders on load.
      return
    }
    const zoom = c.imageZoom / 100
    const imgAspect = img.naturalWidth / img.naturalHeight
    const canvasAspect = width / height
    let drawW: number
    let drawH: number
    if (imgAspect > canvasAspect) {
      drawH = height * zoom
      drawW = drawH * imgAspect
    } else {
      drawW = width * zoom
      drawH = drawW / imgAspect
    }
    const drawX = (width - drawW) / 2 + c.imageX
    const drawY = (height - drawH) / 2 + c.imageY
    const hasFilter =
      c.filterBlur !== 0 ||
      c.filterBrightness !== 100 ||
      c.filterSaturation !== 100 ||
      c.filterContrast !== 100
    if (hasFilter) {
      ctx.save()
      ctx.filter = `blur(${c.filterBlur}px) brightness(${c.filterBrightness}%) saturate(${c.filterSaturation}%) contrast(${c.filterContrast}%)`
      ctx.drawImage(img, drawX, drawY, drawW, drawH)
      ctx.restore()
    } else {
      ctx.drawImage(img, drawX, drawY, drawW, drawH)
    }
  }
}

/* ── Pattern overlay ───────────────────────────────────────────────────── */

/**
 * Paint a pattern effect across a `width` × `height` region in `ctx`'s own
 * coordinate space. Shared by every item — text, shape, icon, and canvas
 * background all resolve to this same tile math so patterns line up.
 */
function drawPatternRaw(ctx: CanvasRenderingContext2D, p: EffectPattern, width: number, height: number): void {
  const size = Math.max(4, p.size)
  ctx.save()
  ctx.globalAlpha = p.opacity / 100
  ctx.strokeStyle = p.color
  ctx.fillStyle = p.color
  ctx.lineWidth = Math.max(1, Math.round(width / 1000))
  if (p.type === 'dots') {
    const r = Math.max(1, p.dotSize)
    for (let x = size / 2; x < width; x += size) {
      for (let y = size / 2; y < height; y += size) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else if (p.type === 'lines') {
    ctx.translate(width / 2, height / 2)
    ctx.rotate((p.angle * Math.PI) / 180)
    ctx.translate(-width / 2, -height / 2)
    const diagonal = Math.sqrt(width * width + height * height)
    for (let x = -diagonal / 2; x < diagonal * 1.5; x += size) {
      ctx.beginPath()
      ctx.moveTo(x, -diagonal)
      ctx.lineTo(x, diagonal * 2)
      ctx.stroke()
    }
  } else {
    // grid
    for (let x = 0; x <= width; x += size) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y += size) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * Paint a pattern effect masked to an arbitrary silhouette — used to fill
 * text glyphs, a decorative shape, or an icon with a pattern texture rather
 * than a flat color. `drawSilhouette` paints opaque pixels (any color) onto
 * the scratch context wherever the item itself is visible; the pattern is
 * then composited in with `source-in` so it only shows through those pixels.
 */
function drawPatternMasked(
  ctx: CanvasRenderingContext2D,
  pattern: EffectPattern,
  width: number,
  height: number,
  drawSilhouette: (maskCtx: CanvasRenderingContext2D) => void,
): void {
  if (!pattern.enabled) return
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))

  // Build the silhouette and the pattern as two independent, fully-formed
  // layers first — `drawPatternRaw` paints its tiles as several separate
  // stroke/fill calls, so compositing with `source-in` DURING those calls
  // would re-intersect (and wipe out) the mask after every single tile.
  // Combining two finished layers with one `source-in` draw avoids that.
  const mask = document.createElement('canvas')
  mask.width = w
  mask.height = h
  const maskCtx = mask.getContext('2d')
  if (!maskCtx) return
  drawSilhouette(maskCtx)

  const tile = document.createElement('canvas')
  tile.width = w
  tile.height = h
  const tileCtx = tile.getContext('2d')
  if (!tileCtx) return
  drawPatternRaw(tileCtx, pattern, width, height)

  maskCtx.globalCompositeOperation = 'source-in'
  maskCtx.drawImage(tile, 0, 0)

  ctx.save()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.drawImage(mask, 0, 0)
  ctx.restore()
}

/* ── Decorative shape ──────────────────────────────────────────────────── */

/**
 * Trace a closed polygon with each corner rounded to `radius`, using the
 * standard `arcTo` trick: an `arcTo` at each vertex draws a tangent arc
 * between the incoming and outgoing edges instead of a sharp point.
 *
 * The path must start ON an edge, not at a raw vertex — `arcTo`'s "current
 * point" needs to already lie on the incoming line for the tangent math to
 * work, and if the path starts at a sharp vertex, the final `closePath()`
 * draws a stray straight line from wherever the last rounded corner's arc
 * left off back to that sharp vertex (a visible diagonal cutting across the
 * shape). Starting at the midpoint of the first edge sidesteps this: the
 * last arc in the loop rounds that same corner and ends back on that edge,
 * so `closePath()`'s implicit segment is collinear with it — invisible.
 */
function roundedPolygonPath(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  radius: number,
): void {
  const n = points.length
  ctx.beginPath()
  if (radius <= 0 || n < 3) {
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.closePath()
    return
  }
  // Clamp so the rounding on any vertex can't overrun half of either
  // adjacent edge (which would otherwise distort or invert the corner).
  let r = radius
  for (let i = 0; i < n; i++) {
    const curr = points[i]
    const next = points[(i + 1) % n]
    r = Math.min(r, Math.hypot(next.x - curr.x, next.y - curr.y) / 2)
  }
  const first = points[0]
  const second = points[1]
  ctx.moveTo((first.x + second.x) / 2, (first.y + second.y) / 2)
  for (let i = 1; i <= n; i++) {
    const curr = points[i % n]
    const next = points[(i + 1) % n]
    ctx.arcTo(curr.x, curr.y, next.x, next.y, r)
  }
  ctx.closePath()
}

function shapePath(
  ctx: CanvasRenderingContext2D,
  type: ShapeType,
  cx: number,
  cy: number,
  width: number,
  height: number,
  cornerRadius = 0,
): void {
  const rx = width / 2
  const ry = height / 2
  if (type === 'square') {
    roundedPolygonPath(
      ctx,
      [
        { x: cx - rx, y: cy - ry },
        { x: cx + rx, y: cy - ry },
        { x: cx + rx, y: cy + ry },
        { x: cx - rx, y: cy + ry },
      ],
      cornerRadius,
    )
  } else if (type === 'triangle') {
    roundedPolygonPath(
      ctx,
      [
        { x: cx, y: cy - ry },
        { x: cx + rx, y: cy + ry },
        { x: cx - rx, y: cy + ry },
      ],
      cornerRadius,
    )
  } else if (type === 'star') {
    // Points sit on concentric ellipses (outer = full radius, inner = half),
    // so a non-square width/height stretches the star instead of clipping it.
    const inner = 0.5
    let rot = (3 * Math.PI) / 2
    const step = Math.PI / 5
    const points: Array<{ x: number; y: number }> = [
      { x: cx + Math.cos(rot) * rx, y: cy + Math.sin(rot) * ry },
    ]
    for (let i = 0; i < 5; i++) {
      rot += step
      points.push({ x: cx + Math.cos(rot) * rx * inner, y: cy + Math.sin(rot) * ry * inner })
      rot += step
      points.push({ x: cx + Math.cos(rot) * rx, y: cy + Math.sin(rot) * ry })
    }
    roundedPolygonPath(ctx, points, cornerRadius)
  } else if (type === 'hexagon') {
    const points: Array<{ x: number; y: number }> = []
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2
      points.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
    }
    roundedPolygonPath(ctx, points, cornerRadius)
  } else {
    // circle → ellipse when width ≠ height
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  }
}

/** Effective width/height for a shape — independent dims when set, else the
 *  legacy uniform `size`. */
function shapeDims(s: ShapeStyle): { w: number; h: number } {
  return { w: s.width ?? s.size, h: s.height ?? s.size }
}

/** Draw one styled shape at (cx, cy). Shared by the primary `doc.shape` and
 *  every entry in `doc.extraShapes` — `canvasW`/`canvasH` are only needed to
 *  scale the pattern-fill tile. */
/* ── Border frame ──────────────────────────────────────────────────────── */

/** Geometry of a border ring: the outer rect (inset from the canvas edges) and
 *  the inner rect (the hole), each with its own corner radius. */
export function borderRingGeometry(
  b: BorderStyle,
  width: number,
  height: number,
): { ox: number; oy: number; ow: number; oh: number; ix: number; iy: number; iw: number; ih: number } | null {
  const inset = Math.max(0, b.inset)
  const ow = width - inset * 2
  const oh = height - inset * 2
  if (ow <= 0 || oh <= 0) return null
  // A thickness past half the frame collapses the hole — clamp so the ring
  // degenerates into a filled rect instead of inverting.
  const t = Math.max(0, Math.min(b.thickness, ow / 2, oh / 2))
  if (t <= 0) return null
  return {
    ox: inset,
    oy: inset,
    ow,
    oh,
    ix: inset + t,
    iy: inset + t,
    iw: ow - t * 2,
    ih: oh - t * 2,
  }
}

/** Trace the ring as one path: outer rounded rect + inner rounded rect. Filled
 *  with the even-odd rule so the inner rect punches the hole. */
function borderRingPath(ctx: CanvasRenderingContext2D, b: BorderStyle, width: number, height: number): boolean {
  const g = borderRingGeometry(b, width, height)
  if (!g) return false
  ctx.beginPath()
  roundRectSubPath(ctx, g.ox, g.oy, g.ow, g.oh, b.outerRadius)
  if (g.iw > 0 && g.ih > 0) roundRectSubPath(ctx, g.ix, g.iy, g.iw, g.ih, b.innerRadius)
  return true
}

function drawBorderStyled(
  ctx: CanvasRenderingContext2D,
  b: BorderStyle,
  width: number,
  height: number,
): void {
  const g = borderRingGeometry(b, width, height)
  if (!g) return
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, b.opacity / 100))
  if (b.glow.enabled) {
    ctx.save()
    ctx.shadowColor = b.glow.color
    ctx.shadowBlur = b.glow.blur
    ctx.fillStyle = b.glow.color
    for (let i = 0; i < b.glow.strength; i++) {
      if (borderRingPath(ctx, b, width, height)) ctx.fill('evenodd')
    }
    ctx.restore()
  }
  if (b.shadow.enabled) {
    ctx.shadowColor = b.shadow.color
    ctx.shadowBlur = b.shadow.blur
    ctx.shadowOffsetX = b.shadow.x
    ctx.shadowOffsetY = b.shadow.y
  }
  ctx.fillStyle =
    b.material === 'gradient'
      ? gradientForBounds(ctx, b.gradientDirection, g.ox, g.oy, g.ox + g.ow, g.oy + g.oh, b.color, b.gradientColor2)
      : b.color
  if (borderRingPath(ctx, b, width, height)) ctx.fill('evenodd')
  if (b.pattern.enabled) {
    drawPatternMasked(ctx, b.pattern, width, height, (maskCtx) => {
      maskCtx.fillStyle = '#000'
      if (borderRingPath(maskCtx, b, width, height)) maskCtx.fill('evenodd')
    })
  }
  ctx.restore()
}

/* ── Corner logo / watermark ───────────────────────────────────────────── */

/** Top-left of a `w × h` logo box hugging its chosen corner, after margin and
 *  the fine nudge. */
export function logoBox(
  l: LogoStyle,
  canvasW: number,
  canvasH: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const left = l.corner === 'top-left' || l.corner === 'bottom-left'
  const top = l.corner === 'top-left' || l.corner === 'top-right'
  return {
    x: (left ? l.margin : canvasW - l.margin - w) + l.offsetX,
    y: (top ? l.margin : canvasH - l.margin - h) + l.offsetY,
  }
}

export function logoFontString(l: LogoStyle): string {
  return `${l.italic ? 'italic ' : ''}${l.fontWeight} ${l.size}px "${l.fontFamily}", sans-serif`
}

function drawLogoStyled(
  ctx: CanvasRenderingContext2D,
  l: LogoStyle,
  canvasW: number,
  canvasH: number,
): void {
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, l.opacity / 100))

  if (l.kind === 'text') {
    const text = l.text.trim()
    if (!text) {
      ctx.restore()
      return
    }
    ctx.font = logoFontString(l)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const m = ctx.measureText(text)
    // Measure the real ink box so the wordmark hugs the corner tightly rather
    // than floating on the font's internal leading.
    const ascent = m.actualBoundingBoxAscent || l.size * 0.8
    const descent = m.actualBoundingBoxDescent || l.size * 0.2
    const { x, y } = logoBox(l, canvasW, canvasH, m.width, ascent + descent)
    const baseline = y + ascent

    if (l.glow.enabled) {
      ctx.save()
      ctx.shadowColor = l.glow.color
      ctx.shadowBlur = l.glow.blur
      ctx.fillStyle = l.glow.color
      for (let i = 0; i < l.glow.strength; i++) ctx.fillText(text, x, baseline)
      ctx.restore()
    }
    ctx.save()
    if (l.shadow.enabled) {
      ctx.shadowColor = l.shadow.color
      ctx.shadowBlur = l.shadow.blur
      ctx.shadowOffsetX = l.shadow.x
      ctx.shadowOffsetY = l.shadow.y
    }
    if (l.stroke.enabled) {
      ctx.lineJoin = 'round'
      ctx.strokeStyle = l.stroke.color
      ctx.lineWidth = l.stroke.width
      ctx.strokeText(text, x, baseline)
    }
    ctx.fillStyle = l.color
    ctx.fillText(text, x, baseline)
    ctx.restore()
    ctx.restore()
    return
  }

  const img = getCachedImage(l.dataUrl)
  if (!img) {
    ctx.restore()
    return
  }
  const h = Math.max(1, l.size)
  const w = h * (img.naturalWidth / img.naturalHeight)
  const { x, y } = logoBox(l, canvasW, canvasH, w, h)

  const silhouette = (color: string): HTMLCanvasElement | null => {
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.round(w))
    off.height = Math.max(1, Math.round(h))
    const octx = off.getContext('2d')
    if (!octx) return null
    octx.drawImage(img, 0, 0, off.width, off.height)
    octx.globalCompositeOperation = 'source-in'
    octx.fillStyle = color
    octx.fillRect(0, 0, off.width, off.height)
    return off
  }

  if (l.glow.enabled) {
    const glowImg = silhouette(l.glow.color)
    if (glowImg) {
      ctx.save()
      ctx.shadowColor = l.glow.color
      ctx.shadowBlur = l.glow.blur
      for (let p = 0; p < l.glow.strength; p++) ctx.drawImage(glowImg, x, y, w, h)
      ctx.restore()
    }
  }
  if (l.stroke.enabled) {
    const strokeImg = silhouette(l.stroke.color)
    if (strokeImg) {
      const r = l.stroke.width * 0.7
      for (let a = 0; a < 12; a++) {
        const angle = (a * Math.PI) / 6
        ctx.drawImage(strokeImg, x + Math.cos(angle) * r, y + Math.sin(angle) * r, w, h)
      }
    }
  }
  ctx.save()
  if (l.shadow.enabled) {
    ctx.shadowColor = l.shadow.color
    ctx.shadowBlur = l.shadow.blur
    ctx.shadowOffsetX = l.shadow.x
    ctx.shadowOffsetY = l.shadow.y
  }
  const tinted = l.tint ? silhouette(l.tint) : null
  if (tinted) ctx.drawImage(tinted, x, y, w, h)
  else ctx.drawImage(img, x, y, w, h)
  ctx.restore()
  ctx.restore()
}

function drawOneShapeStyled(
  ctx: CanvasRenderingContext2D,
  s: ShapeStyle,
  cx: number,
  cy: number,
  canvasW: number,
  canvasH: number,
): void {
  const { w, h } = shapeDims(s)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity / 100))
  // Glow
  if (s.glow.enabled) {
    ctx.save()
    ctx.shadowColor = s.glow.color
    ctx.shadowBlur = s.glow.blur
    ctx.fillStyle = s.glow.color
    for (let i = 0; i < s.glow.strength; i++) {
      shapePath(ctx, s.type, cx, cy, w, h, s.cornerRadius)
      ctx.fill()
    }
    ctx.restore()
  }
  if (s.shadow.enabled) {
    ctx.shadowColor = s.shadow.color
    ctx.shadowBlur = s.shadow.blur
    ctx.shadowOffsetX = s.shadow.x
    ctx.shadowOffsetY = s.shadow.y
  }
  ctx.fillStyle = s.color
  shapePath(ctx, s.type, cx, cy, w, h, s.cornerRadius)
  ctx.fill()
  if (s.pattern.enabled) {
    drawPatternMasked(ctx, s.pattern, canvasW, canvasH, (maskCtx) => {
      maskCtx.fillStyle = '#000'
      shapePath(maskCtx, s.type, cx, cy, w, h, s.cornerRadius)
      maskCtx.fill()
    })
  }
  if (s.stroke.enabled) {
    ctx.strokeStyle = s.stroke.color
    ctx.lineWidth = s.stroke.width
    shapePath(ctx, s.type, cx, cy, w, h, s.cornerRadius)
    ctx.stroke()
  }
  ctx.restore()
}

function drawOneShape(ctx: CanvasRenderingContext2D, doc: StudioDoc, cx: number, cy: number): void {
  drawOneShapeStyled(ctx, doc.shape, cx, cy, doc.canvas.width, doc.canvas.height)
}

function shapeAnchor(doc: StudioDoc): { x: number; y: number } {
  const { width, height } = doc.canvas
  const safe = doc.align.safeZone
  const fs = doc.font.size
  let x: number
  if (doc.align.h === 'left') x = safe
  else if (doc.align.h === 'right') x = width - safe
  else x = width / 2
  let y: number
  if (doc.align.v === 'top') y = safe + fs
  else if (doc.align.v === 'bottom') y = height - safe
  else y = height / 2
  return { x: x + doc.shape.x, y: y + doc.shape.y }
}

function drawShapes(ctx: CanvasRenderingContext2D, doc: StudioDoc): void {
  if (doc.mode === 'split') {
    const { width, height } = doc.canvas
    const safe = doc.align.safeZone
    const fs = doc.font.size
    let y: number
    if (doc.align.v === 'top') y = safe + fs
    else if (doc.align.v === 'bottom') y = height - safe
    else y = height / 2
    const leftX = (safe + width / 3) / 2
    const centerX = width / 2
    const rightX = (width * 2 / 3 + (width - safe)) / 2
    for (const cx of [leftX, centerX, rightX]) {
      drawOneShape(ctx, doc, cx + doc.shape.x, y + doc.shape.y)
    }
  } else {
    const { x, y } = shapeAnchor(doc)
    drawOneShape(ctx, doc, x, y)
  }
}

/* ── Picture (user-uploaded image, independent of canvas bg / icon) ────── */

function drawOneImage(
  ctx: CanvasRenderingContext2D,
  im: PictureStyle,
  canvasW: number,
  canvasH: number,
): void {
  const img = getCachedImage(im.dataUrl)
  if (!img) return
  const w = Math.max(1, im.width)
  const h = w * (img.naturalHeight / img.naturalWidth)
  const cx = canvasW / 2 + im.x
  const cy = canvasH / 2 + im.y
  const x = cx - w / 2
  const y = cy - h / 2

  // Colorized silhouette of the picture — used for glow and stroke, same
  // source-in stamping trick as the icon's silhouette (drawIcon, above).
  const silhouette = (color: string): HTMLCanvasElement | null => {
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.round(w))
    off.height = Math.max(1, Math.round(h))
    const octx = off.getContext('2d')
    if (!octx) return null
    octx.drawImage(img, 0, 0, off.width, off.height)
    octx.globalCompositeOperation = 'source-in'
    octx.fillStyle = color
    octx.fillRect(0, 0, off.width, off.height)
    return off
  }

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, im.opacity / 100))

  if (im.glow.enabled) {
    const glowImg = silhouette(im.glow.color)
    if (glowImg) {
      ctx.save()
      ctx.shadowColor = im.glow.color
      ctx.shadowBlur = im.glow.blur
      for (let p = 0; p < im.glow.strength; p++) ctx.drawImage(glowImg, x, y, w, h)
      ctx.restore()
    }
  }

  if (im.stroke.enabled) {
    const strokeImg = silhouette(im.stroke.color)
    if (strokeImg) {
      const r = im.stroke.width * 0.7
      for (let a = 0; a < 12; a++) {
        const angle = (a * Math.PI) / 6
        ctx.drawImage(strokeImg, x + Math.cos(angle) * r, y + Math.sin(angle) * r, w, h)
      }
    }
  }

  ctx.save()
  if (im.shadow.enabled) {
    ctx.shadowColor = im.shadow.color
    ctx.shadowBlur = im.shadow.blur
    ctx.shadowOffsetX = im.shadow.x
    ctx.shadowOffsetY = im.shadow.y
  }
  ctx.drawImage(img, x, y, w, h)
  ctx.restore()

  ctx.restore()
}

function drawPictureImage(ctx: CanvasRenderingContext2D, doc: StudioDoc): void {
  drawOneImage(ctx, doc.image, doc.canvas.width, doc.canvas.height)
}

/* ── Extra text layers (standalone, independent of the title text) ─────── */

function drawExtraText(ctx: CanvasRenderingContext2D, item: ExtraTextItem, canvasW: number, canvasH: number): void {
  if (item.opacity <= 0) return
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, item.opacity / 100))
  const style = item.italic ? 'italic ' : ''
  ctx.font = `${style}${item.fontWeight} ${item.size}px "${item.fontFamily}", sans-serif`
  ctx.textAlign = item.align
  ctx.textBaseline = 'middle'

  const cx = canvasW / 2 + item.x
  const cy = canvasH / 2 + item.y
  const lines = item.text.split('\n')
  const lineHeight = item.size * 1.2
  const startY = cy - (lineHeight * (lines.length - 1)) / 2

  if (item.glow.enabled) {
    ctx.save()
    ctx.shadowColor = item.glow.color
    ctx.shadowBlur = item.glow.blur
    ctx.fillStyle = item.glow.color
    for (let p = 0; p < item.glow.strength; p++) {
      lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight))
    }
    ctx.restore()
  }

  ctx.save()
  if (item.shadow.enabled) {
    ctx.shadowColor = item.shadow.color
    ctx.shadowBlur = item.shadow.blur
    ctx.shadowOffsetX = item.shadow.x
    ctx.shadowOffsetY = item.shadow.y
  }
  if (item.stroke.enabled) {
    ctx.strokeStyle = item.stroke.color
    ctx.lineWidth = item.stroke.width
    ctx.lineJoin = 'round'
    lines.forEach((line, i) => ctx.strokeText(line, cx, startY + i * lineHeight))
  }
  ctx.fillStyle = item.color
  lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight))
  ctx.restore()
  ctx.restore()
}

/* ── Extra icon/logo layers (standalone, independent of the title icon) ── */

function drawExtraIcon(ctx: CanvasRenderingContext2D, item: ExtraIconItem, canvasW: number, canvasH: number): void {
  const img = getCachedImage(item.dataUrl)
  if (!img) return
  const iconH = Math.max(1, item.size)
  const iconW = iconH * (img.naturalWidth / img.naturalHeight)
  const ix = canvasW / 2 + item.x - iconW / 2
  const iy = canvasH / 2 + item.y - iconH / 2

  // Colorized silhouette of the icon — used for glow, stroke, and tint.
  const silhouette = (color: string): HTMLCanvasElement | null => {
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.round(iconW))
    off.height = Math.max(1, Math.round(iconH))
    const octx = off.getContext('2d')
    if (!octx) return null
    octx.drawImage(img, 0, 0, off.width, off.height)
    octx.globalCompositeOperation = 'source-in'
    octx.fillStyle = color
    octx.fillRect(0, 0, off.width, off.height)
    return off
  }

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, item.opacity / 100))

  if (item.glow.enabled) {
    const glowImg = silhouette(item.glow.color)
    if (glowImg) {
      ctx.save()
      ctx.shadowColor = item.glow.color
      ctx.shadowBlur = item.glow.blur
      for (let p = 0; p < item.glow.strength; p++) ctx.drawImage(glowImg, ix, iy, iconW, iconH)
      ctx.restore()
    }
  }
  if (item.stroke.enabled) {
    const strokeImg = silhouette(item.stroke.color)
    if (strokeImg) {
      const r = item.stroke.width * 0.7
      for (let a = 0; a < 12; a++) {
        const angle = (a * Math.PI) / 6
        ctx.drawImage(strokeImg, ix + Math.cos(angle) * r, iy + Math.sin(angle) * r, iconW, iconH)
      }
    }
  }

  ctx.save()
  if (item.shadow.enabled) {
    ctx.shadowColor = item.shadow.color
    ctx.shadowBlur = item.shadow.blur
    ctx.shadowOffsetX = item.shadow.x
    ctx.shadowOffsetY = item.shadow.y
  }
  if (item.tint) {
    const tinted = silhouette(item.tint)
    if (tinted) ctx.drawImage(tinted, ix, iy, iconW, iconH)
  } else {
    ctx.drawImage(img, ix, iy, iconW, iconH)
  }
  ctx.restore()
  ctx.restore()
}

/* ── Text block (the core per-block renderer) ──────────────────────────── */

interface BlockOpts {
  /** Force horizontal alignment (split mode overrides the global align). */
  alignOverride?: HAlign
  /** Force the horizontal anchor X (split mode). */
  anchorXOverride?: number
  /** Draw the icon with this block (single/batch only). */
  withIcon?: boolean
  /** Draw ONLY the icon, bypassing text layout rendering */
  onlyIcon?: boolean
  /**
   * Internal — when true, draw only the flat-black glyph silhouette (no box,
   * glow, shadow, stroke, or material fill). Used to build the mask for the
   * text pattern effect; never set by callers.
   */
  silhouette?: boolean
}

const ASCENT = 0.85
const DESCENT = 0.15

function setTextFill(
  ctx: CanvasRenderingContext2D,
  doc: StudioDoc,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const m = doc.material
  if (m.type === 'gradient') {
    ctx.fillStyle = gradientForBounds(
      ctx,
      m.gradientDirection,
      x1,
      y1,
      x2,
      y2,
      m.gradientColor1,
      m.gradientColor2,
    )
  } else if (m.type === 'glass') {
    ctx.fillStyle = rgba(doc.font.color, m.glassOpacity / 100)
  } else {
    ctx.fillStyle = doc.font.color
  }
}

/**
 * Draw a block of lines. `firstBaselineY` is the alphabetic baseline of the
 * first line. Handles background box, glow, per-line fill/stroke/shadow,
 * material, letter/word spacing, and an optional icon.
 */
function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  doc: StudioDoc,
  lines: string[],
  anchorX: number,
  firstBaselineY: number,
  opts: BlockOpts = {},
): void {
  const align = opts.alignOverride ?? doc.align.h
  const fs = doc.font.size
  const lineHeight = fs * 1.2
  const effLineHeight = lineHeight + doc.spacing.line
  const letter = doc.spacing.letter
  const word = doc.spacing.word

  ctx.font = fontString(doc)
  ctx.textBaseline = 'alphabetic'
  // Native canvas letter/word spacing (Chromium 99+ / Electron). Setting them
  // on the context makes measureText account for the spacing too, so centering
  // math below stays correct.
  const spacingCtx = ctx as CanvasRenderingContext2D & {
    letterSpacing: string
    wordSpacing: string
  }
  const applySpacing = (): void => {
    spacingCtx.letterSpacing = `${letter}px`
    spacingCtx.wordSpacing = `${word}px`
  }
  applySpacing()

  const measure = (line: string): number => ctx.measureText(line).width
  const maxLineWidth = Math.max(0, ...lines.map(measure))

  // Icon geometry (single/batch/split share this via withIcon).
  const iconImg = opts.withIcon && doc.icon.enabled ? getCachedImage(doc.icon.dataUrl) : null
  let iconW = 0
  let iconH = 0
  if (iconImg) {
    iconH = (doc.icon.size / 100) * fs
    iconW = iconH * (iconImg.naturalWidth / iconImg.naturalHeight)
  }
  const iconGap = doc.icon.gap
  const horizIcon = iconImg && (doc.icon.position === 'left' || doc.icon.position === 'right')
  const vertIcon = iconImg && (doc.icon.position === 'above' || doc.icon.position === 'below')

  // Shift the text anchor to make room for a horizontal icon.
  let textX = anchorX
  if (horizIcon) {
    textX += doc.icon.position === 'left' ? (iconW + iconGap) / 2 : -(iconW + iconGap) / 2
  }

  const textOffX = doc.box.enabled ? doc.box.offsetX : 0
  const textOffY = doc.box.enabled ? doc.box.offsetY : 0

  // Vertical bounds for the box.
  const lastBaseline = firstBaselineY + (lines.length - 1) * effLineHeight
  let boxTop = firstBaselineY - fs * ASCENT
  let boxBottom = lastBaseline + fs * DESCENT
  if (vertIcon) {
    if (doc.icon.position === 'above') boxTop -= iconH + iconGap
    else boxBottom += iconH + iconGap
  }

  // ── Background box ──
  if (doc.box.enabled && doc.layers.box && !opts.silhouette) {
    const b = doc.box
    // Derive the box from the true content extent (text block + icon), not from
    // the icon-shifted textX — so the box wraps the icon exactly. The text-block
    // horizontal span at textX under `align`:
    let contentLeft: number
    let contentRight: number
    if (align === 'left') {
      contentLeft = textX
      contentRight = textX + maxLineWidth
    } else if (align === 'right') {
      contentLeft = textX - maxLineWidth
      contentRight = textX
    } else {
      contentLeft = textX - maxLineWidth / 2
      contentRight = textX + maxLineWidth / 2
    }
    // Fold in the icon's horizontal extent, mirroring drawIcon()'s x math.
    if (iconImg) {
      const ix = iconLeftX(doc, textX, maxLineWidth, iconW, iconGap, align)
      contentLeft = Math.min(contentLeft, ix)
      contentRight = Math.max(contentRight, ix + iconW)
    }
    const bgX = contentLeft - b.paddingX
    const bgW = contentRight - contentLeft + b.paddingX * 2
    // Text offsets nudge the text within a fixed box, so the box itself does not
    // follow the offset (X or Y).
    const bgY = boxTop - b.paddingY
    const bgH = boxBottom - boxTop + b.paddingY * 2

    ctx.save()
    if (b.shadow.enabled) {
      ctx.shadowColor = b.shadow.color
      ctx.shadowBlur = b.shadow.blur
      ctx.shadowOffsetX = b.shadow.x
      ctx.shadowOffsetY = b.shadow.y
    }
    if (b.material === 'gradient') {
      ctx.fillStyle = gradientForBounds(ctx, b.gradientDirection, bgX, bgY, bgX + bgW, bgY + bgH, b.color, b.gradientColor2)
    } else if (b.material === 'glass') {
      ctx.fillStyle = rgba(b.color, b.opacity / 100)
    } else {
      ctx.fillStyle = rgba(b.color, b.opacity / 100)
    }
    roundRectPath(ctx, bgX, bgY, bgW, bgH, b.radius)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    if (b.material === 'glass') {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = Math.max(1.5, fs * 0.01)
      roundRectPath(ctx, bgX + 1, bgY + 1, bgW - 2, bgH - 2, Math.max(0, b.radius - 1))
      ctx.stroke()
    }
    if (b.stroke.enabled) {
      ctx.strokeStyle = b.stroke.color
      ctx.lineWidth = b.stroke.width
      roundRectPath(ctx, bgX, bgY, bgW, bgH, b.radius)
      ctx.stroke()
    }
    ctx.restore()
  }

  if (opts.onlyIcon) {
    if (iconImg) drawIcon(ctx, doc, iconImg, iconW, iconH, iconGap, textX, firstBaselineY, lines.length, effLineHeight, maxLineWidth, align)
    return
  }

  if (!doc.layers.text) {
    if (iconImg) drawIcon(ctx, doc, iconImg, iconW, iconH, iconGap, textX, firstBaselineY, lines.length, effLineHeight, maxLineWidth, align)
    return
  }

  // Per-line rendering.
  ctx.textAlign = align
  lines.forEach((line, i) => {
    const lineY = firstBaselineY + i * effLineHeight + textOffY
    const lineX = textX + textOffX

    // Glow — behind everything.
    if (doc.glow.enabled && !opts.silhouette) {
      ctx.save()
      ctx.shadowColor = doc.glow.color
      ctx.shadowBlur = doc.glow.blur
      ctx.fillStyle = doc.glow.color
      applySpacing()
      for (let p = 0; p < doc.glow.strength; p++) ctx.fillText(line, lineX, lineY)
      ctx.restore()
    }

    ctx.save()
    if (doc.shadow.enabled && !opts.silhouette) {
      ctx.shadowColor = doc.shadow.color
      ctx.shadowBlur = doc.shadow.blur
      ctx.shadowOffsetX = doc.shadow.x
      ctx.shadowOffsetY = doc.shadow.y
    }
    applySpacing()
    const w = measure(line)
    const x1 = align === 'left' ? lineX : align === 'right' ? lineX - w : lineX - w / 2
    if (opts.silhouette) {
      ctx.fillStyle = '#000'
    } else {
      if (doc.stroke.enabled) {
        ctx.strokeStyle = doc.stroke.color
        ctx.lineWidth = doc.stroke.width
        ctx.lineJoin = 'round'
        ctx.strokeText(line, lineX, lineY)
      }
      if (doc.material.type === 'glass') {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.lineWidth = Math.max(2, fs * 0.02)
        ctx.lineJoin = 'round'
        ctx.strokeText(line, lineX, lineY)
      }
      setTextFill(ctx, doc, x1, lineY - fs, x1 + w, lineY)
    }
    ctx.fillText(line, lineX, lineY)
    ctx.restore()
  })

  spacingCtx.letterSpacing = '0px'
  spacingCtx.wordSpacing = '0px'

  if (iconImg) drawIcon(ctx, doc, iconImg, iconW, iconH, iconGap, textX, firstBaselineY, lines.length, effLineHeight, maxLineWidth, align)

  if (!opts.silhouette && doc.pattern.enabled) {
    drawPatternMasked(ctx, doc.pattern, doc.canvas.width, doc.canvas.height, (maskCtx) => {
      drawTextBlock(maskCtx, doc, lines, anchorX, firstBaselineY, { ...opts, silhouette: true, withIcon: false })
    })
  }
}

/** The icon's left x-coordinate for the current layout. Shared by drawIcon()
 *  and the background-box extent so the box always wraps the icon. */
function iconLeftX(
  doc: StudioDoc,
  textX: number,
  maxLineWidth: number,
  iconW: number,
  gap: number,
  align: HAlign,
): number {
  const pos = doc.icon.position
  if (pos === 'left' || pos === 'right') {
    if (align === 'center') {
      return pos === 'left' ? textX - maxLineWidth / 2 - gap - iconW : textX + maxLineWidth / 2 + gap
    }
    if (align === 'left') {
      return pos === 'left' ? textX - gap - iconW : textX + maxLineWidth + gap
    }
    return pos === 'left' ? textX - maxLineWidth - gap - iconW : textX + gap
  }
  // above / below — horizontally aligned to the text block
  if (align === 'center') return textX - iconW / 2
  if (align === 'left') return textX
  return textX - iconW
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  doc: StudioDoc,
  img: HTMLImageElement,
  iconW: number,
  iconH: number,
  gap: number,
  textX: number,
  firstBaselineY: number,
  lineCount: number,
  effLineHeight: number,
  maxLineWidth: number,
  align: HAlign,
): void {
  if (!doc.layers.icon) return
  const fs = doc.font.size
  const centerY = firstBaselineY - fs * 0.35 + ((lineCount - 1) * effLineHeight) / 2

  const ix = iconLeftX(doc, textX, maxLineWidth, iconW, gap, align)
  let iy = 0
  const pos = doc.icon.position
  if (pos === 'left' || pos === 'right') {
    iy = centerY - iconH / 2
  } else {
    const top = firstBaselineY - fs * ASCENT
    const bottom = firstBaselineY + (lineCount - 1) * effLineHeight + fs * DESCENT
    iy = pos === 'above' ? top - gap - iconH : bottom + gap
  }

  // Colorized silhouette of the icon — used for glow, stroke, and tint.
  const silhouette = (color: string): HTMLCanvasElement | null => {
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.round(iconW))
    off.height = Math.max(1, Math.round(iconH))
    const octx = off.getContext('2d')
    if (!octx) return null
    octx.drawImage(img, 0, 0, off.width, off.height)
    octx.globalCompositeOperation = 'source-in'
    octx.fillStyle = color
    octx.fillRect(0, 0, off.width, off.height)
    return off
  }

  // Pattern-filled silhouette — same idea as `silhouette()`, but the fill is
  // a pattern texture instead of a flat color. Phase-shifted by (-ix, -iy) so
  // the tile aligns with the canvas-wide grid, not the icon's local origin.
  const patternSilhouette = (pattern: EffectPattern): HTMLCanvasElement | null => {
    const off = document.createElement('canvas')
    off.width = Math.max(1, Math.round(iconW))
    off.height = Math.max(1, Math.round(iconH))
    const octx = off.getContext('2d')
    if (!octx) return null
    octx.drawImage(img, 0, 0, off.width, off.height)

    // Build the pattern tile on its own canvas first — see the comment on
    // `drawPatternMasked` for why `source-in` can't be set before a draw call
    // that itself paints in several separate strokes/fills.
    const tile = document.createElement('canvas')
    tile.width = off.width
    tile.height = off.height
    const tileCtx = tile.getContext('2d')
    if (!tileCtx) return null
    tileCtx.translate(-ix, -iy)
    drawPatternRaw(tileCtx, pattern, doc.canvas.width, doc.canvas.height)

    octx.globalCompositeOperation = 'source-in'
    octx.drawImage(tile, 0, 0)
    return off
  }

  // Glow — blurred silhouette stacked `strength` times, behind everything.
  if (doc.icon.glow.enabled) {
    const glowImg = silhouette(doc.icon.glow.color)
    if (glowImg) {
      ctx.save()
      ctx.shadowColor = doc.icon.glow.color
      ctx.shadowBlur = doc.icon.glow.blur
      for (let p = 0; p < doc.icon.glow.strength; p++) {
        ctx.drawImage(glowImg, ix, iy, iconW, iconH)
      }
      ctx.restore()
    }
  }

  // Stroke — silhouette stamped in a ring around the icon (raster outline).
  if (doc.icon.stroke.enabled) {
    const strokeImg = silhouette(doc.icon.stroke.color)
    if (strokeImg) {
      const r = doc.icon.stroke.width * 0.7
      for (let a = 0; a < 12; a++) {
        const angle = (a * Math.PI) / 6
        ctx.drawImage(strokeImg, ix + Math.cos(angle) * r, iy + Math.sin(angle) * r, iconW, iconH)
      }
    }
  }

  ctx.save()
  if (doc.icon.shadow.enabled) {
    ctx.shadowColor = doc.icon.shadow.color
    ctx.shadowBlur = doc.icon.shadow.blur
    ctx.shadowOffsetX = doc.icon.shadow.x
    ctx.shadowOffsetY = doc.icon.shadow.y
  }
  if (doc.icon.tint) {
    const tinted = silhouette(doc.icon.tint)
    if (tinted) ctx.drawImage(tinted, ix, iy, iconW, iconH)
  } else {
    ctx.drawImage(img, ix, iy, iconW, iconH)
  }
  ctx.restore()

  if (doc.icon.pattern.enabled) {
    const patterned = patternSilhouette(doc.icon.pattern)
    if (patterned) ctx.drawImage(patterned, ix, iy, iconW, iconH)
  }
}

/* ── Mode dispatch ─────────────────────────────────────────────────────── */

export function batchLines(doc: StudioDoc): string[] {
  return doc.batchText.split('\n').map((l) => l.trim()).filter(Boolean)
}

/** Compute the first-line baseline Y for a block of `lineCount` lines. */
function firstBaseline(doc: StudioDoc, lineCount: number): number {
  const { height } = doc.canvas
  const safe = doc.align.safeZone
  const oy = doc.align.offsetY
  const fs = doc.font.size
  const effLineHeight = fs * 1.2 + doc.spacing.line
  const blockHeight = (lineCount - 1) * effLineHeight + fs
  if (doc.align.v === 'top') return safe + fs * ASCENT + oy
  if (doc.align.v === 'bottom') return height - safe - (lineCount - 1) * effLineHeight - fs * DESCENT + oy
  return (height - blockHeight) / 2 + fs * ASCENT + oy
}

function anchorX(doc: StudioDoc, align: HAlign): number {
  const { width } = doc.canvas
  const safe = doc.align.safeZone
  const ox = doc.align.offsetX
  if (align === 'left') return safe + ox
  if (align === 'right') return width - safe + ox
  return width / 2 + ox
}

interface RenderOpts {
  /** Render only this bullet index (bullet export). */
  onlyBulletIndex?: number
  /** Render only this text as a single block (batch export/preview). */
  singleTextOverride?: string
  /** Whether to draw the icon. */
  withIcon?: boolean
  /** Whether to draw ONLY the icon. */
  onlyIcon?: boolean
}

function drawTextForMode(ctx: CanvasRenderingContext2D, doc: StudioDoc, opts: RenderOpts): void {
  const blockOpts = {
    withIcon: opts.onlyIcon ? true : (opts.withIcon !== undefined ? opts.withIcon : true),
    onlyIcon: opts.onlyIcon,
  }

  if (opts.singleTextOverride !== undefined) {
    const lines = opts.singleTextOverride.split('\n')
    drawTextBlock(ctx, doc, lines, anchorX(doc, doc.align.h), firstBaseline(doc, lines.length), blockOpts)
    return
  }

  if (doc.mode === 'split') {
    const slots: Array<{ text: string; align: HAlign }> = [
      { text: doc.split.left, align: 'left' },
      { text: doc.split.center, align: 'center' },
      { text: doc.split.right, align: 'right' },
    ]
    for (const slot of slots) {
      if (!slot.text.trim()) continue
      const lines = slot.text.split('\n')
      drawTextBlock(ctx, doc, lines, anchorX(doc, slot.align), firstBaseline(doc, lines.length), {
        alignOverride: slot.align,
        ...blockOpts,
      })
    }
    return
  }

  if (doc.mode === 'bullet') {
    const fs = doc.font.size
    const { height } = doc.canvas
    const safe = doc.align.safeZone
    const bulletSpacing = fs * 1.5 + (doc.box.enabled ? doc.box.paddingY * 2 : 0)
    const total = doc.bullets.length * bulletSpacing
    let startBaseline: number
    if (doc.align.v === 'top') startBaseline = safe + fs * ASCENT
    else if (doc.align.v === 'bottom') startBaseline = height - safe - total + fs * ASCENT
    else startBaseline = (height - total) / 2 + fs * ASCENT
    startBaseline += doc.align.offsetY
    doc.bullets.forEach((bullet, i) => {
      if (opts.onlyBulletIndex !== undefined && i !== opts.onlyBulletIndex) return
      if (!bullet.trim()) return
      const y = startBaseline + i * bulletSpacing
      drawTextBlock(ctx, doc, [bullet], anchorX(doc, doc.align.h), y, blockOpts)
    })
    return
  }

  if (doc.mode === 'batch') {
    const lines = batchLines(doc)
    const text = lines[doc.selectedBatchIndex] ?? lines[0] ?? ''
    const blockLines = text.split('\n')
    drawTextBlock(ctx, doc, blockLines, anchorX(doc, doc.align.h), firstBaseline(doc, blockLines.length), blockOpts)
    return
  }

  // single
  const lines = doc.text.split('\n')
  drawTextBlock(ctx, doc, lines, anchorX(doc, doc.align.h), firstBaseline(doc, lines.length), blockOpts)
}

const PRIMARY_LAYERS = ['logo', 'border', 'image', 'shape', 'text', 'icon'] as const

export type PrimaryLayer = (typeof PRIMARY_LAYERS)[number]

/** A fresh standalone frame, nested one thickness inside the primary border so
 *  a duplicate reads as a second ring rather than hiding under the first. */
export function newExtraBorder(from?: BorderStyle): ExtraBorderItem {
  const base = structuredClone(from ?? defaultStudioDoc().border)
  return {
    ...base,
    id: crypto.randomUUID(),
    enabled: true,
    inset: base.inset + base.thickness + 16,
  }
}

/** A fresh standalone logo. A duplicate lands in the opposite corner so it is
 *  visible immediately instead of stacking on the original. */
export function newExtraLogo(from?: LogoStyle): ExtraLogoItem {
  const base = structuredClone(from ?? defaultStudioDoc().logo)
  const opposite: Record<LogoCorner, LogoCorner> = {
    'top-left': 'top-right',
    'top-right': 'bottom-right',
    'bottom-right': 'bottom-left',
    'bottom-left': 'top-left',
  }
  return { ...base, id: crypto.randomUUID(), enabled: true, corner: opposite[base.corner] }
}

/** A fresh standalone picture layer, centered on the canvas. */
export function newExtraImage(dataUrl: string): ExtraImageItem {
  return {
    ...structuredClone(defaultStudioDoc().image),
    id: crypto.randomUUID(),
    enabled: true,
    dataUrl,
    originalDataUrl: dataUrl,
  }
}

/**
 * Reset one primary kind to its factory state. Used when a deleted primary is
 * re-added from the toolbar, so "delete then add" yields a clean layer rather
 * than resurrecting the old one. Text owns several top-level keys (font,
 * material, spacing, …); the other kinds are each a single object.
 */
export function resetPrimaryLayer(doc: StudioDoc, kind: PrimaryLayer): StudioDoc {
  const fresh = defaultStudioDoc()
  if (kind === 'text') {
    return {
      ...doc,
      text: fresh.text,
      font: structuredClone(fresh.font),
      material: structuredClone(fresh.material),
      align: structuredClone(fresh.align),
      spacing: structuredClone(fresh.spacing),
      shadow: structuredClone(fresh.shadow),
      glow: structuredClone(fresh.glow),
      stroke: structuredClone(fresh.stroke),
      box: structuredClone(fresh.box),
      pattern: structuredClone(fresh.pattern),
    }
  }
  return { ...doc, [kind]: structuredClone(fresh[kind]) }
}

/**
 * The canonical, self-healing z-order of every layer — the primaries plus
 * every extra (duplicated) item, identified by its UUID. Honors the saved
 * `layerOrder` where valid, drops stale ids, and slots any extra not yet in the
 * order right after its primary kind. Used by both the renderer and the sidebar
 * so the on-screen stack and the card list always match.
 */
export function effectiveLayerOrder(doc: StudioDoc): string[] {
  const extraIdsByKind: Array<[string, string[]]> = [
    ['shape', doc.extraShapes.map((s) => s.id)],
    ['text', doc.extraTexts.map((t) => t.id)],
    ['icon', doc.extraIcons.map((i) => i.id)],
    ['image', (doc.extraImages ?? []).map((i) => i.id)],
    ['border', (doc.extraBorders ?? []).map((b) => b.id)],
    ['logo', (doc.extraLogos ?? []).map((l) => l.id)],
  ]
  const removed = new Set(doc.removedPrimaries ?? [])
  const livePrimaries = PRIMARY_LAYERS.filter((p) => !removed.has(p))
  const valid = new Set<string>([...livePrimaries, ...extraIdsByKind.flatMap(([, ids]) => ids)])
  const base = doc.layerOrder && doc.layerOrder.length ? doc.layerOrder : [...livePrimaries]
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of base) {
    if (valid.has(e) && !seen.has(e)) {
      out.push(e)
      seen.add(e)
    }
  }
  for (const p of livePrimaries) {
    if (seen.has(p)) continue
    // A primary the saved order predates (a kind added in a later version)
    // belongs at its canonical spot in the stack, not dumped at the bottom:
    // insert it above the first primary that follows it canonically.
    const below = livePrimaries.slice(livePrimaries.indexOf(p) + 1)
    const at = out.findIndex((e) => below.includes(e as (typeof livePrimaries)[number]))
    if (at >= 0) out.splice(at, 0, p)
    else out.push(p)
    seen.add(p)
  }
  for (const [primary, ids] of extraIdsByKind) {
    for (const id of ids) {
      if (seen.has(id)) continue
      const at = out.indexOf(primary)
      if (at >= 0) out.splice(at + 1, 0, id)
      else out.push(id)
      seen.add(id)
    }
  }
  return out
}

/** The color grade attached to a layer entry, if it has one. */
export function gradeForEntry(doc: StudioDoc, entry: string): EffectColorGrade | undefined {
  switch (entry) {
    case 'text':
      return doc.grade
    case 'image':
      return doc.image.grade
    case 'shape':
      return doc.shape.grade
    case 'icon':
      return doc.icon.grade
    case 'border':
      return doc.border?.grade
    case 'logo':
      return doc.logo?.grade
    default:
      return (
        doc.extraShapes.find((i) => i.id === entry) ??
        doc.extraTexts.find((i) => i.id === entry) ??
        doc.extraIcons.find((i) => i.id === entry) ??
        (doc.extraImages ?? []).find((i) => i.id === entry) ??
        (doc.extraBorders ?? []).find((i) => i.id === entry) ??
        (doc.extraLogos ?? []).find((i) => i.id === entry)
      )?.grade
  }
}

/** The effect stack attached to a layer entry, if it has one. */
export function fxForEntry(doc: StudioDoc, entry: string): LayerEffects | undefined {
  switch (entry) {
    case 'text':
      return doc.fx
    case 'image':
      return doc.image.fx
    case 'shape':
      return doc.shape.fx
    case 'icon':
      return doc.icon.fx
    case 'border':
      return doc.border?.fx
    case 'logo':
      return doc.logo?.fx
    default:
      return (
        doc.extraShapes.find((i) => i.id === entry) ??
        doc.extraTexts.find((i) => i.id === entry) ??
        doc.extraIcons.find((i) => i.id === entry) ??
        (doc.extraImages ?? []).find((i) => i.id === entry) ??
        (doc.extraBorders ?? []).find((i) => i.id === entry) ??
        (doc.extraLogos ?? []).find((i) => i.id === entry)
      )?.fx
  }
}

/**
 * Draw a single layer entry, running its ordered effect pipeline (color grade
 * included — it is a stage like any other, see `fxOrder`).
 *
 * Effects live here rather than inside each draw function so every layer gets
 * them for free: the layer is painted alone onto a scratch canvas, put through
 * the pipeline, then blitted back. Isolating it also stops a grade or blur
 * bleeding onto the layers underneath, which setting `filter` on the shared
 * context would do.
 */
function drawLayerEntry(
  ctx: CanvasRenderingContext2D,
  doc: StudioDoc,
  entry: string,
  opts: RenderOpts,
): void {
  const grade = gradeForEntry(doc, entry)
  const fx = normalizeFx(fxForEntry(doc, entry))
  if (isNeutralGrade(grade) && !isFxActive(fx)) {
    drawLayerEntryRaw(ctx, doc, entry, opts)
    return
  }
  const { width, height } = doc.canvas
  const off = document.createElement('canvas')
  off.width = Math.max(1, Math.round(width))
  off.height = Math.max(1, Math.round(height))
  const octx = off.getContext('2d')
  if (!octx) {
    drawLayerEntryRaw(ctx, doc, entry, opts)
    return
  }
  drawLayerEntryRaw(octx, doc, entry, opts)
  const processed = applyLayerEffects(off, fx, grade)
  ctx.drawImage(processed, 0, 0, width, height)
}

function drawLayerEntryRaw(
  ctx: CanvasRenderingContext2D,
  doc: StudioDoc,
  entry: string,
  opts: RenderOpts,
): void {
  const { width, height } = doc.canvas
  if (entry === 'image') {
    if (doc.layers.image && doc.image.enabled) drawPictureImage(ctx, doc)
    return
  }
  if (entry === 'shape') {
    if (doc.layers.shape && doc.shape.enabled) drawShapes(ctx, doc)
    return
  }
  if (entry === 'text') {
    drawTextForMode(ctx, doc, { ...opts, withIcon: false })
    return
  }
  if (entry === 'icon') {
    if (doc.layers.icon && doc.icon.enabled) drawTextForMode(ctx, doc, { ...opts, onlyIcon: true })
    return
  }
  if (entry === 'border') {
    if (doc.layers.border && doc.border?.enabled) drawBorderStyled(ctx, doc.border, width, height)
    return
  }
  if (entry === 'logo') {
    if (doc.layers.logo && doc.logo?.enabled) drawLogoStyled(ctx, doc.logo, width, height)
    return
  }
  // Extra (duplicated) item, keyed by UUID.
  const es = doc.extraShapes.find((s) => s.id === entry)
  if (es) {
    if (es.enabled) drawOneShapeStyled(ctx, es, width / 2 + es.x, height / 2 + es.y, width, height)
    return
  }
  const et = doc.extraTexts.find((t) => t.id === entry)
  if (et) {
    if (et.enabled) drawExtraText(ctx, et, width, height)
    return
  }
  const ei = doc.extraIcons.find((i) => i.id === entry)
  if (ei) {
    if (ei.enabled) drawExtraIcon(ctx, ei, width, height)
    return
  }
  const eimg = (doc.extraImages ?? []).find((i) => i.id === entry)
  if (eimg) {
    if (eimg.enabled) drawOneImage(ctx, eimg, width, height)
    return
  }
  const eb = (doc.extraBorders ?? []).find((b) => b.id === entry)
  if (eb) {
    if (eb.enabled) drawBorderStyled(ctx, eb, width, height)
    return
  }
  const el = (doc.extraLogos ?? []).find((l) => l.id === entry)
  if (el) {
    if (el.enabled) drawLogoStyled(ctx, el, width, height)
  }
}

/** Draw the full document into a 2D context sized doc.canvas.width × height. */
export function renderStudioDoc(
  ctx: CanvasRenderingContext2D,
  doc: StudioDoc,
  opts: RenderOpts = {},
): void {
  const { width, height } = doc.canvas
  ctx.clearRect(0, 0, width, height)
  if (doc.layers.canvasBg) {
    if (doc.canvas.bg !== 'transparent') drawCanvasBg(ctx, doc)
    if (doc.canvas.pattern.enabled) drawPatternRaw(ctx, doc.canvas.pattern, width, height)
  }
  // Paint back-to-front: the last entry in the order sits at the bottom, so we
  // reverse (order[0] is the top-most layer, matching the sidebar list).
  const order = effectiveLayerOrder(doc)
  for (const entry of [...order].reverse()) {
    drawLayerEntry(ctx, doc, entry, opts)
  }
}

/* ── Export helpers ────────────────────────────────────────────────────── */

function renderToDataUrl(doc: StudioDoc, opts: RenderOpts = {}): string {
  const off = document.createElement('canvas')
  off.width = doc.canvas.width
  off.height = doc.canvas.height
  const ctx = off.getContext('2d')
  if (!ctx) throw new Error('canvas-2d-unavailable')
  renderStudioDoc(ctx, doc, opts)
  return off.toDataURL('image/png')
}

export function renderDocToPngBase64(doc: StudioDoc, opts: RenderOpts = {}): string {
  return renderToDataUrl(doc, opts).split(',')[1] ?? ''
}

function sanitizeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().slice(0, 60) || 'title'
}

/** Files for a batch/bullet "export all" run: [{ name, dataBase64 }]. */
export function exportAllFiles(doc: StudioDoc): Array<{ name: string; dataBase64: string }> {
  if (doc.mode === 'batch') {
    const lines = batchLines(doc)
    return lines.map((text, i) => ({
      name: `${String(i + 1).padStart(3, '0')}_${sanitizeName(text)}.png`,
      dataBase64: renderDocToPngBase64({ ...doc, selectedBatchIndex: i }, { singleTextOverride: text }),
    }))
  }
  // bullet — one PNG per non-empty bullet, at its stacked position.
  return doc.bullets
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.trim())
    .map(({ b, i }) => ({
      name: `${sanitizeName(b)}_${i + 1}.png`,
      dataBase64: renderDocToPngBase64(doc, { onlyBulletIndex: i }),
    }))
}

/** Suggested filename (no extension) for a single-file export. */
export function exportSuggestedName(doc: StudioDoc): string {
  if (doc.mode === 'split') {
    return sanitizeName([doc.split.left, doc.split.center, doc.split.right].filter(Boolean).join(' '))
  }
  if (doc.mode === 'batch') {
    const lines = batchLines(doc)
    return sanitizeName(lines[doc.selectedBatchIndex] ?? lines[0] ?? 'title')
  }
  if (doc.mode === 'bullet') return sanitizeName(doc.bullets.find((b) => b.trim()) ?? 'title')
  return sanitizeName(doc.text.split('\n')[0] ?? 'title')
}

/* ── Persistence: working doc ──────────────────────────────────────────── */

const DOC_KEY = 'studio-doc-v2'

/** Deep-merge a partial saved doc over fresh defaults so old saves and new
 *  fields both survive. */
/**
 * Shallow-merge a partial document over a complete one, one level deep for
 * plain objects. This is what lets a caller — persistence, a preset, or an
 * agent over MCP — describe only the fields it cares about.
 */
export function mergeDoc(base: StudioDoc, saved: unknown): StudioDoc {
  if (!saved || typeof saved !== 'object') return base
  const s = saved as Record<string, unknown>
  const out = structuredClone(base) as unknown as Record<string, unknown>
  // Union of both key sets, not just the base's. Optional fields — `grade`,
  // `fx` — are absent from a default document, so iterating the base alone
  // would silently drop every effect a caller set, which is exactly what an
  // agent sends over MCP.
  for (const key of new Set([...Object.keys(base), ...Object.keys(s)])) {
    const v = s[key]
    if (v === undefined) continue
    const baseV = (base as unknown as Record<string, unknown>)[key]
    if (baseV && typeof baseV === 'object' && !Array.isArray(baseV) && v && typeof v === 'object') {
      out[key] = { ...(baseV as object), ...(v as object) }
    } else {
      out[key] = v
    }
  }
  return out as unknown as StudioDoc
}

export function loadStudioDoc(): StudioDoc {
  try {
    const raw = localStorage.getItem(DOC_KEY)
    if (!raw) return defaultStudioDoc()
    return mergeDoc(defaultStudioDoc(), JSON.parse(raw))
  } catch {
    return defaultStudioDoc()
  }
}

export function saveStudioDoc(doc: StudioDoc): void {
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify(doc))
  } catch {
    // ignore quota errors
  }
}

/* ── Persistence: multiple canvases ────────────────────────────────────── */

export interface StudioCanvas {
  id: string
  name: string
  doc: StudioDoc
}

const CANVASES_KEY = 'studio-canvases-v1'

export interface StudioWorkspace {
  canvases: StudioCanvas[]
  activeId: string
}

/* ── Workspace operations ──────────────────────────────────────────────── */
/*
 * Tab operations as pure functions rather than inline setState chains. The
 * live document is held apart from the workspace while a canvas is open, so
 * every one of these has to fold it back before changing tabs — the step whose
 * omission loses work.
 */

/** Write the live document back into the active canvas. */
export function foldLiveDoc(ws: StudioWorkspace, liveDoc: StudioDoc): StudioWorkspace {
  return {
    ...ws,
    canvases: ws.canvases.map((c) => (c.id === ws.activeId ? { ...c, doc: liveDoc } : c)),
  }
}

/** Add a blank canvas and make it active. Returns the doc to load. */
export function addCanvasOp(
  ws: StudioWorkspace,
  liveDoc: StudioDoc,
  id: string = crypto.randomUUID(),
): { ws: StudioWorkspace; doc: StudioDoc } {
  const folded = foldLiveDoc(ws, liveDoc)
  const doc = defaultStudioDoc()
  return {
    ws: {
      canvases: [...folded.canvases, { id, name: `Canvas ${folded.canvases.length + 1}`, doc }],
      activeId: id,
    },
    doc,
  }
}

/** Copy a canvas — the whole document, under a new id — and open the copy.
 *  For "same thumbnail, slightly different". */
export function duplicateCanvasOp(
  ws: StudioWorkspace,
  liveDoc: StudioDoc,
  sourceId: string = ws.activeId,
  id: string = crypto.randomUUID(),
): { ws: StudioWorkspace; doc: StudioDoc } | null {
  const folded = foldLiveDoc(ws, liveDoc)
  const idx = folded.canvases.findIndex((c) => c.id === sourceId)
  if (idx === -1) return null
  const source = folded.canvases[idx]
  const doc = structuredClone(source.doc)
  const copy: StudioCanvas = { id, name: `${source.name} copy`, doc }
  const canvases = [...folded.canvases]
  // Sit the copy right next to its original rather than at the far end.
  canvases.splice(idx + 1, 0, copy)
  return { ws: { canvases, activeId: id }, doc }
}

/** Switch tabs, keeping the outgoing canvas's edits. */
export function switchCanvasOp(
  ws: StudioWorkspace,
  liveDoc: StudioDoc,
  id: string,
): { ws: StudioWorkspace; doc: StudioDoc } | null {
  if (id === ws.activeId) return null
  const folded = foldLiveDoc(ws, liveDoc)
  const target = folded.canvases.find((c) => c.id === id)
  if (!target) return null
  return { ws: { ...folded, activeId: id }, doc: target.doc }
}

/** Close a canvas. Closing the last one is refused; closing the active one
 *  falls through to its neighbour. */
export function closeCanvasOp(
  ws: StudioWorkspace,
  liveDoc: StudioDoc,
  id: string,
): { ws: StudioWorkspace; doc: StudioDoc | null } | null {
  if (ws.canvases.length <= 1) return null
  const folded = foldLiveDoc(ws, liveDoc)
  const idx = folded.canvases.findIndex((c) => c.id === id)
  if (idx === -1) return null
  const remaining = folded.canvases.filter((c) => c.id !== id)
  if (id !== folded.activeId) return { ws: { ...folded, canvases: remaining }, doc: null }
  const neighbor = remaining[Math.min(idx, remaining.length - 1)]
  return { ws: { canvases: remaining, activeId: neighbor.id }, doc: neighbor.doc }
}

/** Load all canvases; migrates a pre-multi-canvas single doc into "Canvas 1". */
/** Normalize a stored workspace, filling any fields a saved document predates. */
export function parseWorkspace(parsed: unknown): StudioWorkspace | null {
  const p = parsed as Partial<StudioWorkspace> | null
  if (!p || !Array.isArray(p.canvases) || p.canvases.length === 0) return null
  const canvases = p.canvases.map((c) => ({
    id: typeof c.id === 'string' ? c.id : crypto.randomUUID(),
    name: typeof c.name === 'string' ? c.name : 'Canvas',
    doc: mergeDoc(defaultStudioDoc(), c.doc),
  }))
  const activeId = canvases.some((c) => c.id === p.activeId)
    ? (p.activeId as string)
    : canvases[0].id
  return { canvases, activeId }
}

/**
 * Load the saved canvases.
 *
 * Disk first (written by the main process, no size cap), then localStorage as a
 * one-time migration for workspaces saved by earlier builds. Documents embed
 * their images as data URLs, so a couple of generated pictures used to exceed
 * localStorage's quota and every later save failed silently — losing work.
 */
export function loadStudioCanvases(): StudioWorkspace {
  const fromDisk = parseWorkspace(globalThis.window?.studioApi?.initialWorkspace ?? null)
  if (fromDisk) return fromDisk
  try {
    const raw = localStorage.getItem(CANVASES_KEY)
    if (raw) {
      const migrated = parseWorkspace(JSON.parse(raw))
      if (migrated) return migrated
    }
  } catch {
    // fall through to a fresh workspace
  }
  const first: StudioCanvas = { id: crypto.randomUUID(), name: 'Canvas 1', doc: loadStudioDoc() }
  return { canvases: [first], activeId: first.id }
}

/**
 * Persist the canvases through the main process. Returns an error string when
 * the write fails so the UI can say so — a design tool that loses work quietly
 * is worse than one that admits it.
 */
export async function saveStudioCanvases(ws: StudioWorkspace): Promise<string | null> {
  const json = JSON.stringify(ws)
  const api = globalThis.window?.studioApi
  if (!api?.saveWorkspace) {
    // No preload (tests, or a plain browser): best-effort localStorage.
    try {
      localStorage.setItem(CANVASES_KEY, json)
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }
  const res = await api.saveWorkspace(json)
  return res.ok ? null : res.error
}

/* ── Persistence: style presets ────────────────────────────────────────── */

const PRESETS_KEY = 'studio-presets-v2'

/** A named preset stores the full style — everything except canvas size and
 *  the mode-specific text content. */
export type PresetStyle = Omit<
  StudioDoc,
  'canvas' | 'text' | 'bullets' | 'batchText' | 'selectedBatchIndex' | 'split' | 'mode'
> & { canvasBg: StudioDoc['canvas'] }

export interface StudioPreset {
  id: string
  name: string
  doc: Partial<StudioDoc>
}

export function docToPreset(doc: StudioDoc, name: string, id: string): StudioPreset {
  const { text: _t, bullets: _b, batchText: _bt, selectedBatchIndex: _si, split: _sp, mode: _m, ...style } = doc
  // Keep the canvas *background* styling but drop the resolution.
  const { width: _w, height: _h, ...canvasBg } = style.canvas
  return {
    id,
    name,
    doc: { ...style, canvas: { ...canvasBg, width: doc.canvas.width, height: doc.canvas.height } },
  }
}

export function applyPreset(doc: StudioDoc, preset: StudioPreset): StudioDoc {
  const p = structuredClone(preset.doc)
  // Preserve the current resolution and text content; apply the styling.
  const merged = mergeDoc(doc, p)
  return {
    ...merged,
    canvas: { ...merged.canvas, width: doc.canvas.width, height: doc.canvas.height },
    mode: doc.mode,
    text: doc.text,
    bullets: doc.bullets,
    batchText: doc.batchText,
    selectedBatchIndex: doc.selectedBatchIndex,
    split: doc.split,
  }
}

export function loadStudioPresets(): StudioPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StudioPreset[]) : []
  } catch {
    return []
  }
}

export function saveStudioPresets(presets: StudioPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
  } catch {
    // ignore quota errors
  }
}

/* ── Persistence: custom fonts ─────────────────────────────────────────── */

const FONTS_KEY = 'studio-fonts-v1'

export interface CustomFont {
  name: string
  dataUrl: string
}

export function loadCustomFonts(): CustomFont[] {
  try {
    const raw = localStorage.getItem(FONTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CustomFont[]) : []
  } catch {
    return []
  }
}

export function saveCustomFonts(fonts: CustomFont[]): void {
  try {
    localStorage.setItem(FONTS_KEY, JSON.stringify(fonts))
  } catch {
    // ignore quota errors (fonts are large; may exceed localStorage)
  }
}

/** Register a font face so the canvas + <select> preview can use it. */
export async function registerFont(font: CustomFont): Promise<void> {
  try {
    const face = new FontFace(font.name, `url(${font.dataUrl})`)
    await face.load()
    ;(document.fonts as FontFaceSet).add(face)
  } catch {
    // ignore invalid font files
  }
}
