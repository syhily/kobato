import { user, verification } from '@kobato/db/schema/user.ts'
import { SmtpCapture } from '@kobato/harness/smtp.ts'
import { invalidateMailTransportCache } from '@kobato/server/infra/email/sender.ts'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/server/tests/utils/blog-settings.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Real end-to-end: the actual sender, templates, and nodemailer SMTP transport
// against an in-process capture server; the failure leg dials a port with no
// listener and the token-store fault drops the verification table for real.
const { inviteAuthorWithRollback } = await import('@kobato/server/domains/users/services/admin.ts')

const db = getTestDb()
const capture = new SmtpCapture()
let capturePort = 0
let deadPort = 0

function bundleWithSmtp(port: number) {
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: {
      mail: {
        ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
        enabled: true,
        sender: 'noreply@example.com',
        transport: 'smtp' as const,
        smtpHost: '127.0.0.1',
        smtpPort: port,
        smtpUser: 'test',
        smtpPass: 'test',
        smtpSecure: false,
        smtpRequireTls: false,
        smtpRejectUnauthorized: false,
      },
    },
  }
}

beforeAll(async () => {
  capturePort = await capture.start()
  // A loopback port with no listener: a real ECONNREFUSED for the failure leg.
  const { createServer } = await import('node:net')
  deadPort = await new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
})

afterAll(async () => {
  await capture.close()
})

beforeEach(async () => {
  // The it-setup afterEach resets the bundle to defaults; re-point mail at
  // the capture server for every test, and drop any cached transporter.
  setBlogSettingsBundleForTests(bundleWithSmtp(capturePort))
  invalidateMailTransportCache()
  await clearAllTables(db)
})

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  invalidateMailTransportCache()
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

    const mail = await capture.nextMessage(5_000)
    expect(mail.to).toContain('jane@example.com')
    expect(mail.raw).toContain('noreply@example.com')
  })

  it('soft-deletes the author when email send fails', async () => {
    setBlogSettingsBundleForTests(bundleWithSmtp(deadPort))
    invalidateMailTransportCache()

    await expect(
      inviteAuthorWithRollback(db, 'Jane Author', 'jane@example.com', 'https://blog.example.com', 'Admin'),
    ).rejects.toMatchObject({ descriptor: { messageKey: 'users.error.mailFailedRolledBack' } })

    const row = await findUserRow('jane@example.com')
    expect(row).not.toBeNull()
    expect(row!.role).toBe('author')
    expect(row!.deletedAt).not.toBeNull()
  })

  it('rolls back the token if the user insert hits a unique-constraint error', async () => {
    await inviteAuthorWithRollback(db, 'First Author', 'dup@example.com', 'https://blog.example.com', 'Admin')
    await capture.nextMessage(5_000)

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

  it('preserves atomicity when the token store fails mid-transaction', async () => {
    // Drop the verification table for real: the INSERT inside the transaction
    // throws, the whole invite rolls back. Table AND index DDL is snapshotted
    // and restored in creation order — the worker's DB outlives this file.
    const ddlRows = await db.all<{ type: string; name: string; sql: string }>(
      sql`SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'verification' AND sql IS NOT NULL ORDER BY type = 'index', name`,
    )
    expect(ddlRows.length).toBeGreaterThan(1)
    await db.run(sql`DROP TABLE verification`)

    try {
      await expect(
        inviteAuthorWithRollback(db, 'Ghost Author', 'ghost@example.com', 'https://blog.example.com', 'Admin'),
      ).rejects.toThrow()

      const row = await findUserRow('ghost@example.com')
      expect(row).toBeNull()
    } finally {
      for (const row of ddlRows) {
        await db.run(sql.raw(row.sql))
      }
    }
  })
})
