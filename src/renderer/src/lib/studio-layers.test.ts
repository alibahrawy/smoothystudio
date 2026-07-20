import { describe, expect, it } from 'vitest'
import {
  borderRingGeometry,
  defaultColorGrade,
  defaultStudioDoc,
  effectiveLayerOrder,
  gradeFilterString,
  gradeForEntry,
  GRADE_PRESETS,
  isNeutralGrade,
  logoBox,
  logoFontString,
  newExtraLogo,
  newExtraText,
  resetPrimaryLayer,
  type EffectColorGrade,
} from './studio'

describe('deletable primary layers', () => {
  it('keeps every primary in the stack by default', () => {
    expect(effectiveLayerOrder(defaultStudioDoc()).sort()).toEqual([
      'border',
      'icon',
      'image',
      'logo',
      'shape',
      'text',
    ])
  })

  it('slots newly introduced primaries at their canonical spot, not the bottom', () => {
    // A document saved before the border and logo layers existed.
    const legacy = {
      ...defaultStudioDoc(),
      layerOrder: ['image', 'shape', 'text', 'icon'],
    }
    // order[0] is the top-most layer, so both must land above the picture.
    expect(effectiveLayerOrder(legacy)).toEqual([
      'logo',
      'border',
      'image',
      'shape',
      'text',
      'icon',
    ])
  })

  it('drops a removed primary from the stack', () => {
    const doc = { ...defaultStudioDoc(), removedPrimaries: ['text'] }
    expect(effectiveLayerOrder(doc)).not.toContain('text')
    expect(effectiveLayerOrder(doc)).toContain('shape')
  })

  it('does not resurrect a removed primary that is still listed in layerOrder', () => {
    const doc = {
      ...defaultStudioDoc(),
      layerOrder: ['logo', 'border', 'image', 'shape', 'text', 'icon'],
      removedPrimaries: ['shape', 'icon', 'logo'],
    }
    expect(effectiveLayerOrder(doc)).toEqual(['border', 'image', 'text'])
  })

  it('still lists extras whose primary kind was removed', () => {
    const order = effectiveLayerOrder({
      ...defaultStudioDoc(),
      extraTexts: [{ ...newExtraText(), id: 'extra-1' }],
      removedPrimaries: ['text'],
    })
    expect(order).toContain('extra-1')
    expect(order).not.toContain('text')
  })

  it('resets a primary to factory state on restore', () => {
    const edited = { ...defaultStudioDoc(), text: 'Edited title' }
    edited.font.size = 999
    edited.shape.color = '#ff0000'

    const restoredText = resetPrimaryLayer(edited, 'text')
    expect(restoredText.text).toBe(defaultStudioDoc().text)
    expect(restoredText.font.size).toBe(defaultStudioDoc().font.size)
    // Restoring text must not disturb the other primaries.
    expect(restoredText.shape.color).toBe('#ff0000')

    const restoredShape = resetPrimaryLayer(edited, 'shape')
    expect(restoredShape.shape.color).toBe(defaultStudioDoc().shape.color)
  })
})

describe('border ring geometry', () => {
  const border = (over: Partial<ReturnType<typeof defaultStudioDoc>['border']> = {}) => ({
    ...defaultStudioDoc().border,
    ...over,
  })

  it('measures the ring inward from the canvas edges', () => {
    const g = borderRingGeometry(border({ thickness: 40, inset: 0 }), 1000, 600)
    expect(g).toEqual({ ox: 0, oy: 0, ow: 1000, oh: 600, ix: 40, iy: 40, iw: 920, ih: 520 })
  })

  it('insets the outer edge away from the canvas edges', () => {
    const g = borderRingGeometry(border({ thickness: 20, inset: 50 }), 1000, 600)
    expect(g).toMatchObject({ ox: 50, oy: 50, ow: 900, oh: 500, ix: 70, iy: 70 })
  })

  it('clamps thickness so an oversized frame fills instead of inverting', () => {
    const g = borderRingGeometry(border({ thickness: 5000, inset: 0 }), 1000, 600)
    // Half the shorter side is the most that still leaves a valid ring.
    expect(g).toMatchObject({ iw: 400, ih: 0 })
    expect(g!.ih).toBeGreaterThanOrEqual(0)
  })

  it('draws nothing when thickness is zero or the inset swallows the canvas', () => {
    expect(borderRingGeometry(border({ thickness: 0 }), 1000, 600)).toBeNull()
    expect(borderRingGeometry(border({ thickness: 20, inset: 400 }), 1000, 600)).toBeNull()
  })
})

describe('corner logo placement', () => {
  const logo = (over: Partial<ReturnType<typeof defaultStudioDoc>['logo']> = {}) => ({
    ...defaultStudioDoc().logo,
    ...over,
  })
  // A 200×100 logo on a 1000×600 canvas with a 40px margin.
  const place = (corner: string, over = {}) =>
    logoBox(logo({ corner: corner as never, margin: 40, ...over }), 1000, 600, 200, 100)

  it('hugs each corner by the margin', () => {
    expect(place('top-left')).toEqual({ x: 40, y: 40 })
    expect(place('top-right')).toEqual({ x: 760, y: 40 })
    expect(place('bottom-left')).toEqual({ x: 40, y: 460 })
    expect(place('bottom-right')).toEqual({ x: 760, y: 460 })
  })

  it('applies the nudge on top of the corner anchor', () => {
    expect(place('bottom-right', { offsetX: -25, offsetY: 10 })).toEqual({ x: 735, y: 470 })
  })

  it('keeps the nudge in screen space, not mirrored per corner', () => {
    // A positive nudge moves right/down from every corner, so the control
    // behaves the same wherever the logo is pinned.
    const nudge = { offsetX: 30, offsetY: 30 }
    expect(place('top-left', nudge).x - place('top-left').x).toBe(30)
    expect(place('bottom-right', nudge).x - place('bottom-right').x).toBe(30)
    expect(place('top-right', nudge).y - place('top-right').y).toBe(30)
  })

  it('duplicates into the opposite corner so the copy is visible', () => {
    expect(newExtraLogo(logo({ corner: 'bottom-right' })).corner).toBe('bottom-left')
    expect(newExtraLogo(logo({ corner: 'top-left' })).corner).toBe('top-right')
  })

  it('builds a font string that honors weight, size and italics', () => {
    expect(logoFontString(logo({ size: 48, fontWeight: 700, italic: true, fontFamily: 'Inter' })))
      .toBe('italic 700 48px "Inter", sans-serif')
  })
})

describe('color grading', () => {
  const grade = (over: Partial<EffectColorGrade> = {}): EffectColorGrade => ({
    ...defaultColorGrade(),
    enabled: true,
    ...over,
  })

  it('treats an untouched or disabled grade as neutral so rendering skips it', () => {
    expect(isNeutralGrade(undefined)).toBe(true)
    expect(isNeutralGrade(defaultColorGrade())).toBe(true)
    expect(isNeutralGrade(grade())).toBe(true)
    // Disabled beats non-default values.
    expect(isNeutralGrade(grade({ enabled: false, contrast: 180 }))).toBe(true)
  })

  it('is not neutral once any slider moves', () => {
    expect(isNeutralGrade(grade({ contrast: 120 }))).toBe(false)
    expect(isNeutralGrade(grade({ temperature: -10 }))).toBe(false)
    expect(isNeutralGrade(grade({ blur: 2 }))).toBe(false)
  })

  it('emits only the filters that differ from neutral', () => {
    expect(gradeFilterString(grade())).toBe('none')
    expect(gradeFilterString(grade({ saturation: 140 }))).toBe('saturate(140%)')
    expect(gradeFilterString(grade({ brightness: 110, contrast: 90, hue: -20, blur: 3 }))).toBe(
      'brightness(110%) contrast(90%) hue-rotate(-20deg) blur(3px)',
    )
  })

  it('leaves temperature out of the filter chain (it is composited separately)', () => {
    expect(gradeFilterString(grade({ temperature: 60 }))).toBe('none')
  })

  it('resolves the grade attached to each kind of layer', () => {
    const base = defaultStudioDoc()
    const doc = {
      ...base,
      grade: grade({ contrast: 111 }),
      image: { ...base.image, grade: grade({ contrast: 222 }) },
      extraLogos: [{ ...base.logo, id: 'logo-x', grade: grade({ contrast: 333 }) }],
    }
    expect(gradeForEntry(doc, 'text')?.contrast).toBe(111)
    expect(gradeForEntry(doc, 'image')?.contrast).toBe(222)
    expect(gradeForEntry(doc, 'logo-x')?.contrast).toBe(333)
    expect(gradeForEntry(doc, 'shape')).toBeUndefined()
    expect(gradeForEntry(doc, 'no-such-id')).toBeUndefined()
  })

  it('ships presets that all differ from neutral except Neutral itself', () => {
    const byName = Object.fromEntries(GRADE_PRESETS.map((p) => [p.name, p.grade]))
    expect(isNeutralGrade({ ...byName.Neutral, enabled: true })).toBe(true)
    for (const p of GRADE_PRESETS.filter((x) => x.name !== 'Neutral')) {
      expect(isNeutralGrade({ ...p.grade, enabled: true })).toBe(false)
    }
    expect(byName.Noir.grayscale).toBe(100)
  })
})
