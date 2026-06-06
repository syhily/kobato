import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { createDbPool, closePool } from '@/server/infra/db/pool'
import { setting } from '@/server/infra/db/schema/config'
import { DomainError } from '@/server/infra/http/errors'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await db.delete(setting)
})

const { updateBlogSettingsSection } = await import('@/server/domains/settings/service')
const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/snapshot')

describe('services/settings — passkey domain validation', () => {
  it('rejects passkey enable when website is not set', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: '' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, pool, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable when website is not HTTPS', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'http://example.com' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, pool, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable for localhost', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://localhost:3000' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, pool, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable for 127.0.0.1', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://127.0.0.1' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, pool, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('rejects passkey enable for private IPv4 ranges', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://192.168.1.1' },
    } as any)

    await expect(
      updateBlogSettingsSection(db, pool, 'security', { passkey: { enabled: true } }, null),
    ).rejects.toBeInstanceOf(DomainError)
  })

  it('allows passkey enable for valid public HTTPS domain', async () => {
    setBlogSettingsBundleForTests({
      siteIdentity: { title: 'Test', website: 'https://example.com' },
    } as any)

    await expect(
      updateBlogSettingsSection(
        db,
        pool,
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
        pool,
        'security',
        { csrf: { enabled: true, exemptPaths: [] }, passkey: { enabled: false } },
        null,
      ),
    ).resolves.toBeDefined()
  })
})
