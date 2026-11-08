import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { __clearSectionChangeHandlersForTests } from '@/server/domains/settings/services/section-changes'
import { adminSettingsRouter } from '@/server/http/controllers/admin/settings.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog, setting } from '@/server/infra/db/schema/config'
import { storageMigration } from '@/server/infra/db/schema/storage-migration'
import { user } from '@/server/infra/db/schema/user'

// update against the real engine (section write, encryption, snapshot,
// projection); section-change dispatch stays unregistered (unit-covered).
const db = getTestDb()

let adminId = 0

// `refreshBlogSettings` refuses a bundle until the setup-owned sections are seeded.
async function seedBaselineSettings(): Promise<void> {
  await db.insert(setting).values([
    { scope: 'blog.general', data: TEST_BLOG_SETTINGS_BUNDLE.siteIdentity },
    { scope: 'blog.assets', data: TEST_BLOG_SETTINGS_BUNDLE.assets },
  ])
}

// audit_log.actor_id references user.id: the editor must be a real row for the FK.
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

/** Pin the request locale so the translated message is deterministic. */
function withLocale<T extends ReturnType<typeof adminCtx>>(context: T, locale: AppLocale): T {
  return { ...context, localization: { locale, timeZone: 'UTC' } }
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
  // The real update refreshes the in-process snapshot; the it setup re-seeds it.
})

describe('adminSettingsRouter.update', () => {
  it('updates a section with a valid payload and returns the real admin projection', async () => {
    const res = await call(
      adminSettingsRouter.update,
      {
        section: 'mail',
        payload: {
          mail: { enabled: false, sender: 'noreply@example.com', smtpPass: 'smtp-secret-1234' },
        },
      },
      { context: adminCtx() },
    )

    // Admin display shape: secrets redacted to the last-4 mask.
    expect(res.section).toMatchObject({
      mail: {
        enabled: false,
        sender: 'noreply@example.com',
        smtpPassMask: '1234',
      },
    })
    expect((res.section as { mail: Record<string, unknown> }).mail).not.toHaveProperty('smtpPass')

    // The secret rests encrypted in the stored row.
    const [row] = await db.select().from(setting).where(eq(setting.scope, 'blog.mail'))
    expect((row.data as { mail: { smtpPass: string } }).mail.smtpPass).toMatch(/^enc2:/)

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
          payload: { mail: { enabled: false, sender: 'not-an-email' } },
        },
        { context: adminCtx() },
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('surfaces the strict-patch issue list as descriptor data', async () => {
    await expect(
      call(
        adminSettingsRouter.update,
        {
          section: 'mail',
          payload: { mail: { sender: 'a@b.co', bogus: 1 } },
        },
        { context: adminCtx() },
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      data: {
        descriptor: { messageKey: 'admin.settings.errors.invalid' },
        issues: [
          {
            messageKey: 'error.api.rawMessage',
            fallbackMessage: 'Unrecognized key: "bogus"',
            path: ['mail', 'bogus'],
          },
        ],
      },
    })
  })

  it('maps a typed schema message into a localized descriptor (rate-limit bound)', async () => {
    await expect(
      call(
        adminSettingsRouter.update,
        {
          section: 'rateLimit',
          payload: { signIn: { windowSeconds: 10, maxAttempts: 5 } },
        },
        { context: withLocale(adminCtx(), 'zh-CN') },
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      // The server folds the localized issue into the top-level message.
      message: '设置数据无效：signIn.windowSeconds：时间窗口不能小于 60 秒',
      data: {
        descriptor: { messageKey: 'admin.settings.errors.invalid', fallbackMessage: 'The settings data is invalid' },
        issues: [
          {
            messageKey: 'admin.settings.rateLimit.error.windowMin',
            params: { min: 60 },
            fallbackMessage: 'The time window must be at least 60 seconds',
            code: 'too_small',
            path: ['signIn', 'windowSeconds'],
          },
        ],
      },
    })
  })

  it('localizes the same descriptor for en-US', async () => {
    await expect(
      call(
        adminSettingsRouter.update,
        {
          section: 'rateLimit',
          payload: { signIn: { windowSeconds: 10, maxAttempts: 5 } },
        },
        { context: withLocale(adminCtx(), 'en-US') },
      ),
    ).rejects.toMatchObject({
      message: 'The settings data is invalid: signIn.windowSeconds: The time window must be at least 60 seconds',
    })
  })

  it('rejects an unsupported locale through the typed general write schema', async () => {
    await expect(
      call(
        adminSettingsRouter.update,
        { section: 'general', payload: { locale: 'fr-FR' } },
        { context: withLocale(adminCtx(), 'zh-CN') },
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      data: {
        issues: [
          {
            messageKey: 'admin.settings.general.localeInvalid',
            fallbackMessage: 'Choose a supported site language',
            path: ['locale'],
          },
        ],
      },
    })
  })

  it('rejects storage patches with CONFLICT while a migration is in flight', async () => {
    // The lock probe is injected by the controller from the storage domain —
    // this exercises the real perimeter wiring, not a stubbed predicate.
    const now = new Date()
    await db.insert(storageMigration).values({
      id: 1,
      direction: 'local-to-s3',
      targetStorage: null,
      sourceStorage: null,
      phase: 'copying',
      cursor: null,
      copiedObjects: 0,
      copiedBytes: 0,
      skippedObjects: 0,
      error: null,
      verification: null,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
    })

    await expect(
      call(
        adminSettingsRouter.update,
        { section: 'assets', payload: { storage: { endpoint: 'https://s3.example.com' } } },
        { context: adminCtx() },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
