import { describe, expect, it } from 'vitest'
import { defaultStudioDoc, type StudioDoc } from './studio'
import { mapPoint, resizeContext, resizeDoc, scaleFor, transposeAlign } from './studio-resize'

const LANDSCAPE = { width: 1920, height: 1080 }
const PORTRAIT = { width: 1080, height: 1920 }

function docAt(width: number, height: number): StudioDoc {
  const d = defaultStudioDoc()
  return { ...d, canvas: { ...d.canvas, width, height } }
}

describe('resize context', () => {
  it('separates contain from cover the way object-fit does', () => {
    const ctx = resizeContext(1920, 1080, 1080, 1920)
    expect(ctx.contain).toBeCloseTo(1080 / 1920) // smaller axis ratio
    expect(ctx.cover).toBeCloseTo(1920 / 1080) // larger axis ratio
  })

  it('detects an orientation change', () => {
    expect(resizeContext(1920, 1080, 1080, 1920).transposed).toBe(true)
    expect(resizeContext(1920, 1080, 1280, 720).transposed).toBe(false)
    expect(resizeContext(1080, 1920, 1080, 1080).transposed).toBe(true)
  })
})

describe('point remapping', () => {
  it('keeps relative placement when the orientation is unchanged', () => {
    const ctx = resizeContext(1920, 1080, 1280, 720)
    // A third of the way out stays a third of the way out.
    expect(mapPoint(ctx, 320, 0)).toEqual({ x: 213, y: 0 })
  })

  it('keeps an edge-flush point flush against the edge', () => {
    const ctx = resizeContext(1920, 1080, 1280, 720)
    expect(mapPoint(ctx, 960, 0).x).toBe(640) // still the right edge
    expect(mapPoint(ctx, 0, -540).y).toBe(-360) // still the top edge
  })

  /** The behaviour asked for: left becomes top-centre, right becomes bottom-centre. */
  it('moves left content to the top and right content to the bottom on a flip', () => {
    const ctx = resizeContext(1920, 1080, 1080, 1920)
    const left = mapPoint(ctx, -500, 0)
    expect(left.x).toBe(0) // horizontally centred
    expect(left.y).toBeLessThan(0) // and above centre

    const right = mapPoint(ctx, 500, 0)
    expect(right.x).toBe(0)
    expect(right.y).toBeGreaterThan(0) // below centre
  })

  it('is symmetric — portrait back to landscape undoes the move', () => {
    const there = resizeContext(1920, 1080, 1080, 1920)
    const back = resizeContext(1080, 1920, 1920, 1080)
    const once = mapPoint(there, -500, 0)
    expect(mapPoint(back, once.x, once.y)).toEqual({ x: -500, y: 0 })
  })
})

describe('contain vs cover', () => {
  it('shrinks contained content so it cannot overflow', () => {
    const ctx = resizeContext(1920, 1080, 1080, 1920)
    // A 400px-wide object near the middle is well inside the frame.
    expect(scaleFor(ctx, 0, 200, 'x')).toBe(ctx.contain)
  })

  it('grows bleeding content so it still covers', () => {
    const ctx = resizeContext(1920, 1080, 1080, 1920)
    // A full-width object reaches both edges.
    expect(scaleFor(ctx, 0, 960, 'x')).toBe(ctx.cover)
  })
})

describe('title anchor transpose', () => {
  it('maps left to top and right to bottom, centring the other axis', () => {
    expect(transposeAlign('left', 'middle')).toEqual({ h: 'center', v: 'top' })
    expect(transposeAlign('right', 'middle')).toEqual({ h: 'center', v: 'bottom' })
  })

  it('is its own inverse', () => {
    const once = transposeAlign('left', 'middle')
    expect(transposeAlign(once.h, once.v)).toEqual({ h: 'left', v: 'middle' })
  })

  it('leaves a fully centred anchor centred', () => {
    expect(transposeAlign('center', 'middle')).toEqual({ h: 'center', v: 'middle' })
  })
})

describe('resizeDoc', () => {
  it('is a no-op when the size is unchanged', () => {
    const d = docAt(1920, 1080)
    expect(resizeDoc(d, 1920, 1080)).toBe(d)
  })

  it('sets the new canvas size and scales the type to fit', () => {
    const d = docAt(LANDSCAPE.width, LANDSCAPE.height)
    d.font.size = 160
    const out = resizeDoc(d, PORTRAIT.width, PORTRAIT.height)
    expect(out.canvas.width).toBe(1080)
    expect(out.canvas.height).toBe(1920)
    // contain = 1080/1920 = 0.5625
    expect(out.font.size).toBe(90)
  })

  it('reflows a left-aligned title to the top on a flip', () => {
    const d = docAt(LANDSCAPE.width, LANDSCAPE.height)
    d.align = { ...d.align, h: 'left', v: 'middle' }
    const out = resizeDoc(d, PORTRAIT.width, PORTRAIT.height)
    expect(out.align.h).toBe('center')
    expect(out.align.v).toBe('top')
  })

  it('moves a right-side picture to the bottom, centred', () => {
    const d = docAt(LANDSCAPE.width, LANDSCAPE.height)
    d.image = { ...d.image, enabled: true, x: 480, y: 0, width: 600 }
    const out = resizeDoc(d, PORTRAIT.width, PORTRAIT.height)
    expect(out.image.x).toBe(0)
    expect(out.image.y).toBeGreaterThan(0)
  })

  it('keeps a full-bleed picture full-bleed', () => {
    const d = docAt(LANDSCAPE.width, LANDSCAPE.height)
    d.image = { ...d.image, enabled: true, x: 0, y: 0, width: 1920 }
    const out = resizeDoc(d, PORTRAIT.width, PORTRAIT.height)
    // Scaled by cover (1.777…), not contain — so it still spans the new frame.
    expect(out.image.width).toBeGreaterThanOrEqual(out.canvas.width)
  })

  it('scales margins, padding and effect geometry with the canvas', () => {
    const d = docAt(LANDSCAPE.width, LANDSCAPE.height)
    d.align.safeZone = 100
    d.box = { ...d.box, paddingX: 48, radius: 16 }
    d.shadow = { ...d.shadow, blur: 24, y: 8 }
    d.border = { ...d.border, thickness: 40, inset: 20 }
    d.logo = { ...d.logo, margin: 64, size: 120 }
    const out = resizeDoc(d, 960, 540) // exactly half

    expect(out.align.safeZone).toBe(50)
    expect(out.box.paddingX).toBe(24)
    expect(out.box.radius).toBe(8)
    expect(out.shadow.blur).toBe(12)
    expect(out.shadow.y).toBe(4)
    expect(out.border.thickness).toBe(20)
    expect(out.logo.margin).toBe(32)
    expect(out.logo.size).toBe(60)
  })

  it('keeps a corner logo in its corner', () => {
    const d = docAt(LANDSCAPE.width, LANDSCAPE.height)
    d.logo = { ...d.logo, enabled: true, corner: 'bottom-right' }
    expect(resizeDoc(d, PORTRAIT.width, PORTRAIT.height).logo.corner).toBe('bottom-right')
  })

  it('transposes an icon anchored beside the title', () => {
    const d = docAt(LANDSCAPE.width, LANDSCAPE.height)
    d.icon = { ...d.icon, position: 'left' }
    expect(resizeDoc(d, PORTRAIT.width, PORTRAIT.height).icon.position).toBe('top')
  })

  it('reflows every extra layer, not just the primaries', () => {
    const base = docAt(LANDSCAPE.width, LANDSCAPE.height)
    const d: StudioDoc = {
      ...base,
      extraTexts: [{ ...base.extraTexts[0], id: 't', x: -600, y: 0, size: 80 } as never],
      extraShapes: [{ ...base.shape, id: 's', x: 600, y: 0, size: 200 } as never],
    }
    const out = resizeDoc(d, PORTRAIT.width, PORTRAIT.height)
    expect(out.extraTexts[0].x).toBe(0)
    expect(out.extraTexts[0].y).toBeLessThan(0) // was left → now top
    expect(out.extraShapes[0].x).toBe(0)
    expect(out.extraShapes[0].y).toBeGreaterThan(0) // was right → now bottom
    expect(out.extraTexts[0].size).toBe(45) // 80 * 0.5625
  })

  it('never produces a zero or negative size', () => {
    const d = docAt(1920, 1080)
    d.font.size = 10
    d.shape = { ...d.shape, size: 4 }
    const out = resizeDoc(d, 64, 64)
    expect(out.font.size).toBeGreaterThan(0)
    expect(out.shape.size).toBeGreaterThan(0)
  })
})
