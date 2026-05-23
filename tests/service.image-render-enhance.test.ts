import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/server/infra/db/pool'
import { image } from '@/server/infra/db/schema'
import { redisInstance } from '@/server/infra/redis/storage'

import { clearAllTables } from './_helpers/integration-db'
import { flushWorkerRedis } from './_helpers/redis'

const { clearImageEnhanceCache, loadImageThumbhash } = await import('@/server/render/image-enhance')
const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/snapshot')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('./_helpers/blog-settings')

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  await flushWorkerRedis()
  await clearImageEnhanceCache()
})

async function seedImage(overrides: Partial<typeof image.$inferInsert> = {}) {
  const rows = await db
    .insert(image)
    .values({
      storagePath: 'images/categories/coding.jpg',
      mimeType: 'image/jpeg',
      width: 1280,
      height: 425,
      byteSize: 0,
      thumbhash: 'cover-hash',
      ...overrides,
    })
    .returning()
  return rows[0]
}

describe('server/images/render-enhance — loadImageThumbhash', () => {
  it('returns null for empty src', async () => {
    expect(await loadImageThumbhash('')).toBeNull()
  })

  it('returns the row dimensions and thumbhash for a matched URL', async () => {
    const row = await seedImage()

    const result = await loadImageThumbhash('https://cat.yufan.me/images/categories/coding.jpg')
    expect(result).toEqual({
      width: 1280,
      height: 425,
      thumbhash: 'cover-hash',
      publicUrl: `https://cat.yufan.me/images/categories/coding.jpg?v=${row.updatedAt.getTime()}`,
    })
  })

  it('returns null when the URL has no matching row', async () => {
    expect(await loadImageThumbhash('https://cat.yufan.me/images/no-such.jpg')).toBeNull()
  })

  it('serves a second hit from the Redis cache', async () => {
    await seedImage()

    const result1 = await loadImageThumbhash('https://cat.yufan.me/images/categories/coding.jpg')
    expect(result1).not.toBeNull()

    // Verify cache was written to Redis
    const cached = await redisInstance().get('image-meta:images/categories/coding.jpg')
    expect(cached).not.toBeNull()

    // Second call should return the same result (cache hit)
    const result2 = await loadImageThumbhash('https://cat.yufan.me/images/categories/coding.jpg')
    expect(result2).toEqual(result1)
  })
})
