import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { installFetch, jsonResponse } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { kvCache } from '@/server/infra/db/schema/kv-cache'

// fetchLatestRelease against the real kv_cache engine; only the network is mocked.

const db = getTestDb()

const RELEASE_URL = /api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/latest/
const CACHE_KEY = 'github-release:syhily/kobato/releases/latest'

function releasePayload(tag: string) {
  return jsonResponse({
    tag_name: tag,
    html_url: `https://github.com/syhily/kobato/releases/tag/${tag}`,
    name: `Release ${tag}`,
    published_at: '2026-07-19T00:00:00Z',
  })
}

const { fetchLatestRelease } = await import('@/server/domains/update/release')

describe('update/release — fetchLatestRelease cache', () => {
  const mockFetch = installFetch()

  beforeEach(async () => {
    mockFetch.reset()
    globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
    await clearAllTables(db)
  })

  it('serves a repeat call from the cache without a second upstream request', async () => {
    mockFetch.enqueue(RELEASE_URL, releasePayload('v6.5.0'))

    const first = await fetchLatestRelease(db)
    const second = await fetchLatestRelease(db)

    expect(first.tagName).toBe('v6.5.0')
    expect(second).toEqual(first)
    expect(mockFetch.calls).toHaveLength(1)

    // The entry landed under the request-target key with the declared TTL.
    const rows = await db.select().from(kvCache).where(eq(kvCache.key, CACHE_KEY))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.bucket).toBe('githubRelease')
    const ttlMs = (rows[0]?.expiresAt?.getTime() ?? 0) - Date.now()
    expect(ttlMs).toBeGreaterThan(14 * 60 * 1000)
    expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000)
  })

  it('re-requests once the cached entry has expired', async () => {
    mockFetch.enqueue(RELEASE_URL, releasePayload('v6.5.0'))
    mockFetch.enqueue(RELEASE_URL, releasePayload('v6.6.0'))

    await fetchLatestRelease(db)
    // Force the entry past its TTL instead of waiting out 15 minutes.
    await db
      .update(kvCache)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(kvCache.key, CACHE_KEY))

    const refreshed = await fetchLatestRelease(db)

    expect(refreshed.tagName).toBe('v6.6.0')
    expect(mockFetch.calls).toHaveLength(2)
  })

  it('never caches a failed upstream response', async () => {
    mockFetch.enqueue(RELEASE_URL, new Response('not found', { status: 404 }))
    mockFetch.enqueue(RELEASE_URL, releasePayload('v6.5.0'))

    await expect(fetchLatestRelease(db)).rejects.toThrow('Failed to fetch release')
    expect(await db.select().from(kvCache).where(eq(kvCache.key, CACHE_KEY))).toHaveLength(0)

    const retry = await fetchLatestRelease(db)
    expect(retry.tagName).toBe('v6.5.0')
    expect(mockFetch.calls).toHaveLength(2)
  })
})
