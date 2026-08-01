// In-memory single-job state machine for self-update. One update at a time:
// a second `apply` while a job is running is rejected with CONFLICT.
// The job runs in-process; the admin UI polls `admin.update.status`.
// There is no `'succeeded'` state — on success the process restarts.
// and exits, so the UI infers success from the version change after reload.

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

// Self-restart after a successful binary swap (plan 090). `process.exit`
// must never fire inside a vitest worker, so `startUpdateJob` takes the
// restart as an injected function and tests pass a spy instead.
//
// Ordering matters (audit P0-7): the listen socket MUST be closed before
// the replacement process is spawned. The previous order — spawn first,
// request the shutdown ~1s later — raced the child's bind against the
// parent still holding the port: on bare metal (no supervisor; systemd's
// default KillMode=control-group only masks this by reaping the orphan
// with the cgroup) the child died on EADDRINUSE and the parent then
// exited, leaving the deployment permanently down. `closeHttpServer` is
// idempotent, so the graceful chain's own close becomes a no-op.
//
// The replacement process is spawned detached with the same argv tail;
// `env` is intentionally omitted because spawn already inherits the
// parent's environment by default (and raw environment reads are
// centralised in `infra/env.ts` by the boundaries contract). Under
// systemd's default KillMode=control-group the orphan is cleaned up with
// the cgroup, so the spawned child is only ever the restart vehicle for
// unsupervised bare-metal runs.
//
// The exit itself goes through `requestShutdown`, NOT `process.exit`:
// the graceful chain runs the priority-100 batcher flush hooks (audit
// 500ms / page-view 60s / access-log 1s buffers) before exiting — a raw
// `process.exit(0)` would silently drop those rows on every upgrade.
function scheduleSelfRestart(): void {
  void (async () => {
    // Free the port before the child boots; the 8s budget matches the
    // graceful-shutdown close in `performShutdown`.
    await closeHttpServer(8_000)
    // Shared recovery for both respawn failure shapes (audit V3-01). The
    // socket is already closed, so re-bind with the current process to keep
    // a listener, then release the job slot — otherwise the state machine
    // sticks in 'restarting', the admin UI spins forever, and every later
    // apply is rejected with CONFLICT.
    const recover = async (err: unknown): Promise<void> => {
      const message = err instanceof Error ? err.message : String(err)
      log.error('self-update respawn failed; restoring the listener', { err: message })
      try {
        await restartServer()
      } catch (restartErr) {
        // Best-effort: a failed re-bind must not escape as an unhandled
        // rejection inside this detached IIFE.
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
      // Real spawn failures (ENOENT/EACCES) arrive asynchronously via the
      // child's 'error' event; without a listener the event throws and
      // crashes the process before `restartServer` could run.
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
