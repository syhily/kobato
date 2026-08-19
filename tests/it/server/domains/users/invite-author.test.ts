import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { user, verification } from '@/server/infra/db/schema/user'

// sendAuthorInvite (SMTP/HTTP side effect) is stubbed at the module boundary.
const sendAuthorInvite = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/email/sender', () => ({
  sendAuthorInvite,
  sendPasswordReset: vi.fn(),
  invalidateMailTransportCache: vi.fn(),
}))

// issueSetupToken is wrapped so tests can make it throw mid-transaction; defaults to the real implementation.
// The factory is async (importOriginal): db-lifecycle's scheduler wiring pulls the real
// verification-tokens module into this file's static import graph, so the factory can
// fire before any top-level `await vi.importActual` in the file body would run (TDZ).
const setupTokenMocks = vi.hoisted(() => ({
  issueSetupToken: vi.fn(),
  realIssueSetupToken:
    undefined as unknown as typeof import('@/server/domains/auth/verification-tokens').issueSetupToken,
}))

vi.mock('@/server/domains/auth/verification-tokens', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/server/domains/auth/verification-tokens')>()
  setupTokenMocks.realIssueSetupToken = real.issueSetupToken
  return {
    issueResetToken: real.issueResetToken,
    issueSetupToken: (...args: Parameters<typeof real.issueSetupToken>) => setupTokenMocks.issueSetupToken(...args),
    revokeTokensFor: real.revokeTokensFor,
  }
})

// Import the service AFTER the mocks so the bindings propagate.
const { inviteAuthorWithRollback } = await import('@/server/domains/users/services/admin')

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  sendAuthorInvite.mockReset()
  setupTokenMocks.issueSetupToken.mockReset()
  setupTokenMocks.issueSetupToken.mockImplementation(setupTokenMocks.realIssueSetupToken)
})

async function findUserRow(email: string) {
  const rows = await db
    .select({
      id: user.id,
      role: user.role,
      deletedAt: user.deletedAt,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)
  return rows[0] ?? null
}

async function countSetupTokensFor(userId: number): Promise<number> {
  const rows = await db.select({ id: verification.id }).from(verification).where(eq(verification.userId, userId))
  return rows.length
}

describe('integration / inviteAuthorWithRollback', () => {
  it('creates the author and sends the invite on the happy path', async () => {
    sendAuthorInvite.mockResolvedValueOnce({ ok: true })

    const result = await inviteAuthorWithRollback(
      db,
      'Jane Author',
      'jane@example.com',
      'https://blog.example.com',
      'Admin',
    )

    expect(result.success).toBe(true)

    const row = await findUserRow('jane@example.com')
    expect(row).not.toBeNull()
    expect(row!.role).toBe('author')
    expect(row!.deletedAt).toBeNull()

    const tokenCount = await countSetupTokensFor(row!.id)
    expect(tokenCount).toBe(1)

    expect(sendAuthorInvite).toHaveBeenCalledTimes(1)
  })

  it('soft-deletes the author when email send fails', async () => {
    sendAuthorInvite.mockResolvedValueOnce({
      ok: false,
      reason: 'upstream',
      status: 500,
      message: 'provider down',
    })

    await expect(
      inviteAuthorWithRollback(db, 'Jane Author', 'jane@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toThrow(/邮件发送失败/)

    // The user row exists but is soft-deleted by the compensating call.
    const row = await findUserRow('jane@example.com')
    expect(row).not.toBeNull()
    expect(row!.role).toBe('author')
    expect(row!.deletedAt).not.toBeNull()
  })

  it('rolls back the token if the user insert hits a unique-constraint error', async () => {
    // The CONFLICT error throws before the transaction opens — no token row is created.
    sendAuthorInvite.mockResolvedValueOnce({ ok: true })
    await inviteAuthorWithRollback(db, 'First Author', 'dup@example.com', 'https://blog.example.com', 'Admin')

    const existing = await findUserRow('dup@example.com')
    expect(existing).not.toBeNull()
    const tokensBefore = await countSetupTokensFor(existing!.id)

    // Second invitation: CONFLICT — no second user row, no second token.
    await expect(
      inviteAuthorWithRollback(db, 'Second Author', 'dup@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toThrow(/已被注册/)

    const row = await findUserRow('dup@example.com')
    expect(row).not.toBeNull()
    expect(row!.id).toBe(existing!.id)

    // Token count unchanged: the duplicate attempt never opened a transaction.
    const tokensAfter = await countSetupTokensFor(existing!.id)
    expect(tokensAfter).toBe(tokensBefore)
  })

  it('preserves atomicity when issueSetupToken fails mid-transaction', async () => {
    // Rollback must discard the insertAuthor write and never run sendAuthorInvite.
    setupTokenMocks.issueSetupToken.mockImplementationOnce(() => {
      throw new Error('token store down')
    })

    await expect(
      inviteAuthorWithRollback(db, 'Ghost Author', 'ghost@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toThrow('token store down')

    const row = await findUserRow('ghost@example.com')
    expect(row).toBeNull()

    expect(sendAuthorInvite).not.toHaveBeenCalled()
  })
})
