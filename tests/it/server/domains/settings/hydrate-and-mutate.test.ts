import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlogSettingsForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { __clearSectionChangeHandlersForTests } from '@/server/domains/settings/services/section-changes'
import { setting } from '@/server/infra/db/schema/config'

// Section-change dispatch is covered by the unit tests; keep the schedulers out.
const db = getTestDb()

beforeEach(async () => {
  __clearSectionChangeHandlersForTests()
  await clearAllTables(db)
  // Evict the snapshot so tests don't reuse a stale hydration promise.
  resetBlogSettingsForTests()
  // Seed the three rows hydrateBlogSettings treats as the installed baseline.
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
    // The response is authoritative — the client adopts it without refetching.
    const updateBody = await parseRpcJson<{ section: { maxRequestBodySize: number } }>(updateRes)
    expect(updateBody.section.maxRequestBodySize).toBe(5 * 1024 * 1024)

    const bundle = await hydrateBlogSettings(db)
    expect(bundle?.limits?.maxRequestBodySize).toBe(5 * 1024 * 1024)
  })
})
