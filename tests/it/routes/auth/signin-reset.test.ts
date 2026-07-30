import type { Mock } from 'vitest'

import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { makeSession } from '#/_helpers/session'
import { issueResetToken } from '@/server/domains/auth/verification-tokens'
import { passkeyCredential } from '@/server/infra/db/schema/passkey'
import { user, verification } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// Covers RBAC-RECTIFICATION-PLAN §1.2.
//
// The `signin` action's password-reset and author-invite branches
// share a non-negotiable invariant:
//
//   After a successful password rotation, ALL other sessions of the
//   target user MUST be revoked — `establishLoginSession` is called
//   with `{ revokeOtherSessions: true }` so a stolen cookie cannot
//   survive the recovery flow.
//
// Real engine: the user is a real row, the reset token is a real
// single-use `verification` row, and the rate limiter is the real
// in-process one. `establishLoginSession` stays mocked — it IS the
// seam whose call contract this file pins. Email delivery and the
// audit sink are true externals.

const mockHandles = vi.hoisted(() => ({
  getRequestContext: vi.fn<any>(),
  sendPasswordReset: vi.fn<any>(),
  establishLoginSession: vi.fn<any>(),
  recordAuditEvent: vi.fn<any>(),
}))

vi.mock('@/server/http/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/http/request-context')>()
  return {
    ...actual,
    getRequestContext: mockHandles.getRequestContext,
  }
})

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureInstalledOrRedirect: vi.fn(async () => null),
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => true),
  getInstallState: vi.fn(async () => 'installed' as const),
}))

vi.mock('@/server/domains/auth/csrf', () => ({
  validateCsrfForAction: vi.fn(() => true),
}))

vi.mock('@/server/infra/email/sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/email/sender')>()
  return {
    ...actual,
    sendPasswordReset: mockHandles.sendPasswordReset,
  }
})

vi.mock('@/server/domains/auth/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/auth/primitives')>()
  return {
    ...actual,
    establishLoginSession: mockHandles.establishLoginSession,
  }
})

vi.mock('@/server/domains/audit/services/record', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/audit/services/record')>()
  return {
    ...actual,
    recordAuditEvent: mockHandles.recordAuditEvent,
  }
})

const db = getTestDb()

const { action } = await import('@/routes/auth/signin')

let testSession: BlogSession
let markSessionDirty: Mock<() => void>

beforeAll(() => {
  mockHandles.sendPasswordReset.mockResolvedValue({ ok: true })
  mockHandles.establishLoginSession.mockResolvedValue({
    sid: 'test-sid',
    setCookie: '__session=test-cookie; Path=/',
  })
})

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
  testSession = makeSession({})
  markSessionDirty = vi.fn<() => void>()
  mockHandles.sendPasswordReset.mockClear()
  mockHandles.establishLoginSession.mockClear()
  mockHandles.recordAuditEvent.mockClear()
  mockHandles.sendPasswordReset.mockResolvedValue({ ok: true })
  mockHandles.establishLoginSession.mockResolvedValue({
    sid: 'test-sid',
    setCookie: '__session=test-cookie; Path=/',
  })
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const hashed = await bcrypt.hash('OldPassword1', 4)
  const [inserted] = await db
    .insert(user)
    .values({
      name: 'tester',
      email: 'tester@example.com',
      password: hashed,
      role: 'visitor',
      ...overrides,
    })
    .returning()
  return inserted!
}

async function callResetAction(body: Record<string, string>): Promise<unknown> {
  const url = new URL('http://localhost/admin/signin?action=resetpassword')
  mockHandles.getRequestContext.mockReturnValue(
    makeRequestContext({ session: testSession, db, request: new Request(url), markSessionDirty }),
  )
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  try {
    return await action({ request, context: new Map(), params: {} } as unknown as Parameters<typeof action>[0])
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
}

async function readActionData<T>(promise: Promise<unknown>): Promise<T> {
  const result = (await promise) as { data: T } | T
  if (result !== null && typeof result === 'object' && 'data' in (result as object)) {
    return (result as { data: T }).data
  }
  return result as T
}

describe('routes/signin — password-reset session-revocation (real db + tokens)', () => {
  it('returns 链接无效或已过期 when the token does not consume (no session established)', async () => {
    const result = await readActionData<{ error: string | null }>(
      callResetAction({ reset_token: 'bogus-token', password: 'LongEnough1' }),
    )
    expect(result.error).toBe('链接无效或已过期。')
    expect(mockHandles.establishLoginSession).not.toHaveBeenCalled()
  })

  it('calls establishLoginSession with revokeOtherSessions: true on a successful reset', async () => {
    const admin = await seedUser({ loginMethod: 'passkey' })
    await db.insert(passkeyCredential).values({
      userId: admin.id,
      credentialId: 'cred-1',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: [],
    })
    const { token } = issueResetToken(db, admin.id)

    // Action returns a redirect Response on success; both `data(...)` and
    // `redirect(...)` flow through the same call surface.
    await callResetAction({ reset_token: token, password: 'LongEnough1' })

    // Whichever path it took, the security invariant is the same:
    expect(mockHandles.establishLoginSession).toHaveBeenCalledTimes(1)
    const callArgs = mockHandles.establishLoginSession.mock.calls[0]!
    // Last positional arg is `{ revokeOtherSessions: true }`.
    expect(callArgs[callArgs.length - 1]).toEqual({ revokeOtherSessions: true })

    // The rotation really landed: new bcrypt hash, login method reverted,
    // passkey credentials cleared through the real cleanup, token gone.
    const [row] = await db.select().from(user).where(eq(user.id, admin.id))
    expect(await bcrypt.compare('LongEnough1', row!.password)).toBe(true)
    expect(row!.loginMethod).toBe('password')
    expect(await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, admin.id))).toHaveLength(0)
    const tokens = await db
      .select()
      .from(verification)
      .where(and(eq(verification.purpose, 'password-reset'), eq(verification.userId, admin.id)))
    expect(tokens).toHaveLength(0)
  })
})
