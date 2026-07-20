import { describe, expect, it } from 'vitest'
import {
  buildGradeLuts,
  croppedRect,
  defaultBlinds,
  defaultColorGrade,
  defaultCrop,
  defaultDuotone,
  defaultEcho,
  defaultGaussianBlur,
  defaultMosaic,
  defaultRadialBlur,
  defaultTurbulence,
  defaultVignette,
  defaultWave,
  duotoneLut,
  FX_PIPELINE_KEYS,
  fxOrder,
  gradeHasPixelPass,
  hexToRgb,
  isNeutralGrade,
  isFxActive,
  mirrorMatrix,
  normalizeFx,
  perspectiveScaleAt,
  replaceBlendFactor,
  rgbToHue,
  smoothNoise2,
  waveOffsetAt,
  type EffectColorGrade,
  type FxCrop,
  type FxWave,
  type LayerEffects,
} from './studio-effects'

describe('effect activation', () => {
  it('is inactive for a missing or all-off stack', () => {
    expect(isFxActive(undefined)).toBe(false)
    expect(isFxActive({})).toBe(false)
    expect(isFxActive({ mosaic: defaultMosaic(), crop: defaultCrop() })).toBe(false)
  })

  it('is active as soon as one effect is switched on', () => {
    expect(isFxActive({ mosaic: { ...defaultMosaic(), enabled: true } })).toBe(true)
    expect(isFxActive({ gaussianBlur: { ...defaultGaussianBlur(), enabled: true } })).toBe(true)
  })

  it('sees an enabled legacy blur even before normalization', () => {
    const legacy = { blur: { enabled: true, type: 'zoom', amount: 40 } } as unknown as LayerEffects
    expect(isFxActive(legacy)).toBe(true)
  })
})

describe('legacy blur migration', () => {
  it('passes through fx with nothing to convert', () => {
    const fx: LayerEffects = { mosaic: defaultMosaic() }
    expect(normalizeFx(fx)).toBe(fx)
    expect(normalizeFx(undefined)).toBeUndefined()
  })

  it('converts a gaussian-type legacy blur', () => {
    const legacy = { blur: { enabled: true, type: 'gaussian', amount: 12 } } as unknown as LayerEffects
    const fx = normalizeFx(legacy)!
    expect(fx.gaussianBlur).toEqual({ enabled: true, amount: 12 })
    expect((fx as Record<string, unknown>).blur).toBeUndefined()
  })

  it('converts zoom/spin legacy blurs to radial with a centered pivot', () => {
    const legacy = { blur: { enabled: true, type: 'spin', amount: 60 } } as unknown as LayerEffects
    expect(normalizeFx(legacy)!.radialBlur).toEqual({
      enabled: true, type: 'spin', amount: 60, centerX: 0, centerY: 0,
    })
  })

  it('never clobbers an already-split blur', () => {
    const fx = {
      blur: { enabled: true, type: 'gaussian', amount: 99 },
      gaussianBlur: { enabled: true, amount: 5 },
    } as unknown as LayerEffects
    expect(normalizeFx(fx)!.gaussianBlur).toEqual({ enabled: true, amount: 5 })
  })
})

describe('pipeline ordering', () => {
  it('defaults to the canonical order', () => {
    expect(fxOrder(undefined)).toEqual([...FX_PIPELINE_KEYS])
    expect(fxOrder({})).toEqual([...FX_PIPELINE_KEYS])
  })

  it('honors a saved order and drops unknown keys', () => {
    const saved = ['gaussianBlur', 'mosaic', 'made-up', 'crop']
    const order = fxOrder({ order: saved })
    expect(order.indexOf('gaussianBlur')).toBeLessThan(order.indexOf('mosaic'))
    expect(order.indexOf('mosaic')).toBeLessThan(order.indexOf('crop'))
    expect(order).not.toContain('made-up')
  })

  it('slots keys a saved order predates back at their canonical position', () => {
    // Saved before 'grade' and the blur split existed.
    const order = fxOrder({ order: ['mosaic', 'crop', 'transform'] })
    expect(order).toContain('grade')
    expect(order).toContain('radialBlur')
    // grade's canonical slot is just before transform.
    expect(order.indexOf('grade')).toBeLessThan(order.indexOf('transform'))
    expect(order.indexOf('radialBlur')).toBeLessThan(order.indexOf('grade'))
  })

  it('contains every canonical key exactly once', () => {
    const order = fxOrder({ order: ['threeD', 'crop', 'threeD'] })
    expect([...order].sort()).toEqual([...FX_PIPELINE_KEYS].sort())
  })
})

describe('crop geometry', () => {
  const crop = (over: Partial<FxCrop> = {}): FxCrop => ({ ...defaultCrop(), ...over })

  it('trims each side independently', () => {
    expect(croppedRect(crop({ left: 100, top: 50, right: 200, bottom: 25 }), 1000, 600)).toEqual({
      x: 100,
      y: 50,
      w: 700,
      h: 525,
    })
  })

  it('never inverts when the crops overlap', () => {
    const r = croppedRect(crop({ left: 900, right: 900 }), 1000, 600)
    expect(r.w).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThan(0)
    expect(r.x).toBeLessThan(1000)
  })

  it('ignores negative insets', () => {
    expect(croppedRect(crop({ left: -50, top: -50 }), 1000, 600)).toEqual({ x: 0, y: 0, w: 1000, h: 600 })
  })
})

describe('wave warp', () => {
  const wave = (over: Partial<FxWave> = {}): FxWave => ({ ...defaultWave(), ...over })

  it('is zero at the origin and peaks a quarter wavelength in', () => {
    const w = wave({ amplitude: 50, wavelength: 400, phase: 0 })
    expect(waveOffsetAt(w, 0)).toBeCloseTo(0)
    expect(waveOffsetAt(w, 100)).toBeCloseTo(50)
    expect(waveOffsetAt(w, 300)).toBeCloseTo(-50)
  })

  it('repeats every wavelength', () => {
    const w = wave({ amplitude: 30, wavelength: 200 })
    expect(waveOffsetAt(w, 37)).toBeCloseTo(waveOffsetAt(w, 237))
  })

  it('shifts with phase and survives a zero wavelength', () => {
    expect(waveOffsetAt(wave({ amplitude: 10, wavelength: 400, phase: 90 }), 0)).toBeCloseTo(10)
    expect(Number.isFinite(waveOffsetAt(wave({ wavelength: 0 }), 5))).toBe(true)
  })

  it('folds a triangle wave with the same period and peaks', () => {
    const w = wave({ waveType: 'triangle', amplitude: 40, wavelength: 400 })
    expect(waveOffsetAt(w, 0)).toBeCloseTo(0)
    expect(waveOffsetAt(w, 100)).toBeCloseTo(40) // peak
    expect(waveOffsetAt(w, 50)).toBeCloseTo(20) // linear ramp, not sinusoidal
    expect(waveOffsetAt(w, 300)).toBeCloseTo(-40)
  })

  it('snaps a square wave to ±amplitude', () => {
    const w = wave({ waveType: 'square', amplitude: 25, wavelength: 400 })
    expect(waveOffsetAt(w, 100)).toBeCloseTo(25)
    expect(waveOffsetAt(w, 300)).toBeCloseTo(-25)
  })

  it('pins displacement to zero at both edges', () => {
    const w = wave({ amplitude: 50, wavelength: 130, phase: 90, pinEdges: true })
    expect(waveOffsetAt(w, 0, 600)).toBeCloseTo(0)
    expect(waveOffsetAt(w, 600, 600)).toBeCloseTo(0)
    // Mid-span still waves.
    expect(Math.abs(waveOffsetAt(w, 300, 600))).toBeGreaterThan(0)
    // Without a total, pinning is a no-op rather than a crash.
    expect(Number.isFinite(waveOffsetAt(w, 10))).toBe(true)
  })
})

describe('mirror matrix', () => {
  const apply = (
    m: [number, number, number, number, number, number],
    x: number,
    y: number,
  ): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

  it('reflects across the vertical center line at angle 0', () => {
    const m = mirrorMatrix('left', 0, 0, 1000, 600)
    expect(apply(m, 100, 300)).toEqual([900, 300])
    expect(apply(m, 500, 42)[0]).toBeCloseTo(500) // points on the line stay put
  })

  it('honors the line offset', () => {
    const m = mirrorMatrix('left', 200, 0, 1000, 600)
    // Line at x=700: x=600 reflects to x=800.
    expect(apply(m, 600, 100)[0]).toBeCloseTo(800)
  })

  it('reflects across the horizontal line for top/bottom', () => {
    const m = mirrorMatrix('top', 0, 0, 1000, 600)
    expect(apply(m, 250, 100)).toEqual([250, 500])
  })

  it('is an involution — reflecting twice is the identity', () => {
    const m = mirrorMatrix('left', 120, 30, 1000, 600)
    const [x1, y1] = apply(m, 333, 444)
    const [x2, y2] = apply(m, x1, y1)
    expect(x2).toBeCloseTo(333)
    expect(y2).toBeCloseTo(444)
  })
})

describe('color replace matching', () => {
  it('is fully replaced inside tolerance and cut off with no softness', () => {
    expect(replaceBlendFactor(10, 20, 0)).toBe(1)
    expect(replaceBlendFactor(20, 20, 0)).toBe(1)
    expect(replaceBlendFactor(21, 20, 0)).toBe(0)
  })

  it('falls off linearly across the softness band', () => {
    // Band = limit * softness/50 = 20 for limit 20, softness 50.
    expect(replaceBlendFactor(30, 20, 50)).toBeCloseTo(0.5)
    expect(replaceBlendFactor(40, 20, 50)).toBeCloseTo(0)
    expect(replaceBlendFactor(41, 20, 50)).toBe(0)
  })

  it('reads hue and refuses grays', () => {
    expect(rgbToHue(255, 0, 0)).toBeCloseTo(0)
    expect(rgbToHue(0, 255, 0)).toBeCloseTo(120)
    expect(rgbToHue(0, 0, 255)).toBeCloseTo(240)
    expect(rgbToHue(128, 128, 128)).toBeNull()
    expect(rgbToHue(255, 255, 255)).toBeNull()
  })
})

describe('3D perspective', () => {
  it('leaves the layer untouched at zero rotation', () => {
    expect(perspectiveScaleAt(300, 0, 1200)).toBeCloseTo(1)
    expect(perspectiveScaleAt(-300, 0, 1200)).toBeCloseTo(1)
  })

  it('shrinks the receding edge and enlarges the approaching one', () => {
    const far = perspectiveScaleAt(400, 40, 1200)!
    const near = perspectiveScaleAt(-400, 40, 1200)!
    expect(far).toBeLessThan(1)
    expect(near).toBeGreaterThan(1)
  })

  it('exaggerates with a closer viewer', () => {
    const gentle = perspectiveScaleAt(400, 40, 4000)!
    const strong = perspectiveScaleAt(400, 40, 600)!
    expect(strong).toBeLessThan(gentle)
  })

  it('rejects points that fall behind the viewer', () => {
    expect(perspectiveScaleAt(-5000, 60, 300)).toBeNull()
  })
})

describe('blur defaults', () => {
  it('ships radial blur centered with a zoom type', () => {
    expect(defaultRadialBlur()).toMatchObject({ type: 'zoom', centerX: 0, centerY: 0 })
    expect(defaultGaussianBlur().enabled).toBe(false)
  })
})

describe('Lumetri grade math', () => {
  const grade = (over: Partial<EffectColorGrade> = {}): EffectColorGrade => ({
    ...defaultColorGrade(),
    enabled: true,
    ...over,
  })

  it('builds identity LUTs at neutral', () => {
    const { r, g, b } = buildGradeLuts(grade())
    for (const v of [0, 1, 64, 128, 200, 255]) {
      expect(r[v]).toBe(v)
      expect(g[v]).toBe(v)
      expect(b[v]).toBe(v)
    }
  })

  it('doubles values at +1 stop of exposure (50 slider units)', () => {
    const { r } = buildGradeLuts(grade({ exposure: 50 }))
    expect(r[60]).toBe(120)
    expect(r[200]).toBe(255) // clamped
  })

  it('lifts the black point and pulls the white point', () => {
    const lifted = buildGradeLuts(grade({ blacks: 60 }))
    expect(lifted.r[0]).toBe(30) // 60 * 0.5
    const pulled = buildGradeLuts(grade({ whites: -60 }))
    expect(pulled.r[255]).toBe(225)
    expect(pulled.r[0]).toBe(0)
  })

  it('warms by raising red and lowering blue, tints toward magenta by cutting green', () => {
    const warm = buildGradeLuts(grade({ temperature: 50 }))
    expect(warm.r[128]).toBeGreaterThan(128)
    expect(warm.b[128]).toBeLessThan(128)
    expect(warm.g[128]).toBe(128)
    const magenta = buildGradeLuts(grade({ tint: 50 }))
    expect(magenta.g[128]).toBeLessThan(128)
    expect(magenta.r[128]).toBe(128)
  })

  it('keeps LUTs monotonic under combined adjustments', () => {
    const { r } = buildGradeLuts(grade({ exposure: 30, blacks: 20, whites: 15, temperature: 25 }))
    for (let v = 1; v < 256; v++) expect(r[v]).toBeGreaterThanOrEqual(r[v - 1])
  })

  it('gates the pixel pass on the Lumetri fields only', () => {
    expect(gradeHasPixelPass(grade())).toBe(false)
    expect(gradeHasPixelPass(grade({ contrast: 150 }))).toBe(false) // CSS-filter half
    expect(gradeHasPixelPass(grade({ vibrance: 10 }))).toBe(true)
    expect(gradeHasPixelPass(grade({ temperature: -5 }))).toBe(true)
  })

  it('treats Lumetri fields as part of neutrality', () => {
    expect(isNeutralGrade(grade())).toBe(true)
    expect(isNeutralGrade(grade({ highlights: 20 }))).toBe(false)
    // A grade saved before the Lumetri fields existed reads as neutral.
    const legacy = { ...grade() }
    delete (legacy as Record<string, unknown>).exposure
    delete (legacy as Record<string, unknown>).vibrance
    expect(isNeutralGrade(legacy)).toBe(true)
  })
})

describe('new AE staples', () => {
  it('keeps the canonical order sane: echo first, blinds last, noise absent', () => {
    expect(FX_PIPELINE_KEYS[0]).toBe('echo')
    expect(FX_PIPELINE_KEYS[FX_PIPELINE_KEYS.length - 1]).toBe('blinds')
    expect(FX_PIPELINE_KEYS).not.toContain('noise' as never)
  })

  it('activates on each new effect', () => {
    expect(isFxActive({ turbulence: { ...defaultTurbulence(), enabled: true } })).toBe(true)
    expect(isFxActive({ vignette: { ...defaultVignette(), enabled: true } })).toBe(true)
    expect(isFxActive({ duotone: { ...defaultDuotone(), enabled: true } })).toBe(true)
    expect(isFxActive({ blinds: { ...defaultBlinds(), enabled: true } })).toBe(true)
    expect(isFxActive({ echo: { ...defaultEcho(), enabled: true } })).toBe(true)
  })

  it('builds a duotone LUT hitting both endpoints and the midpoint', () => {
    const lut = duotoneLut('#000000', '#FFFFFF')
    expect(lut.r[0]).toBe(0)
    expect(lut.r[255]).toBe(255)
    expect(lut.r[128]).toBeGreaterThan(120)
    expect(lut.r[128]).toBeLessThan(136)
    const teal = duotoneLut('#1E293B', '#2DD4BF')
    expect(teal.g[0]).toBe(0x29)
    expect(teal.g[255]).toBe(0xd4)
  })

  it('produces deterministic, seed-dependent smooth noise in range', () => {
    const a = smoothNoise2(3.7, 8.2, 5, 2)
    expect(smoothNoise2(3.7, 8.2, 5, 2)).toBe(a)
    expect(smoothNoise2(3.7, 8.2, 6, 2)).not.toBe(a)
    for (let i = 0; i < 50; i++) {
      const v = smoothNoise2(i * 0.37, i * 0.91, 1, 3)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('varies smoothly between lattice points', () => {
    // Two nearby samples inside one cell should not jump.
    const a = smoothNoise2(2.4, 5.5, 9)
    const b = smoothNoise2(2.45, 5.5, 9)
    expect(Math.abs(a - b)).toBeLessThan(0.3)
  })
})

describe('hex parsing', () => {
  it('reads long and short form', () => {
    expect(hexToRgb('#2DD4BF')).toEqual({ r: 45, g: 212, b: 191 })
    expect(hexToRgb('2DD4BF')).toEqual({ r: 45, g: 212, b: 191 })
    expect(hexToRgb('#FFF')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('falls back to black on junk rather than throwing', () => {
    expect(hexToRgb('#zzzzzz')).toEqual({ r: 0, g: 0, b: 0 })
  })
})
