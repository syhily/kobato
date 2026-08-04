import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

// The send half of a fired batch goes through the REAL safeFetch stack —
// only the network boundary is stubbed: `fetch` via installFetch, DNS to a
// fixed public address (same discipline as tests/unit/server/infra/
// safe-fetch.test.ts). The stubbed target pages declare no endpoint, so a
// processed row lands on the terminal `no-endpoint` state.
vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}))

import { installFetch } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { OUTBOX_BATCH_SIZE } from '@kobato/server/domains/webmentions/outbox'
import {
  OUTBOX_MIN_DELAY_MS,
  rescheduleWebmentionOutbox,
  scheduleWebmentionOutbox,
} from '@kobato/server/domains/webmentions/outbox-scheduler'
import { upsertWebmentionOutbox } from '@kobato/server/infra/db/operations/webmention-outbox'
import { webmentionOutbox } from '@kobato/server/infra/db/schema/webmention'
import { stopAllScheduledJobs } from '@kobato/server/infra/scheduler-utils'

// The webmention outbox job against the real engine: real outbox rows feed
// the next-due waterline query, and the observable effect is the real
// discovery/send round-trip. db-lifecycle (pulled in by the test-db helper)
// is the composition root that wires the scheduler's db getter, so only
// `scheduleWebmentionOutbox()` is called explicitly, like server.ts.
const db = getTestDb()

const mockFetch = installFetch()

const SOURCE = 'https://example.com/posts/scheduled/'
const HOUR_MS = 3_600_000

let seq = 0

/** A fresh pending row plus its stubbed target page (declares no endpoint). */
async function seedDueRow(nextRetryAt?: Date): Promise<void> {
  const key = ++seq
  await upsertWebmentionOutbox(db, {
    sourceUrl: SOURCE,
    targetUrl: `https://target.example/article-${key}`,
    nextRetryAt: nextRetryAt ?? null,
  })
  mockFetch.enqueue(/target\.example/, () => new Response('<html><head><title>plain</title></head>', { status: 200 }))
}

// Sync (node:sqlite).
function statusCount(status: 'pending' | 'no-endpoint'): number {
  return db.select().from(webmentionOutbox).where(eq(webmentionOutbox.status, status)).all().length
}

beforeEach(async () => {
  stopAllScheduledJobs()
  await clearAllTables(db)
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
})

afterEach(() => {
  stopAllScheduledJobs()
})

describe('webmentions/outbox scheduler throttle', () => {
  it('fires a send-now row at the throttle floor — never before', async () => {
    await seedDueRow()
    scheduleWebmentionOutbox()

    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS - 1)
    expect(mockFetch.calls).toHaveLength(0)
    expect(statusCount('pending')).toBe(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(1)
    expect(statusCount('no-endpoint')).toBe(1)
  })

  it('clamps a sub-floor waterline up to the floor', async () => {
    await seedDueRow(new Date(Date.now() + OUTBOX_MIN_DELAY_MS / 2))
    scheduleWebmentionOutbox()

    // Past the waterline but below the floor: the row must not go out early.
    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS / 2 + 100)
    expect(mockFetch.calls).toHaveLength(0)
    expect(statusCount('pending')).toBe(1)

    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS)
    expect(statusCount('no-endpoint')).toBe(1)
  })

  it('waits for a far-future waterline instead of firing early', async () => {
    await seedDueRow(new Date(Date.now() + HOUR_MS))
    scheduleWebmentionOutbox()

    await vi.advanceTimersByTimeAsync(HOUR_MS - 1)
    expect(mockFetch.calls).toHaveLength(0)
    expect(statusCount('pending')).toBe(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(statusCount('no-endpoint')).toBe(1)
  })

  it('stays suspended with nothing pending — the enqueue nudge arms the timer promptly', async () => {
    scheduleWebmentionOutbox()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    // Without the nudge a fresh row waits for the suspended re-check (30s),
    // not the throttle floor.
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
    scheduleWebmentionOutbox()

    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS)
    expect(mockFetch.calls).toHaveLength(OUTBOX_BATCH_SIZE)
    expect(statusCount('pending')).toBe(1)

    // The remaining row is due NOW, but the next batch still waits a full
    // floor interval — this is the burst throttle.
    await vi.advanceTimersByTimeAsync(OUTBOX_MIN_DELAY_MS - 1)
    expect(mockFetch.calls).toHaveLength(OUTBOX_BATCH_SIZE)

    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch.calls).toHaveLength(OUTBOX_BATCH_SIZE + 1)
    expect(statusCount('pending')).toBe(0)
    expect(statusCount('no-endpoint')).toBe(OUTBOX_BATCH_SIZE + 1)
  })
})
