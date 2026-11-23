import { sqliteOf } from '@kobato/db/sqlite/database'
import { upsertWebmentionOutbox } from '@kobato/db/sqlite/operations/engagement/webmention-outbox'
import { webmentionOutbox } from '@kobato/db/sqlite/schema/webmention'
import { OUTBOX_BATCH_SIZE } from '@kobato/server/domains/webmentions/outbox'
import { OUTBOX_MIN_DELAY_MS, rescheduleWebmentionOutbox } from '@kobato/server/domains/webmentions/outbox-scheduler'
import { scheduleRegisteredJob } from '@kobato/server/infra/job-registry'
import { __setDnsLookupForTests } from '@kobato/server/infra/safe-fetch'
import { stopAllScheduledJobs } from '@kobato/server/infra/scheduler-utils'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { htmlResponse, installFetch } from '@kobato/test/fetch'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

afterAll(() => {
  __setDnsLookupForTests(null)
})

const mockFetch = installFetch()

__setDnsLookupForTests(async () => [{ address: '203.0.113.10', family: 4 }])

const SOURCE = 'https://example.com/posts/scheduled/'
const HOUR_MS = 3_600_000

let seq = 0

async function seedDueRow(nextRetryAt?: Date): Promise<void> {
  const key = ++seq
  await upsertWebmentionOutbox(db, {
    sourceUrl: SOURCE,
    targetUrl: `https://target.example/article-${key}`,
    nextRetryAt: nextRetryAt ?? null,
  })
  mockFetch.enqueue(/target\.example/, () => htmlResponse('<html><head><title>plain</title></head>', { status: 200 }))
}

function statusCount(status: 'pending' | 'no-endpoint'): number {
  return sqliteOf(db).select().from(webmentionOutbox).where(eq(webmentionOutbox.status, status)).all().length
}

beforeEach(async () => {
  vi.useFakeTimers()
  stopAllScheduledJobs()
  await clearAllTables(db)
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
})

afterEach(() => {
  stopAllScheduledJobs()
  vi.useRealTimers()
})

describe('webmentions/outbox scheduler throttle', () => {
  it('fires a send-now row at the throttle floor — never before', async () => {
    await seedDueRow()
    scheduleRegisteredJob('webmentions.outbox')

    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS - 1)
    expect(mockFetch.calls).toHaveLength(0)
    expect(statusCount('pending')).toBe(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(1)
    expect(statusCount('no-endpoint')).toBe(1)
  })

  it('clamps a sub-floor waterline up to the floor', async () => {
    await seedDueRow(new Date(Date.now() + OUTBOX_MIN_DELAY_MS / 2))
    scheduleRegisteredJob('webmentions.outbox')

    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS / 2 + 100)
    expect(mockFetch.calls).toHaveLength(0)
    expect(statusCount('pending')).toBe(1)

    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS)
    expect(statusCount('no-endpoint')).toBe(1)
  })

  it('waits for a far-future waterline instead of firing early', async () => {
    await seedDueRow(new Date(Date.now() + HOUR_MS))
    scheduleRegisteredJob('webmentions.outbox')

    await vi.advanceTimersByTimeAsync(HOUR_MS - 1)
    expect(mockFetch.calls).toHaveLength(0)
    expect(statusCount('pending')).toBe(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(statusCount('no-endpoint')).toBe(1)
  })

  it('stays suspended with nothing pending — the enqueue nudge arms the timer promptly', async () => {
    scheduleRegisteredJob('webmentions.outbox')
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    await seedDueRow()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mockFetch.calls).toHaveLength(0)
    expect(statusCount('pending')).toBe(1)

    rescheduleWebmentionOutbox()
    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS)
    expect(statusCount('no-endpoint')).toBe(1)
  })

  it('paces a burst: one batch per floor interval, never back-to-back', async () => {
    for (let i = 0; i < OUTBOX_BATCH_SIZE + 1; i++) {
      await seedDueRow()
    }
    scheduleRegisteredJob('webmentions.outbox')

    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS)
    expect(mockFetch.calls).toHaveLength(OUTBOX_BATCH_SIZE)
    expect(statusCount('pending')).toBe(1)

    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS - 1)
    expect(mockFetch.calls).toHaveLength(OUTBOX_BATCH_SIZE)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(OUTBOX_BATCH_SIZE + 1)
    expect(statusCount('pending')).toBe(0)
    expect(statusCount('no-endpoint')).toBe(OUTBOX_BATCH_SIZE + 1)
  })
})
