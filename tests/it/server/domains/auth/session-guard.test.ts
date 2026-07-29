import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { findSessionMeta, recordSessionLogin } from '@/server/domains/auth/repo'
import {
  revokeAllSessionsWithGuard,
  revokeOwnSessionWithGuard,
  revokeSessionWithGuard,
} from '@/server/domains/auth/session-guard'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user } from '@/server/infra/db/schema/user'
import { DomainError } from '@/server/infra/http/errors'

// The guard's policy branches run against the real session/user tables:
// the guard reads the session meta, checks the target user row, and the
// revocation is a real DELETE we assert on. The admin-scope happy paths
// (missing meta, own session, admin→live-admin FORBIDDEN, admin→visitor)
// are already covered in ./auth-coverage.test.ts — this file owns the
// own-scope and bulk-scope suites plus the two remaining admin-scope
// branches (non-admin actor, soft-deleted target admin).

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedUser(role: 'admin' | 'visitor' = 'admin', email: string, opts: { deletedAt?: Date } = {}) {
  const [u] = await db
    .insert(user)
    .values({ name: 'T', email, password: 'hashed', role, deletedAt: opts.deletedAt ?? null })
    .returning()
  return u!
}

/** Seed a session row the way production does: bare row at commit time,
 * then `recordSessionLogin` stamps the login meta (it is UPDATE-only). */
async function seedLiveSession(sid: string, userId: number) {
  await db.insert(sessionTable).values({
    id: sid,
    userId,
    data: {},
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  await recordSessionLogin(db, { sid, userId, userAgent: 'ua', ip: '1.1.1.1' })
}

function actor(id: number | string, role: ViewerIdentity['role'] = 'admin'): ViewerIdentity {
  return { id: String(id), role }
}

async function sessionRowExists(sid: string): Promise<boolean> {
  const rows = await db.select().from(sessionTable).where(eq(sessionTable.id, sid))
  return rows.length > 0
}

describe('auth/session-guard — revokeOwnSessionWithGuard (own scope)', () => {
  it('returns targetUserId:null when the session meta is missing (no-op)', async () => {
    const result = await revokeOwnSessionWithGuard(db, 'missing', actor(1))
    expect(result).toEqual({ targetUserId: null })
  })

  it('revokes when the actor owns the session', async () => {
    const u = await seedUser('visitor', 'own@example.com')
    await seedLiveSession('sid-own', u.id)

    const result = await revokeOwnSessionWithGuard(db, 'sid-own', actor(u.id, 'visitor'))

    expect(result.targetUserId).toBe(u.id)
    expect(await sessionRowExists('sid-own')).toBe(false)
  })

  it('throws FORBIDDEN when the session belongs to another user — even for an admin actor (no bypass)', async () => {
    const other = await seedUser('visitor', 'other@example.com')
    await seedLiveSession('sid-other', other.id)

    await expect(revokeOwnSessionWithGuard(db, 'sid-other', actor(999, 'admin'))).rejects.toThrow(
      new DomainError('FORBIDDEN', '无权操作该会话。'),
    )
    expect(await sessionRowExists('sid-other')).toBe(true)
  })
})

describe('auth/session-guard — revokeSessionWithGuard (admin scope, remaining branches)', () => {
  it('revokes when a non-admin actor targets another user (unreachable via adminProc; no guard fires)', async () => {
    const target = await seedUser('visitor', 'target@example.com')
    await seedLiveSession('sid-target', target.id)

    const result = await revokeSessionWithGuard(db, 'sid-target', actor(999, 'visitor'))

    expect(result.targetUserId).toBe(target.id)
    expect(await sessionRowExists('sid-target')).toBe(false)
  })

  it('revokes when the target admin has been soft-deleted', async () => {
    const admin = await seedUser('admin', 'actor-admin@example.com')
    const deletedAdmin = await seedUser('admin', 'deleted-admin@example.com', { deletedAt: new Date() })
    await seedLiveSession('sid-deleted-admin', deletedAdmin.id)

    const result = await revokeSessionWithGuard(db, 'sid-deleted-admin', actor(admin.id))

    expect(result.targetUserId).toBe(deletedAdmin.id)
    expect(await sessionRowExists('sid-deleted-admin')).toBe(false)
  })
})

describe('auth/session-guard — revokeAllSessionsWithGuard (bulk scope)', () => {
  it('allows an admin to bulk-revoke their own sessions', async () => {
    const admin = await seedUser('admin', 'bulk-self@example.com')
    await seedLiveSession('sid-self-1', admin.id)
    await seedLiveSession('sid-self-2', admin.id)

    await revokeAllSessionsWithGuard(db, admin.id, actor(admin.id))

    expect(await findSessionMeta(db, 'sid-self-1')).toBeNull()
    expect(await findSessionMeta(db, 'sid-self-2')).toBeNull()
    expect(await sessionRowExists('sid-self-1')).toBe(false)
    expect(await sessionRowExists('sid-self-2')).toBe(false)
  })

  it('allows an admin to bulk-revoke a non-admin user', async () => {
    const admin = await seedUser('admin', 'bulk-admin@example.com')
    const visitor = await seedUser('visitor', 'bulk-visitor@example.com')
    await seedLiveSession('sid-visitor', visitor.id)

    await revokeAllSessionsWithGuard(db, visitor.id, actor(admin.id))

    expect(await sessionRowExists('sid-visitor')).toBe(false)
  })

  it('throws FORBIDDEN when an admin bulk-revokes another admin', async () => {
    const alice = await seedUser('admin', 'bulk-alice@example.com')
    const bob = await seedUser('admin', 'bulk-bob@example.com')
    await seedLiveSession('sid-bob', bob.id)

    await expect(revokeAllSessionsWithGuard(db, bob.id, actor(alice.id))).rejects.toThrow(
      new DomainError('FORBIDDEN', '无权撤销其他管理员的全部会话。'),
    )
    expect(await sessionRowExists('sid-bob')).toBe(true)
  })

  it('still throws FORBIDDEN when the other admin is soft-deleted (no exemption in bulk scope)', async () => {
    const alice = await seedUser('admin', 'bulk-alice2@example.com')
    const deletedBob = await seedUser('admin', 'bulk-bob2@example.com', { deletedAt: new Date() })
    await seedLiveSession('sid-bob2', deletedBob.id)

    await expect(revokeAllSessionsWithGuard(db, deletedBob.id, actor(alice.id))).rejects.toThrow(
      '无权撤销其他管理员的全部会话。',
    )
    expect(await sessionRowExists('sid-bob2')).toBe(true)
  })

  it('proceeds when the target user row is missing', async () => {
    const admin = await seedUser('admin', 'bulk-admin3@example.com')

    await expect(revokeAllSessionsWithGuard(db, 999_999, actor(admin.id))).resolves.toBeUndefined()
  })
})
