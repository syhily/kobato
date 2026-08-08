import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc } from '#/_helpers/rpc-call'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { __clearSectionChangeHandlersForTests } from '@/server/domains/settings/services/section-changes'
import { setting } from '@/server/infra/db/schema/config'

// Section-change dispatch is covered by the unit tests; keep the
// backup/audit schedulers out of these persistence-focused cases.
const db = getTestDb()

beforeEach(async () => {
  __clearSectionChangeHandlersForTests()
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

    const limitsRes = await callRpc(
      '/admin/settings/update',
      { section: 'limits', payload: { maxRequestBodySize: 5 * 1024 * 1024 } },
      ctx,
    )
    expect(limitsRes.status).toBe(200)

    // The general section requires all fields, hence the full payload.
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

    const bundle = await hydrateBlogSettings(db)
    expect(bundle?.limits?.maxRequestBodySize).toBe(5 * 1024 * 1024)
    expect(bundle?.siteIdentity?.title).toBe('Updated Title')
  })
})
