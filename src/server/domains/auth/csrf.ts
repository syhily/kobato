import { timingSafeEqual } from 'node:crypto'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const CSRF_SESSION_KEY = 'csrfToken'

export const CSRF_HEADER = 'x-csrf-token'

function generateAndStore(session: BlogSession): string {
  const token = crypto.randomUUID()
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
  return getBlogSettingsBundleSync()?.security?.csrf.enabled ?? true
}

export function isPathExempt(path: string): boolean {
  const exemptPaths = getBlogSettingsBundleSync()?.security?.csrf.exemptPaths ?? []
  return exemptPaths.some((prefix) => path.startsWith(prefix))
}
