import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Server-render smoke test for the app shell — catches "component crashes on
 * mount" in the chrome around the two views, which is otherwise only visible by
 * launching the app and looking at it.
 */
beforeAll(() => {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
  // The shell reads the platform during render to size the traffic-light gutter.
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { smoothy: { platform: 'darwin' }, addEventListener() {}, removeEventListener() {} },
  })
})

describe('app shell', () => {
  it('renders the logo, wordmark and both tabs', async () => {
    const { createElement } = await import('react')
    const { renderToString } = await import('react-dom/server')
    const { App } = await import('./App')

    const html = renderToString(createElement(App))

    expect(html).toContain('SmoothyStudio')
    // The mark is inlined SVG, identified by its aria-label and gradient id.
    expect(html).toContain('aria-label="SmoothyStudio"')
    expect(html).toContain('smoothystudio-accent')
    expect(html).toContain('Studio')
    expect(html).toContain('AI Photos')
  })

  it('defaults to the white theme, which carries no theme class', async () => {
    const { INITIAL_STATE } = await import('@shared/state')
    const { useAppStore } = await import('./store')
    expect(INITIAL_STATE.theme).toBe('white')
    expect(useAppStore.getState().theme).toBe('white')
  })
})
