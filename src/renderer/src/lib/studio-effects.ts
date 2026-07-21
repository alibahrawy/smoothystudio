/**
 * Studio layer effects — the post-processing pipeline that runs on a layer
 * after it is drawn and before it is composited back onto the canvas.
 *
 * Every effect here operates on a rasterized copy of a single layer, which is
 * what lets them apply uniformly to text, shapes, pictures, logos and frames
 * alike. `studio.ts` owns the "draw the layer" half; this module owns the
 * "then mangle it" half.
 *
 * Like After Effects, the stack is ORDERED and reorderable: every effect —
 * including gaussian blur, the color grade, transform and 3D — is a pipeline
 * stage, run in the layer's `fx.order` (see `fxOrder`). The default order is
 * `FX_PIPELINE_KEYS`: geometry first so pixel effects act on the final shape.
 * Noise is the one exception — it always runs last, outside the ordering, so
 * grain stays crisp instead of being smeared by whatever follows it.
 */

export interface FxCrop {
  enabled: boolean
  /** Pixels trimmed from each side of the layer's canvas. */
  top: number
  right: number
  bottom: number
  left: number
  /** Corner rounding applied to the cropped rectangle. */
  radius: number
  /** Soft edge in px — like Premiere's crop feather. */
  feather?: number
}

export interface FxTransform {
  enabled: boolean
  /** Scale percent — X scale when `uniform` is off. */
  scale: number
  /** Y scale percent, used only when `uniform` is off. */
  scaleY?: number
  /** One scale slider for both axes (AE's chain-link). Default true. */
  uniform?: boolean
  /** Rotation in degrees, clockwise. */
  rotate: number
  skewX: number
  skewY: number
  offsetX: number
  offsetY: number
  /** Pivot for scale/rotate/skew, as a px offset from the layer center. */
  anchorX?: number
  anchorY?: number
  /** Layer opacity 0–100, applied with the transform (AE Transform's opacity). */
  opacity?: number
  flipH: boolean
  flipV: boolean
}

export interface Fx3D {
  enabled: boolean
  /** Tilt about the horizontal axis, degrees. */
  rotateX: number
  /** Tilt about the vertical axis, degrees. */
  rotateY: number
  /** Viewer distance in px — smaller exaggerates the perspective. */
  distance: number
  /** Draw a light sheen across the tilted plane (AE Basic 3D's highlight). */
  specular?: boolean
  specularStrength?: number
}

export interface FxMosaic {
  enabled: boolean
  /** Block width in px. */
  size: number
  /** Block height in px — 0/absent means square blocks from `size`. */
  sizeV?: number
}

export interface FxGaussianBlur {
  enabled: boolean
  /** Radius in px. */
  amount: number
}

export interface FxRadialBlur {
  enabled: boolean
  type: 'zoom' | 'spin'
  /** Strength, 0–200. */
  amount: number
  /** Blur center as a px offset from the canvas center. */
  centerX: number
  centerY: number
}

/** Pre-split blur shape still present in saved documents — `normalizeFx`
 *  converts it to `gaussianBlur` / `radialBlur` at read time. */
interface FxLegacyBlur {
  enabled: boolean
  type: 'gaussian' | 'zoom' | 'spin'
  amount: number
}

export interface FxNoise {
  enabled: boolean
  /** Opacity of the grain, 0–100. */
  amount: number
  /** Grain pixel size — 1 is fine film grain, higher is chunkier. */
  size: number
  /** Monochrome grain instead of colored. */
  mono: boolean
}

export interface FxRoughen {
  enabled: boolean
  /** How far the edge is chewed away, 0–100. */
  amount: number
  /** Size of the roughness features in px. */
  size: number
  /** Evolution — reshapes the noise field without changing its character. */
  seed?: number
}

export type WaveType = 'sine' | 'triangle' | 'square'

export interface FxWave {
  enabled: boolean
  axis: 'horizontal' | 'vertical'
  /** Wave shape — AE Wave Warp's wave type. Default sine. */
  waveType?: WaveType
  /** Peak displacement in px. */
  amplitude: number
  /** Distance between wave crests in px. */
  wavelength: number
  /** Phase offset in degrees. */
  phase: number
  /** Fade displacement to zero at both ends (AE's pinning), so the layer's
   *  edges stay put while the middle waves. */
  pinEdges?: boolean
}

export interface FxMirror {
  enabled: boolean
  /** Which half is kept and reflected onto the other. */
  keep: 'left' | 'right' | 'top' | 'bottom'
  /** Position of the mirror line, px from the canvas center along the axis
   *  perpendicular to the line. */
  offset?: number
  /** Tilt of the mirror line in degrees, -45…45. */
  angle?: number
}

export interface FxColorReplace {
  enabled: boolean
  from: string
  to: string
  /** How far a pixel may sit from `from` and still be replaced, 0–100. */
  tolerance: number
  /** Match on hue alone (AE Change to Color's hue mode) instead of full RGB
   *  distance — swaps every shade of a color regardless of brightness. */
  matchBy?: 'rgb' | 'hue'
  /** Falloff band past the tolerance edge, 0–100 — partial replacement instead
   *  of a hard cutoff. */
  softness?: number
  /** Keep the original luminance so shading and edges survive the swap. */
  preserveShading: boolean
}

/** Organic noise-driven warp — AE's Turbulent Displace. */
export interface FxTurbulence {
  enabled: boolean
  /** Peak displacement in px. */
  amount: number
  /** Feature size of the noise in px — bigger is billowier. */
  size: number
  /** Octaves of detail, 1–3. */
  complexity: number
  /** Evolution — reshapes the field without changing its character. */
  evolution: number
}

export interface FxVignette {
  enabled: boolean
  /** -100 (darken) … 100 (lighten). */
  amount: number
  /** How far from center the falloff starts, 0–100. */
  size: number
  /** Softness of the falloff band, 0–100. */
  feather: number
  /** 0 = ellipse matching the canvas, 100 = perfect circle. */
  roundness: number
}

/** Two-color luminance map — Tint/Duotone. */
export interface FxDuotone {
  enabled: boolean
  shadowColor: string
  highlightColor: string
  /** Blend with the original, 0–100. */
  amount: number
}

export interface FxBlinds {
  enabled: boolean
  /** How much is wiped away, 0–100. */
  completion: number
  direction: 'horizontal' | 'vertical'
  /** Stripe period in px. */
  width: number
}

/** Trailing ghost copies — AE's Echo, spatial flavor. */
export interface FxEcho {
  enabled: boolean
  /** Number of ghosts behind the original, 1–10. */
  copies: number
  offsetX: number
  offsetY: number
  /** Scale change per copy, percent (100 = none). */
  scaleStep: number
  /** Rotation per copy, degrees. */
  rotateStep: number
  /** Opacity multiplier per copy, 0–100. */
  opacityDecay: number
}

/** Clip a layer to another layer's silhouette. */
export interface FxMask {
  enabled: boolean
  /** Layer to clip against: a primary key ('image', 'shape', 'text', …) or an
   *  extra layer's id. */
  sourceId: string
  /** Keep what overlaps the mask (default), or punch it out. */
  invert?: boolean
}

export interface LayerEffects {
  mask?: FxMask
  echo?: FxEcho
  crop?: FxCrop
  mosaic?: FxMosaic
  gaussianBlur?: FxGaussianBlur
  radialBlur?: FxRadialBlur
  noise?: FxNoise
  roughen?: FxRoughen
  wave?: FxWave
  turbulence?: FxTurbulence
  mirror?: FxMirror
  colorReplace?: FxColorReplace
  duotone?: FxDuotone
  vignette?: FxVignette
  blinds?: FxBlinds
  transform?: FxTransform
  threeD?: Fx3D
  /** Pipeline order — effect keys plus `'grade'`. Missing keys self-heal into
   *  their canonical `FX_PIPELINE_KEYS` slot (see `fxOrder`). */
  order?: string[]
}

/**
 * Read-time migration for saved documents: the original single `blur` effect
 * (with a gaussian/zoom/spin type switch) became two independent effects.
 * Returns the input untouched when there is nothing to convert.
 */
export function normalizeFx(fx: LayerEffects | undefined): LayerEffects | undefined {
  if (!fx) return fx
  const legacy = (fx as LayerEffects & { blur?: FxLegacyBlur }).blur
  if (!legacy) return fx
  const { blur: _drop, ...rest } = fx as LayerEffects & { blur?: FxLegacyBlur }
  if (legacy.type === 'gaussian') {
    return { ...rest, gaussianBlur: rest.gaussianBlur ?? { enabled: legacy.enabled, amount: legacy.amount } }
  }
  return {
    ...rest,
    radialBlur:
      rest.radialBlur ??
      { enabled: legacy.enabled, type: legacy.type, amount: legacy.amount, centerX: 0, centerY: 0 },
  }
}

/* ── Defaults ──────────────────────────────────────────────────────────── */

export const defaultCrop = (): FxCrop => ({
  enabled: false, top: 0, right: 0, bottom: 0, left: 0, radius: 0, feather: 0,
})
export const defaultTransform = (): FxTransform => ({
  enabled: false, scale: 100, scaleY: 100, uniform: true, rotate: 0, skewX: 0, skewY: 0,
  offsetX: 0, offsetY: 0, anchorX: 0, anchorY: 0, opacity: 100, flipH: false, flipV: false,
})
export const default3D = (): Fx3D => ({
  enabled: false, rotateX: 0, rotateY: 0, distance: 1200, specular: false, specularStrength: 40,
})
export const defaultMosaic = (): FxMosaic => ({ enabled: false, size: 24, sizeV: 0 })
export const defaultGaussianBlur = (): FxGaussianBlur => ({ enabled: false, amount: 8 })
export const defaultRadialBlur = (): FxRadialBlur => ({
  enabled: false, type: 'zoom', amount: 40, centerX: 0, centerY: 0,
})
export const defaultNoise = (): FxNoise => ({ enabled: false, amount: 25, size: 1, mono: true })
export const defaultRoughen = (): FxRoughen => ({ enabled: false, amount: 40, size: 12, seed: 1 })
export const defaultWave = (): FxWave => ({
  enabled: false, axis: 'horizontal', waveType: 'sine', amplitude: 24, wavelength: 220, phase: 0, pinEdges: false,
})
export const defaultMirror = (): FxMirror => ({ enabled: false, keep: 'left', offset: 0, angle: 0 })
export const defaultColorReplace = (): FxColorReplace => ({
  enabled: false, from: '#FFFFFF', to: '#2DD4BF', tolerance: 20, matchBy: 'rgb', softness: 0,
  preserveShading: true,
})
export const defaultTurbulence = (): FxTurbulence => ({
  enabled: false, amount: 30, size: 120, complexity: 2, evolution: 0,
})
export const defaultVignette = (): FxVignette => ({
  enabled: false, amount: -60, size: 55, feather: 60, roundness: 0,
})
export const defaultDuotone = (): FxDuotone => ({
  enabled: false, shadowColor: '#1E293B', highlightColor: '#2DD4BF', amount: 100,
})
export const defaultBlinds = (): FxBlinds => ({
  enabled: false, completion: 40, direction: 'horizontal', width: 60,
})
export const defaultMask = (): FxMask => ({ enabled: false, sourceId: 'shape', invert: false })
export const defaultEcho = (): FxEcho => ({
  enabled: false, copies: 4, offsetX: 24, offsetY: 24, scaleStep: 100, rotateStep: 0, opacityDecay: 60,
})

/** True when at least one effect would change the layer. Callers should pass
 *  fx through `normalizeFx` first (a legacy `blur` is checked here anyway so a
 *  missed call site cannot silently drop an effect). */
export function isFxActive(fx: LayerEffects | undefined): boolean {
  if (!fx) return false
  return Boolean(
    fx.mask?.enabled ||
      fx.echo?.enabled ||
      fx.crop?.enabled ||
      fx.mosaic?.enabled ||
      fx.gaussianBlur?.enabled ||
      fx.radialBlur?.enabled ||
      (fx as LayerEffects & { blur?: FxLegacyBlur }).blur?.enabled ||
      fx.noise?.enabled ||
      fx.roughen?.enabled ||
      fx.wave?.enabled ||
      fx.turbulence?.enabled ||
      fx.mirror?.enabled ||
      fx.colorReplace?.enabled ||
      fx.duotone?.enabled ||
      fx.vignette?.enabled ||
      fx.blinds?.enabled ||
      fx.transform?.enabled ||
      fx.threeD?.enabled,
  )
}

/* ── Pipeline ordering ─────────────────────────────────────────────────── */

/**
 * The canonical stage order — also the default execution order. `'grade'` is
 * the layer's color grade (stored beside `fx`, but ordered with it, exactly
 * like Lumetri sits in an AE effect stack). `noise` is deliberately absent:
 * it always runs last so grain never gets smeared by a later stage.
 */
export const FX_PIPELINE_KEYS = [
  'echo',
  'crop',
  'mosaic',
  'wave',
  'turbulence',
  'mirror',
  'colorReplace',
  'duotone',
  'roughen',
  'gaussianBlur',
  'radialBlur',
  'vignette',
  'grade',
  'transform',
  'threeD',
  'blinds',
] as const

export type FxPipelineKey = (typeof FX_PIPELINE_KEYS)[number]

/**
 * The effective stage order for a layer — the saved `fx.order` where valid,
 * self-healing like the layer stack does: unknown keys drop out, keys the
 * saved order predates slot back in at their canonical position (above the
 * first canonical successor that survived).
 */
export function fxOrder(fx: LayerEffects | undefined): string[] {
  const canonical = [...FX_PIPELINE_KEYS] as string[]
  const saved = fx?.order
  if (!saved || saved.length === 0) return canonical
  const known = new Set(canonical)
  const out = saved.filter((k, i) => known.has(k) && saved.indexOf(k) === i)
  for (const key of canonical) {
    if (out.includes(key)) continue
    const after = canonical.slice(canonical.indexOf(key) + 1)
    const at = out.findIndex((k) => after.includes(k))
    if (at >= 0) out.splice(at, 0, key)
    else out.push(key)
  }
  return out
}

/* ── Color grade (an ordered stage like any other — AE's Lumetri) ──────── */

/**
 * A per-layer color grade, modeled on Premiere's Lumetri. Two halves:
 *
 * - CSS-filter half (brightness/contrast/saturation/hue/sepia/grayscale/
 *   invert/blur) — one filtered draw, cheap.
 * - Per-pixel half (exposure, highlights/shadows, whites/blacks, real
 *   temperature/tint white balance, vibrance) — a single LUT-driven
 *   `getImageData` pass, run only when one of those sliders is off zero.
 *
 * Filter percentages are neutral at 100, Lumetri fields at 0 — so a freshly
 * enabled grade changes nothing until a slider moves.
 */
export interface EffectColorGrade {
  enabled: boolean
  brightness: number
  contrast: number
  saturation: number
  /** Hue rotation in degrees, -180…180. */
  hue: number
  /** White balance, -100 (cool) … 100 (warm). 0 is neutral. */
  temperature: number
  sepia: number
  grayscale: number
  invert: number
  blur: number
  /** Exposure, -100…100 — ±2 photographic stops (50 = one stop). */
  exposure?: number
  /** Lift/lower the bright end, luminance-weighted. -100…100. */
  highlights?: number
  /** Lift/lower the dark end, luminance-weighted. -100…100. */
  shadows?: number
  /** White point: positive brightens the top end, negative pulls it down. */
  whites?: number
  /** Black point: positive lifts (faded film), negative crushes. */
  blacks?: number
  /** Green (-100) … magenta (100) balance — Lumetri's tint. */
  tint?: number
  /** Saturation push weighted toward the least-saturated pixels. -100…100. */
  vibrance?: number
}

export function defaultColorGrade(): EffectColorGrade {
  return {
    enabled: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    temperature: 0,
    sepia: 0,
    grayscale: 0,
    invert: 0,
    blur: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    tint: 0,
    vibrance: 0,
  }
}

const NEUTRAL_LUMETRI = { exposure: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, tint: 0, vibrance: 0 }

/** One-click starting points. Each replaces every slider at once (rather than
 *  merging) so a look always lands the same way. */
export const GRADE_PRESETS: Array<{ name: string; grade: Omit<EffectColorGrade, 'enabled'> }> = [
  { name: 'Neutral', grade: { brightness: 100, contrast: 100, saturation: 100, hue: 0, temperature: 0, sepia: 0, grayscale: 0, invert: 0, blur: 0, ...NEUTRAL_LUMETRI } },
  { name: 'Warm', grade: { brightness: 102, contrast: 104, saturation: 106, hue: 0, temperature: 40, sepia: 6, grayscale: 0, invert: 0, blur: 0, ...NEUTRAL_LUMETRI, tint: 6 } },
  { name: 'Cool', grade: { brightness: 100, contrast: 106, saturation: 104, hue: 0, temperature: -40, sepia: 0, grayscale: 0, invert: 0, blur: 0, ...NEUTRAL_LUMETRI } },
  { name: 'Punch', grade: { brightness: 100, contrast: 122, saturation: 112, hue: 0, temperature: 6, sepia: 0, grayscale: 0, invert: 0, blur: 0, ...NEUTRAL_LUMETRI, shadows: -12, vibrance: 35 } },
  { name: 'Faded', grade: { brightness: 104, contrast: 88, saturation: 82, hue: 0, temperature: 10, sepia: 10, grayscale: 0, invert: 0, blur: 0, ...NEUTRAL_LUMETRI, blacks: 30, whites: -12 } },
  { name: 'Noir', grade: { brightness: 100, contrast: 126, saturation: 100, hue: 0, temperature: 0, sepia: 0, grayscale: 100, invert: 0, blur: 0, ...NEUTRAL_LUMETRI, shadows: -10, whites: 10 } },
  { name: 'Vintage', grade: { brightness: 102, contrast: 92, saturation: 88, hue: -4, temperature: 26, sepia: 30, grayscale: 0, invert: 0, blur: 0, ...NEUTRAL_LUMETRI, blacks: 22, tint: 8 } },
]

/** True when the Lumetri (per-pixel) half of the grade would change nothing. */
export function gradeHasPixelPass(g: EffectColorGrade): boolean {
  return (
    (g.exposure ?? 0) !== 0 ||
    (g.highlights ?? 0) !== 0 ||
    (g.shadows ?? 0) !== 0 ||
    (g.whites ?? 0) !== 0 ||
    (g.blacks ?? 0) !== 0 ||
    (g.temperature ?? 0) !== 0 ||
    (g.tint ?? 0) !== 0 ||
    (g.vibrance ?? 0) !== 0
  )
}

/** True when the grade would not change a single pixel — lets the renderer
 *  skip its stage entirely. Reads defensively: grades saved before a field
 *  existed stay neutral. */
export function isNeutralGrade(g: EffectColorGrade | undefined): boolean {
  if (!g || !g.enabled) return true
  return (
    (g.brightness ?? 100) === 100 &&
    (g.contrast ?? 100) === 100 &&
    (g.saturation ?? 100) === 100 &&
    (g.hue ?? 0) === 0 &&
    (g.sepia ?? 0) === 0 &&
    (g.grayscale ?? 0) === 0 &&
    (g.invert ?? 0) === 0 &&
    (g.blur ?? 0) === 0 &&
    !gradeHasPixelPass(g)
  )
}

/**
 * Per-channel 256-entry LUTs folding exposure, the whites/blacks endpoint
 * remap, and the temperature/tint white balance — everything in the pixel
 * pass that doesn't depend on a pixel's neighbors or its own luminance mix.
 */
export function buildGradeLuts(g: EffectColorGrade): { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray } {
  const lutR = new Uint8ClampedArray(256)
  const lutG = new Uint8ClampedArray(256)
  const lutB = new Uint8ClampedArray(256)
  const k = Math.pow(2, (g.exposure ?? 0) / 50) // 50 slider units = one stop
  const black = (g.blacks ?? 0) * 0.5
  const white = 255 + (g.whites ?? 0) * 0.5
  const t = (g.temperature ?? 0) / 100
  const ti = (g.tint ?? 0) / 100
  const scaleR = 1 + t * 0.28
  const scaleG = 1 - ti * 0.22
  const scaleB = 1 - t * 0.28
  for (let v = 0; v < 256; v++) {
    const exposed = v * k
    const remapped = (exposed / 255) * (white - black) + black
    lutR[v] = remapped * scaleR
    lutG[v] = remapped * scaleG
    lutB[v] = remapped * scaleB
  }
  return { r: lutR, g: lutG, b: lutB }
}

/** The grade as a canvas `filter` string. Temperature is handled separately —
 *  there is no CSS filter for it. */
export function gradeFilterString(g: EffectColorGrade): string {
  const parts: string[] = []
  if (g.brightness !== 100) parts.push(`brightness(${g.brightness}%)`)
  if (g.contrast !== 100) parts.push(`contrast(${g.contrast}%)`)
  if (g.saturation !== 100) parts.push(`saturate(${g.saturation}%)`)
  if (g.hue !== 0) parts.push(`hue-rotate(${g.hue}deg)`)
  if (g.sepia !== 0) parts.push(`sepia(${g.sepia}%)`)
  if (g.grayscale !== 0) parts.push(`grayscale(${g.grayscale}%)`)
  if (g.invert !== 0) parts.push(`invert(${g.invert}%)`)
  if (g.blur !== 0) parts.push(`blur(${g.blur}px)`)
  return parts.length ? parts.join(' ') : 'none'
}

/** The Lumetri half: one in-place pixel pass using the LUTs plus the two
 *  luminance-dependent adjustments (highlights/shadows and vibrance). */
function applyGradePixelPass(ctx: CanvasRenderingContext2D, g: EffectColorGrade, w: number, h: number): void {
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, w, h)
  } catch {
    return
  }
  const px = data.data
  const luts = buildGradeLuts(g)
  const hi = (g.highlights ?? 0) / 100
  const sh = (g.shadows ?? 0) / 100
  const vib = (g.vibrance ?? 0) / 100
  const tonal = hi !== 0 || sh !== 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    let r: number = luts.r[px[i]]
    let gg: number = luts.g[px[i + 1]]
    let b: number = luts.b[px[i + 2]]
    if (tonal || vib !== 0) {
      const luma = (r * 0.299 + gg * 0.587 + b * 0.114) / 255
      if (tonal) {
        // Smooth luminance weights: highlights act on the bright end
        // (weight = luma²), shadows on the dark end ((1−luma)²).
        const lift = hi * luma * luma * 80 + sh * (1 - luma) * (1 - luma) * 80
        r += lift
        gg += lift
        b += lift
      }
      if (vib !== 0) {
        // Push away from gray, weighted toward the least-saturated pixels so
        // already-vivid colors don't clip (that's vibrance vs saturation).
        const mx = Math.max(r, gg, b)
        const mn = Math.min(r, gg, b)
        const sat = mx > 0 ? (mx - mn) / 255 : 0
        const boost = 1 + vib * (1 - sat)
        const l255 = luma * 255
        r = l255 + (r - l255) * boost
        gg = l255 + (gg - l255) * boost
        b = l255 + (b - l255) * boost
      }
    }
    px[i] = r < 0 ? 0 : r > 255 ? 255 : r
    px[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg
    px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
  ctx.putImageData(data, 0, 0)
}

/* ── Small pure helpers (unit-tested) ──────────────────────────────────── */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full.slice(0, 6), 16)
  return Number.isFinite(n)
    ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    : { r: 0, g: 0, b: 0 }
}

/** The rectangle left after cropping, clamped so it never inverts. */
export function croppedRect(
  c: FxCrop,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const left = Math.max(0, c.left)
  const top = Math.max(0, c.top)
  const w = Math.max(1, width - left - Math.max(0, c.right))
  const h = Math.max(1, height - top - Math.max(0, c.bottom))
  return { x: Math.min(left, width - 1), y: Math.min(top, height - 1), w, h }
}

/**
 * Displacement of one row/column under the wave, in px. `total` is the length
 * of the perpendicular axis — required for edge pinning, which tapers the
 * displacement to zero at both ends (AE Wave Warp's pinning).
 */
export function waveOffsetAt(w: FxWave, position: number, total?: number): number {
  const wavelength = Math.max(1, w.wavelength)
  const t = (position / wavelength) * Math.PI * 2 + (w.phase * Math.PI) / 180
  const s = Math.sin(t)
  let shape: number
  switch (w.waveType ?? 'sine') {
    case 'triangle':
      // Fold the sine's phase into a linear zig-zag with the same period.
      shape = (2 / Math.PI) * Math.asin(s)
      break
    case 'square':
      shape = Math.sign(s)
      break
    default:
      shape = s
  }
  let out = shape * w.amplitude
  if (w.pinEdges && total && total > 0) {
    out *= Math.sin((Math.PI * Math.max(0, Math.min(total, position))) / total)
  }
  return out
}

/**
 * Affine reflection across the mirror line as a `setTransform` 6-tuple
 * [a, b, c, d, e, f]. The line passes through the canvas center pushed by
 * `offset` along the keep-axis, tilted by `angle` degrees.
 */
export function mirrorMatrix(
  keep: FxMirror['keep'],
  offset: number,
  angle: number,
  width: number,
  height: number,
): [number, number, number, number, number, number] {
  const rad = (angle * Math.PI) / 180
  // Unit normal of the line: vertical line for left/right, horizontal for
  // top/bottom, rotated by the tilt.
  const vertical = keep === 'left' || keep === 'right'
  const nx = vertical ? Math.cos(rad) : -Math.sin(rad)
  const ny = vertical ? Math.sin(rad) : Math.cos(rad)
  const cx = width / 2 + (vertical ? offset : 0)
  const cy = height / 2 + (vertical ? 0 : offset)
  // p' = p - 2((p−C)·n)n  →  linear part I − 2nnᵀ, translation 2(C·n)n.
  const dot = cx * nx + cy * ny
  return [1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, 2 * dot * nx, 2 * dot * ny]
}

/** Hue of an RGB color in degrees, or null for near-gray pixels where hue is
 *  meaningless. */
export function rgbToHue(r: number, g: number, b: number): number | null {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d < 8) return null // too gray to carry a hue
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return ((h * 60) % 360 + 360) % 360
}

/**
 * How strongly a pixel is replaced: 1 inside the tolerance, falling linearly
 * to 0 across the softness band beyond it (AE Change to Color's softness).
 */
export function replaceBlendFactor(dist: number, limit: number, softness: number): number {
  if (dist <= limit) return 1
  const band = limit * (Math.max(0, softness) / 50)
  if (band <= 0 || dist > limit + band) return 0
  return 1 - (dist - limit) / band
}

/**
 * Perspective scale for a point `u` px from the layer's center along the axis
 * being rotated. Returns null when the point sits behind the viewer, which the
 * slice renderer skips.
 */
export function perspectiveScaleAt(u: number, angleDeg: number, distance: number): number | null {
  const rad = (angleDeg * Math.PI) / 180
  const z = u * Math.sin(rad)
  const d = Math.max(1, distance)
  const denom = d + z
  if (denom <= 1) return null
  return d / denom
}

/* ── Canvas helpers ────────────────────────────────────────────────────── */

type Canvas = HTMLCanvasElement

function makeCanvas(w: number, h: number): Canvas {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function cloneSize(src: Canvas): Canvas {
  return makeCanvas(src.width, src.height)
}

function roundRectSub(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/* ── Effects ───────────────────────────────────────────────────────────── */

function applyCrop(src: Canvas, c: FxCrop): Canvas {
  const { x, y, w, h } = croppedRect(c, src.width, src.height)
  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  const feather = Math.max(0, c.feather ?? 0)
  if (feather <= 0) {
    ctx.save()
    ctx.beginPath()
    roundRectSub(ctx, x, y, w, h, c.radius)
    ctx.clip()
    ctx.drawImage(src, 0, 0)
    ctx.restore()
    return out
  }
  // Feathered: blur the crop mask itself, then keep the layer only where the
  // soft mask has coverage. Rounded corners and feather compose.
  const mask = cloneSize(src)
  const mctx = mask.getContext('2d')
  if (!mctx) return src
  mctx.filter = `blur(${feather}px)`
  mctx.fillStyle = '#000'
  mctx.beginPath()
  // Inset the rect by half the feather so the softness eats inward instead of
  // growing the crop outward.
  roundRectSub(mctx, x + feather / 2, y + feather / 2, Math.max(1, w - feather), Math.max(1, h - feather), c.radius)
  mctx.fill()
  mctx.filter = 'none'
  ctx.drawImage(src, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  return out
}

function applyMosaic(src: Canvas, m: FxMosaic): Canvas {
  const blockW = Math.max(2, Math.round(m.size))
  const blockH = Math.max(2, Math.round(m.sizeV || m.size))
  const sw = Math.max(1, Math.round(src.width / blockW))
  const sh = Math.max(1, Math.round(src.height / blockH))
  const small = makeCanvas(sw, sh)
  const sctx = small.getContext('2d')
  if (!sctx) return src
  sctx.imageSmoothingEnabled = true
  sctx.drawImage(src, 0, 0, sw, sh)

  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, sw, sh, 0, 0, out.width, out.height)
  return out
}

function applyWave(src: Canvas, w: FxWave): Canvas {
  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  if (w.axis === 'horizontal') {
    // Shift each row sideways — slices are GPU blits, far cheaper than a
    // per-pixel displacement map.
    for (let y = 0; y < src.height; y++) {
      ctx.drawImage(src, 0, y, src.width, 1, waveOffsetAt(w, y, src.height), y, src.width, 1)
    }
  } else {
    for (let x = 0; x < src.width; x++) {
      ctx.drawImage(src, x, 0, 1, src.height, x, waveOffsetAt(w, x, src.width), 1, src.height)
    }
  }
  return out
}

/** Clip `ctx` to one side of the mirror line. `sign` picks the half-plane:
 *  -1 keeps where (p−C)·n < 0 (the left/top side), +1 the other. */
function clipMirrorHalf(
  ctx: CanvasRenderingContext2D,
  m: FxMirror,
  W: number,
  H: number,
  sign: -1 | 1,
): void {
  const rad = ((m.angle ?? 0) * Math.PI) / 180
  const vertical = m.keep === 'left' || m.keep === 'right'
  const nx = (vertical ? Math.cos(rad) : -Math.sin(rad)) * sign
  const ny = (vertical ? Math.sin(rad) : Math.cos(rad)) * sign
  const cx = W / 2 + (vertical ? m.offset ?? 0 : 0)
  const cy = H / 2 + (vertical ? 0 : m.offset ?? 0)
  // Half-plane as a huge rectangle: two far points along the line direction
  // (−ny, nx), extruded away from the normal.
  const L = W + H
  const dx = -ny
  const dy = nx
  ctx.beginPath()
  ctx.moveTo(cx + dx * L, cy + dy * L)
  ctx.lineTo(cx - dx * L, cy - dy * L)
  ctx.lineTo(cx - dx * L - nx * L, cy - dy * L - ny * L)
  ctx.lineTo(cx + dx * L - nx * L, cy + dy * L - ny * L)
  ctx.closePath()
  ctx.clip()
}

function applyMirror(src: Canvas, m: FxMirror): Canvas {
  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  const { width: W, height: H } = src
  // The kept side sits on the negative side of the normal for left/top and the
  // positive side for right/bottom.
  const keepSign: -1 | 1 = m.keep === 'left' || m.keep === 'top' ? -1 : 1

  // Kept half, untouched.
  ctx.save()
  clipMirrorHalf(ctx, m, W, H, keepSign)
  ctx.drawImage(src, 0, 0)
  ctx.restore()

  // Other half: the kept pixels reflected across the line.
  const [a, b, c, d, e, f] = mirrorMatrix(m.keep, m.offset ?? 0, m.angle ?? 0, W, H)
  ctx.save()
  clipMirrorHalf(ctx, m, W, H, (keepSign * -1) as -1 | 1)
  ctx.transform(a, b, c, d, e, f)
  ctx.drawImage(src, 0, 0)
  ctx.restore()
  return out
}

function applyGaussianBlur(src: Canvas, b: FxGaussianBlur): Canvas {
  if (b.amount <= 0) return src
  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  ctx.filter = `blur(${b.amount}px)`
  ctx.drawImage(src, 0, 0)
  ctx.filter = 'none'
  return out
}

function applyRadialBlur(src: Canvas, b: FxRadialBlur): Canvas {
  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  const steps = 12
  const cx = src.width / 2 + (b.centerX ?? 0)
  const cy = src.height / 2 + (b.centerY ?? 0)
  ctx.globalAlpha = 1 / steps
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1 || 1)
    ctx.save()
    ctx.translate(cx, cy)
    if (b.type === 'zoom') ctx.scale(1 + (b.amount / 100) * t, 1 + (b.amount / 100) * t)
    else ctx.rotate(((b.amount / 100) * t * Math.PI) / 8)
    ctx.translate(-cx, -cy)
    ctx.drawImage(src, 0, 0)
    ctx.restore()
  }
  ctx.globalAlpha = 1
  return out
}

/** The color grade as a stage: the Lumetri pixel pass in place, then the
 *  CSS-filter half via one filtered draw (each skipped when neutral). */
function applyGrade(src: Canvas, g: EffectColorGrade): Canvas {
  if (gradeHasPixelPass(g)) {
    const sctx = src.getContext('2d')
    if (sctx) applyGradePixelPass(sctx, g, src.width, src.height)
  }
  const filter = gradeFilterString(g)
  if (filter === 'none') return src
  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  ctx.filter = filter
  ctx.drawImage(src, 0, 0)
  ctx.filter = 'none'
  return out
}

/** Cheap deterministic value noise — same input always gives the same field, so
 *  the grain does not crawl between renders. */
function valueNoise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return n - Math.floor(n)
}

/** Smoothly interpolated (and octaved) value noise in [-1, 1]. Deterministic
 *  per (x, y, seed) so turbulence fields don't crawl between renders. */
export function smoothNoise2(x: number, y: number, seed: number, octaves = 1): number {
  let total = 0
  let amp = 1
  let norm = 0
  let fx = x
  let fy = y
  for (let o = 0; o < Math.max(1, Math.min(3, octaves)); o++) {
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const sx = tx * tx * (3 - 2 * tx) // smoothstep
    const sy = ty * ty * (3 - 2 * ty)
    const n00 = valueNoise(x0, y0, seed + o * 13)
    const n10 = valueNoise(x0 + 1, y0, seed + o * 13)
    const n01 = valueNoise(x0, y0 + 1, seed + o * 13)
    const n11 = valueNoise(x0 + 1, y0 + 1, seed + o * 13)
    const v = (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy
    total += (v * 2 - 1) * amp
    norm += amp
    amp *= 0.5
    fx *= 2
    fy *= 2
  }
  return total / norm
}

/** Duotone LUT: luminance → lerp(shadow, highlight) per channel. */
export function duotoneLut(shadowColor: string, highlightColor: string): {
  r: Uint8ClampedArray
  g: Uint8ClampedArray
  b: Uint8ClampedArray
} {
  const s = hexToRgb(shadowColor)
  const h = hexToRgb(highlightColor)
  const r = new Uint8ClampedArray(256)
  const g = new Uint8ClampedArray(256)
  const b = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const t = v / 255
    r[v] = s.r + (h.r - s.r) * t
    g[v] = s.g + (h.g - s.g) * t
    b[v] = s.b + (h.b - s.b) * t
  }
  return { r, g, b }
}

function applyRoughen(src: Canvas, r: FxRoughen): Canvas {
  const ctx = src.getContext('2d')
  if (!ctx) return src
  const { width: W, height: H } = src
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, W, H)
  } catch {
    return src
  }
  const px = data.data
  const cell = Math.max(1, r.size)
  const strength = Math.max(0, Math.min(1, r.amount / 100))
  const seed = r.seed ?? 1
  for (let y = 0; y < H; y++) {
    const ny = Math.floor(y / cell)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4 + 3
      const a = px[i]
      if (a === 0) continue
      const n = valueNoise(Math.floor(x / cell), ny, seed)
      // Push the alpha away from its midpoint by the noise field: solid
      // interior survives, the soft edge band breaks up into flecks.
      const v = a / 255 - (1 - n) * strength
      px[i] = v > 0.5 ? 255 : 0
    }
  }
  ctx.putImageData(data, 0, 0)
  return src
}

function applyColorReplace(src: Canvas, c: FxColorReplace): Canvas {
  const ctx = src.getContext('2d')
  if (!ctx) return src
  const { width: W, height: H } = src
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, W, H)
  } catch {
    return src
  }
  const px = data.data
  const from = hexToRgb(c.from)
  const to = hexToRgb(c.to)
  const byHue = (c.matchBy ?? 'rgb') === 'hue'
  const softness = c.softness ?? 0
  // Tolerance is a share of the maximum possible distance for the chosen
  // metric: full RGB distance, or 180° of hue.
  const maxDist = byHue ? 180 : Math.sqrt(3 * 255 * 255)
  const limit = (Math.max(0, Math.min(100, c.tolerance)) / 100) * maxDist
  const fromHue = rgbToHue(from.r, from.g, from.b)
  const fromLum = (from.r * 0.299 + from.g * 0.587 + from.b * 0.114) || 1

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    let dist: number
    if (byHue) {
      const h = rgbToHue(px[i], px[i + 1], px[i + 2])
      // Gray pixels carry no hue — they can never hue-match a colored target.
      if (h === null || fromHue === null) continue
      const d = Math.abs(h - fromHue)
      dist = Math.min(d, 360 - d)
    } else {
      const dr = px[i] - from.r
      const dg = px[i + 1] - from.g
      const db = px[i + 2] - from.b
      dist = Math.sqrt(dr * dr + dg * dg + db * db)
    }
    const t = replaceBlendFactor(dist, limit, softness)
    if (t <= 0) continue
    let nr: number
    let ng: number
    let nb: number
    if (c.preserveShading) {
      // Carry the pixel's own brightness across so gradients and anti-aliased
      // edges keep their shape instead of flattening to one flat color. In RGB
      // mode brightness is measured relative to the picked color; in hue mode
      // (where any shade matches) relative to the replacement color.
      const lum = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
      const toLum = to.r * 0.299 + to.g * 0.587 + to.b * 0.114 || 1
      const k = byHue ? lum / toLum : lum / fromLum
      nr = to.r * k
      ng = to.g * k
      nb = to.b * k
    } else {
      nr = to.r
      ng = to.g
      nb = to.b
    }
    px[i] = Math.max(0, Math.min(255, px[i] + (nr - px[i]) * t))
    px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + (ng - px[i + 1]) * t))
    px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + (nb - px[i + 2]) * t))
  }
  ctx.putImageData(data, 0, 0)
  return src
}

/** Noise tiles are expensive to build and identical between frames, so keep the
 *  last few around keyed by the settings that shape them. */
const noiseTiles = new Map<string, Canvas>()

function noiseTile(n: FxNoise): Canvas | null {
  const key = `${n.size}|${n.mono}`
  const cached = noiseTiles.get(key)
  if (cached) return cached
  const cell = Math.max(1, Math.round(n.size))
  const tilePx = 128
  const tile = makeCanvas(tilePx * cell, tilePx * cell)
  const ctx = tile.getContext('2d')
  if (!ctx) return null
  const small = makeCanvas(tilePx, tilePx)
  const sctx = small.getContext('2d')
  if (!sctx) return null
  const img = sctx.createImageData(tilePx, tilePx)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = v
    img.data[i + 1] = n.mono ? v : Math.random() * 255
    img.data[i + 2] = n.mono ? v : Math.random() * 255
    img.data[i + 3] = 255
  }
  sctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, tile.width, tile.height)
  if (noiseTiles.size > 8) noiseTiles.clear()
  noiseTiles.set(key, tile)
  return tile
}

function applyNoise(src: Canvas, n: FxNoise): Canvas {
  const ctx = src.getContext('2d')
  if (!ctx) return src
  const tile = noiseTile(n)
  if (!tile) return src
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return src
  ctx.save()
  // `source-atop` keeps the grain inside the layer's own silhouette.
  ctx.globalCompositeOperation = 'source-atop'
  ctx.globalAlpha = Math.max(0, Math.min(1, n.amount / 100))
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, src.width, src.height)
  ctx.restore()
  return src
}

/* ── New AE staples: echo, turbulence, duotone, vignette, blinds ───────── */

function applyEcho(src: Canvas, e: FxEcho): Canvas {
  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  const cx = src.width / 2
  const cy = src.height / 2
  const copies = Math.max(1, Math.min(10, Math.round(e.copies)))
  // Ghosts back-to-front, original last on top.
  for (let i = copies; i >= 1; i--) {
    ctx.save()
    ctx.globalAlpha = Math.pow(Math.max(0, Math.min(100, e.opacityDecay)) / 100, i)
    ctx.translate(cx + e.offsetX * i, cy + e.offsetY * i)
    ctx.rotate((e.rotateStep * i * Math.PI) / 180)
    const s = Math.pow(Math.max(1, e.scaleStep) / 100, i)
    ctx.scale(s, s)
    ctx.translate(-cx, -cy)
    ctx.drawImage(src, 0, 0)
    ctx.restore()
  }
  ctx.drawImage(src, 0, 0)
  return out
}

/** Cached unit displacement fields for turbulence, keyed by everything that
 *  shapes them. Values in [-1, 1]; `amount` scales at sample time. */
const turbulenceFields = new Map<string, { gw: number; gh: number; step: number; dx: Float32Array; dy: Float32Array }>()

function turbulenceField(t: FxTurbulence, W: number, H: number) {
  const step = Math.max(4, Math.round(t.size / 4))
  const key = `${t.size}|${t.complexity}|${t.evolution}|${W}x${H}`
  const hit = turbulenceFields.get(key)
  if (hit) return hit
  const gw = Math.ceil(W / step) + 2
  const gh = Math.ceil(H / step) + 2
  const dx = new Float32Array(gw * gh)
  const dy = new Float32Array(gw * gh)
  const freq = step / Math.max(8, t.size)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      dx[gy * gw + gx] = smoothNoise2(gx * freq, gy * freq, 100 + t.evolution, t.complexity)
      dy[gy * gw + gx] = smoothNoise2(gx * freq, gy * freq, 700 + t.evolution, t.complexity)
    }
  }
  const field = { gw, gh, step, dx, dy }
  if (turbulenceFields.size > 4) turbulenceFields.clear()
  turbulenceFields.set(key, field)
  return field
}

function applyTurbulence(src: Canvas, t: FxTurbulence): Canvas {
  const sctx = src.getContext('2d')
  const out = cloneSize(src)
  const octx = out.getContext('2d')
  if (!sctx || !octx) return src
  const W = src.width
  const H = src.height
  let sData: ImageData
  try {
    sData = sctx.getImageData(0, 0, W, H)
  } catch {
    return src
  }
  const oData = octx.createImageData(W, H)
  const sp = sData.data
  const op = oData.data
  const { gw, step, dx, dy } = turbulenceField(t, W, H)
  const amt = t.amount
  for (let y = 0; y < H; y++) {
    const gy = y / step
    const gy0 = Math.floor(gy)
    const ty = gy - gy0
    for (let x = 0; x < W; x++) {
      const gx = x / step
      const gx0 = Math.floor(gx)
      const tx = gx - gx0
      const i00 = gy0 * gw + gx0
      const i10 = i00 + 1
      const i01 = i00 + gw
      const i11 = i01 + 1
      // Bilinear sample of the coarse field.
      const fdx = (dx[i00] * (1 - tx) + dx[i10] * tx) * (1 - ty) + (dx[i01] * (1 - tx) + dx[i11] * tx) * ty
      const fdy = (dy[i00] * (1 - tx) + dy[i10] * tx) * (1 - ty) + (dy[i01] * (1 - tx) + dy[i11] * tx) * ty
      const sx = Math.round(x - fdx * amt)
      const sy = Math.round(y - fdy * amt)
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue
      const si = (sy * W + sx) * 4
      const oi = (y * W + x) * 4
      op[oi] = sp[si]
      op[oi + 1] = sp[si + 1]
      op[oi + 2] = sp[si + 2]
      op[oi + 3] = sp[si + 3]
    }
  }
  octx.putImageData(oData, 0, 0)
  return out
}

function applyDuotone(src: Canvas, d: FxDuotone): Canvas {
  const ctx = src.getContext('2d')
  if (!ctx) return src
  let data: ImageData
  try {
    data = ctx.getImageData(0, 0, src.width, src.height)
  } catch {
    return src
  }
  const px = data.data
  const lut = duotoneLut(d.shadowColor, d.highlightColor)
  const t = Math.max(0, Math.min(1, d.amount / 100))
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    const luma = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114)
    px[i] += (lut.r[luma] - px[i]) * t
    px[i + 1] += (lut.g[luma] - px[i + 1]) * t
    px[i + 2] += (lut.b[luma] - px[i + 2]) * t
  }
  ctx.putImageData(data, 0, 0)
  return src
}

function applyVignette(src: Canvas, v: FxVignette): Canvas {
  const ctx = src.getContext('2d')
  if (!ctx || v.amount === 0) return src
  const W = src.width
  const H = src.height
  const cx = W / 2
  const cy = H / 2
  // Roundness morphs the ellipse (canvas aspect) toward a circle.
  const round = Math.max(0, Math.min(100, v.roundness)) / 100
  const maxR = Math.sqrt(cx * cx + cy * cy)
  const rx = cx + (maxR - cx) * 0.5
  const scaleY = 1 + (H / W - 1) * (1 - round)
  const inner = (Math.max(0, Math.min(100, v.size)) / 100) * maxR
  const feather = Math.max(1, (v.feather / 100) * maxR)
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.translate(cx, cy)
  ctx.scale(1, scaleY)
  const g = ctx.createRadialGradient(0, 0, Math.max(0, inner), 0, 0, inner + feather)
  const a = Math.min(1, Math.abs(v.amount) / 100)
  const color = v.amount < 0 ? '0,0,0' : '255,255,255'
  g.addColorStop(0, `rgba(${color},0)`)
  g.addColorStop(1, `rgba(${color},${a.toFixed(3)})`)
  ctx.fillStyle = g
  ctx.fillRect(-rx * 2, -maxR * 2, rx * 4, maxR * 4)
  ctx.restore()
  return src
}

function applyBlinds(src: Canvas, b: FxBlinds): Canvas {
  const ctx = src.getContext('2d')
  if (!ctx) return src
  const completion = Math.max(0, Math.min(100, b.completion)) / 100
  if (completion <= 0) return src
  const period = Math.max(4, Math.round(b.width))
  const gap = period * completion
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  if (b.direction === 'horizontal') {
    for (let y = 0; y < src.height; y += period) ctx.fillRect(0, y, src.width, gap)
  } else {
    for (let x = 0; x < src.width; x += period) ctx.fillRect(x, 0, gap, src.height)
  }
  ctx.restore()
  return src
}

/**
 * Run the full ordered pipeline: every enabled stage in `fxOrder`, then noise
 * last. Returns the canvas to composite — possibly the same one, since some
 * effects work in place. Callers pass fx through `normalizeFx` first.
 */
export function applyLayerEffects(
  src: Canvas,
  fx: LayerEffects | undefined,
  grade?: EffectColorGrade,
): Canvas {
  let out = src
  for (const key of fxOrder(fx)) {
    switch (key) {
      case 'echo':
        if (fx?.echo?.enabled) out = applyEcho(out, fx.echo)
        break
      case 'crop':
        if (fx?.crop?.enabled) out = applyCrop(out, fx.crop)
        break
      case 'mosaic':
        if (fx?.mosaic?.enabled) out = applyMosaic(out, fx.mosaic)
        break
      case 'wave':
        if (fx?.wave?.enabled) out = applyWave(out, fx.wave)
        break
      case 'turbulence':
        if (fx?.turbulence?.enabled && fx.turbulence.amount !== 0) out = applyTurbulence(out, fx.turbulence)
        break
      case 'mirror':
        if (fx?.mirror?.enabled) out = applyMirror(out, fx.mirror)
        break
      case 'colorReplace':
        if (fx?.colorReplace?.enabled) out = applyColorReplace(out, fx.colorReplace)
        break
      case 'duotone':
        if (fx?.duotone?.enabled) out = applyDuotone(out, fx.duotone)
        break
      case 'vignette':
        if (fx?.vignette?.enabled) out = applyVignette(out, fx.vignette)
        break
      case 'blinds':
        if (fx?.blinds?.enabled) out = applyBlinds(out, fx.blinds)
        break
      case 'roughen':
        if (fx?.roughen?.enabled) out = applyRoughen(out, fx.roughen)
        break
      case 'gaussianBlur':
        if (fx?.gaussianBlur?.enabled) out = applyGaussianBlur(out, fx.gaussianBlur)
        break
      case 'radialBlur':
        if (fx?.radialBlur?.enabled) out = applyRadialBlur(out, fx.radialBlur)
        break
      case 'grade':
        if (grade && !isNeutralGrade(grade)) out = applyGrade(out, grade)
        break
      case 'transform':
        if (fx?.transform?.enabled) out = applyTransform(out, fx.transform)
        break
      case 'threeD':
        if (fx?.threeD?.enabled && (fx.threeD.rotateX || fx.threeD.rotateY)) out = applyThreeD(out, fx.threeD)
        break
    }
  }
  if (fx?.noise?.enabled) out = applyNoise(out, fx.noise)
  return out
}

/* ── Stages: transform + basic 3D ──────────────────────────────────────── */

/**
 * Draw a rotated-in-depth plane by slicing it. Canvas 2D transforms are affine
 * and cannot do perspective, so each slice is drawn with its own scale — enough
 * for a convincing card tilt.
 */
function draw3DSlices(
  ctx: CanvasRenderingContext2D,
  src: Canvas,
  angle: number,
  distance: number,
  axis: 'x' | 'y',
): void {
  const W = src.width
  const H = src.height
  const cx = W / 2
  const cy = H / 2
  const SLICES = 64
  if (axis === 'y') {
    const step = W / SLICES
    for (let i = 0; i < SLICES; i++) {
      const u0 = -W / 2 + i * step
      const u1 = u0 + step
      const s0 = perspectiveScaleAt(u0, angle, distance)
      const s1 = perspectiveScaleAt(u1, angle, distance)
      if (s0 === null || s1 === null) continue
      const rad = (angle * Math.PI) / 180
      const x0 = cx + u0 * Math.cos(rad) * s0
      const x1 = cx + u1 * Math.cos(rad) * s1
      const sMid = (s0 + s1) / 2
      const dw = x1 - x0
      if (Math.abs(dw) < 0.01) continue
      const dh = H * sMid
      ctx.drawImage(src, i * step, 0, step, H, x0, cy - dh / 2, dw, dh)
    }
    return
  }
  const step = H / SLICES
  for (let i = 0; i < SLICES; i++) {
    const u0 = -H / 2 + i * step
    const u1 = u0 + step
    const s0 = perspectiveScaleAt(u0, angle, distance)
    const s1 = perspectiveScaleAt(u1, angle, distance)
    if (s0 === null || s1 === null) continue
    const rad = (angle * Math.PI) / 180
    const y0 = cy + u0 * Math.cos(rad) * s0
    const y1 = cy + u1 * Math.cos(rad) * s1
    const sMid = (s0 + s1) / 2
    const dh = y1 - y0
    if (Math.abs(dh) < 0.01) continue
    const dw = W * sMid
    ctx.drawImage(src, 0, i * step, W, step, cx - dw / 2, y0, dw, dh)
  }
}

/**
 * Transform as a raster stage, working about the layer's center so scaling and
 * rotation feel anchored rather than flying off toward the origin. Content
 * pushed outside the canvas clips, exactly as it did when this ran at
 * composite time.
 */
function applyTransform(src: Canvas, t: FxTransform): Canvas {
  const out = cloneSize(src)
  const ctx = out.getContext('2d')
  if (!ctx) return src
  // Pivot = layer center pushed by the anchor, like AE's anchor point.
  const cx = src.width / 2 + (t.anchorX ?? 0)
  const cy = src.height / 2 + (t.anchorY ?? 0)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, (t.opacity ?? 100) / 100))
  ctx.translate(cx + t.offsetX, cy + t.offsetY)
  ctx.rotate((t.rotate * Math.PI) / 180)
  if (t.skewX || t.skewY) {
    ctx.transform(1, Math.tan((t.skewY * Math.PI) / 180), Math.tan((t.skewX * Math.PI) / 180), 1, 0, 0)
  }
  const sx = Math.max(0.01, t.scale / 100)
  const sy = Math.max(0.01, (t.uniform ?? true ? t.scale : t.scaleY ?? t.scale) / 100)
  ctx.scale(sx * (t.flipH ? -1 : 1), sy * (t.flipV ? -1 : 1))
  ctx.translate(-cx, -cy)
  ctx.drawImage(src, 0, 0)
  ctx.restore()
  return out
}

/** Basic 3D as a raster stage: tilt about Y, then about X. Composing them
 *  exactly would need a real quad rasterizer; sequential passes read correctly
 *  for the small angles this control is for. */
function applyThreeD(src: Canvas, d3: Fx3D): Canvas {
  let plane = src
  if (d3.rotateY) {
    const mid = makeCanvas(src.width, src.height)
    const mctx = mid.getContext('2d')
    if (mctx) {
      draw3DSlices(mctx, plane, d3.rotateY, d3.distance, 'y')
      plane = mid
    }
  }
  if (d3.rotateX) {
    const mid = makeCanvas(src.width, src.height)
    const mctx = mid.getContext('2d')
    if (mctx) {
      draw3DSlices(mctx, plane, d3.rotateX, d3.distance, 'x')
      plane = mid
    }
  }
  if (d3.specular && (d3.specularStrength ?? 0) > 0) {
    // AE Basic 3D's specular highlight: a soft white sheen swept across the
    // tilted plane, brighter the harder the plane is tilted.
    const ctx = plane === src ? null : plane.getContext('2d')
    if (ctx) {
      const W = plane.width
      const H = plane.height
      const tilt = Math.min(1, (Math.abs(d3.rotateX) + Math.abs(d3.rotateY)) / 45)
      const alpha = (Math.max(0, Math.min(100, d3.specularStrength ?? 40)) / 100) * 0.6 * tilt
      if (alpha > 0.01) {
        // The lit edge is the one rotated toward the viewer.
        const along = Math.abs(d3.rotateY) >= Math.abs(d3.rotateX)
        const sign = along ? Math.sign(d3.rotateY) : Math.sign(d3.rotateX)
        const g = along
          ? ctx.createLinearGradient(sign > 0 ? W : 0, 0, sign > 0 ? 0 : W, 0)
          : ctx.createLinearGradient(0, sign > 0 ? 0 : H, 0, sign > 0 ? H : 0)
        g.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(3)})`)
        g.addColorStop(0.55, 'rgba(255,255,255,0)')
        ctx.save()
        ctx.globalCompositeOperation = 'source-atop'
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }
    }
  }
  return plane
}
