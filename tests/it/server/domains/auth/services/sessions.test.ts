import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { listAllSessions, revokeAllSessionsOfUser } from '@/server/domains/auth/services/sessions'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user } from '@/server/infra/db/schema/user'

// Sessions service against the real session/user tables; this file owns
// the branches auth-sessions/auth-coverage do not: except-session
// revocation, deleted-user fallback, and the 10k soft cap.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedUser(role: 'admin' | 'visitor' = 'admin', email = 'a@example.com') {
  const [u] = await db.insert(user).values({ name: 'T', email, password: 'hashed', role }).returning()
  return u!
}

/** Insert a live session row with the login meta stamped inline — the same
 * columns `recordSessionLogin` writes, batched here so bulk seeds stay cheap. */
function liveSessionRow(sid: string, userId: number, opts: { ip?: string; userAgent?: string } = {}) {
  const now = new Date()
  return {
    id: sid,
    userId,
    data: {},
    userAgent: opts.userAgent ?? 'ua',
    ip: opts.ip ?? '1.1.1.1',
    loginAt: now,
    lastActiveAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  }
}

describe('auth/services/sessions — revokeAllSessionsOfUser', () => {
  it('deletes every session but the except one and returns the deleted count', async () => {
    const u = await seedUser('admin', 'except@example.com')
    await db
      .insert(sessionTable)
      .values([liveSessionRow('sid-1', u.id), liveSessionRow('sid-2', u.id), liveSessionRow('sid-keep', u.id)])

    const deleted = await revokeAllSessionsOfUser(db, u.id, 'sid-keep')

    expect(deleted).toBe(2)
    const remaining = await db.select().from(sessionTable)
    expect(remaining.map((r) => r.id)).toEqual(['sid-keep'])
  })

  it('deletes all sessions when no except id is given', async () => {
    const u = await seedUser('admin', 'all@example.com')
    await db.insert(sessionTable).values([liveSessionRow('sid-1', u.id), liveSessionRow('sid-2', u.id)])

    const deleted = await revokeAllSessionsOfUser(db, u.id)

    expect(deleted).toBe(2)
    expect(await db.select().from(sessionTable)).toHaveLength(0)
  })
})

describe('auth/services/sessions — listAllSessions', () => {
  it('returns one entry per session when a user has several live sessions', async () => {
    const alice = await seedUser('admin', 'alice@example.com')
    await db
      .insert(sessionTable)
      .values([liveSessionRow('sid-a1', alice.id), liveSessionRow('sid-a2', alice.id, { ip: '2.2.2.2' })])

    const list = await listAllSessions(db)

    expect(list).toHaveLength(2)
    expect(list.map((s) => s.sid).sort()).toEqual(['sid-a1', 'sid-a2'])
    // Both entries joined against the same single user row.
    for (const entry of list) {
      expect(entry.userEmail).toBe('alice@example.com')
      expect(entry.userRole).toBe('admin')
    }
  })

  it('uses the deleted-user fallback when no user row matches the session owner', async () => {
    const u = await seedUser('admin', 'gone@example.com')
    await db.insert(sessionTable).values(liveSessionRow('sid-orphan', u.id, { ip: '3.3.3.3' }))
    // Drop the user with FK checks off — dangling owners cascade otherwise.
    db.run(sql`PRAGMA foreign_keys = OFF`)
    try {
      await db.delete(user)
    } finally {
      db.run(sql`PRAGMA foreign_keys = ON`)
    }

    const list = await listAllSessions(db)

    expect(list).toHaveLength(1)
    expect(list[0]!.userName).toBe('已删除的用户')
    expect(list[0]!.userEmail).toBe('')
    expect(list[0]!.userRole).toBeNull()
    expect(list[0]!.ip).toBe('3.3.3.3')
  })

  it('soft-caps the listing at 10k rows', async () => {
    const u = await seedUser('admin', 'cap@example.com')
    const total = 10_001
    const batchSize = 500
    for (let start = 0; start < total; start += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, total - start) }, (_, i) =>
        liveSessionRow(`sid-${start + i}`, u.id),
      )
      await db.insert(sessionTable).values(batch)
    }

    const list = await listAllSessions(db)

    expect(list).toHaveLength(10_000)
  })
})
