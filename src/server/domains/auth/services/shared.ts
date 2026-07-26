// Shared contract of the sign-in services — the per-flow modules in
// this directory (`credential`, `otp`, `passkey`, `password-reset`,
// `setup`) are the single owner of the auth session-key state machine.
// Previously one `signin-flow.ts` held every flow; the split is by
// use-case, with this module holding the vocabulary they all speak.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BlogSession } from '@/server/domains/auth/session-storage'

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
  db: NodePgDatabase
  session: BlogSession
  clientAddress: string
  markSessionDirty(): void
}

export function formFieldString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}
