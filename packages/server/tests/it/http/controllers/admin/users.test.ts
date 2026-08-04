import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { adminUsersCrudRouter } from '@kobato/server/http/controllers/admin/users-crud.controller'
import { adminUsersSessionsRouter } from '@kobato/server/http/controllers/admin/users-sessions.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { session as sessionTable } from '@kobato/server/infra/db/schema/session'
import { user as userTable } from '@kobato/server/infra/db/schema/user'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The admin users routers against the real engine: the operations
// layer, the admin service guards, and the session repository all run
// against seeded rows. The only stub is the email sender — a true
// external (SMTP/HTTP) that the service module imports but none of the
// procedures exercised here reach.
vi.mock('@kobato/server/infra/email/sender', () => ({
  sendAuthorInvite: vi.fn(),
  sendPasswordReset: vi.fn(),
  invalidateMailTransportCache: vi.fn(),
}))

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(() => {
  resetAllBatchers()
})

async function seedUser(opts: Partial<typeof userTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(userTable)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      role: opts.role ?? 'visitor',
      ...opts,
    })
    .returning({ id: userTable.id })
  return rows[0]!.id
}

async function userRow(id: number): Promise<typeof userTable.$inferSelect> {
  const rows = await db.select().from(userTable).where(eq(userTable.id, id))
  return rows[0]!
}

async function seedSession(sid: string, userId: number): Promise<void> {
  await db.insert(sessionTable).values({
    id: sid,
    userId,
    data: {},
    userAgent: 'vitest',
    ip: '127.0.0.1',
    loginAt: new Date(),
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  })
}

async function sessionRow(sid: string): Promise<typeof sessionTable.$inferSelect | undefined> {
  const rows = await db.select().from(sessionTable).where(eq(sessionTable.id, sid))
  return rows[0]
}

function ctxFor(userId: number | string, opts: { role?: 'admin' | 'author' | 'visitor'; sessionId?: string } = {}) {
  return makeAuthedCtx({
    db,
    userId: String(userId),
    role: opts.role ?? 'admin',
    sessionId: opts.sessionId ?? 'session-1',
  })
}

describe('adminUsersRouter.list', () => {
  it('lists the seeded users through the real aggregation query', async () => {
    const id = await seedUser({ name: 'u', email: 'u@example.test', role: 'visitor' })

    const res = await call(adminUsersCrudRouter.list, { offset: 0, limit: 20 }, { context: ctxFor(999) })

    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
    expect(res.users).toHaveLength(1)
    expect(res.users[0]).toMatchObject({
      id: String(id),
      name: 'u',
      email: 'u@example.test',
      role: 'visitor',
      commentCount: 0,
      passkeyCount: 0,
    })
  })

  it('passes the query filters through to the real query', async () => {
    await seedUser({ name: 'findable', email: 'findable@example.test' })
    await seedUser({ name: 'other', email: 'other@example.test' })

    const matched = await call(
      adminUsersCrudRouter.list,
      { offset: 0, limit: 20, q: 'findable' },
      { context: ctxFor(999) },
    )
    expect(matched.total).toBe(1)
    expect(matched.users[0]!.name).toBe('findable')

    const missed = await call(
      adminUsersCrudRouter.list,
      { offset: 0, limit: 20, q: 'no-such-user' },
      { context: ctxFor(999) },
    )
    expect(missed.total).toBe(0)
    expect(missed.users).toHaveLength(0)
  })
})

describe('adminUsersRouter.get', () => {
  it('returns the admin DTO for a seeded user', async () => {
    const id = await seedUser({ name: 'Target', email: 'target@example.test', role: 'author' })

    const res = await call(adminUsersCrudRouter.get, { id: String(id) }, { context: ctxFor(999) })

    expect(res.user.id).toBe(String(id))
    expect(res.user.email).toBe('target@example.test')
    expect(res.user.role).toBe('author')
  })

  it('throws NOT_FOUND when the user does not exist', async () => {
    await expect(call(adminUsersCrudRouter.get, { id: '999' }, { context: ctxFor(1) })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('adminUsersRouter.softDelete', () => {
  it('refuses with FORBIDDEN when the viewer is the same user', async () => {
    const id = await seedUser({ role: 'visitor' })

    await expect(
      call(adminUsersCrudRouter.softDelete, { id: String(id) }, { context: ctxFor(id) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect((await userRow(id)).deletedAt).toBeNull()
  })

  it('refuses with CONFLICT when removing the last admin', async () => {
    const id = await seedUser({ role: 'admin' })

    await expect(
      call(adminUsersCrudRouter.softDelete, { id: String(id) }, { context: ctxFor(999) }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    expect((await userRow(id)).deletedAt).toBeNull()
  })

  it('soft-deletes the row and revokes the target sessions on success', async () => {
    const id = await seedUser({ role: 'visitor' })
    await seedSession('doomed-session', id)

    const res = await call(adminUsersCrudRouter.softDelete, { id: String(id) }, { context: ctxFor(999) })

    expect(res).toBeUndefined()
    expect((await userRow(id)).deletedAt).not.toBeNull()
    expect(await sessionRow('doomed-session')).toBeUndefined()
  })
})

describe('adminUsersRouter.update', () => {
  it('throws NOT_FOUND when the target user does not exist', async () => {
    await expect(
      call(adminUsersCrudRouter.update, { id: '99', name: 'X' }, { context: ctxFor(1) }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('persists the patch on a seeded user', async () => {
    const id = await seedUser({ name: 'Before' })

    const res = await call(adminUsersCrudRouter.update, { id: String(id), name: 'X' }, { context: ctxFor(999) })

    expect(res).toEqual({ success: true })
    expect((await userRow(id)).name).toBe('X')
  })
})

describe('adminUsersRouter.revokeAllSessions', () => {
  it('allows an admin to revoke their own sessions', async () => {
    const id = await seedUser({ role: 'admin' })
    await seedSession('own-session', id)

    const res = await call(adminUsersSessionsRouter.revokeAllSessions, { userId: String(id) }, { context: ctxFor(id) })

    expect(res).toEqual({ success: true })
    expect(await sessionRow('own-session')).toBeUndefined()
  })

  it("forbids an admin from revoking another admin's sessions", async () => {
    const actorId = await seedUser({ role: 'admin', name: 'Actor' })
    const targetId = await seedUser({ role: 'admin', name: 'Target' })
    await seedSession('target-session', targetId)

    await expect(
      call(adminUsersSessionsRouter.revokeAllSessions, { userId: String(targetId) }, { context: ctxFor(actorId) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(await sessionRow('target-session')).toBeDefined()
  })

  it("allows an admin to revoke a visitor's sessions", async () => {
    const actorId = await seedUser({ role: 'admin', name: 'Actor' })
    const targetId = await seedUser({ role: 'visitor', name: 'Target' })
    await seedSession('visitor-session', targetId)

    const res = await call(
      adminUsersSessionsRouter.revokeAllSessions,
      { userId: String(targetId) },
      { context: ctxFor(actorId) },
    )

    expect(res).toEqual({ success: true })
    expect(await sessionRow('visitor-session')).toBeUndefined()
  })
})
