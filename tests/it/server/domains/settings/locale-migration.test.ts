import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { migrateLegacySiteIdentityLocale } from '@/server/domains/settings/services/locale-migration'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { setting } from '@/server/infra/db/schema/config'

const db = getTestDb()

const INPUT = { title: 'Test Blog', name: 'Admin', email: 'admin@example.com', hostname: 'localhost' }

function seedInstalledSite(overrides: Record<string, unknown> = {}): void {
  const built = buildInstallSectionRows(INPUT)
  if (!built.ok) {
    throw new Error(`expected ok rows, got: ${built.descriptor.fallbackMessage}`)
  }
  db.transaction((tx) => {
    seedInstallSections(tx, built.rows, null)
  })
  if (Object.keys(overrides).length > 0) {
    const row = findSettingByScope(db, 'blog.general')
    if (row === null) {
      throw new Error('expected a seeded blog.general row')
    }
    upsertSetting(db, { ...(row.data as Record<string, unknown>), ...overrides }, null, 'blog.general')
  }
}

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()
})

describe('server/domains/settings/services/locale-migration', () => {
  it('rewrites a known alias to its canonical tag and keeps every other field', async () => {
    seedInstalledSite({ locale: 'zh-Hant-TW', timeFormat: 'yyyy-MM-dd HH:mm' })

    const result = migrateLegacySiteIdentityLocale(db)

    expect(result).toEqual({ changed: true, previous: 'zh-Hant-TW', locale: 'zh-TW' })
    const stored = findSettingByScope(db, 'blog.general')
    expect(stored?.data).toMatchObject({
      locale: 'zh-TW',
      timeFormat: 'yyyy-MM-dd HH:mm',
      title: 'Test Blog',
    })
  })

  it('falls back to the default for an unknown tag instead of dropping the section', async () => {
    seedInstalledSite({ locale: 'fr-FR' })

    const result = migrateLegacySiteIdentityLocale(db)

    expect(result).toEqual({ changed: true, previous: 'fr-FR', locale: 'zh-CN' })
    expect(findSettingByScope(db, 'blog.general')?.data).toMatchObject({ locale: 'zh-CN' })
  })

  it('is idempotent: a canonical value performs no write and reports no change', async () => {
    seedInstalledSite({ locale: 'zh-HK' })
    const before = findSettingByScope(db, 'blog.general')

    expect(migrateLegacySiteIdentityLocale(db)).toEqual({ changed: false, previous: 'zh-HK', locale: 'zh-HK' })
    const after = findSettingByScope(db, 'blog.general')
    expect(after?.updatedAt).toEqual(before?.updatedAt)
    expect(after?.data).toEqual(before?.data)

    // A second pass after a rewrite is a no-op too.
    seedInstalledSite({ locale: 'zh-Hant-HK' })
    expect(migrateLegacySiteIdentityLocale(db).changed).toBe(true)
    expect(migrateLegacySiteIdentityLocale(db).changed).toBe(false)
  })

  it('leaves an uninstalled database untouched', () => {
    expect(migrateLegacySiteIdentityLocale(db)).toEqual({ changed: false, previous: null, locale: 'zh-CN' })
    expect(db.select().from(setting).where(eq(setting.scope, 'blog.general')).all()).toHaveLength(0)
  })

  describe('hydration', () => {
    it('keeps a legacy-locale site installed and canonicalizes the snapshot value', async () => {
      seedInstalledSite({ locale: 'zh-Hans-CN' })

      const bundle = await refreshBlogSettings(db)

      expect(bundle).not.toBeNull()
      expect(bundle?.siteIdentity).not.toBeNull()
      expect(bundle?.siteIdentity?.locale).toBe('zh-CN')
      // The rewrite is persisted, not just projected.
      expect(findSettingByScope(db, 'blog.general')?.data).toMatchObject({ locale: 'zh-CN' })
    })

    it('keeps an unknown-locale site installed by reading it as the default', async () => {
      seedInstalledSite({ locale: 'fr-FR' })

      const bundle = await refreshBlogSettings(db)

      expect(bundle).not.toBeNull()
      expect(bundle?.siteIdentity).not.toBeNull()
      expect(bundle?.siteIdentity?.locale).toBe('zh-CN')
    })

    it('preserves a legacy timeFormat as a custom pattern and maps a blank one to null', async () => {
      seedInstalledSite({ locale: 'zh-TW', timeFormat: 'yyyy-LL-dd HH:mm' })
      expect((await refreshBlogSettings(db))?.siteIdentity?.timeFormat).toBe('yyyy-LL-dd HH:mm')

      seedInstalledSite({ timeFormat: '' })
      expect((await refreshBlogSettings(db))?.siteIdentity?.timeFormat).toBeNull()
    })

    it('reads a row written before timeFormat existed as null (follow the locale)', async () => {
      seedInstalledSite()
      const row = findSettingByScope(db, 'blog.general')
      const data = { ...(row?.data as Record<string, unknown>) }
      delete data.timeFormat
      upsertSetting(db, data, null, 'blog.general')

      expect((await refreshBlogSettings(db))?.siteIdentity?.timeFormat).toBeNull()
    })

    it('survives corrupt (non-string) locale and timeFormat values instead of dropping the section', async () => {
      seedInstalledSite({ locale: 42, timeFormat: 42 })

      const bundle = await refreshBlogSettings(db)

      expect(bundle).not.toBeNull()
      expect(bundle?.siteIdentity).not.toBeNull()
      expect(bundle?.siteIdentity?.locale).toBe('zh-CN')
      expect(bundle?.siteIdentity?.timeFormat).toBeNull()
    })
  })
})
