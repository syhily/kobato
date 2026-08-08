// In-memory single-job state machine for self-update: one update at a time,
// no 'succeeded' state — on success the process restarts.

import { spawn } from 'node:child_process'

import type { UpdateJobStatus } from '@/shared/contracts/update'

import { runSelfUpdate } from '@/server/domains/update/pipeline'
import { DomainError } from '@/server/infra/http/errors'
import { closeHttpServer, requestShutdown, restartServer } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('update.job')

let current: UpdateJobStatus = { state: 'idle' }
let running = false

export function getUpdateJobStatus(): UpdateJobStatus {
  return current
}

// Self-restart after a successful binary swap (plan 090). The listen socket
// MUST close before the replacement spawns (audit P0-7); exit goes through
// `requestShutdown` so the batcher flush hooks run first.
function scheduleSelfRestart(): void {
  void (async () => {
    // 8s budget matches the graceful close in `performShutdown`.
    await closeHttpServer(8_000)
    // Respawn failure (audit V3-01): re-bind the listener, release the job slot.
    const recover = async (err: unknown): Promise<void> => {
      const message = err instanceof Error ? err.message : String(err)
      log.error('self-update respawn failed; restoring the listener', { err: message })
      try {
        await restartServer()
      } catch (restartErr) {
        // Best-effort: a failed re-bind must not escape this detached IIFE.
        log.error('self-update listener restore failed', {
          err: restartErr instanceof Error ? restartErr.message : String(restartErr),
        })
      }
      current = { ...current, state: 'failed', error: message }
      running = false
    }
    try {
      const child = spawn(process.execPath, process.argv.slice(1), {
        detached: true,
        stdio: 'inherit',
      })
      // Spawn failures arrive asynchronously via the child's 'error' event.
      child.on('error', (err) => {
        void recover(err)
      })
      child.unref()
      log.info('self-update swapped the binary; restarting', { pid: child.pid ?? null })
    } catch (err) {
      await recover(err)
      return
    }
    requestShutdown('self-update restart')
  })()
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
      // L1 operational data only — no user content.
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
