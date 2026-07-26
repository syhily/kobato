// In-memory single-job state machine for self-update. One update at a time:
// a second `apply` while a job is running is rejected with CONFLICT.
// The job runs in-process; the admin UI polls `admin.update.status`.
// There is no `'succeeded'` state — on success the process restarts.
// and exits, so the UI infers success from the version change after reload.

import { spawn } from 'node:child_process'

import type { UpdateJobStatus } from '@/shared/contracts/update'

import { runSelfUpdate } from '@/server/domains/update/pipeline'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('update.job')

let current: UpdateJobStatus = { state: 'idle' }
let running = false

export function getUpdateJobStatus(): UpdateJobStatus {
  return current
}

// Self-restart after a successful binary swap (plan 090). `process.exit`
// must never fire inside a vitest worker, so `startUpdateJob` takes the
// restart as an injected function and tests pass a spy instead.
//
// The replacement process is spawned detached with the same argv tail;
// `env` is intentionally omitted because spawn already inherits the
// parent's environment by default (and raw environment reads are
// centralised in `infra/env.ts` by the boundaries contract).
function scheduleSelfRestart(delayMs = 1_000): void {
  const child = spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'inherit',
  })
  child.unref()
  log.info('self-update swapped the binary; restarting', { pid: child.pid ?? null })
  setTimeout(() => {
    process.exit(0)
  }, delayMs)
}

export interface StartUpdateJobOptions {
  /** Defaults to the detached-respawn restart; tests inject a spy. */
  restart?: () => void
}

export function startUpdateJob(tagName: string, options: StartUpdateJobOptions = {}): void {
  if (running) {
    throw new DomainError('CONFLICT', '已有更新任务正在进行中')
  }
  running = true
  current = { state: 'downloading', targetVersion: tagName }
  const restart = options.restart ?? scheduleSelfRestart

  void (async () => {
    try {
      await runSelfUpdate({
        tagName,
        onState: (state) => {
          current = { ...current, state }
        },
      })
      current = { ...current, state: 'restarting' }
      restart()
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
