/**
 * Brand themes — single axis. Each theme is a complete look (background +
 * foreground + accent + surface together). No separate light/dark mode —
 * the user explicitly wanted themes to BE the looks, not a colour-mode
 * modifier on top.
 *
 * White + Strawberry + Peach are light looks; Zucchini + Blueberry + Ocean
 * + Grape + No Fun are dark looks.
 */
export type BrandTheme =
  | 'white'
  | 'zucchini'
  | 'strawberry'
  | 'blueberry'
  | 'ocean'
  | 'grape'
  | 'peach'
  | 'nofun'

export const BRAND_THEMES: Array<{
  value: BrandTheme
  name: string
  description: string
  swatch: string
  tier: 'free' | 'pro'
  mode: 'light' | 'dark'
}> = [
  { value: 'white', name: 'White', description: 'Clean light', swatch: 'oklch(0.98 0.005 0)', tier: 'free', mode: 'light' },
  { value: 'zucchini', name: 'Zucchini', description: 'Dark mint', swatch: 'oklch(0.65 0.22 155)', tier: 'free', mode: 'dark' },
  { value: 'strawberry', name: 'Strawberry', description: 'Light pink', swatch: 'oklch(0.68 0.25 15)', tier: 'pro', mode: 'light' },
  { value: 'blueberry', name: 'Blueberry', description: 'Deep navy', swatch: 'oklch(0.65 0.22 260)', tier: 'pro', mode: 'dark' },
  { value: 'ocean', name: 'Ocean', description: 'Dark cyan', swatch: 'oklch(0.68 0.18 200)', tier: 'pro', mode: 'dark' },
  { value: 'grape', name: 'Grape', description: 'Dark purple', swatch: 'oklch(0.70 0.20 300)', tier: 'pro', mode: 'dark' },
  { value: 'peach', name: 'Peach', description: 'Warm peach', swatch: 'oklch(0.72 0.22 32)', tier: 'pro', mode: 'light' },
  { value: 'nofun', name: 'No Fun', description: 'High contrast', swatch: 'oklch(0.10 0 0)', tier: 'pro', mode: 'dark' },
]

export interface PublicUser {
  id: string
  email: string
  name: string | null
}

export interface AppState {
  theme: BrandTheme
  signedIn: boolean
  user: PublicUser | null
  /** True when a previously valid session hit its 7-day expiry (vs. never signed in). */
  sessionExpired: boolean
  online: boolean
  hydrated: boolean
}

export type AppAction =
  | { type: 'SET_THEME'; payload: BrandTheme }
  | { type: 'SIGN_IN'; payload: PublicUser }
  | { type: 'SIGN_OUT' }
  | { type: 'ONLINE'; payload: boolean }
  | { type: 'HYDRATED' }

export const INITIAL_STATE: AppState = {
  // Default = White. A design tool should surround the canvas with a neutral
  // light UI so it doesn't bias how the artwork's own colours read.
  theme: 'white',
  signedIn: false,
  user: null,
  sessionExpired: false,
  online: true,
  hydrated: false,
}
