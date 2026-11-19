import type { Database } from '@kobato/db/database.ts'
import type { BlogSessionData } from '@kobato/server/domains/auth/session-storage.ts'

import { session as sessionTable } from '@kobato/db/schema/session.ts'
import { user as userTable } from '@kobato/db/schema/user.ts'
import { resolveSessionContext } from '@kobato/server/domains/auth/primitives.ts'
import { buildSessionWithSid, commitSession } from '@kobato/server/domains/auth/session-storage.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

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
    const { cookie } = await sessionCookie({ user: legacyUser('999999') })

    const result = await resolveSessionContext(db, requestWithCookie(cookie))

    expect(result.dirty).toBe(true)
    expect(result.user).toBeUndefined()
    expect(result.session.get('user')).toBeUndefined()
  })

  it('returns dirty=false for a modern session that already has role (no db lookup)', async () => {
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

    const [row] = await db.select().from(sessionTable).where(eq(sessionTable.id, sid))
    expect(row!.lastActiveAt).not.toBeNull()
  })

  it('returns dirty=true and clears user when the back-compat lookup throws', async () => {
    const u = await seedUser()
    const { cookie } = await sessionCookie({ user: legacyUser(String(u.id)) }, { userId: u.id })
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
