import { describe, expect, it, vi } from 'vitest'
import {
  DECOR_DEFAULT,
  DECOR_DEFAULT_SHAPE,
  DECOR_KEYS,
  decorOrder,
  paintDecor,
} from './studio-decor'

describe('decorOrder', () => {
  it('defaults to the canonical stack', () => {
    expect(decorOrder(undefined)).toEqual([...DECOR_DEFAULT])
    expect(decorOrder([])).toEqual([...DECOR_DEFAULT])
  })

  it('round-trips a custom order — the point of the feature', () => {
    const custom = ['shadow', 'fill', 'stroke', 'glow', 'pattern']
    expect(decorOrder(custom)).toEqual(custom)
  })

  it('lets the stroke move above the shadow', () => {
    const order = decorOrder(['glow', 'fill', 'shadow', 'stroke', 'pattern'])
    expect(order.indexOf('stroke')).toBeGreaterThan(order.indexOf('shadow'))
  })

  it('drops unknown keys and de-duplicates', () => {
    expect(decorOrder(['stroke', 'nope', 'stroke', 'fill'])).toHaveLength(DECOR_KEYS.length)
    expect(decorOrder(['stroke', 'nope', 'stroke', 'fill'])).not.toContain('nope')
  })

  it('slots a missing decoration back at its canonical spot, not on top', () => {
    // A doc saved before `pattern` existed still has to draw it last, and one
    // saved before `shadow` existed still has to draw it first.
    expect(decorOrder(['shadow', 'glow', 'stroke', 'fill'])).toEqual([...DECOR_DEFAULT])
    const noShadow = decorOrder(['glow', 'stroke', 'fill', 'pattern'])
    expect(noShadow[0]).toBe('shadow')
  })

  it('honours a different canonical order for shapes', () => {
    expect(decorOrder(undefined, DECOR_DEFAULT_SHAPE)).toEqual([...DECOR_DEFAULT_SHAPE])
    // Stroke on top is what makes a shape's centred stroke read at full width.
    expect(decorOrder(undefined, DECOR_DEFAULT_SHAPE).at(-1)).toBe('stroke')
  })
})

describe('paintDecor', () => {
  const stubCtx = (): CanvasRenderingContext2D =>
    ({
      save: vi.fn(),
      restore: vi.fn(),
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    }) as unknown as CanvasRenderingContext2D

  it('runs the passes in the stored order', () => {
    const calls: string[] = []
    paintDecor(stubCtx(), ['fill', 'shadow', 'stroke', 'glow', 'pattern'], {
      fill: () => calls.push('fill'),
      shadow: () => calls.push('shadow'),
      stroke: () => calls.push('stroke'),
      glow: () => calls.push('glow'),
      pattern: () => calls.push('pattern'),
    })
    expect(calls).toEqual(['fill', 'shadow', 'stroke', 'glow', 'pattern'])
  })

  it('skips decorations the layer has not enabled', () => {
    const calls: string[] = []
    paintDecor(stubCtx(), undefined, { fill: () => calls.push('fill') })
    expect(calls).toEqual(['fill'])
  })

  it('clears shadow state before every pass so it cannot bleed', () => {
    // The original bug: the fill was drawn while ctx.shadow* was still set from
    // the shadow step, so the fill cast a second shadow over the stroke.
    const ctx = stubCtx()
    ctx.shadowColor = 'red'
    ctx.shadowBlur = 20
    ctx.shadowOffsetX = 9
    const seen: Array<{ color: string; blur: number; x: number }> = []
    paintDecor(ctx, undefined, {
      fill: (c) => seen.push({ color: c.shadowColor, blur: c.shadowBlur, x: c.shadowOffsetX }),
      stroke: (c) => seen.push({ color: c.shadowColor, blur: c.shadowBlur, x: c.shadowOffsetX }),
    })
    expect(seen).toHaveLength(2)
    for (const s of seen) {
      expect(s).toEqual({ color: 'transparent', blur: 0, x: 0 })
    }
  })
})
