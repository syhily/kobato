import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { call } from '@orpc/server'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { adminCacheRouter } from '@/server/http/controllers/admin/cache.controller'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { kvCache } from '@/server/infra/db/schema/kv-cache'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('adminCacheRouter.getStats', () => {
  it('proxies the service stats verbatim', async () => {
    const ctx = makeAuthedCtx({ db })
    const res = (await call(adminCacheRouter.getStats, {}, { context: ctx })) as { total: number }
    expect(res.total).toBe(0)
  })
})

describe('adminCacheRouter.clear', () => {
  it('forwards the target string to the service and ships the refreshed stats', async () => {
    await db.insert(kvCache).values({ key: 'og:hello', bucket: 'og', blob: Buffer.from([1]) })

    const ctx = makeAuthedCtx({ db })
    const res = (await call(adminCacheRouter.clear, { target: 'og' }, { context: ctx })) as {
      total: number
      cleared: Array<{ bucketId: string; removed: number }>
    }

    expect(res.total).toBe(1)
    expect(res.cleared[0]?.bucketId).toBe('og')
    expect(res.cleared[0]?.removed).toBe(1)
  })
})
