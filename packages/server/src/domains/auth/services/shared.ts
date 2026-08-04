// Shared contract of the sign-in services — the per-flow modules in
// this directory (`credential`, `otp`, `passkey`, `password-reset`,
// `setup`) are the single owner of the auth session-key state machine.
// Previously one `signin-flow.ts` held every flow; the split is by
// use-case, with this module holding the vocabulary they all speak.

import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { Database } from '@kobato/server/infra/db/database'

import { checkMailReady } from '@kobato/server/infra/email/sender'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'

export type AuthFlowResult =
  | { type: 'redirect'; to: string; setCookie?: string }
  | { type: 'error'; message: string; setCookie?: string }
  | { type: 'success'; message: string; setCookie?: string }

/**
 * The slice of the canonical request context the signin flows need.
 * Structurally satisfied by `RequestContext` (`@/server/http/request-context`)
 * so routes pass `rc` straight in — the domain stays decoupled from the
 * http layer.
 *
 * Same-session mutations (OTP staging, fail counters) call
 * `markSessionDirty()`; the perimeter middleware emits the Set-Cookie
 * after the response resolves. `AuthFlowResult.setCookie` is reserved
 * for sid-rotating results (`establishLoginSession`) — never for
 * same-session commits.
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
 * Whether mail-dependent signin steps (the post-password OTP code and
 * magic-link delivery) can run right now. There is deliberately no
 * on/off toggle: a ready mail transport enables them automatically.
 */
export function isMailLoginReady(): boolean {
  const mail = getBlogSettingsBundleSync()?.mail?.mail
  return mail !== undefined && checkMailReady(mail).ready
}
