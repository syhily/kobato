import { auditLog } from '@kobato/db/schema/config.ts'
import { session as sessionTable } from '@kobato/db/schema/session.ts'
import { user } from '@kobato/db/schema/user.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher.ts'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives.ts'
import { revokeAllSessionsOfUser } from '@kobato/server/domains/auth/services/sessions.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { emptySession } from '@kobato/test/session.ts'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(() => {
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

async function seedUser(overrides: Record<string, unknown> = {}): Promise<number> {
  const hashed = await bcrypt.hash('Password123!', 12)
  const [inserted] = await db
    .insert(user)
    .values({
      name: 'Test User',
      email: 'test@example.com',
      password: hashed,
      role: 'admin',
      ...overrides,
    })
    .returning({ id: user.id })
  return inserted!.id
}

function buildRequest(userAgent = 'Mozilla/5.0 (Test) Chrome/120'): Request {
  return new Request('http://localhost/admin', { headers: { 'User-Agent': userAgent } })
}

beforeEach(async () => {
  await clearAllTables(db)
})

async function findSessionRow(sid: string) {
  const rows = await db.select().from(sessionTable).where(eq(sessionTable.id, sid))
  return rows[0]
}

describe('establishLoginSession', () => {
  it('writes a session row stamped with the user and login meta', async () => {
    const userId = await seedUser()
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])

    const result = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.1')

    const row = await findSessionRow(result.sid)
    expect(row).toBeDefined()
    expect(row!.userId).toBe(userId)
    expect(row!.loginAt).not.toBeNull()
    expect(row!.lastActiveAt).not.toBeNull()
    expect(row!.userAgent).toBe('Mozilla/5.0 (Test) Chrome/120')
    expect(row!.ip).toBe('203.0.113.1')
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('supports revocation via revokeAllSessionsOfUser', async () => {
    const userId = await seedUser({ email: 'revoke@example.com' })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])

    const result = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.2')

    expect(await findSessionRow(result.sid)).toBeDefined()

    const deleted = await revokeAllSessionsOfUser(db, userId)
    expect(deleted).toBe(1)
    expect(await findSessionRow(result.sid)).toBeUndefined()
  })

  it('emits an audit event on successful login', async () => {
    const userId = await seedUser({ email: 'audit@example.com' })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])

    const result = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.3')

    await flushAuditLog()

    const events = await db.select().from(auditLog).where(eq(auditLog.resourceId, result.sid)).limit(1)
    expect(events).toHaveLength(1)
    expect(events[0].action).toBe('login')
    expect(events[0].resourceType).toBe('session')
    expect(events[0].actorId).toBe(userId)
    expect(events[0].actorRole).toBe('admin')
    expect(events[0].ipAddress).toBe('203.0.113.3')
  })

  it('revokes existing sessions when revokeOtherSessions is set', async () => {
    const userId = await seedUser({ email: 'rotate@example.com' })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])

    const first = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.4')
    expect(await findSessionRow(first.sid)).toBeDefined()

    const second = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.5', {
      revokeOtherSessions: true,
    })

    expect(second.sid).not.toBe(first.sid)
    expect(await findSessionRow(first.sid)).toBeUndefined()
    expect(await findSessionRow(second.sid)).toBeDefined()
  })

  it('throws when the user has no role', async () => {
    const userId = await seedUser({ email: 'no-role@example.com', role: null })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])

    await expect(establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.6')).rejects.toThrow(
      DomainError,
    )
  })
})
