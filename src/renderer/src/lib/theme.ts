import type { BrandTheme } from '@shared/state'

/**
 * Applies a brand theme to <html> by swapping the `theme-*` class.
 * The default `white` theme uses no class. There's no separate light/dark
 * axis — each theme is a complete look.
 */
export function applyBrandTheme(theme: BrandTheme): void {
  const html = document.documentElement
  html.classList.forEach((cls) => {
    if (cls.startsWith('theme-')) html.classList.remove(cls)
  })
  if (theme !== 'white') html.classList.add(`theme-${theme}`)
}
