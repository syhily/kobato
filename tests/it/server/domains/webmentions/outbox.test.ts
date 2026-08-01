import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real-send describe below drives `sendWebmention` through the REAL
// safeFetch stack — only the network boundary is stubbed: `fetch` via
// installFetch, DNS to a fixed public address (same discipline as
// tests/unit/server/infra/safe-fetch.test.ts).
vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}))

import { installFetch } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import {
  OUTBOX_MAX_ATTEMPTS,
  outboxBackoffMs,
  processWebmentionOutboxRow,
  runWebmentionOutboxBatch,
  type OutboxHooks,
} from '@/server/domains/webmentions/outbox'
import {
  findNextWebmentionOutboxDueAt,
  pickDueWebmentionOutbox,
  upsertWebmentionOutbox,
} from '@/server/infra/db/operations/webmention-outbox'
import { webmentionOutbox } from '@/server/infra/db/schema/webmention'

const db = getTestDb()

const mockFetch = installFetch()

const SOURCE = 'https://example.com/posts/hello/'
const TARGET = 'https://a.dev/article'

beforeEach(async () => {
  await clearAllTables(db)
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
})

async function seedRow(overrides: { endpoint?: string | null; nextRetryAt?: Date | null } = {}) {
  await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET, nextRetryAt: overrides.nextRetryAt })
  if (overrides.endpoint !== undefined && overrides.endpoint !== null) {
    await db.update(webmentionOutbox).set({ endpoint: overrides.endpoint })
  }
  const rows = await db.select().from(webmentionOutbox)
  return rows[0]!
}

function hooks(overrides: Partial<OutboxHooks>): OutboxHooks {
  return {
    discover: () => Promise.resolve({ kind: 'found', endpoint: 'https://a.dev/wm' }),
    send: () => Promise.resolve({ kind: 'ok' }),
    ...overrides,
  }
}

describe('webmentions/outbox state machine', () => {
  it('discovers, sends, and lands on sent', async () => {
    const row = await seedRow()
    await processWebmentionOutboxRow(db, row, hooks({}))

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('sent')
    expect(after!.endpoint).toBe('https://a.dev/wm')
    expect(after!.sentAt).not.toBeNull()
  })

  it('marks no-endpoint terminal when the target declares nothing', async () => {
    const row = await seedRow()
    await processWebmentionOutboxRow(db, row, hooks({ discover: () => Promise.resolve({ kind: 'none' }) }))

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('no-endpoint')
  })

  it('retries a failed discovery with backoff and keeps the row pending', async () => {
    const before = Date.now()
    const row = await seedRow()
    await processWebmentionOutboxRow(
      db,
      row,
      hooks({ discover: () => Promise.resolve({ kind: 'retry', error: 'timeout' }) }),
    )

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('pending')
    expect(after!.attempts).toBe(1)
    expect(after!.lastError).toBe('timeout')
    expect(after!.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(before + outboxBackoffMs(1))
  })

  it('treats a 4xx from the endpoint as a terminal refusal', async () => {
    const row = await seedRow({ endpoint: 'https://a.dev/wm' })
    await processWebmentionOutboxRow(db, row, hooks({ send: () => Promise.resolve({ kind: 'rejected', status: 410 }) }))

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('failed')
    expect(after!.lastError).toBe('http-410')
  })

  it('exhausts the attempt budget into failed', async () => {
    await seedRow({ endpoint: 'https://a.dev/wm' })
    const retryHooks = hooks({ send: () => Promise.resolve({ kind: 'retry', error: 'http-error (HTTP 500)' }) })
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i++) {
      const [current] = await db.select().from(webmentionOutbox)
      await processWebmentionOutboxRow(db, current!, retryHooks)
    }

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.attempts).toBe(OUTBOX_MAX_ATTEMPTS)
    expect(after!.status).toBe('failed')
  })

  it('reuses a stored endpoint without re-discovering', async () => {
    const row = await seedRow({ endpoint: 'https://a.dev/wm' })
    let discovered = 0
    await processWebmentionOutboxRow(
      db,
      row,
      hooks({
        discover: () => {
          discovered++
          return Promise.resolve({ kind: 'found', endpoint: 'https://a.dev/other' })
        },
      }),
    )

    expect(discovered).toBe(0)
    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('sent')
  })
})

describe('webmentions/outbox upsert dedup', () => {
  it('inserts once for the same source×target pair', async () => {
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET })
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET })
    expect(await db.select().from(webmentionOutbox)).toHaveLength(1)
  })

  it('never resets a sent row (repeat-bombing guard)', async () => {
    const row = await seedRow({ endpoint: 'https://a.dev/wm' })
    await processWebmentionOutboxRow(db, row, hooks({}))
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET })

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('sent')
  })

  it('raises the waterline of a pending row when a republish moves the publish moment later', async () => {
    const sooner = new Date(Date.now() + 3_600_000)
    const later = new Date(Date.now() + 7_200_000)
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET, nextRetryAt: sooner })
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET, nextRetryAt: later })

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('pending')
    expect(after!.nextRetryAt!.getTime()).toBe(later.getTime())
  })

  it('raises a NULL (send-now) waterline when the republish schedules the source later', async () => {
    const later = new Date(Date.now() + 7_200_000)
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET })
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET, nextRetryAt: later })

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.nextRetryAt!.getTime()).toBe(later.getTime())
  })

  it('never lowers the waterline of a pending row (earlier reschedule stays late)', async () => {
    const sooner = new Date(Date.now() + 3_600_000)
    const later = new Date(Date.now() + 7_200_000)
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET, nextRetryAt: later })
    // Republish with an earlier — and with no — publish moment.
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET, nextRetryAt: sooner })
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET })

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.nextRetryAt!.getTime()).toBe(later.getTime())
  })
})

describe('webmentions/outbox picking', () => {
  it('picks only due pending rows, waterline order', async () => {
    await upsertWebmentionOutbox(db, {
      sourceUrl: SOURCE,
      targetUrl: 'https://a.dev/future',
      nextRetryAt: new Date(Date.now() + 3_600_000),
    })
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET })
    await upsertWebmentionOutbox(db, {
      sourceUrl: SOURCE,
      targetUrl: 'https://a.dev/due',
      nextRetryAt: new Date(Date.now() - 1000),
    })

    const due = await pickDueWebmentionOutbox(db, new Date(), 10)
    expect(due.map((r) => r.targetUrl)).toEqual([TARGET, 'https://a.dev/due'])
  })

  it('reports the next wake-up for the scheduler', async () => {
    expect(findNextWebmentionOutboxDueAt(db)).toBeNull()
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: TARGET })
    expect(findNextWebmentionOutboxDueAt(db)).toBe('now')
  })

  it('processes a batch through the injected hooks end to end', async () => {
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: 'https://a.dev/one' })
    await upsertWebmentionOutbox(db, { sourceUrl: SOURCE, targetUrl: 'https://a.dev/two' })
    const sent: string[] = []
    const processed = await runWebmentionOutboxBatch(
      db,
      hooks({
        send: (_endpoint, _source, target) => {
          sent.push(target)
          return Promise.resolve({ kind: 'ok' })
        },
      }),
    )

    expect(processed).toBe(2)
    expect(sent.sort()).toEqual(['https://a.dev/one', 'https://a.dev/two'])
    expect(findNextWebmentionOutboxDueAt(db)).toBeNull()
  })
})

describe('webmentions/outbox real send path', () => {
  const ENDPOINT = 'https://endpoint.example/wm'

  it('POSTs the form-encoded mention with the sender UA and lands sent on 2xx', async () => {
    const row = await seedRow({ endpoint: ENDPOINT })
    mockFetch.enqueue(ENDPOINT, new Response('ok', { status: 202 }))

    // Default hooks: the REAL sendWebmention through the REAL safeFetch.
    await processWebmentionOutboxRow(db, row)

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('sent')

    expect(mockFetch.calls).toHaveLength(1)
    const call = mockFetch.calls[0]!
    expect(call.url).toBe(ENDPOINT)
    expect(call.init?.method).toBe('POST')
    const headers = call.init?.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('Kobato Webmention Sender (+https://example.com)')
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(headers['Accept']).toBe('*/*')
    // Form encoding, pinned byte for byte.
    expect(call.init?.body).toBe(`source=${encodeURIComponent(SOURCE)}&target=${encodeURIComponent(TARGET)}`)
  })

  it('maps a 4xx from the real stack to a terminal refusal', async () => {
    const row = await seedRow({ endpoint: ENDPOINT })
    mockFetch.enqueue(ENDPOINT, new Response('gone', { status: 410 }))

    await processWebmentionOutboxRow(db, row)

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('failed')
    expect(after!.lastError).toBe('http-410')
  })

  it('maps a 5xx from the real stack to a retryable failure', async () => {
    const before = Date.now()
    const row = await seedRow({ endpoint: ENDPOINT })
    mockFetch.enqueue(ENDPOINT, new Response('boom', { status: 500 }))

    await processWebmentionOutboxRow(db, row)

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('pending')
    expect(after!.attempts).toBe(1)
    expect(after!.lastError).toBe('http-error (HTTP 500)')
    expect(after!.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(before + outboxBackoffMs(1))
  })

  it('maps a network failure from the real stack to a retryable failure', async () => {
    const row = await seedRow({ endpoint: ENDPOINT })
    mockFetch.enqueue(ENDPOINT, () => Promise.reject(new Error('connection refused')))

    await processWebmentionOutboxRow(db, row)

    const [after] = await db.select().from(webmentionOutbox)
    expect(after!.status).toBe('pending')
    expect(after!.attempts).toBe(1)
    expect(after!.lastError).toBe('fetch-failed')
  })
})
