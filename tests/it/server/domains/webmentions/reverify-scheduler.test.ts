import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

// Real safeFetch round-trip; only the network boundary is stubbed: fetch via installFetch, DNS to a fixed address.
vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}))

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { installFetch } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { REVERIFY_BATCH_SIZE } from '@/server/domains/webmentions/reverify'
import { REVERIFY_MIN_DELAY_MS, scheduleWebmentionReverify } from '@/server/domains/webmentions/reverify-scheduler'
import { upsertWebmention } from '@/server/infra/db/operations/webmention'
import { post } from '@/server/infra/db/schema/post'
import { webmention } from '@/server/infra/db/schema/webmention'
import { stopAllScheduledJobs } from '@/server/infra/scheduler-utils'

// The daily re-verification job against the real engine; only
// `scheduleWebmentionReverify()` is called explicitly, like server.ts.
const db = getTestDb()

const mockFetch = installFetch()

const SOURCE = 'https://sender.example/post'
const TARGET = 'https://example.com/posts/wm-target/'
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 3_600_000

let seq = 0

/** A fresh due `approved` row (24h waterline crossed) plus its stubbed
 *  source page (links to the target). */
async function seedRow(lastVerifiedAt: Date): Promise<void> {
  const key = ++seq
  await upsertWebmention(db, {
    sourceUrl: `${SOURCE}?k=${key}`,
    targetUrl: TARGET,
    status: 'approved',
    type: 'mention',
    targetType: 'post',
    targetOwnerId: 1,
    verificationStatus: 'verified',
    lastVerifiedAt,
    lastError: null,
    verifyFailStreak: 0,
    authorName: 'Jane Doe',
    title: 'Mentioning post',
    summary: null,
  })
  mockFetch.enqueue(
    /sender\.example/,
    () =>
      new Response(`<html><body><p>I wrote about <a href="${TARGET}">this post</a>.</p></body></html>`, {
        status: 200,
      }),
  )
}

async function seedLivePost(): Promise<void> {
  await db.insert(post).values({ slug: 'wm-target', title: 'Mentioned Post', published: true, publishedRevisionId: 1 })
}

function failedCount(): number {
  return db.select().from(webmention).where(eq(webmention.verificationStatus, 'failed')).all().length
}

beforeEach(async () => {
  stopAllScheduledJobs()
  await clearAllTables(db)
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await seedLivePost()
})

afterEach(() => {
  stopAllScheduledJobs()
})

describe('webmentions/reverify scheduler throttle', () => {
  it('fires a waterline-crossed row at the throttle floor — never before', async () => {
    await seedRow(new Date(Date.now() - DAY_MS - 60_000))
    scheduleWebmentionReverify()

    await vi.advanceTimersByTimeAsync(REVERIFY_MIN_DELAY_MS - 1)
    expect(mockFetch.calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(1)
    expect(failedCount()).toBe(0)
  })

  it('waits for the 24h waterline instead of firing early', async () => {
    await seedRow(new Date(Date.now() - DAY_MS + HOUR_MS)) // due in ~1h
    scheduleWebmentionReverify()

    await vi.advanceTimersByTimeAsync(HOUR_MS - 1)
    expect(mockFetch.calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(1)
  })

  it('self-heals from suspension when a qualifying row appears', async () => {
    // Nothing qualifying: the job suspends on its re-check timer.
    scheduleWebmentionReverify()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    await seedRow(new Date(Date.now() - DAY_MS - 60_000))
    // The suspended re-check (30s) picks it up; the floor throttle applies before the fetch.
    await vi.advanceTimersByTimeAsync(30_000 + REVERIFY_MIN_DELAY_MS)
    expect(mockFetch.calls).toHaveLength(1)
  })

  it('paces a burst: one batch per floor interval, never back-to-back', async () => {
    for (let i = 0; i < REVERIFY_BATCH_SIZE + 1; i++) {
      await seedRow(new Date(Date.now() - DAY_MS - 60_000))
    }
    scheduleWebmentionReverify()

    await vi.advanceTimersByTimeAsync(REVERIFY_MIN_DELAY_MS)
    expect(mockFetch.calls).toHaveLength(REVERIFY_BATCH_SIZE)

    // Still due NOW, but the next batch waits a full floor interval — the burst throttle.
    await vi.advanceTimersByTimeAsync(REVERIFY_MIN_DELAY_MS - 1)
    expect(mockFetch.calls).toHaveLength(REVERIFY_BATCH_SIZE)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(REVERIFY_BATCH_SIZE + 1)
  })
})
