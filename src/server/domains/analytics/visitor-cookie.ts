import { randomBytes } from 'node:crypto'

import { KOBATO_AID_COOKIE } from '@/server/domains/analytics/track'

// Long-lived opaque visitor identifier. Issued exactly once per browser
// (httpOnly, sameSite=Lax, Max-Age=30d) so the analytics dashboard can
// reason about cross-day returning visitors without relying on the
// daily-rotating `visitor_hash` (which deliberately resets across UTC
// boundaries).
//
// Why not the existing `__session` cookie? `__session` is signed and
// keyed on logged-in identity; we want a stable handle even for
// anonymous readers and we don't want to tie analytics fingerprinting
// to the session secret. A separate cookie keeps the two surfaces
// independent and lets a future "delete my analytics history" admin
// action expire one without touching the other.
//
// The cookie value is a 12-byte random hex string (96 bits of entropy)
// — large enough that collisions are negligible and small enough that
// it doesn't bloat every request's `Cookie:` header.

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
   * the request already carried a valid cookie (no rotation needed).
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
