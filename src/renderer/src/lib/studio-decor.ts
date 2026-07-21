/**
 * The shadow fields this module needs. Declared structurally rather than
 * imported from `studio.ts` so the dependency stays one-way — studio.ts already
 * imports this module.
 */
export interface ShadowSpec {
  blur: number
  x: number
  y: number
  color: string
}

/**
 * The per-layer decoration stack: shadow, glow, stroke, the layer's own fill,
 * and the pattern overlay — drawn in an order the user controls.
 *
 * These used to be hardcoded, and each layer type baked in its own sequence:
 * text stroked under its fill, shapes stroked over it, pictures stroked before
 * the photo. Worse, the shadow was not a pass at all — the draw code set
 * `ctx.shadowColor` and then ran *several* draws inside that state, so the
 * fill's shadow landed on top of the stroke that had already been painted. A
 * thick stroke with an offset shadow came out with the shadow lying across it,
 * which is what made this reorderable in the first place.
 *
 * Two rules fix that and keep it fixed:
 *   1. Every decoration is an isolated pass. Shadow state never leaks from one
 *      pass into the next, so no pass can accidentally shadow another.
 *   2. The shadow is cast from the layer's silhouette, once, as its own pass.
 *      Where it lands in the stack is then purely a matter of order.
 */
export const DECOR_KEYS = ['shadow', 'glow', 'stroke', 'fill', 'pattern'] as const
export type DecorKey = (typeof DECOR_KEYS)[number]

/**
 * Back-to-front default for text, pictures and icons: the stroke sits *under*
 * the fill so a wide stroke reads as an outline hugging the glyph rather than
 * eating into it.
 */
export const DECOR_DEFAULT: readonly DecorKey[] = ['shadow', 'glow', 'stroke', 'fill', 'pattern']

/**
 * Shapes stroke on top instead. A shape's stroke is centred on its path, so
 * burying it under the fill would hide the inner half and halve its apparent
 * width — which is how shapes have always looked here.
 */
export const DECOR_DEFAULT_SHAPE: readonly DecorKey[] = [
  'shadow',
  'glow',
  'fill',
  'pattern',
  'stroke',
]

/**
 * A saved order, healed against the canonical one.
 *
 * Same contract as `fxOrder` and `effectiveLayerOrder`: unknown keys are
 * dropped and missing ones are slotted back at their canonical position, so a
 * document saved before a decoration existed still draws it.
 */
export function decorOrder(
  order: string[] | undefined,
  fallback: readonly DecorKey[] = DECOR_DEFAULT,
): DecorKey[] {
  const known = new Set<string>(DECOR_KEYS)
  const seen = new Set<string>()
  const kept: DecorKey[] = []
  for (const key of order ?? []) {
    if (!known.has(key) || seen.has(key)) continue
    seen.add(key)
    kept.push(key as DecorKey)
  }
  if (kept.length === DECOR_KEYS.length) return kept
  // Re-insert anything missing at its canonical index rather than appending, so
  // a doc that predates a decoration gets it in the right place, not on top.
  const out = [...kept]
  fallback.forEach((key, i) => {
    if (seen.has(key)) return
    const before = fallback.slice(0, i).filter((k) => seen.has(k)).length
    out.splice(Math.min(before, out.length), 0, key)
    seen.add(key)
  })
  return out
}

export interface DecorPasses {
  /** The layer's own pixels. Always drawn. */
  fill: (ctx: CanvasRenderingContext2D) => void
  shadow?: (ctx: CanvasRenderingContext2D) => void
  glow?: (ctx: CanvasRenderingContext2D) => void
  stroke?: (ctx: CanvasRenderingContext2D) => void
  pattern?: (ctx: CanvasRenderingContext2D) => void
}

/** Clear any inherited shadow so a pass only draws what it means to draw. */
function resetShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

/** Run the decorations back-to-front, each isolated from the others. */
export function paintDecor(
  ctx: CanvasRenderingContext2D,
  order: string[] | undefined,
  passes: DecorPasses,
  fallback: readonly DecorKey[] = DECOR_DEFAULT,
): void {
  for (const key of decorOrder(order, fallback)) {
    const pass = passes[key]
    if (!pass) continue
    ctx.save()
    resetShadow(ctx)
    pass(ctx)
    ctx.restore()
  }
}

/**
 * Draw *only* the shadow of whatever `paint` draws.
 *
 * Canvas has no shadow-only mode: setting `shadowColor` and drawing gives you
 * the shadow AND the thing casting it. So the caster is rendered to a scratch
 * canvas, blitted entirely off the left edge, and the shadow offset is grown by
 * the canvas width to bring just the shadow back into frame. Using the native
 * shadow (rather than a blur filter) keeps the blur radius identical to what
 * these layers produced before.
 */
export function drawShadowOf(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sh: ShadowSpec,
  paint: (ctx: CanvasRenderingContext2D) => void,
): void {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const octx = off.getContext('2d')
  if (!octx) return
  paint(octx)
  ctx.save()
  ctx.shadowColor = sh.color
  ctx.shadowBlur = sh.blur
  ctx.shadowOffsetX = sh.x + w
  ctx.shadowOffsetY = sh.y
  ctx.drawImage(off, -w, 0)
  ctx.restore()
}
