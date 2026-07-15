import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { flushWorkerRedis } from '#/_helpers/redis'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { getAdminBlogSettings } from '@/server/domains/settings/services/core'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { setting } from '@/server/infra/db/schema/config'

// Section-change dispatch is covered by the unit tests; keep the
// backup/audit schedulers out of these persistence-focused cases.
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  await flushWorkerRedis()
  // Evict the in-process settings snapshot so tests don't reuse a
  // stale hydration promise from a previous worker.
  const { BLOG_SETTINGS_SNAPSHOT_SLOT } = await import('@/shared/config/snapshot')
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)
  // Seed the three rows that `hydrateBlogSettings` treats as the
  // "installed" baseline (general + assets + limits).
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
    const ctx = makePublicCtx({ db, pool })
    const res = await callRpc(
      '/admin/settings/update',
      { section: 'limits', payload: { maxRequestBodySize: 5 * 1024 * 1024 } },
      ctx,
    )
    expect(res.status).toBe(401)
  })

  it('updates and reads back a setting value', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db, pool })

    const updateRes = await callRpc(
      '/admin/settings/update',
      { section: 'limits', payload: { maxRequestBodySize: 5 * 1024 * 1024 } },
      ctx,
    )
    expect(updateRes.status).toBe(200)
    const updateBody = await parseRpcJson<{ success: boolean }>(updateRes)
    expect(updateBody.success).toBe(true)

    const { bundle } = await getAdminBlogSettings(db)
    expect(bundle?.limits?.maxRequestBodySize).toBe(5 * 1024 * 1024)
  })
})
