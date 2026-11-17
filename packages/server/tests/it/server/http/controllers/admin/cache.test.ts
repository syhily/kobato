import { adminCacheRouter } from '@kobato/server/http/controllers/admin/cache.controller.ts'
import { setItem } from '@kobato/server/infra/cache/file-store.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/test-helpers/blog-settings.ts'
import { clearAllTables, getTestDb } from '@kobato/test-helpers/integration-db.ts'
import { makeAuthedCtx } from '@kobato/test-helpers/mock-ctx.ts'
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
    await setItem('og', 'og:hello', { hello: true }, { ttlSeconds: 3600 })

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
