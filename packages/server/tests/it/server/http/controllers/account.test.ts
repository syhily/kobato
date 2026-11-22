import type { BlogSettingsBundle, RateLimitSettings } from '@kobato/settings/types'

import { sqliteOf } from '@kobato/db/database'
import { session as sessionTable } from '@kobato/db/schema/session'
import { user as userTable } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { accountRouter } from '@kobato/server/http/controllers/account/account.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  __resetRateLimitsForTests()
})

afterEach(() => {
  resetAllBatchers()
})

function withBucket(
  base: BlogSettingsBundle,
  bucket: keyof RateLimitSettings,
  maxAttempts: number,
): BlogSettingsBundle {
  return {
    ...base,
    rateLimit: { ...base.rateLimit!, [bucket]: { windowSeconds: 60, maxAttempts } },
  }
}

let ipCounter = 0
function nextIp(): string {
  ipCounter += 1
  return `10.0.0.${ipCounter}`
}

function ctxFor(
  userId: number | string,
  opts: { role?: 'admin' | 'author' | 'visitor'; sessionId?: string; ip?: string } = {},
) {
  return makeAuthedCtx({
    db,
    userId: String(userId),
    role: opts.role ?? 'visitor',
    sessionId: opts.sessionId ?? 'session-1',
    clientAddress: opts.ip ?? nextIp(),
  })
}

async function seedUser(opts: Partial<typeof userTable.$inferInsert> = {}): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(userTable)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Math.random().toString(36).slice(2)}@example.com`,
      password: opts.password ?? 'hashed',
      role: opts.role ?? 'visitor',
      ...opts,
    })
    .returning({ id: userTable.id })
  return rows[0]!.id
}

async function userRow(id: number): Promise<typeof userTable.$inferSelect> {
  const rows = await sqliteOf(db).select().from(userTable).where(eq(userTable.id, id))
  return rows[0]!
}

async function seedSession(sid: string, userId: number): Promise<void> {
  await sqliteOf(db)
    .insert(sessionTable)
    .values({
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
  const rows = await sqliteOf(db).select().from(sessionTable).where(eq(sessionTable.id, sid))
  return rows[0]
}

describe('accountRouter.updateProfile', () => {
  it('updates name when supplied and persists the patch', async () => {
    const id = await seedUser({ name: 'Alice' })

    const res = await call(
      accountRouter.updateProfile,
      { name: 'Alice the Updated' },
      { context: ctxFor(id, { role: 'visitor' }) },
    )

    expect(res.user.name).toBe('Alice the Updated')
    expect((await userRow(id)).name).toBe('Alice the Updated')
  })

  it('refuses to set badge fields for a non-admin visitor', async () => {
    const id = await seedUser({ role: 'visitor' })

    const res = await call(
      accountRouter.updateProfile,
      { name: 'Still Alice', badgeName: 'visitor-cannot-set' },
      { context: ctxFor(id, { role: 'visitor' }) },
    )

    expect(res.user.badgeName).toBeNull()
    const row = await userRow(id)
    expect(row.name).toBe('Still Alice')
    expect(row.badgeName).toBeNull()
  })

  it('treats a badge-only patch from a visitor as a graceful no-op, not a 500', async () => {
    const id = await seedUser({ role: 'visitor' })

    const res = await call(
      accountRouter.updateProfile,
      { badgeName: 'visitor-cannot-set', badgeColor: '#fff' },
      { context: ctxFor(id, { role: 'visitor' }) },
    )

    expect(res.user.badgeName).toBeNull()
    const row = await userRow(id)
    expect(row.badgeName).toBeNull()
  })

  it('throws NOT_FOUND when the underlying user row is missing', async () => {
    await expect(call(accountRouter.updateProfile, {}, { context: ctxFor(404) })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('accountRouter.updatePassword', () => {
  it('hashes the new password, persists it, and revokes other sessions', async () => {
    const id = await seedUser({ password: await bcrypt.hash('OldPass1234', 4) })
    await seedSession('keep-me', id)
    await seedSession('other-session', id)

    const res = await call(
      accountRouter.updatePassword,
      { oldPassword: 'OldPass1234', newPassword: 'New-password-1' },
      { context: ctxFor(id, { sessionId: 'keep-me' }) },
    )

    expect(res.success).toBe(true)
    expect(await bcrypt.compare('New-password-1', (await userRow(id)).password)).toBe(true)
    expect(await sessionRow('other-session')).toBeUndefined()
    expect(await sessionRow('keep-me')).toBeDefined()
  })

  it('throws FORBIDDEN when the original password does not match', async () => {
    const id = await seedUser({ password: await bcrypt.hash('OldPass1234', 4) })

    await expect(
      call(
        accountRouter.updatePassword,
        { oldPassword: 'wrong', newPassword: 'New-password-1' },
        { context: ctxFor(id) },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    expect(await bcrypt.compare('OldPass1234', (await userRow(id)).password)).toBe(true)
  })

  it('throws TOO_MANY_REQUESTS when the rate limit is exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(TEST_BLOG_SETTINGS_BUNDLE, 'signIn', 1))
    const id = await seedUser({ password: await bcrypt.hash('OldPass1234', 4) })
    const ip = nextIp()

    await call(
      accountRouter.updatePassword,
      { oldPassword: 'OldPass1234', newPassword: 'New-password-1' },
      { context: ctxFor(id, { ip }) },
    )
    await expect(
      call(
        accountRouter.updatePassword,
        { oldPassword: 'New-password-1', newPassword: 'Another-pass-1' },
        { context: ctxFor(id, { ip }) },
      ),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })

    expect(await bcrypt.compare('New-password-1', (await userRow(id)).password)).toBe(true)
  })
})

describe('accountRouter.revokeSession', () => {
  it('returns `currentSession: false` when the revoked id is not the caller session', async () => {
    const id = await seedUser()

    const res = await call(
      accountRouter.revokeSession,
      { id: 'other-session' },
      { context: ctxFor(id, { sessionId: 'caller-session' }) },
    )

    expect(res).toEqual({ success: true, currentSession: false })
  })
})
