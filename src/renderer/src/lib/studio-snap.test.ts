import { describe, expect, it } from 'vitest'
import { snapDrag } from './studio-snap'

// A 200×100 box on a 1920×1080 canvas; threshold 10.
const box = { x: 300, y: 400, width: 200, height: 100 }
const snap = (dx: number, dy: number): ReturnType<typeof snapDrag> =>
  snapDrag(box, dx, dy, 1920, 1080, 10)

describe('snapDrag', () => {
  it('leaves a drag alone when nothing is near', () => {
    const r = snap(50, 50)
    expect(r).toEqual({ dx: 50, dy: 50, guides: { v: null, h: null } })
  })

  it('pulls the box centre onto the canvas centre', () => {
    // Box centre is at 400 + dx; canvas centre 960 → dx 566 lands at 966, 6 off.
    const r = snap(566, 0)
    expect(r.dx).toBe(560)
    expect(r.guides.v).toBe(960)
  })

  it('pulls the leading edge onto the canvas edge', () => {
    // Left edge at 300 + dx; dx -293 lands at 7, within 10 of 0.
    const r = snap(-293, 0)
    expect(r.dx).toBe(-300)
    expect(r.guides.v).toBe(0)
  })

  it('pulls the trailing edge onto the far edge', () => {
    // Right edge at 500 + dx; dx 1414 lands at 1914, within 10 of 1920.
    const r = snap(1414, 0)
    expect(r.dx).toBe(1420)
    expect(r.guides.v).toBe(1920)
  })

  it('snaps the vertical axis independently', () => {
    // Box centre y is 450 + dy; canvas centre 540 → dy 85 lands at 535, 5 off.
    const r = snap(50, 85)
    expect(r.dx).toBe(50)
    expect(r.dy).toBe(90)
    expect(r.guides).toEqual({ v: null, h: 540 })
  })

  it('takes the nearest candidate when several are in range', () => {
    // Small box near the top edge on a small canvas: centre at 12 (2 from the
    // 10-centre? no —) use explicit: box top lands at 4, centre lands at 14 on
    // a 20-tall canvas whose centre is 10 → edge dist 4, centre dist 4: centre
    // is listed first, so equal distances centre wins.
    const r = snapDrag({ x: 0, y: 0, width: 0, height: 20 }, 0, 4, 1920, 20, 10)
    expect(r.guides.h).toBe(10)
  })

  it('does not snap just past the threshold', () => {
    // Centre lands 11 off — one more than the threshold.
    const r = snap(571, 0)
    expect(r.dx).toBe(571)
    expect(r.guides.v).toBeNull()
  })
})
