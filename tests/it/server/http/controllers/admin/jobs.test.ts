import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { adminJobsRouter } from '@/server/http/controllers/admin/jobs.controller'
import { finishJobRun, startJobRun } from '@/server/infra/db/job-run-recorder'
import { markWebmentionInboxRetry, upsertWebmentionInbox } from '@/server/infra/db/operations/webmention-inbox'
import { upsertWebmentionOutbox } from '@/server/infra/db/operations/webmention-outbox'
import { webmentionInbox, webmentionOutbox } from '@/server/infra/db/schema/webmention'
import { __resetSchedulerTaskStatesForTests, scheduleJob, stopAllScheduledJobs } from '@/server/infra/scheduler-utils'
import { TASK_CATALOG } from '@/shared/contracts/jobs'

// Read-only aggregation over the catalog × live scheduler state × job_run
// history × webmention queue tables. The recorder is wired to the global
// test db by db-lifecycle at import time.
const db = getTestDb()
const ctx = makeAuthedCtx({ role: 'admin', db })

beforeEach(async () => {
  await clearAllTables(db)
})

afterEach(() => {
  stopAllScheduledJobs()
  __resetSchedulerTaskStatesForTests()
})

describe('adminJobsRouter.list', () => {
  it('returns one summary per catalog task plus the storage migration DTO', async () => {
    const res = await call(adminJobsRouter.list, undefined, { context: ctx })
    expect(res.tasks).toHaveLength(TASK_CATALOG.length)
    expect(res.tasks.map((task) => task.taskKey)).toEqual(TASK_CATALOG.map((task) => task.key))
    for (const task of res.tasks) {
      expect(task.label.length).toBeGreaterThan(0)
      expect(task.lastRun).toBeNull()
    }
    // No scheduler armed in this module graph → no live state.
    expect(res.tasks.find((task) => task.taskKey === 'backup')!.liveState).toBeNull()
    expect(res.storageMigration.phase).toBe('idle')
  })

  it('merges the latest job_run row into the task summary', async () => {
    const runId = startJobRun('backup', 'manual')
    finishJobRun(runId, 'failed', 'disk full')

    const res = await call(adminJobsRouter.list, undefined, { context: ctx })
    const backup = res.tasks.find((task) => task.taskKey === 'backup')!
    expect(backup.lastRun).not.toBeNull()
    expect(backup.lastRun!.status).toBe('failed')
    expect(backup.lastRun!.trigger).toBe('manual')
    expect(backup.lastRun!.error).toBe('disk full')
    expect(backup.lastRun!.durationMs).toBeGreaterThanOrEqual(0)
    // Untouched tasks stay null.
    expect(res.tasks.find((task) => task.taskKey === 'geoip-update')!.lastRun).toBeNull()
  })

  it('merges the live scheduler state for armed tasks', async () => {
    scheduleJob({ name: 'test.backup', task: { key: 'backup' }, nextDelayMs: () => 60_000, run: () => undefined })

    const res = await call(adminJobsRouter.list, undefined, { context: ctx })
    const backup = res.tasks.find((task) => task.taskKey === 'backup')!
    expect(backup.liveState).toEqual({ suspended: false, nextRunAt: expect.any(String), running: false })
  })

  it('aggregates the webmention queue stats (outbox depth/attention, inbox depth/attention)', async () => {
    await upsertWebmentionOutbox(db, { sourceUrl: 'https://a.example/1', targetUrl: 'https://b.example/1' })
    await upsertWebmentionOutbox(db, { sourceUrl: 'https://a.example/2', targetUrl: 'https://b.example/2' })
    await db
      .update(webmentionOutbox)
      .set({ status: 'failed' })
      .where(eq(webmentionOutbox.sourceUrl, 'https://a.example/2'))
    await upsertWebmentionInbox(db, { sourceUrl: 'https://c.example/1', targetUrl: 'https://d.example/1' })
    await upsertWebmentionInbox(db, { sourceUrl: 'https://c.example/2', targetUrl: 'https://d.example/2' })
    const inboxRow = await db.select().from(webmentionInbox).limit(1)
    await markWebmentionInboxRetry(db, inboxRow[0]!.id, 1, new Date(Date.now() + 60_000), 'fetch failed')

    const res = await call(adminJobsRouter.list, undefined, { context: ctx })
    const outbox = res.tasks.find((task) => task.taskKey === 'webmention-outbox')!
    expect(outbox.queue).toEqual({ depth: 1, nextDueAt: expect.any(String), attentionCount: 1 })
    const inbox = res.tasks.find((task) => task.taskKey === 'webmention-inbox')!
    expect(inbox.queue).toEqual({ depth: 2, nextDueAt: expect.any(String), attentionCount: 1 })
    const reverify = res.tasks.find((task) => task.taskKey === 'webmention-reverify')!
    expect(reverify.queue).toEqual({ depth: 0, nextDueAt: null, attentionCount: null })
    // Non-queue tasks carry no queue stats.
    expect(res.tasks.find((task) => task.taskKey === 'backup')!.queue).toBeNull()
  })
})

describe('adminJobsRouter.history', () => {
  it('paginates newest-first with total and hasMore', async () => {
    for (let i = 0; i < 3; i++) {
      const id = startJobRun('backup', 'scheduled')!
      finishJobRun(id, 'success')
    }
    const manualId = startJobRun('backup', 'manual')!
    finishJobRun(manualId, 'failed', 'conflict')

    const page1 = await call(adminJobsRouter.history, { taskKey: 'backup', offset: 0, limit: 2 }, { context: ctx })
    expect(page1.total).toBe(4)
    expect(page1.items).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    expect(page1.items[0]!.trigger).toBe('manual')
    expect(page1.items[0]!.status).toBe('failed')

    const page2 = await call(adminJobsRouter.history, { taskKey: 'backup', offset: 2, limit: 2 }, { context: ctx })
    expect(page2.items).toHaveLength(2)
    expect(page2.hasMore).toBe(false)

    const empty = await call(adminJobsRouter.history, { taskKey: 'kv-sweep' }, { context: ctx })
    expect(empty).toEqual({ items: [], total: 0, hasMore: false })
  })
})
