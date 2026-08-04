import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { __clearSectionChangeHandlersForTests } from '@kobato/server/domains/settings/services/section-changes'
import { adminSettingsRouter } from '@kobato/server/http/controllers/admin/settings.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { auditLog, setting } from '@kobato/server/infra/db/schema/config'
import { user } from '@kobato/server/infra/db/schema/user'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// adminSettingsRouter.update against the real engine: the section write,
// secret encryption, snapshot refresh, and admin projection all run for
// real against the in-memory database. Section-change dispatch
// (backup/audit reschedule, mail transport invalidation) is covered by
// the unit tests and stays unregistered here.
const db = getTestDb()

let adminId = 0

// `refreshBlogSettings` refuses to build a bundle while the two
// setup-owned sections (siteIdentity / assets) have no stored row, so
// every update test seeds them first.
async function seedBaselineSettings(): Promise<void> {
  await db.insert(setting).values([
    { scope: 'blog.general', data: TEST_BLOG_SETTINGS_BUNDLE.siteIdentity },
    { scope: 'blog.assets', data: TEST_BLOG_SETTINGS_BUNDLE.assets },
  ])
}

// audit_log.actor_id references user.id, so the editor must be a real
// row for the batched audit insert to survive the FK on flush.
async function seedAdmin(): Promise<number> {
  const [row] = await db
    .insert(user)
    .values({ name: 'Admin', email: 'admin@example.com', password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

function adminCtx() {
  return makeAuthedCtx({ userId: String(adminId), role: 'admin', db })
}

beforeEach(async () => {
  __clearSectionChangeHandlersForTests()
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
  await seedBaselineSettings()
  adminId = await seedAdmin()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
  // The real update refreshes the in-process settings snapshot from the
  // test database; the it setup's afterEach re-seeds the fixture bundle.
})

describe('adminSettingsRouter.update', () => {
  it('updates a section with a valid payload and returns the real admin projection', async () => {
    const res = await call(
      adminSettingsRouter.update,
      {
        section: 'mail',
        payload: {
          mail: { enabled: false, host: 'api.zeabur.com', sender: 'noreply@example.com', apiKey: 'zsend-secret-1234' },
        },
      },
      { context: adminCtx() },
    )

    // The response is the merged section in the admin display shape:
    // secrets redacted, only the last-4 mask merged in.
    expect(res.section).toMatchObject({
      mail: {
        enabled: false,
        host: 'api.zeabur.com',
        sender: 'noreply@example.com',
        apiKeyMask: '1234',
      },
    })
    expect((res.section as { mail: Record<string, unknown> }).mail).not.toHaveProperty('apiKey')

    // The secret rests encrypted in the stored row.
    const [row] = await db.select().from(setting).where(eq(setting.scope, 'blog.mail'))
    expect((row.data as { mail: { apiKey: string } }).mail.apiKey).toMatch(/^enc2:/)

    // The write records a real audit row (flushed from the batcher).
    await flushAuditLog()
    const auditRows = await db.select().from(auditLog).where(eq(auditLog.action, 'settings_updated'))
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]!.resourceType).toBe('setting')
    expect(auditRows[0]!.resourceId).toBe('mail')
    expect(auditRows[0]!.actorId).toBe(adminId)
  })

  it('throws BAD_REQUEST for an invalid payload', async () => {
    await expect(
      call(
        adminSettingsRouter.update,
        {
          section: 'mail',
          payload: { mail: { enabled: false, host: '', sender: 'not-an-email' } },
        },
        { context: adminCtx() },
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('surfaces the strict-patch issue list on the ORPCError data', async () => {
    await expect(
      call(
        adminSettingsRouter.update,
        {
          section: 'mail',
          payload: { mail: { host: 'api.zeabur.com', bogus: 1 } },
        },
        { context: adminCtx() },
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      data: [{ message: 'Unrecognized key: "bogus"', path: ['mail', 'bogus'] }],
    })
  })
})
