import { describe, expect, it } from 'vitest'
import {
  boxOverlaps,
  contrastRatio,
  dominantColors,
  hexToRgb,
  regionLuminance,
  relativeLuminance,
  visualBalance,
} from './studio-analyze'

/** RGBA buffer of solid `color` with an optional rect of another colour. */
function buffer(
  w: number,
  h: number,
  base: [number, number, number, number],
  rect?: { x: number; y: number; w: number; h: number; c: [number, number, number, number] },
): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) px.set(base, i * 4)
  if (rect) {
    for (let y = rect.y; y < rect.y + rect.h; y++)
      for (let x = rect.x; x < rect.x + rect.w; x++) px.set(rect.c, (y * w + x) * 4)
  }
  return px
}

describe('colour math', () => {
  it('matches the WCAG anchors', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5)
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 5)
    // Black on white is the canonical 21:1.
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5)
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 5) // order-independent
    expect(contrastRatio(0.5, 0.5)).toBe(1)
  })

  it('parses hex colours', () => {
    expect(hexToRgb('#FF8000')).toEqual({ r: 255, g: 128, b: 0 })
    expect(hexToRgb('0080FF')).toEqual({ r: 0, g: 128, b: 255 })
    expect(hexToRgb('#fff')).toBeNull() // shorthand unsupported, by design
  })
})

describe('regionLuminance', () => {
  it('averages only the requested box', () => {
    // Dark field with a white square; sampling the square reads white.
    const px = buffer(20, 20, [0, 0, 0, 255], { x: 5, y: 5, w: 5, h: 5, c: [255, 255, 255, 255] })
    expect(regionLuminance(px, 20, { x: 5, y: 5, width: 5, height: 5 })).toBeCloseTo(1, 5)
    expect(regionLuminance(px, 20, { x: 0, y: 0, width: 4, height: 4 })).toBeCloseTo(0, 5)
  })

  it('ignores transparent pixels', () => {
    const px = buffer(4, 4, [255, 255, 255, 0], { x: 0, y: 0, w: 1, h: 1, c: [255, 255, 255, 255] })
    // Only the single opaque pixel counts.
    expect(regionLuminance(px, 4, { x: 0, y: 0, width: 4, height: 4 })).toBeCloseTo(1, 5)
  })
})

describe('visualBalance', () => {
  it('puts the mass where the contrast is', () => {
    // Grey field, bright square in the top-left quadrant.
    const px = buffer(40, 40, [128, 128, 128, 255], { x: 2, y: 2, w: 10, h: 10, c: [255, 255, 255, 255] })
    const b = visualBalance(px, 40, 40)
    expect(b.quadrants[0]).toBeGreaterThan(0.5)
    expect(b.centerX).toBeLessThan(0)
    expect(b.centerY).toBeLessThan(0)
  })

  it('reports a flat image as even', () => {
    const b = visualBalance(buffer(10, 10, [90, 90, 90, 255]), 10, 10)
    expect(b.quadrants).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(b.centerX).toBe(0)
  })

  it('weights dark-on-bright the same as bright-on-dark', () => {
    const bright = visualBalance(
      buffer(40, 40, [0, 0, 0, 255], { x: 22, y: 22, w: 10, h: 10, c: [255, 255, 255, 255] }),
      40,
      40,
    )
    expect(bright.quadrants[3]).toBeGreaterThan(0.5) // deviation, not brightness
  })
})

describe('dominantColors', () => {
  it('ranks by coverage and averages within a bucket', () => {
    const px = buffer(10, 10, [255, 0, 0, 255], { x: 0, y: 0, w: 10, h: 3, c: [0, 0, 255, 255] })
    const top = dominantColors(px, 2)
    expect(top[0].hex).toBe('#FF0000')
    expect(top[0].share).toBeCloseTo(0.7, 5)
    expect(top[1].hex).toBe('#0000FF')
  })

  it('skips fully transparent pixels', () => {
    expect(dominantColors(buffer(4, 4, [10, 10, 10, 0]))).toEqual([])
  })
})

describe('boxOverlaps', () => {
  const box = (id: string, x: number, y: number, w: number, h: number) => ({
    id, x, y, width: w, height: h, empty: false,
  })

  it('reports the intersection as a fraction of the smaller box', () => {
    const out = boxOverlaps([box('a', 0, 0, 100, 100), box('b', 50, 0, 200, 100)])
    // 50×100 overlap; smaller box is a (10000) → 0.5.
    expect(out).toEqual([{ a: 'a', b: 'b', fraction: 0.5 }])
  })

  it('stays quiet below the threshold and for disjoint boxes', () => {
    expect(boxOverlaps([box('a', 0, 0, 100, 100), box('b', 99, 99, 100, 100)])).toEqual([])
    expect(boxOverlaps([box('a', 0, 0, 10, 10), box('b', 50, 50, 10, 10)])).toEqual([])
  })

  it('ignores empty boxes', () => {
    expect(
      boxOverlaps([{ ...box('a', 0, 0, 100, 100), empty: true }, box('b', 0, 0, 100, 100)]),
    ).toEqual([])
  })
})
