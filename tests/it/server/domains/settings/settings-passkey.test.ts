import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { DomainError } from '@/server/infra/http/errors'

// Section-change dispatch is covered by the unit tests; keep the
// backup/audit schedulers out of these persistence-focused cases.
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

const { updateBlogSettingsSection } = await import('@/server/domains/settings/services/core')
const { setBlogSettingsBundleForTests } = await import('#/_helpers/blog-settings')

describe('services/settings — passkey domain validation', () => {
  it('rejects passkey enable when website is not set', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: '' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable when website is not HTTPS', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'http://example.com' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable for localhost', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://localhost:3000' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable for 127.0.0.1', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://127.0.0.1' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable for private IPv4 ranges', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://192.168.1.1' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('allows passkey enable for valid public HTTPS domain', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://example.com' },
    } as any)

    await expect(
      updateBlogSettingsSection(
        db,
        'security',
        { csrf: { enabled: true, exemptPaths: [] }, passkey: { enabled: true } },
        null,
      ),
    ).resolves.toBeDefined()
  })

  it('allows passkey disable regardless of domain', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: '' },
    } as any)

    await expect(
      updateBlogSettingsSection(
        db,
        'security',
        { csrf: { enabled: true, exemptPaths: [] }, passkey: { enabled: false } },
        null,
      ),
    ).resolves.toBeDefined()
  })

  it('rejects passkey enable for ::1 (IPv6 loopback)', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://[::1]' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable for 10.x private range', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://10.0.0.1' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable for 172.16.x private range', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://172.16.0.1' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('allows domains starting with fc/fd that are not IPv6', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://fcbarcelona.com' },
    } as any)

    await expect(
      updateBlogSettingsSection(
        db,
        'security',
        { csrf: { enabled: true, exemptPaths: [] }, passkey: { enabled: true } },
        null,
      ),
    ).resolves.toBeDefined()
  })

  it('rejects IPv6 ULA fc00::1', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://[fc00::1]' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })
})
