// Shared contract of the sign-in services: the per-flow modules
// (`credential`, `otp`, `passkey`, `password-reset`, `setup`) are the
// single owner of the auth session-key state machine.

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'

import { checkMailReady } from '@/server/infra/email/sender'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export type AuthFlowResult =
  | { type: 'redirect'; to: string; setCookie?: string }
  | { type: 'error'; message: string; setCookie?: string }
  | { type: 'success'; message: string; setCookie?: string }

/**
 * The slice of the canonical request context the signin flows need.
 * Same-session mutations call `markSessionDirty()`; `AuthFlowResult.setCookie`
 * is reserved for sid-rotating results — never for same-session commits.
 */
export interface SigninFlowContext {
  db: Database
  session: BlogSession
  clientAddress: string
  markSessionDirty(): void
}

export function formFieldString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Whether mail-dependent signin steps (post-password OTP, magic-link
 * delivery) can run right now.
 */
export function isMailLoginReady(): boolean {
  const mail = getBlogSettingsBundleSync()?.mail?.mail
  return mail !== undefined && checkMailReady(mail).ready
}
