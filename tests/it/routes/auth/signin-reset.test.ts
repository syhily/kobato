import type { Mock } from 'vitest'

import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { makeSession } from '#/_helpers/session'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { issueResetToken } from '@/server/domains/auth/verification-tokens'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { passkeyCredential } from '@/server/infra/db/schema/passkey'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user, verification } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// Covers RBAC-RECTIFICATION-PLAN §1.2: after a successful password
// rotation, ALL other sessions of the target user MUST be revoked.
// Real engine; only mock: email delivery.

const mockHandles = vi.hoisted(() => ({
  getRequestContext: vi.fn<any>(),
  sendPasswordReset: vi.fn<any>(),
}))

vi.mock('@/server/http/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/http/request-context')>()
  return {
    ...actual,
    getRequestContext: mockHandles.getRequestContext,
  }
})

vi.mock('@/server/infra/email/sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/email/sender')>()
  return {
    ...actual,
    sendPasswordReset: mockHandles.sendPasswordReset,
  }
})

const db = getTestDb()

const CSRF_TOKEN = 'signin-reset-csrf-token'

const { action } = await import('@/routes/auth/signin')

let testSession: BlogSession
let markSessionDirty: Mock<() => void>

beforeEach(async () => {
  // Flush before teardown: pending events reference rows the next clearAllTables wipes (FK).
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  // Seed one admin — seedUser's default 'visitor' does not satisfy the install gate.
  await db.insert(user).values({
    name: 'Gatekeeper',
    email: 'gatekeeper@example.com',
    password: 'not-a-real-hash',
    role: 'admin',
  })
  __resetRateLimitsForTests()
  testSession = makeSession({})
  testSession.set('csrfToken', CSRF_TOKEN)
  markSessionDirty = vi.fn<() => void>()
  mockHandles.sendPasswordReset.mockClear()
  mockHandles.sendPasswordReset.mockResolvedValue({ ok: true })
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
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
    body: new URLSearchParams({ ...body, csrf_token: CSRF_TOKEN }).toString(),
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
    expect(await db.select().from(sessionTable)).toHaveLength(0)
  })

  it('revokes every pre-existing session on a successful reset (the §1.2 invariant, on the real table)', async () => {
    const admin = await seedUser({ loginMethod: 'passkey' })
    await db.insert(passkeyCredential).values({
      userId: admin.id,
      credentialId: 'cred-1',
      publicKey: Buffer.from([1, 2, 3]),
      counter: 0,
      transports: [],
    })
    // Two pre-existing sessions — the reset invariant must destroy both.
    for (const sid of ['old-sid-1', 'old-sid-2']) {
      await db.insert(sessionTable).values({
        id: sid,
        userId: admin.id,
        data: {},
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    }
    const { token } = issueResetToken(db, admin.id)

    // A redirect Response on success; `data()` and `redirect()` share the call surface.
    const response = (await callResetAction({ reset_token: token, password: 'LongEnough1' })) as Response
    expect(response.status).toBe(302)
    expect(response.headers.get('Set-Cookie')).toMatch(/^__session=/)

    // Revocation invariant: both old sessions destroyed, one new row owned by the user.
    const sessions = await db.select().from(sessionTable)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.userId).toBe(admin.id)
    expect(['old-sid-1', 'old-sid-2']).not.toContain(sessions[0]!.id)

    const [row] = await db.select().from(user).where(eq(user.id, admin.id))
    expect(await bcrypt.compare('LongEnough1', row!.password)).toBe(true)
    expect(row!.loginMethod).toBe('password')
    expect(await db.select().from(passkeyCredential).where(eq(passkeyCredential.userId, admin.id))).toHaveLength(0)
    const tokens = await db
      .select()
      .from(verification)
      .where(and(eq(verification.purpose, 'password-reset'), eq(verification.userId, admin.id)))
    expect(tokens).toHaveLength(0)

    await flushAuditLog()
    const completes = await db.select().from(auditLog).where(eq(auditLog.action, 'password_reset_complete'))
    expect(completes).toHaveLength(1)
    expect(completes[0]!.resourceId).toBe(String(admin.id))
    const logins = await db.select().from(auditLog).where(eq(auditLog.action, 'login'))
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.details).toMatchObject({ method: 'credential_rotation' })
  })
})
