import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { clearAllTables } from '#/_helpers/integration-db'
import { createTestDatabase, closeTestDatabase } from '#/_helpers/integration-db'
import { user, verification } from '@/server/infra/db/schema/user'

// `sendAuthorInvite` is the external side effect (SMTP/HTTP call). In
// production it runs AFTER the DB transaction commits. Here we stub it
// at the module boundary so each test can dial the outcome without
// touching the network.
const sendAuthorInvite = vi.fn()

vi.mock('@/server/infra/email/sender', () => ({
  sendAuthorInvite,
  sendPasswordReset: vi.fn(),
}))

// `issueSetupToken` is wrapped so individual tests can make it throw
// mid-transaction to verify rollback atomicity. By default it
// delegates to the real implementation so the happy-path and
// email-failure cases exercise the real DB transaction.
const realVerificationTokens = await vi.importActual<typeof import('@/server/domains/auth/verification-tokens')>(
  '@/server/domains/auth/verification-tokens',
)
const issueSetupToken = vi.fn(realVerificationTokens.issueSetupToken)

vi.mock('@/server/domains/auth/verification-tokens', () => ({
  issueResetToken: realVerificationTokens.issueResetToken,
  issueSetupToken,
  revokeTokensFor: realVerificationTokens.revokeTokensFor,
}))

// Import the service under test AFTER the mocks are registered so the
// mocked bindings propagate through its import graph.
const { inviteAuthorWithRollback } = await import('@/server/domains/users/services/admin')

const handle = createTestDatabase()
const db: Database = handle.db

afterAll(async () => {
  closeTestDatabase(handle)
})

beforeEach(async () => {
  await clearAllTables(db)
  sendAuthorInvite.mockReset()
  // Restore real behaviour for every test; individual tests override.
  issueSetupToken.mockReset()
  issueSetupToken.mockImplementation(realVerificationTokens.issueSetupToken)
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

    // A setup token row should survive the committed transaction.
    const tokenCount = await countSetupTokensFor(row!.id)
    expect(tokenCount).toBe(1)

    // The invite email was dispatched exactly once.
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
    // Seed an existing user with the target email so `findUserByEmail`
    // short-circuits the pre-commit guard. The CONFLICT error is thrown
    // before the transaction opens — no token row is created.
    sendAuthorInvite.mockResolvedValueOnce({ ok: true })
    await inviteAuthorWithRollback(db, 'First Author', 'dup@example.com', 'https://blog.example.com', 'Admin')

    // Capture the id of the already-committed user so we can count its
    // tokens after the duplicate attempt.
    const existing = await findUserRow('dup@example.com')
    expect(existing).not.toBeNull()
    const tokensBefore = await countSetupTokensFor(existing!.id)

    // The second invitation with the same email must throw the CONFLICT
    // error — no second user row, no second token.
    await expect(
      inviteAuthorWithRollback(db, 'Second Author', 'dup@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toThrow(/已被注册/)

    // Still exactly one user row for this email (no second author).
    const row = await findUserRow('dup@example.com')
    expect(row).not.toBeNull()
    expect(row!.id).toBe(existing!.id)

    // Token count is unchanged — the duplicate attempt never opened a
    // transaction, so nothing was written to the verification table.
    const tokensAfter = await countSetupTokensFor(existing!.id)
    expect(tokensAfter).toBe(tokensBefore)
  })

  it('preserves atomicity when issueSetupToken fails mid-transaction', async () => {
    // Make `issueSetupToken` throw inside the transaction. The rollback
    // must discard the `insertAuthor` write so no orphaned user row is
    // left behind, and `sendAuthorInvite` must never run.
    issueSetupToken.mockImplementationOnce(() => {
      throw new Error('token store down')
    })

    await expect(
      inviteAuthorWithRollback(db, 'Ghost Author', 'ghost@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toThrow('token store down')

    // No user row survived — the transaction rolled back.
    const row = await findUserRow('ghost@example.com')
    expect(row).toBeNull()

    // The email side effect never fired because the tx threw first.
    expect(sendAuthorInvite).not.toHaveBeenCalled()
  })
})
