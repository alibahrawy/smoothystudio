import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Server-render smoke test for the Studio view — the biggest screen in the app
 * and the one most prone to "component crashes on mount" regressions. Seeds a
 * saved workspace through a stub localStorage so the layer cards render with
 * their controls expanded (a disabled card collapses its body).
 */
const SEEDED_CANVAS = {
  canvases: [
    {
      id: 'test-canvas',
      name: 'Canvas 1',
      doc: {
        border: {
          enabled: true,
          thickness: 32,
          outerRadius: 40,
          innerRadius: 12,
          // One effect from each family, switched on so its controls render.
          fx: {
            transform: { enabled: true, scale: 100, rotate: 0, skewX: 0, skewY: 0, offsetX: 0, offsetY: 0, flipH: false, flipV: false },
            threeD: { enabled: true, rotateX: 8, rotateY: 0, distance: 1200 },
            crop: { enabled: true, top: 0, right: 0, bottom: 0, left: 0, radius: 24 },
            mosaic: { enabled: true, size: 16 },
            // Deliberately the LEGACY pre-split blur shape — the UI must
            // normalize it into the Radial blur row.
            blur: { enabled: true, type: 'zoom', amount: 30 },
            noise: { enabled: true, amount: 20, size: 1, mono: true },
            roughen: { enabled: true, amount: 30, size: 10 },
            wave: { enabled: true, axis: 'horizontal', amplitude: 20, wavelength: 200, phase: 0 },
            mirror: { enabled: true, keep: 'left' },
            colorReplace: { enabled: true, from: '#FFFFFF', to: '#2DD4BF', tolerance: 20, preserveShading: true },
            turbulence: { enabled: true, amount: 30, size: 120, complexity: 2, evolution: 0 },
            vignette: { enabled: true, amount: -60, size: 55, feather: 60, roundness: 0 },
            duotone: { enabled: true, shadowColor: '#1E293B', highlightColor: '#2DD4BF', amount: 100 },
            blinds: { enabled: true, completion: 40, direction: 'horizontal', width: 60 },
            echo: { enabled: true, copies: 4, offsetX: 24, offsetY: 24, scaleStep: 100, rotateStep: 0, opacityDecay: 60 },
          },
        },
        logo: { enabled: true, kind: 'text', text: 'Smoothy', corner: 'top-left' },
        shape: { enabled: true },
        image: {
          enabled: true,
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          grade: {
            enabled: true,
            brightness: 100,
            contrast: 120,
            saturation: 100,
            hue: 0,
            temperature: 0,
            sepia: 0,
            grayscale: 0,
            invert: 0,
            blur: 0,
          },
        },
      },
    },
  ],
  activeId: 'test-canvas',
}

beforeAll(() => {
  const store = new Map<string, string>([['studio-canvases-v1', JSON.stringify(SEEDED_CANVAS)]])
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
})

describe('Studio view', () => {
  it('mounts and renders the border and logo layers with their controls', async () => {
    const { createElement } = await import('react')
    const { renderToString } = await import('react-dom/server')
    const { Studio } = await import('./Studio')

    const html = renderToString(createElement(Studio))

    // Controls only render when a layer is enabled, so these prove the field
    // bodies themselves mounted — not just the collapsed card headers.
    expect(html).toContain('Border')
    expect(html).toContain('Thickness')
    expect(html).toContain('Inset from edge')

    expect(html).toContain('Logo')
    expect(html).toContain('Corner')
    expect(html).toContain('Margin')
    expect(html).toContain('Nudge X')
    // A text-mode logo shows the wordmark input, not the upload button.
    expect(html).toContain('Wordmark')
    expect(html).toContain('Smoothy')
    expect(html).not.toContain('Upload logo')

    // An enabled color grade renders its look presets and Lumetri groups.
    expect(html).toContain('Color grade')
    expect(html).toContain('Look')
    expect(html).toContain('Vintage')
    expect(html).toContain('Basic correction')
    expect(html).toContain('Exposure')
    expect(html).toContain('Highlights')
    expect(html).toContain('Whites')
    expect(html).toContain('Blacks')
    expect(html).toContain('Temperature')
    expect(html).toContain('Tint')
    expect(html).toContain('Vibrance')
    expect(html).toContain('Stylize')
    expect(html).toContain('Hue shift')
  })

  it('renders the controls for every layer effect', async () => {
    const { createElement } = await import('react')
    const { renderToString } = await import('react-dom/server')
    const { Studio } = await import('./Studio')

    const html = renderToString(createElement(Studio))

    for (const label of [
      'Transform',
      '3D tilt',
      'Crop',
      'Mosaic',
      'Radial blur', // seeded as a legacy `blur` object — proves normalizeFx ran
      'Noise / grain',
      'Roughen edges',
      'Wave warp',
      'Mirror',
      'Color change',
      'Turbulent displace',
      'Vignette',
      'Duotone',
      'Venetian blinds',
      'Echo',
    ]) {
      expect(html, `missing effect: ${label}`).toContain(label)
    }
    // Noise is pinned outside the reorderable pipeline.
    expect(html).toContain('Always runs last')

    // Spot-check controls from inside the expanded effect bodies — including
    // the AE-parity additions.
    expect(html).toContain('Skew X')
    expect(html).toContain('Anchor X')
    expect(html).toContain('Perspective')
    expect(html).toContain('Specular sheen')
    expect(html).toContain('Corner radius')
    expect(html).toContain('Edge feather')
    expect(html).toContain('Block width')
    expect(html).toContain('Block height')
    expect(html).toContain('Center X') // radial-blur pivot
    expect(html).toContain('Wavelength')
    expect(html).toContain('Wave type')
    expect(html).toContain('Pin edges')
    expect(html).toContain('Line offset')
    expect(html).toContain('Line angle')
    expect(html).toContain('Evolution')
    expect(html).toContain('Tolerance')
    expect(html).toContain('Softness')
    expect(html).toContain('Match by')
    expect(html).toContain('Keep shading')
  })
})
