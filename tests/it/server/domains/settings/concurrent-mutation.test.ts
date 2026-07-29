import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc } from '#/_helpers/rpc-call'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { setting } from '@/server/infra/db/schema/config'

// Section-change dispatch is covered by the unit tests; keep the
// backup/audit schedulers out of these persistence-focused cases.
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  resetBlogSettingsForTests()

  // Seed baseline rows so hydrateBlogSettings sees an installed deployment
  await db.insert(setting).values([
    {
      scope: 'blog.general',
      data: {
        title: 'Test',
        description: 'Test',
        website: 'https://example.com',
        keywords: ['test'],
        author: { name: 'Test', email: 'test@example.com', url: 'https://example.com' },
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: 'relative',
        initialYear: 2024,
      },
    },
    {
      scope: 'blog.assets',
      data: {
        asset: { host: 'cdn.example.com', scheme: 'https' },
        storage: {
          enabled: false,
          endpoint: '',
          region: '',
          bucket: '',
          accessKeyId: '',
          secretAccessKey: '',
          forcePathStyle: false,
          urlTemplate: '',
        },
        upload: { maxBytes: 5 * 1024 * 1024, jpegQuality: 85 },
      },
    },
    {
      scope: 'blog.limits',
      data: {
        maxRequestBodySize: 10 * 1024 * 1024,
        sessionMaxAge: 60 * 60 * 24 * 30,
        auditLogDbRetentionDays: 30,
        auditLogArchiveRetentionDays: 180,
      },
    },
  ])
})

describe('integration / concurrent settings edits', () => {
  it('updates two different sections without overwriting each other', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    // Update limits
    const limitsRes = await callRpc(
      '/admin/settings/update',
      { section: 'limits', payload: { maxRequestBodySize: 5 * 1024 * 1024 } },
      ctx,
    )
    expect(limitsRes.status).toBe(200)

    // Update general title (must pass all required fields)
    const generalRes = await callRpc(
      '/admin/settings/update',
      {
        section: 'general',
        payload: {
          title: 'Updated Title',
          description: 'Test',
          website: 'https://example.com',
          keywords: ['test'],
          author: { name: 'Test', email: 'test@example.com', url: 'https://example.com' },
          locale: 'zh-CN',
          timeZone: 'Asia/Shanghai',
          timeFormat: 'relative',
          initialYear: 2011,
        },
      },
      ctx,
    )
    expect(generalRes.status).toBe(200)

    // Read back both
    const bundle = await hydrateBlogSettings(db)
    expect(bundle?.limits?.maxRequestBodySize).toBe(5 * 1024 * 1024)
    expect(bundle?.siteIdentity?.title).toBe('Updated Title')
  })
})
