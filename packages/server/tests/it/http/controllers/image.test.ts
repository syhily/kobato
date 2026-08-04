import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makePublicCtx } from '#/_helpers/mock-ctx'

import { image as imageTable } from '@kobato/server/infra/db/schema/media'
import { call } from '@orpc/server'
import { beforeEach, describe, expect, it } from 'vitest'

const { __resetRateLimitsForTests, tryResourceRateLimit } = await import('@kobato/server/infra/rate-limit')
const { imageRouter } = await import('@kobato/server/http/controllers/image.controller')

const db = getTestDb()

beforeEach(async () => {
  __resetRateLimitsForTests()
  await clearAllTables(db)
})

async function seedImage(overrides: Partial<typeof imageTable.$inferInsert> = {}) {
  const rows = await db
    .insert(imageTable)
    .values({
      storagePath: 'images/test.jpg',
      storageDriver: 's3',
      mimeType: 'image/jpeg',
      width: 100,
      height: 200,
      byteSize: 1234,
      thumbhash: 'abc123',
      ...overrides,
    })
    .returning({ id: imageTable.id })
  return rows[0]!.id
}

describe('imageRouter.resolveThumbhash', () => {
  it('throws TOO_MANY_REQUESTS when the rate limit is exceeded', async () => {
    // Shrink the resource bucket so one seeded hit exhausts it; the
    // controller's own hit is the one that exceeds.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resourceIp: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    await tryResourceRateLimit('127.0.0.1')

    const ctx = makePublicCtx({ db })
    await expect(
      call(imageRouter.resolveThumbhash, { src: 'https://assets.example.com/images/test.jpg' }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })

  it('returns thumbhash, width, and height when image is found', async () => {
    await seedImage()
    const ctx = makePublicCtx({ db })
    const res = (await call(
      imageRouter.resolveThumbhash,
      { src: 'https://assets.example.com/images/test.jpg' },
      { context: ctx },
    )) as {
      thumbhash: string | null
      width: number | null
      height: number | null
    }
    expect(res.thumbhash).toBe('abc123')
    expect(res.width).toBe(100)
    expect(res.height).toBe(200)
  })

  it('returns nulls when image is not found', async () => {
    const ctx = makePublicCtx({ db })
    const res = (await call(
      imageRouter.resolveThumbhash,
      { src: 'https://assets.example.com/images/missing.jpg' },
      { context: ctx },
    )) as {
      thumbhash: string | null
      width: number | null
      height: number | null
    }
    expect(res.thumbhash).toBeNull()
    expect(res.width).toBeNull()
    expect(res.height).toBeNull()
  })
})
