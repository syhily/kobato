import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'

import { adminCacheRouter } from '@kobato/server/http/controllers/admin/cache.controller'
import { kvCache } from '@kobato/server/infra/db/schema/kv-cache'
import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

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
