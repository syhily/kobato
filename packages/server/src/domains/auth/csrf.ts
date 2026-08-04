import type { BlogSession } from '@kobato/server/domains/auth/session-storage'

import { serverConfig } from '@kobato/server/infra/config'
import { getLogger } from '@kobato/server/infra/logger'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const CSRF_SESSION_KEY = 'csrfToken'

export const CSRF_HEADER = 'x-csrf-token'

export const CSRF_COOKIE_NAME = '__csrf'

function generateAndStore(session: BlogSession): string {
  // 32 bytes = 256 bits of entropy, hex-encoded. Stronger than
  // crypto.randomUUID() (122 bits) for defense-in-depth.
  const token = randomBytes(32).toString('hex')
  session.set(CSRF_SESSION_KEY, token)
  return token
}

export function ensureCsrfToken(session: BlogSession): string {
  const existing = session.get(CSRF_SESSION_KEY) as string | undefined
  if (existing) {
    return existing
  }
  return generateAndStore(session)
}

// ─── Stateless (anonymous) CSRF tokens ──────────────────
//
// Every SSR page needs a CSRF token for the public forms and /rpc
// mutations it renders, but persisting a session row per cookieless bot
// request floods the session table (write amplification — P1-4). For
// requests without a `__session` cookie the token is therefore derived
// statelessly: HMAC(sessionSecret, __csrf cookie), a signed double-submit
// variant. The HttpOnly SameSite=Lax cookie pins the token to the
// browser; the header/form field proves the caller read the HTML. Nothing
// is ever written to the session table for anonymous traffic.

const CSRF_COOKIE_VALUE_RE = /^[a-f0-9]{64}$/i

export function isCsrfCookieValue(value: string): boolean {
  return CSRF_COOKIE_VALUE_RE.test(value)
}

export function mintCsrfCookieValue(): string {
  // 32 bytes = 256 bits of entropy, hex-encoded — same strength as the
  // session-persisted tokens above.
  return randomBytes(32).toString('hex')
}

export function deriveStatelessCsrfToken(cookieValue: string): string {
  return createHmac('sha256', serverConfig.security.sessionSecret[0]!).update(cookieValue).digest('hex')
}

export function buildCsrfCookieHeader(cookieValue: string): string {
  // Session-scoped on purpose: the token is re-derived on every visit, so
  // the cookie has no reason to outlive the browser session.
  const parts = [`${CSRF_COOKIE_NAME}=${cookieValue}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (import.meta.env.PROD) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

export function validateCsrfToken(session: BlogSession, headerValue: string | null | undefined): boolean {
  const expected = session.get(CSRF_SESSION_KEY)
  if (!expected || !headerValue) {
    return false
  }
  // Constant-time comparison to prevent timing attacks.
  const enc = new TextEncoder()
  const expectedBuf = enc.encode(expected)
  const headerBuf = enc.encode(headerValue)
  if (expectedBuf.byteLength !== headerBuf.byteLength) {
    return false
  }
  return timingSafeEqual(expectedBuf, headerBuf)
}

export function isPathExempt(path: string): boolean {
  const exemptPaths = getBlogSettingsBundleSync()?.security?.csrf.exemptPaths ?? []
  // Segment-boundary match: `/api/admin` exempts `/api/admin` itself and
  // `/api/admin/...`, but not a look-alike prefix such as `/api/adminx`
  // (P1-6). Exempt a non-slash continuation (e.g. `/feed` → `/feed.xml`)
  // by listing that exact path instead.
  return exemptPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

// ─── Master switch (security.csrf.enabled) ──────────────

const log = getLogger('auth.csrf')

let csrfDisabledWarned = false

/**
 * Returns true when CSRF validation must be skipped because the admin
 * turned off `security.csrf.enabled` (P1-7). The first skip after startup
 * logs a warning so the degraded posture is visible in the logs;
 * subsequent skips log at debug to avoid per-request noise. Pre-install
 * (settings snapshot not hydrated yet) fails closed: protection stays on.
 */
export function isCsrfValidationSkipped(): boolean {
  const enabled = getBlogSettingsBundleSync()?.security?.csrf.enabled ?? true
  if (enabled) {
    return false
  }
  if (csrfDisabledWarned) {
    log.debug('CSRF validation skipped: security.csrf.enabled is false')
  } else {
    csrfDisabledWarned = true
    log.warn('CSRF protection is disabled (security.csrf.enabled=false); skipping token validation')
  }
  return true
}

/**
 * Validate a CSRF token for a React Router form action.
 * The token may be supplied via the `x-csrf-token` header or a
 * `csrf_token` form field.
 */
export function validateCsrfForAction(session: BlogSession, request: Request, formData: FormData): boolean {
  if (isCsrfValidationSkipped()) {
    return true
  }
  const fromHeader = request.headers.get(CSRF_HEADER)
  const fromForm = formData.get('csrf_token')
  const candidate = fromHeader ?? (typeof fromForm === 'string' ? fromForm : undefined)
  return validateCsrfToken(session, candidate)
}
