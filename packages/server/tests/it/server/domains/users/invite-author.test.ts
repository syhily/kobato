import { user, verification } from '@kobato/db/schema/user.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendAuthorInvite = vi.hoisted(() => vi.fn())

vi.mock('@kobato/server/infra/email/sender.ts', () => ({
  sendAuthorInvite,
  sendPasswordReset: vi.fn(),
  invalidateMailTransportCache: vi.fn(),
}))

const setupTokenMocks = vi.hoisted(() => ({
  issueSetupToken: vi.fn(),
  realIssueSetupToken:
    undefined as unknown as typeof import('@kobato/server/domains/auth/verification-tokens.ts').issueSetupToken,
}))

vi.mock('@kobato/server/domains/auth/verification-tokens.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('@kobato/server/domains/auth/verification-tokens.ts')>()
  setupTokenMocks.realIssueSetupToken = real.issueSetupToken
  return {
    issueResetToken: real.issueResetToken,
    issueSetupToken: (...args: Parameters<typeof real.issueSetupToken>) => setupTokenMocks.issueSetupToken(...args),
    revokeTokensFor: real.revokeTokensFor,
  }
})

const { inviteAuthorWithRollback } = await import('@kobato/server/domains/users/services/admin.ts')

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
    ).rejects.toMatchObject({ descriptor: { messageKey: 'users.error.mailFailedRolledBack' } })

    const row = await findUserRow('jane@example.com')
    expect(row).not.toBeNull()
    expect(row!.role).toBe('author')
    expect(row!.deletedAt).not.toBeNull()
  })

  it('rolls back the token if the user insert hits a unique-constraint error', async () => {
    sendAuthorInvite.mockResolvedValueOnce({ ok: true })
    await inviteAuthorWithRollback(db, 'First Author', 'dup@example.com', 'https://blog.example.com', 'Admin')

    const existing = await findUserRow('dup@example.com')
    expect(existing).not.toBeNull()
    const tokensBefore = await countSetupTokensFor(existing!.id)

    await expect(
      inviteAuthorWithRollback(db, 'Second Author', 'dup@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toMatchObject({ descriptor: { messageKey: 'users.error.emailTaken' } })

    const row = await findUserRow('dup@example.com')
    expect(row).not.toBeNull()
    expect(row!.id).toBe(existing!.id)

    const tokensAfter = await countSetupTokensFor(existing!.id)
    expect(tokensAfter).toBe(tokensBefore)
  })

  it('preserves atomicity when issueSetupToken fails mid-transaction', async () => {
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
