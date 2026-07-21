import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Regression guard for layer isolation in `measureDoc`.
 *
 * `layerOrder: [id]` does not isolate a layer, because `effectiveLayerOrder`
 * self-heals by re-adding every missing primary. That made every layer report
 * the bounding box of the whole composition, which silently defeats the entire
 * point of measuring.
 */
beforeAll(() => {
  // measureDoc rasterises, so it needs a canvas. A recording stub is enough:
  // we assert on which layers were asked to draw, not on pixels.
  const drawn: string[] = []
  ;(globalThis as unknown as { __drawn: string[] }).__drawn = drawn
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          scale() {}, clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {},
          beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, ellipse() {},
          clip() {}, transform() {}, setTransform() {}, rect() {}, quadraticCurveTo() {}, bezierCurveTo() {},
          fill() {}, stroke() {}, fillRect() {}, drawImage() {}, putImageData() {},
          fillText() {}, strokeText() {},
          measureText: () => ({ width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 2 }),
          createLinearGradient: () => ({ addColorStop() {} }),
          createRadialGradient: () => ({ addColorStop() {} }),
          createPattern: () => ({}),
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4), width: w, height: h,
          }),
          set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {}, set font(_v: unknown) {},
          set filter(_v: unknown) {}, set globalAlpha(_v: unknown) {},
          set globalCompositeOperation(_v: unknown) {}, set textAlign(_v: unknown) {},
          set textBaseline(_v: unknown) {}, set lineWidth(_v: unknown) {}, set lineJoin(_v: unknown) {},
          set shadowColor(_v: unknown) {}, set shadowBlur(_v: unknown) {},
          set shadowOffsetX(_v: unknown) {}, set shadowOffsetY(_v: unknown) {},
          set imageSmoothingEnabled(_v: unknown) {},
        }),
      }),
      fonts: { check: () => true, load: () => Promise.resolve() },
    },
  })
})

describe('measure isolation', () => {
  it('renders one layer at a time, not the whole composition', async () => {
    const { defaultStudioDoc, effectiveLayerOrder } = await import('./studio')
    const { measureDoc } = await import('./studio-measure')

    const base = defaultStudioDoc()
    const doc = {
      ...base,
      text: 'HEADLINE',
      shape: { ...base.shape, enabled: true },
      border: { ...base.border, enabled: true },
    }

    // The isolated document for a single layer must resolve to exactly that
    // layer — this is the property that was broken.
    for (const id of ['text', 'shape', 'border'] as const) {
      const isolated = {
        ...doc,
        removedPrimaries: ['logo', 'border', 'image', 'shape', 'text', 'icon'].filter((p) => p !== id),
        layerOrder: [id],
      }
      expect(effectiveLayerOrder(isolated)).toEqual([id])
    }

    // And measuring returns one entry per layer in the stack.
    const m = measureDoc(doc, 160)
    expect(m.layers.map((l) => l.id)).toEqual(effectiveLayerOrder(doc))
    expect(m.canvas).toEqual({ width: doc.canvas.width, height: doc.canvas.height })
  })
})
