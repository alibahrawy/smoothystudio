import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultColorGrade,
  defaultGaussianBlur,
  defaultMosaic,
  defaultRadialBlur,
  defaultStudioDoc,
  defaultTransform,
  renderStudioDoc,
  type LayerEffects,
} from './studio'

/**
 * Integration check for the ordered effect pipeline. There is no canvas
 * implementation under Node, so this drives `renderStudioDoc` with recording
 * stand-in contexts and asserts on the operations they receive. Every context
 * (the target AND each scratch canvas the pipeline creates) logs into one
 * shared, sequenced event list — which is what lets these tests observe stage
 * ORDER, not just occurrence.
 */
const events: string[] = []

function makeRecordingCtx(tag: string): CanvasRenderingContext2D {
  const target = {
    measureText: () => ({ width: 100, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 5 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => ({}),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(200),
      width: w,
      height: h,
    }),
  } as Record<string, unknown>

  return new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop]
      return (...args: unknown[]) => {
        events.push(`${tag}:${prop}(${args.map((a) => (typeof a === 'object' ? 'obj' : String(a))).join(',')})`)
        return undefined
      }
    },
    set(t, prop: string, value) {
      events.push(`${tag}:${prop}=${String(value)}`)
      t[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

beforeAll(() => {
  let scratchN = 0
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => makeRecordingCtx(`scratch${++scratchN}`),
      }),
    },
  })
})

beforeEach(() => {
  events.length = 0
})

const mainEvents = (): string[] => events.filter((e) => e.startsWith('main:'))
const filterSets = (): string[] =>
  events.filter((e) => /:filter=/.test(e) && !e.endsWith('filter=none')).map((e) => e.split('filter=')[1])

/** A document containing exactly one visible layer: the border frame. Kept
 *  small so per-pixel effects don't allocate megabytes in tests. */
function borderOnlyDoc(
  grade?: Partial<ReturnType<typeof defaultColorGrade>>,
  fx?: LayerEffects,
) {
  const base = defaultStudioDoc()
  return {
    ...base,
    canvas: { ...base.canvas, width: 200, height: 120, bg: 'transparent' as const },
    border: {
      ...base.border,
      enabled: true,
      thickness: 40,
      ...(grade ? { grade: { ...defaultColorGrade(), enabled: true, ...grade } } : {}),
      ...(fx ? { fx } : {}),
    },
    layerOrder: ['border'],
    removedPrimaries: ['logo', 'image', 'shape', 'text', 'icon'],
  }
}

describe('color grade render path', () => {
  it('paints an ungraded layer straight onto the target context', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc())
    expect(mainEvents().some((c) => c.includes('fill('))).toBe(true)
    expect(filterSets()).toEqual([])
    expect(mainEvents().some((c) => c.includes('drawImage('))).toBe(false)
  })

  it('runs a graded layer through a filtered scratch pass', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc({ contrast: 150, saturation: 120 }))
    expect(filterSets()).toContain('contrast(150%) saturate(120%)')
    // The finished layer is blitted back onto the target.
    expect(mainEvents().some((c) => c.includes('drawImage('))).toBe(true)
  })

  it('skips every hop when the grade sits at neutral', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc({}))
    expect(filterSets()).toEqual([])
    expect(mainEvents().some((c) => c.includes('drawImage('))).toBe(false)
  })

  it('runs the Lumetri pixel pass for exposure without touching the filter chain', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc({ exposure: 40 }))
    expect(events.some((e) => e.includes('putImageData('))).toBe(true)
    expect(filterSets()).toEqual([])
  })

  it('combines the pixel pass and filter half in one grade stage', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc({ vibrance: 30, contrast: 120 }))
    expect(events.some((e) => e.includes('putImageData('))).toBe(true)
    expect(filterSets()).toContain('contrast(120%)')
  })
})

describe('ordered effect pipeline', () => {
  it('runs grade and gaussian blur as separate stages, not one filter chain', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc({ contrast: 140 }, {
      gaussianBlur: { ...defaultGaussianBlur(), enabled: true, amount: 4 },
    }))
    expect(filterSets()).toContain('blur(4px)')
    expect(filterSets()).toContain('contrast(140%)')
    expect(filterSets().some((f) => f.includes('contrast') && f.includes('blur'))).toBe(false)
  })

  it('respects the default order: mosaic rasterizes before gaussian blur', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc(undefined, {
      mosaic: { ...defaultMosaic(), enabled: true, size: 10 },
      gaussianBlur: { ...defaultGaussianBlur(), enabled: true, amount: 6 },
    }))
    const mosaicAt = events.findIndex((e) => e.includes('imageSmoothingEnabled=false'))
    const blurAt = events.findIndex((e) => e.includes('filter=blur(6px)'))
    expect(mosaicAt).toBeGreaterThanOrEqual(0)
    expect(blurAt).toBeGreaterThan(mosaicAt)
  })

  it('flips the stage sequence when fx.order says blur first', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc(undefined, {
      mosaic: { ...defaultMosaic(), enabled: true, size: 10 },
      gaussianBlur: { ...defaultGaussianBlur(), enabled: true, amount: 6 },
      order: ['gaussianBlur', 'mosaic'],
    }))
    const mosaicAt = events.findIndex((e) => e.includes('imageSmoothingEnabled=false'))
    const blurAt = events.findIndex((e) => e.includes('filter=blur(6px)'))
    expect(blurAt).toBeGreaterThanOrEqual(0)
    expect(mosaicAt).toBeGreaterThan(blurAt)
  })

  it('keeps a radial blur out of the filter chain and draws it by hand', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc(undefined, {
      radialBlur: { ...defaultRadialBlur(), enabled: true, type: 'zoom', amount: 50 },
    }))
    expect(filterSets()).toEqual([])
    expect(events.some((c) => c.includes('drawImage('))).toBe(true)
  })

  it('normalizes a legacy blur object from a saved document', () => {
    const legacyFx = { blur: { enabled: true, type: 'gaussian', amount: 9 } } as unknown as LayerEffects
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc(undefined, legacyFx))
    expect(filterSets()).toContain('blur(9px)')
  })

  it('runs the new staple stages through their canvas ops', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc(undefined, {
      vignette: { enabled: true, amount: -60, size: 55, feather: 60, roundness: 0 },
      blinds: { enabled: true, completion: 40, direction: 'horizontal', width: 20 },
      duotone: { enabled: true, shadowColor: '#000000', highlightColor: '#FFFFFF', amount: 100 },
    }))
    // Vignette composites source-atop, blinds erase destination-out, and the
    // duotone pixel pass writes back with putImageData.
    expect(events.some((e) => e.includes('globalCompositeOperation=source-atop'))).toBe(true)
    expect(events.some((e) => e.includes('globalCompositeOperation=destination-out'))).toBe(true)
    expect(events.some((e) => e.includes('putImageData('))).toBe(true)
  })

  it('applies a transform about the layer center as a raster stage', () => {
    renderStudioDoc(makeRecordingCtx('main'), borderOnlyDoc(undefined, {
      transform: { ...defaultTransform(), enabled: true, rotate: 90, scale: 50, flipH: true },
    }))
    // Rotation in radians, flipped/halved scale, anchored on the 200×120 center
    // — all on a scratch context now, with a plain blit to the target.
    expect(events.some((e) => !e.startsWith('main:') && e.includes(`rotate(${Math.PI / 2})`))).toBe(true)
    expect(events.some((e) => !e.startsWith('main:') && e.includes('scale(-0.5,0.5)'))).toBe(true)
    expect(events.some((e) => !e.startsWith('main:') && e.includes('translate(100,60)'))).toBe(true)
    expect(mainEvents().some((c) => c.includes('drawImage('))).toBe(true)
  })
})
