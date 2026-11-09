import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { invalidateContent } from '@/server/domains/content/invalidate'
import { countEntryFiles, resolveCacheRoot, setItem } from '@/server/infra/cache/file-store'
import { __resetCacheCountersForTests, getCounter } from '@/server/infra/cache/registry'

// Real cache plane on the filesystem; `og` seeds a control entry no
// invalidation event touches.
const db = getTestDb()

const SEEDED_BUCKETS = ['feed', 'tags', 'categories', 'sitemap', 'comments', 'og'] as const

beforeEach(async () => {
  await clearAllTables(db)
  __resetCacheCountersForTests()
  for (const bucket of SEEDED_BUCKETS) {
    await setItem(bucket, `${bucket}:entry`, 1)
  }
})

async function remainingBuckets(): Promise<string[]> {
  const remaining: string[] = []
  for (const bucket of SEEDED_BUCKETS) {
    if ((await countEntryFiles(bucket)) > 0) {
      remaining.push(bucket)
    }
  }
  return remaining.sort()
}

function generationFile(): string {
  return path.join(resolveCacheRoot(), 'searchResult', '_generation')
}

describe('invalidateContent', () => {
  it('post deletes the feed, taxonomy and sitemap buckets and bumps the search generation', async () => {
    invalidateContent({ entity: 'post' })

    expect(await remainingBuckets()).toEqual(['comments', 'og'])
    expect(await getCounter('searchResult')).toBe(1)
    expect(readFileSync(generationFile(), 'utf8')).toBe('1')

    // A second post event advances the same counter file.
    invalidateContent({ entity: 'post' })
    expect(await getCounter('searchResult')).toBe(2)
  })

  it('page deletes only the sitemap bucket', async () => {
    invalidateContent({ entity: 'page' })

    expect(await remainingBuckets()).toEqual(['categories', 'comments', 'feed', 'og', 'tags'])
    expect(await getCounter('searchResult')).toBe(0)
  })

  it('category deletes the category list and the whole feed bucket', async () => {
    invalidateContent({ entity: 'category' })

    expect(await remainingBuckets()).toEqual(['comments', 'og', 'sitemap', 'tags'])
    expect(await getCounter('searchResult')).toBe(0)
  })

  it('tag deletes the tag list and the whole feed bucket', async () => {
    invalidateContent({ entity: 'tag' })

    expect(await remainingBuckets()).toEqual(['categories', 'comments', 'og', 'sitemap'])
    expect(await getCounter('searchResult')).toBe(0)
  })

  it('comment deletes only the comments bucket', async () => {
    invalidateContent({ entity: 'comment' })

    expect(await remainingBuckets()).toEqual(['categories', 'feed', 'og', 'sitemap', 'tags'])
    expect(await getCounter('searchResult')).toBe(0)
  })
})
