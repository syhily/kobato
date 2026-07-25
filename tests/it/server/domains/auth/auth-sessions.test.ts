import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { recordSessionLogin } from '@/server/domains/auth/repo'
import { listSessionsByUser } from '@/server/domains/auth/service'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user } from '@/server/infra/db/schema/user'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

describe('listSessionsByUser', () => {
  it('returns parsed metadata for each live session row of the user', async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'T', email: 'sessions@example.com', password: 'hashed', role: 'admin' })
      .returning()
    const userId = u.id
    const loginAt = new Date()

    // The session row is created by session-storage at commit time in
    // production; we mirror that with a bare insert, then stamp the login
    // meta via `recordSessionLogin` (which is UPDATE-only).
    const seeds = [
      { sid: 'sid-a', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120', ip: '203.0.113.1' },
      { sid: 'sid-b', userAgent: null, ip: '203.0.113.2' },
    ] as const
    for (const seed of seeds) {
      await db.insert(sessionTable).values({
        id: seed.sid,
        userId,
        data: {},
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      await recordSessionLogin(db, { sid: seed.sid, userId, userAgent: seed.userAgent, ip: seed.ip, loginAt })
    }

    const sessions = await listSessionsByUser(db, userId)
    const ids = sessions.map((s) => s.sid).sort()
    expect(ids).toEqual(['sid-a', 'sid-b'])

    const first = sessions.find((s) => s.sid === 'sid-a')
    expect(first?.userId).toBe(userId)
    expect(first?.userAgent).toContain('Chrome')
    expect(first?.ip).toBe('203.0.113.1')
    expect(first?.loginAt.getTime()).toBe(loginAt.getTime())
    expect(first?.lastActiveAt.getTime()).toBe(loginAt.getTime())
    expect(first?.expiresAt.getTime()).toBeGreaterThan(loginAt.getTime())
  })

  it('returns empty when no sessions are registered', async () => {
    const sessions = await listSessionsByUser(db, 7n)
    expect(sessions).toEqual([])
  })
})
