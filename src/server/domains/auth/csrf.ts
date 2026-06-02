import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const CSRF_SESSION_KEY = 'csrfToken'

export const CSRF_HEADER = 'x-csrf-token'

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

export function isCsrfEnabled(): boolean {
  // CSRF is mandatory for authenticated routes. The `enabled` toggle in
  // security settings is ignored — an admin cannot accidentally (or
  // maliciously) disable CSRF protection at runtime.
  return true
}

export function isPathExempt(path: string): boolean {
  const exemptPaths = getBlogSettingsBundleSync()?.security?.csrf.exemptPaths ?? []
  return exemptPaths.some((prefix) => path.startsWith(prefix))
}

/**
 * Validate a CSRF token for a React Router form action.
 * The token may be supplied via the `x-csrf-token` header or a
 * `csrf_token` form field.
 */
export function validateCsrfForAction(session: BlogSession, request: Request, formData: FormData): boolean {
  const fromHeader = request.headers.get(CSRF_HEADER)
  const fromForm = formData.get('csrf_token')
  const candidate = fromHeader ?? (typeof fromForm === 'string' ? fromForm : undefined)
  return validateCsrfToken(session, candidate)
}
