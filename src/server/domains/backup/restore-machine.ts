import type { Database } from '@/server/infra/db/database'

import { getLogger } from '@/server/infra/logger'

/**
 * The restore machine — the single owner of the restore job's whole
 * vocabulary: claim → drain → swap → reopen → validate → complete →
 * release. Before this module the state lived in `infra/lifecycle`,
 * the chain in an orchestrator, the completion in db-lifecycle, and
 * the claiming in three route files — and the slot only returned to
 * idle when someone polled a status endpoint (a restore could be
 * blocked forever by a never-polled terminal state).
 *
 * Two pieces of state, deliberately separate:
 *   - `current` — the RUNNING job (the slot). Claimed atomically by
 *     `tryBeginRestore`, released the moment the chain finishes. A
 *     completed restore never holds the slot hostage.
 *   - `last` — the terminal REPORT (completed/failed + error), kept
 *     for the status endpoint and consumed on read.
 *
 * The engine specifics (flush/close/reopen/migrate/restart) are
 * injected once by the composition root (`wireRestoreMachine` in
 * db-lifecycle) — routes pass a buffer and options, never handles or
 * phase names.
 */

export type RestorePhase = 'idle' | 'draining' | 'restoring' | 'completed' | 'failed'

export interface RestoreJobStatus {
  phase: RestorePhase
  startedAt: string
  error?: string
}

export interface RestoreMachineDeps {
  /** Stop accepting requests and drain in-flight ones (HTTP close +
   * server phase) — the chain's first step. */
  drain(): Promise<void> | void
  /** Flush batchers and close the live database handle. MUST run before
   * the swap — SQLite keeps the file open, and on Windows a
   * replaced-under-foot file would fail outright (on POSIX it would
   * silently keep writing to an unlinked inode). */
  prepareForSwap(): Promise<void> | void
  /** Open a fresh handle on the swapped file. */
  reopenAfterSwap(): Promise<Database>
  /** Post-chain completion: migrations, ANALYZE, server restart —
   * and the recovery reopen when the job failed. Runs inside the slot
   * (a new restore must not start mid-restart). */
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

/**
 * Atomically claim the restore slot: true when this caller got it,
 * false when a job is already running (or the machine is unwired).
 * Route handlers must call this BEFORE any await — a 500 MB upload
 * body takes seconds to read, and a check-then-act guard there lets a
 * second restore start while the first is still reading.
 */
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
  if (current !== null && current.phase === 'draining') {
    current = null
  }
}

export interface RestoreJobInput {
  restoreFn: () => Promise<void>
  afterReopenFn?: (db: Database) => Promise<void>
}

/**
 * The one guarded entry into the claim lifecycle for route handlers.
 * Claims the slot BEFORE `prepare` runs (a slow body read or download
 * must never race a second restore into the slot), aborts the claim
 * when `prepare` throws (the error propagates) or declines by
 * returning null, and hands the prepared job to the machine. The
 * claim/abort choreography used to be hand-copied at every route —
 * getting it wrong leaks the slot, so it lives here now.
 *
 * Outcomes: 'busy' (another restore holds the slot), 'declined'
 * (prepare passed on the request; the claim is released), 'started'
 * (the job is running).
 */
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
  startRestoreJob(job.restoreFn, job.afterReopenFn)
  return 'started'
}

/**
 * Non-consuming status projection for liveness readers (`/ready`
 * polls): the running phase while a job is in flight, the terminal
 * report WITHOUT consuming it, idle otherwise. Reading never frees
 * the slot and never eats the report.
 */
export function peekRestoreJobPhase(): RestoreJobStatus {
  if (current !== null) {
    return current
  }
  if (last !== null) {
    return last
  }
  return { phase: 'idle', startedAt: '' }
}

/**
 * The restore-status endpoint's read: the running phase while a job
 * is in flight; the terminal report ONCE (consumed on read); idle
 * otherwise. The consuming verb is deliberately separate from
 * `peekRestoreJobPhase` — a liveness poll must never eat the report
 * the admin endpoint is waiting to show.
 */
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

/**
 * Run the restore chain fire-and-forget (the caller already claimed
 * the slot with `tryBeginRestore`). Ordering contract:
 *   1. drain HTTP,  2. prepareForSwap (flush + close),  3. restoreFn
 *   (the file swap ONLY — no queries),  4. reopenAfterSwap (always —
 *   post-restore work must never hit the just-closed handle),
 *   5. afterReopenFn (best-effort validation/audit — INFALLIBLE by
 *   contract: content checks belong before the claim),
 *   6. complete (migrations, ANALYZE, restart; recovery reopen on
 *   failure), then the slot releases and the terminal report is kept
 *   for one status read.
 */
export function startRestoreJob(restoreFn: () => Promise<void>, afterReopenFn?: (db: Database) => Promise<void>): void {
  if (deps === null || current === null) {
    log.error('startRestoreJob without a claimed slot — ignored')
    return
  }
  const machineDeps = deps

  const promise = (async () => {
    let success = false
    let error: Error | undefined

    try {
      // 1. Close HTTP server (stop accepting, drain in-flight)
      await machineDeps.drain()

      // 2. Flush batchers, close the database handle, swap the files.
      await machineDeps.prepareForSwap()
      setPhase('restoring')
      await restoreFn()

      // 3. Reopen on the NEW file, then run post-restore work against it.
      const db = await machineDeps.reopenAfterSwap()
      await afterReopenFn?.(db)

      success = true
      log.info('Restore completed successfully')
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
      log.error('Restore failed', { err: error.message })
    }

    // 4. Completion (migrations + ANALYZE + restart; recovery reopen on
    //    failure) — inside the slot so a new restore can't start
    //    mid-restart. The slot releases here, and the terminal report
    //    is kept for exactly one status read.
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
