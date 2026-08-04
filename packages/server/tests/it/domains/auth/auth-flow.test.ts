import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { emptySession } from '#/_helpers/session'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { signUpInitialAdminWithSession } from '@kobato/server/domains/auth/services/setup'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { auditLog, setting } from '@kobato/server/infra/db/schema/config'
import { session as sessionTable } from '@kobato/server/infra/db/schema/session'
import { user as userTable } from '@kobato/server/infra/db/schema/user'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// `signUpInitialAdminWithSession` against the real engine: the admin
// insert, the 18-section settings seed, the session establish, the
// settings re-hydration, and the login audit all run for real against
// the shared in-memory database. Nothing is mocked — the concurrent-
// install race is reproduced with a real unique-constraint collision,
// which also proves the transaction rolls the seed back atomically.
//
// The two legacy boundary cases that mocked `insertAdmin` returning []
// are gone: with the real engine a successful INSERT always returns the
// row, so that boundary is a mock artifact, not reachable behaviour.

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(async () => {
  // Flush BEFORE dropping the batcher: InsertBatcher.dispose() leaves an
  // armed flush timer behind, so an unflushed queue would otherwise
  // insert this case's stale events mid-next-test.
  await flushAuditLog()
  resetAllBatchers()
})

function buildRequest(): Request {
  return new Request('http://localhost/admin/signin', { method: 'POST' })
}

const baseSeed = {
  title: 'My Blog',
  name: 'Admin',
  email: 'admin@example.com',
  password: 'CorrectHorse1',
}

async function settingRows() {
  return db.select().from(setting)
}

describe('services/auth/flow — signUpInitialAdminWithSession (install stage 1, real db)', () => {
  it('creates the admin row, seeds all settings, establishes the session, and redirects to /admin', async () => {
    const result = await signUpInitialAdminWithSession(db, {
      ...baseSeed,
      session: emptySession(),
      request: buildRequest(),
      clientAddress: '127.0.0.1',
    })

    expect(result.type).toBe('redirect')
    if (result.type !== 'redirect') {
      throw new Error('expected redirect')
    }
    expect(result.to).toBe('/admin')
    expect(result.setCookie).toMatch(/^__session=/)

    // The admin row landed, with a real bcrypt hash of the password.
    const users = await db.select().from(userTable)
    expect(users).toHaveLength(1)
    const admin = users[0]!
    expect(admin).toMatchObject({ name: 'Admin', email: 'admin@example.com', role: 'admin' })
    expect(await bcrypt.compare('CorrectHorse1', admin.password)).toBe(true)

    // All settings sections are seeded in one pass.
    const rows = await settingRows()
    const byScope = new Map(rows.map((row) => [row.scope, row]))

    const EXPECTED_SECTIONS = [
      'blog.general',
      'blog.assets',
      'blog.navigation',
      'blog.socials',
      'blog.content',
      'blog.sidebar',
      'blog.comments',
      'blog.seo',
      'blog.mail',
      'blog.cache',
      'blog.rateLimit',
      'blog.fonts',
      'blog.backup',
      'blog.limits',
    ]
    for (const scope of EXPECTED_SECTIONS) {
      expect(byScope.has(scope), `missing settings scope ${scope}`).toBe(true)
    }

    const general = byScope.get('blog.general')!.data as Record<string, any>
    expect(general.title).toBe('My Blog')
    expect(general.locale).toBe('zh-CN')
    expect(general.author).toMatchObject({ name: 'Admin', email: 'admin@example.com' })

    const assets = byScope.get('blog.assets')!.data as Record<string, any>
    expect(assets.asset).toEqual({ host: 'localhost', scheme: 'https' })

    // refreshBlogSettings ran: the in-process snapshot now reflects the seed.
    expect(getBlogSettingsBundleSync()?.siteIdentity?.title).toBe('My Blog')

    // The session primitive minted a real session row owned by the admin.
    const sessions = await db.select().from(sessionTable)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.userId).toBe(admin.id)

    // Exactly one login audit, attributed to the new session.
    await flushAuditLog()
    const logins = await db.select().from(auditLog).where(eq(auditLog.action, 'login'))
    expect(logins).toHaveLength(1)
    expect(logins[0]!.actorId).toBe(admin.id)
  })

  it('refuses a duplicate stage-1 install (no DB writes)', async () => {
    // An admin already exists → the gate trips before any write.
    await db.insert(userTable).values({
      name: 'Existing',
      email: 'existing@example.com',
      password: 'hashed',
      role: 'admin',
    })

    const result = await signUpInitialAdminWithSession(db, {
      ...baseSeed,
      session: emptySession(),
      request: buildRequest(),
      clientAddress: '127.0.0.1',
    })

    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('管理员账号已存在')
    }
    expect(await db.select().from(userTable)).toHaveLength(1)
    expect(await settingRows()).toHaveLength(0)
  })

  it('rejects an invalid install seed without touching the db', async () => {
    const result = await signUpInitialAdminWithSession(db, {
      ...baseSeed,
      title: '',
      session: emptySession(),
      request: buildRequest(),
      clientAddress: '127.0.0.1',
    })

    expect(result.type).toBe('error')
    expect(await db.select().from(userTable)).toHaveLength(0)
    expect(await settingRows()).toHaveLength(0)
  })

  it('propagates the insert failure and rolls the seed back (concurrent install race)', async () => {
    // A non-admin account holding the same email: `hasAdmin` passes,
    // then `insertAdmin` collides with the real UNIQUE constraint on
    // user.email — exactly the concurrent-install race.
    await db.insert(userTable).values({
      name: 'Squatter',
      email: 'admin@example.com',
      password: 'hashed',
      role: 'visitor',
    })

    await expect(
      signUpInitialAdminWithSession(db, {
        ...baseSeed,
        session: emptySession(),
        request: buildRequest(),
        clientAddress: '127.0.0.1',
      }),
    ).rejects.toThrow()

    // The transaction rolled back atomically: no admin row, no settings.
    const users = await db.select().from(userTable)
    expect(users).toHaveLength(1)
    expect(users[0]!.role).toBe('visitor')
    expect(await settingRows()).toHaveLength(0)
  })
})
