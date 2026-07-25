import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { image } from '@/server/infra/db/schema/media'

const { clearImageEnhanceCache } = await import('@/server/domains/images/services/cache')
const { resolveImageRef } = await import('@/server/domains/images/services/resolve')

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})
const { setBlogSettingsBundleForTests } = await import('@/server/domains/settings/services/test-utils')
const { TEST_BLOG_SETTINGS_BUNDLE } = await import('#/_helpers/blog-settings')

beforeEach(async () => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
  await clearImageEnhanceCache(db)
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

describe('server/images/render-enhance — resolveImageRef', () => {
  it('returns null for empty src', async () => {
    expect(await resolveImageRef(db, '')).toBeNull()
  })

  it('returns the row dimensions and thumbhash for a matched URL', async () => {
    const row = await seedImage()

    const result = await resolveImageRef(db, 'https://assets.example.com/images/categories/coding.jpg')
    expect(result).toEqual({
      width: 1280,
      height: 425,
      thumbhash: 'cover-hash',
      publicUrl: `https://assets.example.com/images/categories/coding.jpg?v=${row.updatedAt.getTime()}`,
    })
  })

  it('returns null when the URL has no matching row', async () => {
    expect(await resolveImageRef(db, 'https://assets.example.com/images/no-such.jpg')).toBeNull()
  })

  it('serves a second hit from the kv cache', async () => {
    await seedImage()

    const result1 = await resolveImageRef(db, 'https://assets.example.com/images/categories/coding.jpg')
    expect(result1).not.toBeNull()

    // Verify the cache row was written to kv_cache
    const cached = await db
      .select({ key: kvCache.key, bucket: kvCache.bucket })
      .from(kvCache)
      .where(eq(kvCache.key, 'image-meta:images/categories/coding.jpg'))
    expect(cached).toHaveLength(1)
    expect(cached[0]?.bucket).toBe('imageMeta')

    // Second call should return the same result (cache hit)
    const result2 = await resolveImageRef(db, 'https://assets.example.com/images/categories/coding.jpg')
    expect(result2).toEqual(result1)
  })
})
