/**
 * PKCE + loopback sign-in for SmoothyEdit Desktop.
 *
 * Flow (per the `pkce-loopback-desktop-auth` skill):
 *   1. Generate code_verifier, code_challenge (SHA-256 base64url), state.
 *   2. Start a one-shot http server on 127.0.0.1:ephemeral_port (port 0).
 *   3. shell.openExternal → https://smoothyedit.com/desktop-link?...
 *   4. User signs in / approves on the web. Browser redirects to
 *      http://127.0.0.1:PORT/callback?code=...&state=...
 *   5. POST /api/desktop-link/token with code + code_verifier → JWT.
 *   6. Encrypt JWT via safeStorage and persist to userData/auth.bin.
 *   7. Focus the main window.
 *
 * No refresh token rotation yet — JWT is 7d. When it expires the user
 * re-signs in (a single click; web session is still cached in the browser).
 */
import { app, shell, safeStorage, BrowserWindow } from 'electron'
import * as http from 'node:http'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import type { PublicUser } from '@shared/state'

const AS_URL = process.env['SMOOTHYEDIT_BASE_URL'] ?? 'https://smoothyedit.com'
const TOKEN_FILE = () => path.join(app.getPath('userData'), 'auth.bin')
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

export interface AuthState {
  signedIn: boolean
  user: PublicUser | null
  accessToken: string | null
  expiresAt: number | null
}

let state: AuthState = { signedIn: false, user: null, accessToken: null, expiresAt: null }

// ─── PKCE helpers ────────────────────────────────────────────────────
function base64url(buf: Buffer): string {
  return buf.toString('base64url')
}
function generateVerifier(): string {
  return base64url(crypto.randomBytes(32))
}
function challengeFromVerifier(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier).digest())
}

// ─── Token persistence (safeStorage-encrypted) ───────────────────────
async function persistToken(token: string, user: PublicUser, expiresAt: number): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('no-keychain')
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    // Refuse plaintext fallback — re-login each launch on this Linux config.
    return
  }
  const blob = safeStorage.encryptString(JSON.stringify({ token, user, expiresAt }))
  await fs.writeFile(TOKEN_FILE(), blob, { mode: 0o600 })
}
async function loadTokenFromDisk(): Promise<AuthState | 'expired' | null> {
  try {
    const blob = await fs.readFile(TOKEN_FILE())
    const decoded = JSON.parse(safeStorage.decryptString(blob))
    if (!decoded?.token || !decoded?.user || !decoded?.expiresAt) return null
    if (decoded.expiresAt < Date.now()) return 'expired'
    return {
      signedIn: true,
      user: decoded.user,
      accessToken: decoded.token,
      expiresAt: decoded.expiresAt,
    }
  } catch {
    return null
  }
}
async function wipeToken(): Promise<void> {
  await fs.rm(TOKEN_FILE(), { force: true })
}

// ─── Public API ──────────────────────────────────────────────────────
/**
 * Returns the restored state, `'expired'` when a previously valid session
 * hit its expiry (the stale token file is wiped), or null when there was
 * never a session on this device.
 */
export async function restoreAuthFromDisk(): Promise<AuthState | 'expired' | null> {
  if (!safeStorage.isEncryptionAvailable()) return null
  const restored = await loadTokenFromDisk()
  if (restored === 'expired') {
    await wipeToken()
    return 'expired'
  }
  if (restored) state = restored
  return restored
}

let expiryTimer: NodeJS.Timeout | null = null

/**
 * Arm a one-shot timer that fires when the current token expires mid-session,
 * clearing auth state and invoking the callback so the UI can say why the
 * user was signed out. Call after every successful sign-in or restore.
 */
export function armExpiryWatch(onExpired: () => void): void {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
  if (!state.expiresAt) return
  const msLeft = state.expiresAt - Date.now()
  if (msLeft <= 0) return
  expiryTimer = setTimeout(() => {
    void wipeToken()
    state = { signedIn: false, user: null, accessToken: null, expiresAt: null }
    onExpired()
  }, msLeft)
}

export function getAuthState(): AuthState {
  return state
}

export async function signIn(mainWindow: BrowserWindow): Promise<AuthState> {
  const code_verifier = generateVerifier()
  const code_challenge = challengeFromVerifier(code_verifier)
  const csrfState = base64url(crypto.randomBytes(16))

  const { code, port } = await waitForLoopbackCode({ csrfState, code_challenge })

  // Exchange code for access token
  const tokenRes = await fetch(`${AS_URL}/api/desktop-link/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier,
      redirect_uri: `http://127.0.0.1:${port}/callback`,
    }),
  })
  if (!tokenRes.ok) {
    const err = (await tokenRes.json().catch(() => ({}))) as { error?: string }
    throw new Error(`Token exchange failed: ${err.error ?? tokenRes.status}`)
  }
  const data = (await tokenRes.json()) as {
    access_token: string
    expires_in: number
    user: PublicUser
  }
  const expiresAt = Date.now() + data.expires_in * 1000
  await persistToken(data.access_token, data.user, expiresAt)
  state = { signedIn: true, user: data.user, accessToken: data.access_token, expiresAt }

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  return state
}

export async function signOut(): Promise<void> {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
  await wipeToken()
  state = { signedIn: false, user: null, accessToken: null, expiresAt: null }
}

/**
 * Helper for code that needs to make authed requests to smoothyedit.com.
 * Returns null when signed out or the token is expired; callers should
 * prompt the user to sign in again rather than silently failing.
 */
export function getAccessToken(): string | null {
  if (!state.accessToken || !state.expiresAt) return null
  if (state.expiresAt < Date.now()) return null
  return state.accessToken
}

// ─── Loopback server ─────────────────────────────────────────────────
async function waitForLoopbackCode(args: {
  csrfState: string
  code_challenge: string
}): Promise<{ code: string; port: number }> {
  const { csrfState, code_challenge } = args
  return new Promise<{ code: string; port: number }>((resolve, reject) => {
    // Captured in the `listen` callback and reused throughout. `server.address()`
    // returns null once `server.close()` has been called, so reading it from
    // inside the request handler (after close) crashes with `lost-port`.
    let listeningPort = 0

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end('Not found')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      })
      res.end(
        '<!doctype html><html><head><meta charset=utf-8><title>Signed in</title>' +
          '<style>body{font:14px -apple-system,system-ui,sans-serif;display:flex;' +
          'align-items:center;justify-content:center;height:100vh;margin:0;color:#222}' +
          '.box{text-align:center;max-width:360px;padding:24px}' +
          'h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#666}</style></head>' +
          '<body><div class=box><h1>Signed in to SmoothyEdit Desktop</h1>' +
          '<p>You can close this tab and return to the app.</p></div>' +
          '<script>setTimeout(()=>window.close(),250)</script></body></html>',
      )
      clearTimeout(timeoutHandle)
      server.close()

      const params = url.searchParams
      const error = params.get('error')
      if (error) return reject(new Error(`Authorize error: ${error}`))
      if (params.get('state') !== csrfState) return reject(new Error('state-mismatch'))
      const code = params.get('code')
      if (!code) return reject(new Error('missing-code'))
      resolve({ code, port: listeningPort })
    })

    const timeoutHandle = setTimeout(() => {
      server.close()
      reject(new Error('login-timeout'))
    }, LOGIN_TIMEOUT_MS)

    server.on('error', (err) => {
      clearTimeout(timeoutHandle)
      reject(err)
    })

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number } | null)?.port
      if (!port) {
        server.close()
        reject(new Error('failed-to-bind'))
        return
      }
      listeningPort = port
      const u = new URL('/desktop-link', AS_URL)
      u.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/callback`)
      u.searchParams.set('state', csrfState)
      u.searchParams.set('code_challenge', code_challenge)
      u.searchParams.set('code_challenge_method', 'S256')
      shell.openExternal(u.toString()).catch((err) => {
        clearTimeout(timeoutHandle)
        server.close()
        reject(err)
      })
    })
  })
}
