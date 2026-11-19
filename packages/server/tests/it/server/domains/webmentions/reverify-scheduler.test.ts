import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}))

import { upsertWebmention } from '@kobato/db/operations/webmention.ts'
import { post } from '@kobato/db/schema/post.ts'
import { webmention } from '@kobato/db/schema/webmention.ts'
import { REVERIFY_MIN_DELAY_MS } from '@kobato/server/domains/webmentions/reverify-scheduler.ts'
import { REVERIFY_BATCH_SIZE } from '@kobato/server/domains/webmentions/reverify.ts'
import { scheduleRegisteredJob } from '@kobato/server/infra/job-registry.ts'
import { stopAllScheduledJobs } from '@kobato/server/infra/scheduler-utils.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/server/tests/utils/blog-settings.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { htmlResponse, installFetch } from '@kobato/test/fetch.ts'

const db = getTestDb()

const mockFetch = installFetch()

const SOURCE = 'https://sender.example/post'
const TARGET = 'https://example.com/posts/wm-target/'
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 3_600_000

let seq = 0

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
  mockFetch.enqueue(/sender\.example/, () =>
    htmlResponse(`<html><body><p>I wrote about <a href="${TARGET}">this post</a>.</p></body></html>`, {
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
    scheduleRegisteredJob('webmentions.reverify')

    await vi.advanceTimersByTimeAsync(REVERIFY_MIN_DELAY_MS - 1)
    expect(mockFetch.calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(1)
    expect(failedCount()).toBe(0)
  })

  it('waits for the 24h waterline instead of firing early', async () => {
    await seedRow(new Date(Date.now() - DAY_MS + HOUR_MS))
    scheduleRegisteredJob('webmentions.reverify')

    await vi.advanceTimersByTimeAsync(HOUR_MS - 1)
    expect(mockFetch.calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(1)
  })

  it('self-heals from suspension when a qualifying row appears', async () => {
    scheduleRegisteredJob('webmentions.reverify')
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    await seedRow(new Date(Date.now() - DAY_MS - 60_000))
    await vi.advanceTimersByTimeAsync(30_000 + REVERIFY_MIN_DELAY_MS)
    expect(mockFetch.calls).toHaveLength(1)
  })

  it('paces a burst: one batch per floor interval, never back-to-back', async () => {
    for (let i = 0; i < REVERIFY_BATCH_SIZE + 1; i++) {
      await seedRow(new Date(Date.now() - DAY_MS - 60_000))
    }
    scheduleRegisteredJob('webmentions.reverify')

    await vi.advanceTimersByTimeAsync(REVERIFY_MIN_DELAY_MS)
    expect(mockFetch.calls).toHaveLength(REVERIFY_BATCH_SIZE)

    await vi.advanceTimersByTimeAsync(REVERIFY_MIN_DELAY_MS - 1)
    expect(mockFetch.calls).toHaveLength(REVERIFY_BATCH_SIZE)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(REVERIFY_BATCH_SIZE + 1)
  })
})
