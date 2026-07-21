import { describe, expect, it } from 'vitest'
import { resolveAnchor, type DocMeasurement } from './studio-measure'

/** A 1920×1080 canvas with a headline block sitting left of centre. */
const M: DocMeasurement = {
  canvas: { width: 1920, height: 1080 },
  safeArea: { x: 120, y: 120, width: 1680, height: 840 },
  layers: [
    // x 200→1000, y 400→640 in canvas coords.
    { id: 'text', x: 200, y: 400, width: 800, height: 240, centerX: -360, centerY: -20, empty: false },
    { id: 'gone', x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0, empty: true },
  ],
}
const self = { width: 400, height: 60 }

describe('anchor resolution', () => {
  it('lines a layer up with the left edge of another', () => {
    const { x } = resolveAnchor(M, { to: 'text', edge: 'left' }, self)
    // Target left edge is 200 → −760 from centre; the layer is centred on it.
    expect(x).toBe(-760 + self.width / 2)
  })

  it('lines a layer up with the right edge', () => {
    const { x } = resolveAnchor(M, { to: 'text', edge: 'right' }, self)
    expect(x).toBe(40 - self.width / 2) // right edge 1000 → +40
  })

  it('stacks below with a gap, clearing the target', () => {
    const { y } = resolveAnchor(M, { to: 'text', edge: 'below', gap: 40 }, self)
    // Target bottom 640 → +100 from centre, plus gap, plus half our height.
    expect(y).toBe(100 + 40 + self.height / 2)
  })

  it('stacks above with a gap', () => {
    const { y } = resolveAnchor(M, { to: 'text', edge: 'above', gap: 20 }, self)
    expect(y).toBe(-140 - 20 - self.height / 2) // target top 400 → −140
  })

  it('places beside a layer horizontally', () => {
    expect(resolveAnchor(M, { to: 'text', edge: 'right-of', gap: 30 }, self).x)
      .toBe(40 + 30 + self.width / 2)
    expect(resolveAnchor(M, { to: 'text', edge: 'left-of', gap: 30 }, self).x)
      .toBe(-760 - 30 - self.width / 2)
  })

  it('anchors to the canvas as well as to layers', () => {
    expect(resolveAnchor(M, { to: 'canvas', edge: 'center' }, self)).toEqual({ x: 0, y: 0 })
    expect(resolveAnchor(M, { to: 'canvas', edge: 'top' }, self).y).toBe(-540 + self.height / 2)
  })

  it('applies the nudge after resolving', () => {
    const { x, y } = resolveAnchor(M, { to: 'text', edge: 'center', offsetX: 12, offsetY: -8 }, self)
    expect(x).toBe(-360 + 12)
    expect(y).toBe(-20 - 8)
  })

  it('falls back to the offset when the target drew nothing or is missing', () => {
    expect(resolveAnchor(M, { to: 'gone', edge: 'below', offsetX: 5 }, self)).toEqual({ x: 5, y: 0 })
    expect(resolveAnchor(M, { to: 'nope', edge: 'below' }, self)).toEqual({ x: 0, y: 0 })
  })
})
