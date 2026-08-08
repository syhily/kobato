import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { serverConfig } from '@/server/infra/config'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const CSRF_SESSION_KEY = 'csrfToken'

export const CSRF_HEADER = 'x-csrf-token'

export const CSRF_COOKIE_NAME = '__csrf'

function generateAndStore(session: BlogSession): string {
  // 32 bytes = 256 bits of entropy, hex-encoded.
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

// Cookieless requests get a stateless token: HMAC(sessionSecret,
// __csrf cookie), a signed double-submit variant — persisting per-request
// rows would flood the session table (P1-4).

const CSRF_COOKIE_VALUE_RE = /^[a-f0-9]{64}$/i

export function isCsrfCookieValue(value: string): boolean {
  return CSRF_COOKIE_VALUE_RE.test(value)
}

export function mintCsrfCookieValue(): string {
  // Same strength as the session-persisted tokens.
  return randomBytes(32).toString('hex')
}

export function deriveStatelessCsrfToken(cookieValue: string): string {
  return createHmac('sha256', serverConfig.security.sessionSecret[0]!).update(cookieValue).digest('hex')
}

export function buildCsrfCookieHeader(cookieValue: string): string {
  // Session-scoped: the token is re-derived every visit.
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
  // Segment-boundary match: `/api/admin` covers `/api/admin/...` but not
  // `/api/adminx` (P1-6); list exact paths for non-slash continuations.
  return exemptPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

const log = getLogger('auth.csrf')

let csrfDisabledWarned = false

/**
 * True when the admin disabled `security.csrf.enabled` (P1-7); the first
 * skip warns, later ones log at debug. Pre-install fails closed.
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

/** Validate a CSRF token for a React Router form action. */
export function validateCsrfForAction(session: BlogSession, request: Request, formData: FormData): boolean {
  if (isCsrfValidationSkipped()) {
    return true
  }
  const fromHeader = request.headers.get(CSRF_HEADER)
  const fromForm = formData.get('csrf_token')
  const candidate = fromHeader ?? (typeof fromForm === 'string' ? fromForm : undefined)
  return validateCsrfToken(session, candidate)
}
