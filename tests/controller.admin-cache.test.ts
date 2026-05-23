import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { setBlogSettingsBundleForTests } from '@/server/domains/settings/snapshot'
import { adminCacheRouter } from '@/server/http/controllers/admin/cache.controller'
import { redisInstance } from '@/server/infra/redis/storage'

import { TEST_BLOG_SETTINGS_BUNDLE } from './_helpers/blog-settings'
import { makeAuthedCtx } from './_helpers/mock-ctx'
import { flushWorkerRedis } from './_helpers/redis'

beforeEach(async () => {
  await flushWorkerRedis()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('adminCacheRouter.getStats', () => {
  it('proxies the service stats verbatim', async () => {
    const ctx = makeAuthedCtx()
    const res = (await call(adminCacheRouter.getStats, {}, { context: ctx })) as { total: number }
    expect(res.total).toBe(0)
  })
})

describe('adminCacheRouter.clear', () => {
  it('forwards the target string to the service and ships the refreshed stats', async () => {
    const redis = redisInstance()
    await redis.set('og:hello', Buffer.from([1]))

    const ctx = makeAuthedCtx()
    const res = (await call(adminCacheRouter.clear, { target: 'og' }, { context: ctx })) as {
      total: number
      cleared: Array<{ bucketId: string; removed: number }>
    }

    expect(res.total).toBe(1)
    expect(res.cleared[0]?.bucketId).toBe('og')
    expect(res.cleared[0]?.removed).toBe(1)
  })
})
