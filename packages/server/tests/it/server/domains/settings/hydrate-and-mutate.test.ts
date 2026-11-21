import { setting } from '@kobato/db/schema/config.ts'
import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { __clearSectionChangeHandlersForTests } from '@kobato/server/domains/settings/services/section-changes.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeAuthedCtx, makePublicCtx } from '@kobato/server/tests/utils/mock-ctx.ts'
import { callRpc, parseRpcJson } from '@kobato/server/tests/utils/rpc-call.ts'
import { resetBlogSettingsForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
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
        title: 'Test Blog',
        description: 'A test blog',
        website: 'https://example.com',
        keywords: ['test'],
        author: { name: 'Test Author', email: 'test@example.com', url: 'https://example.com' },
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

describe('integration / admin settings', () => {
  it('rejects unauthenticated settings update', async () => {
    const ctx = makePublicCtx({ db })
    const res = await callRpc(
      '/admin/settings/update',
      { section: 'limits', payload: { maxRequestBodySize: 5 * 1024 * 1024 } },
      ctx,
    )
    expect(res.status).toBe(401)
  })

  it('updates and reads back a setting value', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })

    const updateRes = await callRpc(
      '/admin/settings/update',
      { section: 'limits', payload: { maxRequestBodySize: 5 * 1024 * 1024 } },
      ctx,
    )
    expect(updateRes.status).toBe(200)
    const updateBody = await parseRpcJson<{ section: { maxRequestBodySize: number } }>(updateRes)
    expect(updateBody.section.maxRequestBodySize).toBe(5 * 1024 * 1024)

    const bundle = await hydrateBlogSettings(db)
    expect(bundle?.limits?.maxRequestBodySize).toBe(5 * 1024 * 1024)
  })
})
