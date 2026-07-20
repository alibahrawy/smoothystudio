/**
 * Credits fetcher. /api/credits accepts the x-member-id header (mirror
 * of the analyze / history pattern), so the desktop can read balance
 * + tier + days remaining for the current user. The per-mode usage
 * breakdown (/api/credits/usage) is gated on a cookie session, not
 * x-member-id, so it stays on the web — the popover deep-links to
 * smoothyedit.com/settings for that.
 */
import { getAuthState, getAccessToken } from './auth-service'

const AS_URL = process.env['SMOOTHYEDIT_BASE_URL'] ?? 'https://smoothyedit.com'

export interface CreditInfo {
  tier: 'free' | 'pro'
  credits: number
  creditsUsed: number
  totalCredits: number
  percentage: number
  daysRemaining: number
  periodEnd: string
  formatted?: { credits: string; creditsUsed: string }
}

export async function getCredits(signal?: AbortSignal): Promise<CreditInfo> {
  const auth = getAuthState()
  if (!auth.signedIn || !auth.user) throw new Error('not-signed-in')
  const access = getAccessToken()

  const res = await fetch(`${AS_URL}/api/credits`, {
    method: 'GET',
    signal,
    headers: {
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      'x-member-id': auth.user.id,
    },
  })
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`credits-failed: ${res.status} ${text}`.trim())
  }
  return (await res.json()) as CreditInfo
}
