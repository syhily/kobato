import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { invalidateContent } from '@/server/domains/content/invalidate'
import { __resetCacheCountersForTests, getCounter, resolveCacheSlot } from '@/server/infra/cache/registry'
import { kvCache } from '@/server/infra/db/schema/kv-cache'

// The REAL cache registry against the shared in-memory kv_cache table:
// `clear` must land bucket-column DELETEs and `bumpCounter` must write
// the searchResult generation row. `og` seeds the control row — no
// invalidation event ever touches it.
const db = getTestDb()

const SEEDED_BUCKETS = ['feed', 'tags', 'categories', 'sitemap', 'comments', 'og'] as const

beforeEach(async () => {
  await clearAllTables(db)
  __resetCacheCountersForTests()
  for (const bucket of SEEDED_BUCKETS) {
    await db
      .insert(kvCache)
      .values({ key: `${bucket}:entry`, bucket, value: 1, blob: null, expiresAt: null })
      .run()
  }
})

async function remainingBuckets(): Promise<string[]> {
  const rows = await db.select({ bucket: kvCache.bucket }).from(kvCache)
  return rows.map((row) => row.bucket).sort()
}

function generationKey(): string {
  return `${resolveCacheSlot('searchResult').prefix}generation`
}

describe('invalidateContent', () => {
  it('post deletes the feed, taxonomy and sitemap buckets and bumps the search generation', async () => {
    invalidateContent(db, { entity: 'post' })

    expect(await remainingBuckets()).toEqual(['comments', 'og', 'searchResult'])
    expect(await getCounter(db, 'searchResult')).toBe(1)

    // The generation row landed with a NULL expires_at (never swept).
    const counterRows = await db.select().from(kvCache).where(eq(kvCache.key, generationKey()))
    expect(counterRows).toHaveLength(1)
    expect(counterRows[0].value).toBe(1)
    expect(counterRows[0].expiresAt).toBeNull()

    // A second post event takes the ON CONFLICT DO UPDATE branch.
    invalidateContent(db, { entity: 'post' })
    expect(await getCounter(db, 'searchResult')).toBe(2)
  })

  it('page deletes only the sitemap bucket', async () => {
    invalidateContent(db, { entity: 'page' })

    expect(await remainingBuckets()).toEqual(['categories', 'comments', 'feed', 'og', 'tags'])
    expect(await getCounter(db, 'searchResult')).toBe(0)
  })

  it('category deletes the category list and the whole feed bucket', async () => {
    invalidateContent(db, { entity: 'category' })

    expect(await remainingBuckets()).toEqual(['comments', 'og', 'sitemap', 'tags'])
    expect(await getCounter(db, 'searchResult')).toBe(0)
  })

  it('tag deletes the tag list and the whole feed bucket', async () => {
    invalidateContent(db, { entity: 'tag' })

    expect(await remainingBuckets()).toEqual(['categories', 'comments', 'og', 'sitemap'])
    expect(await getCounter(db, 'searchResult')).toBe(0)
  })

  it('comment deletes only the comments bucket', async () => {
    invalidateContent(db, { entity: 'comment' })

    expect(await remainingBuckets()).toEqual(['categories', 'feed', 'og', 'sitemap', 'tags'])
    expect(await getCounter(db, 'searchResult')).toBe(0)
  })
})
