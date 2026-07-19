// In-memory single-job state machine for self-update (plan 090, decision
// Q3). One update at a time: a second `apply` while a job is running is
// rejected with CONFLICT. The job runs in-process in the background; the
// admin UI polls `admin.update.status` for progress. There is no
// `'succeeded'` state — on success the process schedules its own restart
// and exits, so the UI infers success from the version change after reload.

import type { UpdateJobStatus } from '@/shared/types/update'

import { runSelfUpdate } from '@/server/domains/update/pipeline'
import { scheduleSelfRestart } from '@/server/domains/update/restart'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('update.job')

let current: UpdateJobStatus = { state: 'idle' }
let running = false

export function getUpdateJobStatus(): UpdateJobStatus {
  return current
}

export function startUpdateJob(tagName: string): void {
  if (running) {
    throw new DomainError('CONFLICT', '已有更新任务正在进行中')
  }
  running = true
  current = { state: 'downloading', targetVersion: tagName }

  void (async () => {
    try {
      await runSelfUpdate({
        tagName,
        onState: (state) => {
          current = { ...current, state }
        },
      })
      current = { ...current, state: 'restarting' }
      scheduleSelfRestart()
    } catch (err) {
      // Version strings and stage paths are L1 operational data; the error
      // message never carries user content.
      log.error('self-update failed', {
        targetVersion: tagName,
        err: err instanceof Error ? err.message : String(err),
      })
      current = {
        state: 'failed',
        error: err instanceof Error ? err.message : String(err),
        targetVersion: tagName,
      }
      running = false
    }
  })()
}
