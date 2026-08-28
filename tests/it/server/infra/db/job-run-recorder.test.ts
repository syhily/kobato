import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import {
  JOB_RUN_KEEP_PER_TASK,
  finishJobRun,
  latestJobRunsByTask,
  listJobRuns,
  pruneJobRuns,
  startJobRun,
  sweepOrphanedJobRuns,
} from '@/server/infra/db/job-run-recorder'
import { jobRun } from '@/server/infra/db/schema/job-run'

// The recorder is wired to the lifecycle-global :memory: db at import time
// (db-lifecycle), so these tests exercise the real write path.
const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
})

function insertRow(values: { taskKey: string; startedAt?: Date; status?: 'running' | 'success' | 'failed' }): number {
  const result = db
    .insert(jobRun)
    .values({
      taskKey: values.taskKey,
      trigger: 'scheduled',
      status: values.status ?? 'success',
      startedAt: values.startedAt ?? new Date(),
    })
    .run()
  return Number(result.lastInsertRowid)
}

describe('job-run-recorder — start/finish', () => {
  it('round-trips a success row with duration and no error', () => {
    const id = startJobRun('backup', 'manual')
    expect(id).not.toBeNull()

    finishJobRun(id, 'success')

    const row = db.select().from(jobRun).where(eq(jobRun.id, id!)).get()!
    expect(row.status).toBe('success')
    expect(row.trigger).toBe('manual')
    expect(row.finishedAt).toBeInstanceOf(Date)
    expect(row.durationMs).toBeGreaterThanOrEqual(0)
    expect(row.error).toBeNull()
  })

  it('records failures with the error message truncated to 500 chars', () => {
    const id = startJobRun('backup', 'scheduled')!
    finishJobRun(id, 'failed', 'x'.repeat(1000))

    const row = db.select().from(jobRun).where(eq(jobRun.id, id)).get()!
    expect(row.status).toBe('failed')
    expect(row.error).toHaveLength(500)
  })

  it('finishJobRun on an unknown id is a no-op', () => {
    expect(() => finishJobRun(999_999, 'success')).not.toThrow()
  })
})

describe('job-run-recorder — orphan sweep', () => {
  it('marks leftover running rows failed', () => {
    const id = insertRow({ taskKey: 'backup', status: 'running' })

    sweepOrphanedJobRuns(db)

    const row = db.select().from(jobRun).where(eq(jobRun.id, id)).get()!
    expect(row.status).toBe('failed')
    expect(row.error).toBe('进程重启中断')
    expect(row.finishedAt).toBeInstanceOf(Date)
  })
})

describe('job-run-recorder — queries', () => {
  it('latestJobRunsByTask returns the newest row per task', () => {
    insertRow({ taskKey: 'backup', startedAt: new Date('2026-01-01T00:00:00Z'), status: 'failed' })
    const newest = insertRow({ taskKey: 'backup', startedAt: new Date('2026-01-02T00:00:00Z') })
    const other = insertRow({ taskKey: 'kv-sweep' })

    const latest = latestJobRunsByTask()
    expect(latest.size).toBe(2)
    expect(latest.get('backup')!.id).toBe(newest)
    expect(latest.get('kv-sweep')!.id).toBe(other)
  })

  it('listJobRuns paginates newest-first with a total', () => {
    for (let i = 0; i < 5; i++) {
      insertRow({ taskKey: 'backup', startedAt: new Date(2026, 0, 1, i) })
    }
    insertRow({ taskKey: 'kv-sweep' })

    const page1 = listJobRuns({ taskKey: 'backup', offset: 0, limit: 2 })
    expect(page1.total).toBe(5)
    expect(page1.items).toHaveLength(2)
    expect(page1.items[0]!.startedAt.getTime()).toBeGreaterThan(page1.items[1]!.startedAt.getTime())

    const page3 = listJobRuns({ taskKey: 'backup', offset: 4, limit: 2 })
    expect(page3.total).toBe(5)
    expect(page3.items).toHaveLength(1)
  })
})

describe('job-run-recorder — pruneJobRuns', () => {
  it('drops rows older than 30 days and trims each task to the newest 200', () => {
    const now = new Date()
    const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    insertRow({ taskKey: 'backup', startedAt: old })
    insertRow({ taskKey: 'backup', startedAt: old })
    insertRow({ taskKey: 'backup' })
    for (let i = 0; i < JOB_RUN_KEEP_PER_TASK + 5; i++) {
      insertRow({ taskKey: 'kv-sweep', startedAt: new Date(now.getTime() - i * 1000) })
    }

    const deleted = pruneJobRuns(db, now)

    expect(deleted).toBe(2 + 5)
    expect(listJobRuns({ taskKey: 'backup', offset: 0, limit: 100 }).total).toBe(1)
    const swept = listJobRuns({ taskKey: 'kv-sweep', offset: 0, limit: 300 })
    expect(swept.total).toBe(JOB_RUN_KEEP_PER_TASK)
    // The trim keeps the NEWEST rows.
    expect(
      swept.items.every((row) => row.startedAt.getTime() >= now.getTime() - (JOB_RUN_KEEP_PER_TASK - 1) * 1000),
    ).toBe(true)
  })
})
