import { sqliteOf } from '@kobato/db/sqlite/database'
import { upsertWebmentionOutbox } from '@kobato/db/sqlite/operations/engagement/webmention-outbox'
import { webmentionOutbox } from '@kobato/db/sqlite/schema/webmention'
import { adminWebmentionsRouter } from '@kobato/server/http/controllers/admin/webmentions.controller'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

describe('integration / admin webmentions outbox', () => {
  it('lists rows with per-status counts, newest first', async () => {
    await upsertWebmentionOutbox(db, { sourceUrl: 'https://example.com/posts/a/', targetUrl: 'https://x.dev/1' })
    await upsertWebmentionOutbox(db, { sourceUrl: 'https://example.com/posts/a/', targetUrl: 'https://x.dev/2' })
    const rows = await sqliteOf(db).select().from(webmentionOutbox)
    await sqliteOf(db)
      .update(webmentionOutbox)
      .set({ status: 'sent', endpoint: 'https://x.dev/wm', sentAt: new Date() })
      .where(eq(webmentionOutbox.id, rows[0]!.id))

    const result = await call(
      adminWebmentionsRouter.outbox,
      { offset: 0, limit: 10 },
      { context: makeAuthedCtx({ role: 'admin', db }) },
    )

    expect(result.total).toBe(2)
    expect(result.hasMore).toBe(false)
    expect(result.statusCounts).toEqual({ all: 2, pending: 1, sent: 1, 'no-endpoint': 0, failed: 0 })
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]!.id).toBe(rows[1]!.id.toString())
  })

  it('filters by status', async () => {
    await upsertWebmentionOutbox(db, { sourceUrl: 'https://example.com/posts/a/', targetUrl: 'https://x.dev/1' })

    const result = await call(
      adminWebmentionsRouter.outbox,
      { offset: 0, limit: 10, status: 'sent' },
      { context: makeAuthedCtx({ role: 'admin', db }) },
    )

    expect(result.rows).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.statusCounts.all).toBe(1)
  })
})
