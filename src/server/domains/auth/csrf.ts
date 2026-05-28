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
  if (expected.length !== headerValue.length) {
    return false
  }
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ headerValue.charCodeAt(i)
  }
  return mismatch === 0
}

export function isCsrfEnabled(): boolean {
  return getBlogSettingsBundleSync()?.security?.csrf.enabled ?? true
}

export function isPathExempt(path: string): boolean {
  const exemptPaths = getBlogSettingsBundleSync()?.security?.csrf.exemptPaths ?? []
  return exemptPaths.some((prefix) => path.startsWith(prefix))
}
