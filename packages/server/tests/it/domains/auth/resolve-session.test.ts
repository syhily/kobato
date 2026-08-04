import type { BlogSessionData } from '@kobato/server/domains/auth/session-storage'
import type { Database } from '@kobato/server/infra/db/database'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { resolveSessionContext } from '@kobato/server/domains/auth/primitives'
import { buildSessionWithSid, commitSession } from '@kobato/server/domains/auth/session-storage'
import { session as sessionTable } from '@kobato/server/infra/db/schema/session'
import { user as userTable } from '@kobato/server/infra/db/schema/user'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

// resolveSessionContext against the real engine: the `__session` cookie
// is genuinely signed by the session storage, the payload rows live in
// the real session table, and the back-compat upgrade reads the real
// user table. Nothing below the flow is mocked — the one sabotage case
// (transient DB error) passes a broken db HANDLE, not a module mock.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(userTable)
    .values({
      name: 'legacy',
      email: 'legacy@example.com',
      password: 'hashed',
      role: 'admin',
      ...overrides,
    })
    .returning()
  return row!
}

let sidCounter = 0
/**
 * Mint a real signed `__session` cookie for a session row carrying
 * `data`. `commitSession` signs the cookie AND writes the row; the
 * follow-up UPDATE then swaps in the exact payload the case needs —
 * including legacy payloads whose user id no longer resolves to a row
 * (the derived `user_id` column stays NULL there so the FK is never
 * tripped by a deliberately-dangling payload).
 */
async function sessionCookie(
  data: BlogSessionData,
  opts: { userId?: number | null } = {},
): Promise<{ cookie: string; sid: string }> {
  sidCounter += 1
  const sid = `test-sid-${sidCounter}`
  const setCookie = await commitSession(buildSessionWithSid(sid, {}))
  await db
    .update(sessionTable)
    .set({ data, userId: opts.userId ?? null })
    .where(eq(sessionTable.id, sid))
  return { cookie: setCookie.split(';')[0]!, sid }
}

function requestWithCookie(cookie: string): Request {
  return new Request('http://localhost/', { headers: { Cookie: cookie } })
}

/** A legacy (pre-role) session payload — the shape old cookies still carry. */
function legacyUser(id: string, name = 'legacy', email = 'legacy@example.com') {
  return { id, name, email, website: null } as BlogSessionData['user']
}

describe('auth/primitives — resolveSessionContext (real session storage + db)', () => {
  it('returns dirty=true when upgrading a legacy session without role', async () => {
    const u = await seedUser()
    const { cookie } = await sessionCookie({ user: legacyUser(String(u.id)) }, { userId: u.id })

    const result = await resolveSessionContext(db, requestWithCookie(cookie))

    expect(result.dirty).toBe(true)
    expect(result.user).toEqual({
      id: String(u.id),
      name: u.name,
      email: u.email,
      website: u.link,
      role: u.role,
    })
    expect(result.session.get('user')).toEqual(result.user)
  })

  it('returns dirty=true when clearing a legacy session for a demoted/gone user', async () => {
    // The payload references a user id that no longer exists.
    const { cookie } = await sessionCookie({ user: legacyUser('999999') })

    const result = await resolveSessionContext(db, requestWithCookie(cookie))

    expect(result.dirty).toBe(true)
    expect(result.user).toBeUndefined()
    expect(result.session.get('user')).toBeUndefined()
  })

  it('returns dirty=false for a modern session that already has role (no db lookup)', async () => {
    // The payload deliberately references a nonexistent user: if the
    // resolver did a back-compat lookup the user would be cleared —
    // surviving untouched proves the modern path never hits the db.
    const modernUser = {
      id: '999999',
      name: 'modern',
      email: 'modern@example.com',
      website: null,
      role: 'admin' as const,
    }
    const { cookie, sid } = await sessionCookie({ user: modernUser })

    const result = await resolveSessionContext(db, requestWithCookie(cookie))

    expect(result.dirty).toBe(false)
    expect(result.user).toEqual(modernUser)

    // An authenticated resolve bumps the real session row's activity meta.
    const [row] = await db.select().from(sessionTable).where(eq(sessionTable.id, sid))
    expect(row!.lastActiveAt).not.toBeNull()
  })

  it('returns dirty=true and clears user when the back-compat lookup throws', async () => {
    const u = await seedUser()
    const { cookie } = await sessionCookie({ user: legacyUser(String(u.id)) }, { userId: u.id })
    // A sabotaged db HANDLE (not a module mock): every findUserById call
    // fails, exercising the transient-error branch.
    const brokenDb = {
      select: () => {
        throw new Error('connection lost')
      },
    } as unknown as Database

    const result = await resolveSessionContext(brokenDb, requestWithCookie(cookie))

    expect(result.dirty).toBe(true)
    expect(result.user).toBeUndefined()
    expect(result.session.get('user')).toBeUndefined()
  })

  it('returns dirty=false for an anonymous request', async () => {
    const result = await resolveSessionContext(db, new Request('http://localhost/'))

    expect(result.dirty).toBe(false)
    expect(result.user).toBeUndefined()
  })
})
