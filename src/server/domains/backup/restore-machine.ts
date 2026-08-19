import type { Database } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'

/**
 * The single owner of the restore job lifecycle (claim → drain → swap →
 * reopen → validate → complete → release): `current` holds the running
 * slot, `last` the one-shot terminal report.
 */

export type RestorePhase = 'idle' | 'draining' | 'restoring' | 'completed' | 'failed'

export interface RestoreJobStatus {
  phase: RestorePhase
  startedAt: string
  error?: string
}

export interface RestoreMachineDeps {
  /** Stop accepting requests and drain in-flight ones (HTTP close + server phase). */
  drain(): Promise<void> | void
  /** Flush batchers and close the live database handle — MUST run before the swap. */
  prepareForSwap(): Promise<void> | void
  /** Open a fresh handle on the swapped file. */
  reopenAfterSwap(): Promise<Database>
  /** Post-chain completion: migrations, ANALYZE, restart, recovery reopen
   * on failure. Runs inside the slot. */
  complete(success: boolean, error?: Error): Promise<void>
}

const log = getLogger('backup.restore-machine')

let deps: RestoreMachineDeps | null = null
let current: RestoreJobStatus | null = null
let last: RestoreJobStatus | null = null

/** Composition-root wiring (db-lifecycle at boot). Re-registration is
 *  allowed for HMR, mirroring the other wire seams. */
export function wireRestoreMachine(d: RestoreMachineDeps): void {
  deps = d
}

/** Test seam: drop wiring and in-flight state between cases. */
export function resetRestoreMachine(): void {
  deps = null
  current = null
  last = null
}

function setPhase(phase: RestorePhase, error?: string): void {
  if (current === null) {
    return
  }
  current = { phase, startedAt: new Date().toISOString(), error }
  log.info('Restore state changed', { phase, err: error })
}

/** Atomically claim the restore slot; false when busy or unwired. Callers must call this BEFORE any await. */
export function tryBeginRestore(): boolean {
  if (deps === null || current !== null) {
    return false
  }
  current = { phase: 'draining', startedAt: new Date().toISOString() }
  return true
}

/** Release a claimed-but-never-started slot (body parse or pre-swap
 *  validation failed before `startRestoreJob` ran). */
export function abortRestoreClaim(): void {
  if (current?.phase === 'draining') {
    current = null
  }
}

export interface RestoreJobInput {
  restoreFn: () => Promise<void>
  afterReopenFn?: (db: Database) => Promise<void>
  /**
   * Cleanup for state staged before the chain: invoked only when
   * `restoreFn` never started; best-effort.
   */
  onFailureFn?: () => Promise<void> | void
}

/** Claim the slot before `prepare` runs, release it on throw/decline, then
 * start the job. Outcomes: 'busy' | 'declined' | 'started'. */
export async function withRestoreClaim(
  prepare: () => Promise<RestoreJobInput | null>,
): Promise<'busy' | 'declined' | 'started'> {
  if (!tryBeginRestore()) {
    return 'busy'
  }
  let job: RestoreJobInput | null
  try {
    job = await prepare()
  } catch (error) {
    abortRestoreClaim()
    throw error
  }
  if (job === null) {
    abortRestoreClaim()
    return 'declined'
  }
  startRestoreJob(job.restoreFn, job.afterReopenFn, job.onFailureFn)
  return 'started'
}

/** Non-consuming status read (`/ready` polls): running phase, the terminal
 * report WITHOUT consuming it, else idle. */
export function peekRestoreJobPhase(): RestoreJobStatus {
  if (current !== null) {
    return current
  }
  if (last !== null) {
    return last
  }
  return { phase: 'idle', startedAt: '' }
}

/** Restore-status endpoint read: the terminal report is returned ONCE (consumed on read). */
export function consumeRestoreJobReport(): RestoreJobStatus {
  if (current !== null) {
    return current
  }
  if (last !== null) {
    const report = last
    last = null
    return report
  }
  return { phase: 'idle', startedAt: '' }
}

/** Run the claimed restore chain fire-and-forget. The step order is the
 * code above; `afterReopenFn` must stay infallible by contract. */
export function startRestoreJob(
  restoreFn: () => Promise<void>,
  afterReopenFn?: (db: Database) => Promise<void>,
  onFailureFn?: () => Promise<void> | void,
): void {
  if (deps === null || current === null) {
    log.error('startRestoreJob without a claimed slot — ignored')
    return
  }
  const machineDeps = deps

  const promise = (async () => {
    let success = false
    let error: Error | undefined
    let swapStarted = false

    try {
      await machineDeps.drain()

      await machineDeps.prepareForSwap()
      setPhase('restoring')
      swapStarted = true
      await restoreFn()

      const db = await machineDeps.reopenAfterSwap()
      await afterReopenFn?.(db)

      success = true
      log.info('Restore completed successfully')
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
      log.error('Restore failed', { err: error.message })
      if (!swapStarted && onFailureFn !== undefined) {
        // drain/prepare threw before the swap — the caller's staged temp dir needs cleanup.
        try {
          await onFailureFn()
        } catch (cleanupErr) {
          log.warn('Restore failure cleanup failed', {
            err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          })
        }
      }
    }

    try {
      await machineDeps.complete(success, error)
    } catch (err) {
      log.error('Restore completion handler failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
    last = {
      phase: success ? 'completed' : 'failed',
      startedAt: new Date().toISOString(),
      error: error?.message,
    }
    current = null
  })()

  promise.catch((err) => {
    log.error('Restore machine crashed', {
      err: err instanceof Error ? err.message : String(err),
    })
    // A crash above must never wedge the slot.
    last = { phase: 'failed', startedAt: new Date().toISOString(), error: String(err) }
    current = null
  })
}
