import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { setting } from '@/server/infra/db/schema/config'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  const { redisInstance } = await import('@/server/infra/redis/storage')
  await redisInstance().flushdb()
  const { BLOG_SETTINGS_SNAPSHOT_SLOT } = await import('@/shared/config/snapshot')
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(null)

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
    const ctx = makeAuthedCtx({ role: 'admin', db, pool })

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
    const loadRes = await callRpc('/admin/settings/loadAll', {}, ctx)
    expect(loadRes.status).toBe(200)
    const data = await parseRpcJson<{
      bundle: { limits: { maxRequestBodySize: number }; siteIdentity: { title: string } }
    }>(loadRes)
    expect(data.bundle.limits.maxRequestBodySize).toBe(5 * 1024 * 1024)
    expect(data.bundle.siteIdentity.title).toBe('Updated Title')
  })
})
