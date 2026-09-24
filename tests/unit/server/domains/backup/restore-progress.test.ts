import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'

import {
  resetRestoreMachine,
  startRestoreJob,
  tryBeginRestore,
  wireRestoreMachine,
} from '@/server/domains/backup/restore-machine'
import {
  beginStagingProgress,
  endStagingProgress,
  peekRestoreProgress,
  reportStagingProgress,
  resetStagingProgress,
} from '@/server/domains/backup/restore-progress'

function wireIdleMachine() {
  wireRestoreMachine({
    drain: vi.fn(async () => {}),
    prepareForSwap: vi.fn(async () => {}),
    reopenAfterSwap: vi.fn(async () => ({}) as unknown as Database),
    complete: vi.fn(async () => {}),
  })
}

describe('restore progress projection', () => {
  beforeEach(() => {
    resetStagingProgress()
    resetRestoreMachine()
  })

  it('reports the idle shape when nothing is staging and the machine is idle', () => {
    expect(peekRestoreProgress()).toEqual({ stage: 'idle', percent: null })
  })

  it('prefers staging progress over the machine phase', () => {
    // The machine slot is claimed (draining) while the pre-claim staging legs
    // still report — the staging view must win or the poll would jump phases.
    wireIdleMachine()
    expect(tryBeginRestore()).toBe(true)

    expect(beginStagingProgress()).toBe(true)
    reportStagingProgress('decrypting', 50, 200)
    expect(peekRestoreProgress()).toEqual({ stage: 'decrypting', percent: 25 })
  })

  it('caps percent at 99 and reports null when the total is unknown', () => {
    expect(beginStagingProgress()).toBe(true)

    // doneBytes past the total (an estimate that ran over) must never round to 100.
    reportStagingProgress('decrypting', 999, 100)
    expect(peekRestoreProgress()).toEqual({ stage: 'decrypting', percent: 99 })

    // Extraction has no total — percent is null, not a fabricated number.
    reportStagingProgress('extracting', 123, null)
    expect(peekRestoreProgress()).toEqual({ stage: 'extracting', percent: null })
  })

  it("passes the machine's terminal error through", async () => {
    const complete = vi.fn(async () => {})
    wireRestoreMachine({
      drain: vi.fn(async () => {}),
      prepareForSwap: vi.fn(async () => {}),
      reopenAfterSwap: vi.fn(async () => ({}) as unknown as Database),
      complete,
    })
    expect(tryBeginRestore()).toBe(true)
    startRestoreJob(async () => {
      throw new Error('swap blew up')
    })

    await vi.waitFor(() => expect(peekRestoreProgress().stage).toBe('failed'))
    expect(peekRestoreProgress()).toEqual({ stage: 'failed', percent: null, error: 'swap blew up' })
  })

  it('owns a single staging slot: a second begin returns false until the first ends', () => {
    expect(beginStagingProgress()).toBe(true)
    expect(beginStagingProgress()).toBe(false)

    endStagingProgress()
    expect(beginStagingProgress()).toBe(true)
  })

  it('ignores reports when no staging slot is claimed', () => {
    reportStagingProgress('decrypting', 10, 100)
    expect(peekRestoreProgress()).toEqual({ stage: 'idle', percent: null })
  })
})
