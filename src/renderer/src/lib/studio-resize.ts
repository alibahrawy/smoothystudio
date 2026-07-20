import { defaultStudioDoc, type HAlign, type StudioDoc, type VAlign } from './studio'

/**
 * Resize a document to a new canvas and re-lay-out its contents.
 *
 * There is no drop-in library for this, but the problem is well-trodden: it is
 * Figma's layout constraints plus Canva's "magic resize", and the two ideas
 * that make it work are borrowed rather than invented.
 *
 * 1. **Normalised coordinates.** Every position is stored as a fraction of the
 *    half-canvas, remapped, then turned back into pixels. Something a third of
 *    the way out stays a third of the way out, and something flush against an
 *    edge stays flush.
 *
 * 2. **Contain vs cover**, exactly as in CSS `object-fit`. Content that has to
 *    stay inside the frame (type, logos, icons) scales by the *smaller* axis
 *    ratio so it can never overflow. Content that was bleeding off the edge
 *    scales by the *larger* ratio so it still covers — which is the user-facing
 *    rule "if something touches the edge it should still touch the edge, maybe
 *    a little bigger".
 *
 * On top of that, changing orientation **transposes** the layout: normalised x
 * and y swap. That single rule produces the reflow you actually want when a
 * 16:9 becomes a 9:16 — something on the left moves to the top and ends up
 * horizontally centred, something on the right moves to the bottom, because a
 * landscape design has a wide spread of x and almost none of y, and after the
 * swap that becomes a tall spread of y and almost none of x.
 */
export interface ResizeContext {
  fromW: number
  fromH: number
  toW: number
  toH: number
  /** Largest scale that still fits inside the new frame. */
  contain: number
  /** Smallest scale that still covers the new frame. */
  cover: number
  /** True when the canvas changed between landscape and portrait. */
  transposed: boolean
}

export function resizeContext(fromW: number, fromH: number, toW: number, toH: number): ResizeContext {
  const w1 = Math.max(1, fromW)
  const h1 = Math.max(1, fromH)
  const w2 = Math.max(1, toW)
  const h2 = Math.max(1, toH)
  const wasLandscape = w1 >= h1
  const isLandscape = w2 >= h2
  return {
    fromW: w1,
    fromH: h1,
    toW: w2,
    toH: h2,
    contain: Math.min(w2 / w1, h2 / h1),
    cover: Math.max(w2 / w1, h2 / h1),
    transposed: wasLandscape !== isLandscape,
  }
}

const r = (n: number): number => Math.round(n)

/** Remap a point given as an offset from the canvas centre. */
export function mapPoint(ctx: ResizeContext, x: number, y: number): { x: number; y: number } {
  const fx = x / (ctx.fromW / 2)
  const fy = y / (ctx.fromH / 2)
  const [nx, ny] = ctx.transposed ? [fy, fx] : [fx, fy]
  return { x: r(nx * (ctx.toW / 2)), y: r(ny * (ctx.toH / 2)) }
}

/**
 * Scale for one item: `cover` when it already reached the canvas edge, so a
 * full-bleed element stays full-bleed; `contain` otherwise.
 */
export function scaleFor(ctx: ResizeContext, center: number, halfSize: number, axis: 'x' | 'y'): number {
  const halfCanvas = (axis === 'x' ? ctx.fromW : ctx.fromH) / 2
  const reachesEdge = Math.abs(center) + halfSize >= halfCanvas - 1
  return reachesEdge ? ctx.cover : ctx.contain
}

const H_TO_V: Record<HAlign, VAlign> = { left: 'top', center: 'middle', right: 'bottom' }
const V_TO_H: Record<VAlign, HAlign> = { top: 'left', middle: 'center', bottom: 'right' }

/** Transpose the title anchor on an orientation change: left↔top, right↔bottom. */
export function transposeAlign(h: HAlign, v: VAlign): { h: HAlign; v: VAlign } {
  return { h: V_TO_H[v], v: H_TO_V[h] }
}

const ICON_TRANSPOSE: Record<string, string> = {
  left: 'top',
  right: 'bottom',
  top: 'left',
  bottom: 'right',
}

/**
 * Scale a shadow/glow/stroke so its weight stays proportional to the artwork —
 * a 24px blur on a 1920px canvas should not stay 24px on a 1080px one.
 * Operates on whichever geometric fields the effect happens to have.
 */
function scaleEffectGeometry<T>(fx: T, s: number): T {
  if (!fx || typeof fx !== 'object') return fx
  const out = { ...(fx as Record<string, unknown>) }
  for (const key of ['blur', 'width', 'x', 'y', 'size', 'dotSize']) {
    if (typeof out[key] === 'number') out[key] = r((out[key] as number) * s)
  }
  return out as T
}

/**
 * Produce a copy of `doc` laid out for a new canvas size. Pure — the caller
 * decides whether to keep it.
 */
export function resizeDoc(doc: StudioDoc, toW: number, toH: number): StudioDoc {
  const ctx = resizeContext(doc.canvas.width, doc.canvas.height, toW, toH)
  if (ctx.fromW === ctx.toW && ctx.fromH === ctx.toH) return doc
  const s = ctx.contain
  const d = structuredClone(doc)

  d.canvas = {
    ...d.canvas,
    width: ctx.toW,
    height: ctx.toH,
    // A background image should keep covering the frame.
    ...mapBackground(ctx, d),
  }

  /* ── Title text ─────────────────────────────────────────────────────── */
  d.font = { ...d.font, size: Math.max(4, r(d.font.size * s)) }
  d.spacing = {
    letter: r(d.spacing.letter * s),
    line: r(d.spacing.line * s),
    word: r(d.spacing.word * s),
  }
  const anchor = ctx.transposed
    ? transposeAlign(d.align.h, d.align.v)
    : { h: d.align.h, v: d.align.v }
  const alignOffset = mapPoint(ctx, d.align.offsetX, d.align.offsetY)
  d.align = {
    ...d.align,
    h: anchor.h,
    v: anchor.v,
    safeZone: Math.max(0, r(d.align.safeZone * s)),
    offsetX: alignOffset.x,
    offsetY: alignOffset.y,
  }
  d.shadow = scaleEffectGeometry(d.shadow, s)
  d.glow = scaleEffectGeometry(d.glow, s)
  d.stroke = scaleEffectGeometry(d.stroke, s)
  d.box = {
    ...d.box,
    paddingX: r(d.box.paddingX * s),
    paddingY: r(d.box.paddingY * s),
    radius: r(d.box.radius * s),
    offsetX: r(d.box.offsetX * s),
    offsetY: r(d.box.offsetY * s),
    stroke: scaleEffectGeometry(d.box.stroke, s),
    shadow: scaleEffectGeometry(d.box.shadow, s),
  }

  /* ── Primary shape / icon / picture ─────────────────────────────────── */
  {
    const p = mapPoint(ctx, d.shape.x, d.shape.y)
    const shapeScale = scaleFor(ctx, d.shape.x, d.shape.size / 2, 'x')
    d.shape = {
      ...d.shape,
      x: p.x,
      y: p.y,
      size: Math.max(1, r(d.shape.size * shapeScale)),
      cornerRadius: r(d.shape.cornerRadius * s),
      stroke: scaleEffectGeometry(d.shape.stroke, s),
      shadow: scaleEffectGeometry(d.shape.shadow, s),
      glow: scaleEffectGeometry(d.shape.glow, s),
    }
  }
  d.icon = {
    ...d.icon,
    position: (ctx.transposed
      ? (ICON_TRANSPOSE[d.icon.position] ?? d.icon.position)
      : d.icon.position) as typeof d.icon.position,
    size: Math.max(1, r(d.icon.size * s)),
    gap: r(d.icon.gap * s),
    stroke: scaleEffectGeometry(d.icon.stroke, s),
    shadow: scaleEffectGeometry(d.icon.shadow, s),
    glow: scaleEffectGeometry(d.icon.glow, s),
  }
  {
    const p = mapPoint(ctx, d.image.x, d.image.y)
    const imgScale = scaleFor(ctx, d.image.x, d.image.width / 2, 'x')
    d.image = {
      ...d.image,
      x: p.x,
      y: p.y,
      width: Math.max(1, r(d.image.width * imgScale)),
      stroke: scaleEffectGeometry(d.image.stroke, s),
      shadow: scaleEffectGeometry(d.image.shadow, s),
      glow: scaleEffectGeometry(d.image.glow, s),
    }
  }

  /* ── Border / logo: already edge-relative, so only their margins scale ── */
  if (d.border) {
    d.border = {
      ...d.border,
      thickness: Math.max(0, r(d.border.thickness * s)),
      inset: Math.max(0, r(d.border.inset * s)),
      outerRadius: r(d.border.outerRadius * s),
      innerRadius: r(d.border.innerRadius * s),
    }
  }
  if (d.logo) {
    d.logo = {
      ...d.logo,
      // Corners stay corners — that anchor is already resolution-independent.
      margin: Math.max(0, r(d.logo.margin * s)),
      size: Math.max(1, r(d.logo.size * s)),
      offsetX: r(d.logo.offsetX * s),
      offsetY: r(d.logo.offsetY * s),
    }
  }

  /* ── Extras ─────────────────────────────────────────────────────────── */
  d.extraTexts = (d.extraTexts ?? []).map((t) => {
    const p = mapPoint(ctx, t.x, t.y)
    return { ...t, x: p.x, y: p.y, size: Math.max(4, r(t.size * s)) }
  })
  d.extraShapes = (d.extraShapes ?? []).map((sh) => {
    const p = mapPoint(ctx, sh.x, sh.y)
    return {
      ...sh,
      x: p.x,
      y: p.y,
      size: Math.max(1, r(sh.size * scaleFor(ctx, sh.x, sh.size / 2, 'x'))),
      cornerRadius: r(sh.cornerRadius * s),
    }
  })
  d.extraIcons = (d.extraIcons ?? []).map((i) => {
    const p = mapPoint(ctx, i.x, i.y)
    return { ...i, x: p.x, y: p.y, size: Math.max(1, r(i.size * s)) }
  })
  d.extraImages = (d.extraImages ?? []).map((im) => {
    const p = mapPoint(ctx, im.x, im.y)
    return {
      ...im,
      x: p.x,
      y: p.y,
      width: Math.max(1, r(im.width * scaleFor(ctx, im.x, im.width / 2, 'x'))),
    }
  })
  d.extraBorders = (d.extraBorders ?? []).map((b) => ({
    ...b,
    thickness: Math.max(0, r(b.thickness * s)),
    inset: Math.max(0, r(b.inset * s)),
    outerRadius: r(b.outerRadius * s),
    innerRadius: r(b.innerRadius * s),
  }))
  d.extraLogos = (d.extraLogos ?? []).map((l) => ({
    ...l,
    margin: Math.max(0, r(l.margin * s)),
    size: Math.max(1, r(l.size * s)),
    offsetX: r(l.offsetX * s),
    offsetY: r(l.offsetY * s),
  }))

  return d
}

/** Keep a canvas background image covering the frame after a resize. */
function mapBackground(ctx: ResizeContext, d: StudioDoc): Partial<StudioDoc['canvas']> {
  const p = mapPoint(ctx, d.canvas.imageX, d.canvas.imageY)
  // Zoom is a percentage of a cover-fit, so it only needs adjusting when the
  // aspect ratio changes enough that the old framing no longer fills.
  const aspectShift = (ctx.toW / ctx.toH) / (ctx.fromW / ctx.fromH)
  const zoom = aspectShift > 1 ? ctx.fromW / ctx.fromH === 0 ? 1 : aspectShift : 1 / aspectShift
  return {
    imageX: p.x,
    imageY: p.y,
    imageZoom: Math.max(50, Math.min(400, r(d.canvas.imageZoom * Math.max(1, Math.sqrt(zoom))))),
    filterBlur: r(d.canvas.filterBlur * ctx.contain),
  }
}

/** A blank document at a given size — used when resizing a brand new canvas. */
export function blankDocAt(width: number, height: number): StudioDoc {
  const d = defaultStudioDoc()
  return { ...d, canvas: { ...d.canvas, width, height } }
}
