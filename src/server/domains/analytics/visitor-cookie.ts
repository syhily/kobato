import { randomBytes } from 'node:crypto'

import { KOBATO_AID_COOKIE } from '@/server/domains/analytics/track'

// Long-lived opaque visitor identifier for cross-day returning-visitor
// tracking. Kept separate from the signed, login-keyed `__session` cookie
// so analytics stays independent of the session secret. 12-byte random hex.

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function readCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null
  }
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
  const m = header.match(re)
  return m ? decodeURIComponent(m[1]!) : null
}

export interface VisitorCookieResolution {
  /** The id present on the request, or freshly generated for new visitors. */
  visitorId: string
  /**
   * Set-Cookie header value to attach to the response, or `null` when
   * the request already carried a valid cookie.
   */
  setCookie: string | null
}

export function resolveVisitorCookie(cookieHeader: string | null): VisitorCookieResolution {
  const existing = readCookie(cookieHeader, KOBATO_AID_COOKIE)
  if (existing && /^[a-f0-9]{16,64}$/i.test(existing)) {
    return { visitorId: existing, setCookie: null }
  }
  const visitorId = randomBytes(12).toString('hex')
  const secure = import.meta.env.PROD
  const parts = [
    `${KOBATO_AID_COOKIE}=${visitorId}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) {
    parts.push('Secure')
  }
  return { visitorId, setCookie: parts.join('; ') }
}
