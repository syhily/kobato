import { describe, expect, it } from 'vitest'

import { finishJobRun, latestJobRunsByTask, listJobRuns, startJobRun } from '@/server/infra/db/job-run-recorder'

// Unwired recorder (unit project: no db bootstrap, `wireJobRunRecorder`
// never ran) — every function is a silent no-op. Wired behavior, the
// orphan sweep, and truncation are covered by the integration tests.
describe('infra/db/job-run-recorder — unwired', () => {
  it('startJobRun returns null', () => {
    expect(startJobRun('backup', 'scheduled')).toBeNull()
  })

  it('finishJobRun is a silent no-op, even with a real-looking id', () => {
    expect(() => finishJobRun(1, 'failed', 'boom')).not.toThrow()
    expect(() => finishJobRun(null, 'success')).not.toThrow()
  })

  it('listJobRuns returns an empty page', () => {
    expect(listJobRuns({ taskKey: 'backup', offset: 0, limit: 20 })).toEqual({ items: [], total: 0 })
  })

  it('latestJobRunsByTask returns an empty map', () => {
    expect(latestJobRunsByTask().size).toBe(0)
  })
})
