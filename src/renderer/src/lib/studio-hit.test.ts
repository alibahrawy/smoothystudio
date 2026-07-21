import { describe, expect, it } from 'vitest'
import { canMoveLayer, layerPosition, moveLayerBy, setLayerPosition } from './studio-hit'
import type { StudioDoc } from './studio'

/** Only the fields these functions touch — the real doc is far larger. */
const doc = {
  canvas: { width: 1920, height: 1080 },
  align: { h: 'left', v: 'middle', safeZone: 120, offsetX: 10, offsetY: -20 },
  shape: { x: 100, y: 200 },
  image: { x: -50, y: 5 },
  logo: { corner: 'bottom-right', offsetX: 3, offsetY: 4 },
  extraTexts: [{ id: 'sub', x: 1, y: 2 }],
  extraShapes: [{ id: 'rule', x: 7, y: 8 }],
  extraLogos: [{ id: 'mark', offsetX: 11, offsetY: 12 }],
} as unknown as StudioDoc

describe('which layers can be dragged', () => {
  it('allows the layers that own a position', () => {
    for (const id of ['text', 'shape', 'image', 'logo', 'sub', 'rule', 'mark']) {
      expect(canMoveLayer(doc, id), id).toBe(true)
    }
  })

  it('refuses the layers that do not', () => {
    // The icon is anchored to the title and the border is measured inward from
    // the canvas edges — dragging either would silently change something else.
    expect(canMoveLayer(doc, 'icon')).toBe(false)
    expect(canMoveLayer(doc, 'border')).toBe(false)
    expect(canMoveLayer(doc, 'nope')).toBe(false)
  })
})

describe('reading a layer position', () => {
  it('finds the field each layer actually uses', () => {
    // The title moves by its alignment offset, not an x/y.
    expect(layerPosition(doc, 'text')).toEqual({ x: 10, y: -20 })
    expect(layerPosition(doc, 'shape')).toEqual({ x: 100, y: 200 })
    // A logo is corner-pinned, so its position is the nudge.
    expect(layerPosition(doc, 'logo')).toEqual({ x: 3, y: 4 })
    expect(layerPosition(doc, 'sub')).toEqual({ x: 1, y: 2 })
    expect(layerPosition(doc, 'mark')).toEqual({ x: 11, y: 12 })
  })

  it('returns null for a layer with no position', () => {
    expect(layerPosition(doc, 'border')).toBeNull()
  })
})

describe('moving a layer', () => {
  it('shifts a primary by the delta', () => {
    const next = moveLayerBy(doc, 'shape', 15, -25)
    expect(next.shape.x).toBe(115)
    expect(next.shape.y).toBe(175)
  })

  it('writes the title through its alignment offset', () => {
    const next = moveLayerBy(doc, 'text', 5, 5)
    expect(next.align.offsetX).toBe(15)
    expect(next.align.offsetY).toBe(-15)
  })

  it('writes a logo through its corner nudge', () => {
    // +x is right and +y is down for every corner, so a drag maps 1:1.
    const next = moveLayerBy(doc, 'logo', -3, 6)
    expect(next.logo.offsetX).toBe(0)
    expect(next.logo.offsetY).toBe(10)
  })

  it('moves an extra layer by id, leaving its siblings alone', () => {
    const withTwo = { ...doc, extraTexts: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 50, y: 50 }] } as unknown as StudioDoc
    const next = moveLayerBy(withTwo, 'b', 10, 10) as unknown as { extraTexts: Array<{ id: string; x: number; y: number }> }
    expect(next.extraTexts.find((t) => t.id === 'a')).toEqual({ id: 'a', x: 0, y: 0 })
    expect(next.extraTexts.find((t) => t.id === 'b')).toEqual({ id: 'b', x: 60, y: 60 })
  })

  it('rounds to whole pixels — a drag produces fractional deltas', () => {
    const next = moveLayerBy(doc, 'shape', 0.4, 1.6)
    expect(next.shape.x).toBe(100)
    expect(next.shape.y).toBe(202)
  })

  it('does not mutate the original document', () => {
    const before = JSON.stringify(doc)
    moveLayerBy(doc, 'shape', 99, 99)
    setLayerPosition(doc, 'text', 1, 1)
    expect(JSON.stringify(doc)).toBe(before)
  })

  it('is a no-op for a layer that cannot move', () => {
    expect(moveLayerBy(doc, 'border', 10, 10)).toBe(doc)
    expect(moveLayerBy(doc, 'missing', 10, 10)).toBe(doc)
  })
})
