import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { generalSchema } from '@/server/domains/settings/sections/general'
import { updateBlogSettingsSection } from '@/server/domains/settings/services/core'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { findSettingByScope } from '@/server/infra/db/operations/setting'
import { DomainError } from '@/server/infra/http/errors'
import { SUPPORTED_LOCALES, type AppLocale } from '@/shared/i18n/locales'

const db = getTestDb()

const INPUT = { title: 'Test Blog', name: 'Admin', email: 'admin@example.com', hostname: 'localhost' }

function installPayload(): Record<string, unknown> {
  const built = buildInstallSectionRows(INPUT)
  if (!built.ok) {
    throw new Error(`expected ok rows, got: ${built.descriptor.fallbackMessage}`)
  }
  return built.rows[0]?.payload ?? {}
}

function seedInstalledSite(): void {
  const built = buildInstallSectionRows(INPUT)
  if (!built.ok) {
    throw new Error(`expected ok rows, got: ${built.descriptor.fallbackMessage}`)
  }
  db.transaction((tx) => {
    seedInstallSections(tx, built.rows, null)
  })
}

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()
})

describe('general section — locale write/read schema split', () => {
  it('rejects a legacy alias through the real settings write path', async () => {
    seedInstalledSite()
    const before = findSettingByScope(db, 'blog.general')

    const error = await updateBlogSettingsSection(db, 'general', { locale: 'zh-Hant-TW' }, null).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(DomainError)
    expect((error as InstanceType<typeof DomainError>).code).toBe('BAD_REQUEST')
    expect((error as InstanceType<typeof DomainError>).issues).toEqual([
      {
        messageKey: 'admin.settings.general.localeInvalid',
        fallbackMessage: 'Choose a supported site language',
        code: 'invalid_value',
        path: ['locale'],
      },
    ])
    // Rejected means not persisted.
    expect(findSettingByScope(db, 'blog.general')?.data).toEqual(before?.data)
  })

  it('rejects an unknown tag and a blank custom pattern', async () => {
    seedInstalledSite()

    for (const patch of [{ locale: 'fr-FR' }, { timeFormat: '' }]) {
      const error = await updateBlogSettingsSection(db, 'general', patch, null).catch((e: unknown) => e)

      expect(error, JSON.stringify(patch)).toBeInstanceOf(DomainError)
      expect((error as InstanceType<typeof DomainError>).code).toBe('BAD_REQUEST')
    }
  })

  it('accepts every canonical locale through the real write path', async () => {
    seedInstalledSite()

    for (const locale of SUPPORTED_LOCALES) {
      const { bundle } = await updateBlogSettingsSection(db, 'general', { locale }, null)

      expect(bundle?.siteIdentity?.locale).toBe(locale)
      expect(findSettingByScope(db, 'blog.general')?.data).toMatchObject({ locale })
    }
  })

  it('accepts both follow-the-locale (null) and a custom pattern', async () => {
    seedInstalledSite()

    const auto = await updateBlogSettingsSection(db, 'general', { timeFormat: null }, null)
    expect(auto.bundle?.siteIdentity?.timeFormat).toBeNull()

    const custom = await updateBlogSettingsSection(db, 'general', { timeFormat: 'yyyy-LL-dd HH:mm' }, null)
    expect(custom.bundle?.siteIdentity?.timeFormat).toBe('yyyy-LL-dd HH:mm')
  })

  it('keeps the read schema lenient for legacy, unknown and corrupt locale values', () => {
    const payload = installPayload()
    const readLocale = (locale: unknown): AppLocale => generalSchema.parse({ ...payload, locale }).locale

    expect(readLocale('zh-Hant-TW')).toBe('zh-TW')
    expect(readLocale('zh-Hans-CN')).toBe('zh-CN')
    expect(readLocale('fr-FR')).toBe('zh-CN')
    expect(readLocale(42)).toBe('zh-CN')
  })

  it('keeps the read schema lenient for legacy, blank and corrupt timeFormat values', () => {
    const payload = installPayload()

    expect(generalSchema.parse({ ...payload, timeFormat: 'yyyy-LL-dd HH:mm' }).timeFormat).toBe('yyyy-LL-dd HH:mm')
    expect(generalSchema.parse({ ...payload, timeFormat: '' }).timeFormat).toBeNull()
    expect(generalSchema.parse({ ...payload, timeFormat: 42 }).timeFormat).toBeNull()
  })
})
