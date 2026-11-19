import { setting } from '@kobato/db/schema/config.ts'
import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { __clearSectionChangeHandlersForTests } from '@kobato/server/domains/settings/services/section-changes.ts'
import { resetBlogSettingsForTests } from '@kobato/server/tests/utils/blog-settings.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx.ts'
import { callRpc } from '@kobato/server/tests/utils/rpc-call.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  __clearSectionChangeHandlersForTests()
  await clearAllTables(db)
  resetBlogSettingsForTests()

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
