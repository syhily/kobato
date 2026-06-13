import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { emptySession } from '#/_helpers/session'
import { flushAuditLog, initAuditLogBatcher, resetAuditLogBatcher } from '@/server/domains/audit/repos/batcher'
import { establishLoginSession } from '@/server/domains/auth/primitives'
import { revokeAllSessionsOfUser } from '@/server/domains/auth/session-storage'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { auditLog } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'
import { DomainError } from '@/server/infra/http/errors'
import { redisInstance } from '@/server/infra/redis/storage'

const poolDb = createDbPool()
const db: NodePgDatabase = poolDb.db
const pool: Pool = poolDb.pool

afterAll(async () => {
  await closePool(pool)
})

// The audit batcher is a module-level singleton that production code
// initialises during bootstrap. Integration tests that exercise
// `recordAuditEvent` (called fire-and-forget inside `establishLoginSession`)
// must wire up the batcher themselves so events actually land in the
// `audit_log` table. `flushAuditLog()` forces a drain before assertions
// and before teardown so no pending event references a user row that the
// next test's `clearAllTables` will truncate (FK violation).
beforeEach(() => {
  initAuditLogBatcher(db, pool)
})

afterEach(async () => {
  await flushAuditLog()
  resetAuditLogBatcher()
})

// ── Fixtures ──────────────────────────────────────────────────────────────

async function seedUser(overrides: Record<string, unknown> = {}): Promise<bigint> {
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
  await flushWorkerRedis()
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('establishLoginSession', () => {
  it('writes both session:<sid> and user_sessions:<userId>', async () => {
    const userId = await seedUser()
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    const redis = redisInstance()

    const result = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.1')

    // The session blob keyed by sid must exist in Redis.
    const blob = await redis.get(`session:${result.sid}`)
    expect(blob).not.toBeNull()

    // The user_sessions set must contain the new sid.
    const members = await redis.smembers(`user_sessions:${userId}`)
    expect(members).toContain(result.sid)
  })

  it('supports revocation via revokeAllSessionsOfUser', async () => {
    const userId = await seedUser({ email: 'revoke@example.com' })
    const dbUser = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((r) => r[0])
    const redis = redisInstance()

    const result = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.2')

    // Confirm both structures exist before revocation.
    expect(await redis.exists(`session:${result.sid}`)).toBeGreaterThan(0)
    expect(await redis.smembers(`user_sessions:${userId}`)).toContain(result.sid)

    await revokeAllSessionsOfUser(userId)

    // Both the session blob and the set entry must be cleared.
    expect(await redis.get(`session:${result.sid}`)).toBeNull()
    expect(await redis.smembers(`user_sessions:${userId}`)).toEqual([])
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

    // `recordAuditEvent` is fire-and-forget into the batcher. Flush before
    // querying so the row is guaranteed to be in the table.
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
    const redis = redisInstance()

    // Establish a first session.
    const first = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.4')
    expect(await redis.smembers(`user_sessions:${userId}`)).toContain(first.sid)

    // Establish a second session with revokeOtherSessions; the first
    // session's blob and set entry must be cleared.
    const second = await establishLoginSession(db, emptySession(), dbUser, buildRequest(), '203.0.113.5', {
      revokeOtherSessions: true,
    })

    expect(second.sid).not.toBe(first.sid)

    // The first session blob is gone.
    expect(await redis.get(`session:${first.sid}`)).toBeNull()
    // The set now contains only the new sid.
    const members = await redis.smembers(`user_sessions:${userId}`)
    expect(members).toEqual([second.sid])
  })

  it('throws when the user has no role', async () => {
    // Seed a user with a null role (anonymous placeholder account).
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
