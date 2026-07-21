import { useEffect, useState } from 'react'
import { Type, Image as ImageIcon, LogIn, LogOut, Loader2 } from 'lucide-react'
import { Studio } from './views/Studio'
import { AiPhotos } from './views/AiPhotos'
import { useAppStore } from './store'
import { applyBrandTheme } from './lib/theme'
import { cn } from './lib/cn'
import { Button } from './components/ui/button'
import { Logo } from './components/Logo'

/**
 * Two surfaces, one loop: generate the imagery in AI Photos, compose the
 * thumbnail in Studio. A plain tab switch rather than a router — there are two
 * destinations and both keep their state mounted, so unmounting on navigation
 * would throw away an in-progress design. The tab lives in the store because
 * "Send to Studio" switches it from the other view.
 */
export function App(): JSX.Element {
  const tab = useAppStore((s) => s.tab)
  const status = useAppStore((s) => s.status)
  const setTab = useAppStore((s) => s.setTab)
  const theme = useAppStore((s) => s.theme)
  const signedIn = useAppStore((s) => s.signedIn)
  const user = useAppStore((s) => s.user)
  const credits = useAppStore((s) => s.credits)
  const setAuth = useAppStore((s) => s.setAuth)
  const setCredits = useAppStore((s) => s.setCredits)
  const [busy, setBusy] = useState(false)

  useEffect(() => applyBrandTheme(theme), [theme])

  useEffect(() => {
    document.documentElement.classList.add(`platform-${window.smoothy.platform}`)
  }, [])

  // Auth arrives by push from main (on load and on change) rather than polling.
  useEffect(() => {
    const off = window.auth.onChange((s) => setAuth({ signedIn: s.signedIn, user: s.user }))
    void window.auth.state().then((s) => setAuth({ signedIn: s.signedIn, user: s.user }))
    return off
  }, [setAuth])

  // Credits gate the AI half, so keep them fresh: on sign-in, and whenever a
  // generation reports that it spent some.
  useEffect(() => {
    if (!signedIn) {
      setCredits(null)
      return
    }
    const refresh = (): void => {
      void window.credits
        .get()
        .then((c) => setCredits({ credits: c.credits, tier: c.tier }))
        .catch(() => undefined)
    }
    refresh()
    window.addEventListener('credits:refresh', refresh)
    return () => window.removeEventListener('credits:refresh', refresh)
  }, [signedIn, setCredits])

  const tabCls = (active: boolean): string =>
    cn(
      'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-base font-medium',
      'transition-colors duration-120 ease-out [-webkit-app-region:no-drag]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      '[&_svg]:size-3.5',
      active
        ? 'bg-primary-soft text-primary'
        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
    )

  return (
    <div className="app-shell flex h-screen flex-col">
      <header className="titlebar flex h-titlebar shrink-0 select-none items-center gap-2 border-b border-border px-2">
        {window.smoothy.platform === 'darwin' ? <div className="w-[76px] shrink-0" aria-hidden /> : null}
        <nav className="flex items-center gap-0.5" aria-label="Primary">
          <button type="button" className={tabCls(tab === 'studio')} onClick={() => setTab('studio')}>
            <Type /> Studio
          </button>
          <button type="button" className={tabCls(tab === 'photos')} onClick={() => setTab('photos')}>
            <ImageIcon /> AI Photos
          </button>
        </nav>
        <div className="h-full flex-1" />
        <div className="flex items-center gap-1.5 [-webkit-app-region:no-drag]">
          {signedIn && credits ? (
            <span
              className="rounded-sm bg-secondary px-1.5 py-0.5 text-sm text-muted-foreground"
              title={`${credits.tier} plan`}
            >
              {credits.credits} credits
            </span>
          ) : null}
          {signedIn ? (
            <Button
              variant="ghost"
              size="sm"
              title={user?.email ?? 'Sign out'}
              onClick={() => {
                setBusy(true)
                void window.auth.signOut().finally(() => setBusy(false))
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBusy(true)
                void window.auth.signIn().finally(() => setBusy(false))
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
            </Button>
          )}
        </div>
      </header>

      {/* Both stay mounted — switching tabs must not discard an in-progress
          design or a running generation. */}
      <main className="app-content min-h-0 flex-1 overflow-hidden p-3">
        <div className={cn('h-full', tab === 'studio' ? 'block' : 'hidden')}>
          <Studio />
        </div>
        <div className={cn('h-full overflow-auto', tab === 'photos' ? 'block' : 'hidden')}>
          <AiPhotos />
        </div>
      </main>

      {/* Status bar. Sits outside <main> so it stays put while the panels
          scroll, and shows on both tabs. */}
      <footer className="flex h-7 shrink-0 select-none items-center gap-1.5 border-t border-border px-3">
        <Logo className="size-3.5" />
        <span className="text-sm font-medium tracking-tight text-muted-foreground">
          SmoothyStudio
        </span>
        {/* Live status published by Studio — the footer earns its row. */}
        <span className="min-w-0 flex-1" />
        {status.error ? (
          <span className="truncate text-sm text-destructive" title={status.error}>
            {status.error}
          </span>
        ) : tab === 'studio' && status.text ? (
          <span className="truncate font-mono text-sm text-muted-foreground" title={status.text}>
            {status.text}
          </span>
        ) : null}
      </footer>
    </div>
  )
}
