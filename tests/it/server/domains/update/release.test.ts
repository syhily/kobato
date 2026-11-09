import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installFetch, jsonResponse } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { get } from '@/server/infra/cache/registry'

// fetchLatestRelease against the real file cache; only the network is mocked.

const db = getTestDb()

const RELEASE_URL = /api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/latest/
const RELEASE_PARAMS = { owner: 'syhily', repo: 'kobato', endpoint: 'releases/latest' } as const

function releasePayload(tag: string) {
  return jsonResponse({
    tag_name: tag,
    html_url: `https://github.com/syhily/kobato/releases/tag/${tag}`,
    name: `Release ${tag}`,
    published_at: '2026-07-19T00:00:00Z',
  })
}

async function waitForCached(): Promise<void> {
  await vi.waitFor(async () => {
    expect(await get('githubRelease', RELEASE_PARAMS)).not.toBeNull()
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serves a repeat call from the cache without a second upstream request', async () => {
    mockFetch.enqueue(RELEASE_URL, releasePayload('v6.5.0'))

    const first = await fetchLatestRelease()
    await waitForCached()
    const second = await fetchLatestRelease()

    expect(first.tagName).toBe('v6.5.0')
    expect(second).toEqual(first)
    expect(mockFetch.calls).toHaveLength(1)
  })

  it('keeps the entry through 14 minutes and re-requests after the 15-minute TTL', async () => {
    // Fake only the clock: fs promises and vi.waitFor still use real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = new Date('2026-07-19T00:00:00Z')
    vi.setSystemTime(start)
    mockFetch.enqueue(RELEASE_URL, releasePayload('v6.5.0'))
    mockFetch.enqueue(RELEASE_URL, releasePayload('v6.6.0'))

    await fetchLatestRelease()
    await waitForCached()

    vi.setSystemTime(new Date(start.getTime() + 14 * 60 * 1000))
    expect((await fetchLatestRelease()).tagName).toBe('v6.5.0')
    expect(mockFetch.calls).toHaveLength(1)

    vi.setSystemTime(new Date(start.getTime() + 16 * 60 * 1000))
    expect((await fetchLatestRelease()).tagName).toBe('v6.6.0')
    expect(mockFetch.calls).toHaveLength(2)
  })

  it('never caches a failed upstream response', async () => {
    mockFetch.enqueue(RELEASE_URL, new Response('not found', { status: 404 }))
    mockFetch.enqueue(RELEASE_URL, releasePayload('v6.5.0'))

    await expect(fetchLatestRelease()).rejects.toMatchObject({
      descriptor: { messageKey: 'update.error.releaseFetchFailed' },
    })
    expect(await get('githubRelease', RELEASE_PARAMS)).toBeNull()

    const retry = await fetchLatestRelease()
    expect(retry.tagName).toBe('v6.5.0')
    expect(mockFetch.calls).toHaveLength(2)
  })
})
