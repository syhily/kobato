import type { Database } from '@/server/infra/db/database'
import type { Logger } from '@/server/infra/logger'

import { closeHttpServer, setRestoreState, setServerPhase } from '@/server/infra/lifecycle'

type CompleteFn = (success: boolean, error?: Error) => Promise<void>
let completeFn: CompleteFn | null = null

export function registerRestoreComplete(fn: CompleteFn): void {
  // Allow overwrite so HMR / Vite dev server restarts can re-register the
  // completion handler when server.ts is re-evaluated. In production this
  // module is loaded once, so the handler is never replaced.
  completeFn = fn
}

export function resetRestoreComplete(): void {
  completeFn = null
}

export interface RestoreOrchestratorDeps {
  /** Flush batchers and close the live database handle. MUST run before
   * `restoreFn` swaps the database files — SQLite keeps the file open,
   * and on Windows a replaced-under-foot file would fail outright (on
   * POSIX it would silently keep writing to an unlinked inode). The
   * flush is part of the contract: batchers flushed AFTER the close
   * would dead-letter buffered events against the dead handle. */
  prepareForSwap(): Promise<void> | void
  /** Open a fresh handle on the swapped file. Runs between the swap and
   * `afterReopenFn`, so post-restore validation/queries always hit the
   * NEW database — never the just-closed request-scoped handle. */
  reopenAfterSwap(): Promise<Database>
  log: Logger
}

/**
 * Fire-and-forget restore that drains the HTTP server before running the
 * restore, so no new requests arrive while the backup file replaces the
 * live one. Ordering contract:
 *   1. drain HTTP,  2. prepareForSwap (flush + close),  3. restoreFn
 *   (the file swap ONLY — no queries),  4. reopenAfterSwap (always —
 *   post-restore work must never hit the just-closed handle),
 *   5. afterReopenFn (validation, settings refresh, audit events —
 *   against the NEW database),  6. completion callback (migrations,
 *   ANALYZE, server restart; recovery reopen on failure).
 */
export function performSafeRestore(
  deps: RestoreOrchestratorDeps,
  restoreFn: () => Promise<void>,
  afterReopenFn?: (db: Database) => Promise<void>,
): void {
  // Capture the promise so callers (tests) can await completion, and so we
  // don't silently swallow rejections.
  const promise = (async () => {
    setRestoreState('draining')
    setServerPhase('restarting')

    let success = false
    let error: Error | undefined

    try {
      // 1. Close HTTP server (stop accepting, drain in-flight)
      await closeHttpServer()

      // 2. Flush batchers, close the database handle, swap the files.
      await deps.prepareForSwap()
      setRestoreState('restoring')
      await restoreFn()

      // 3. Reopen on the NEW file, then run post-restore work against it.
      const db = await deps.reopenAfterSwap()
      await afterReopenFn?.(db)

      setRestoreState('completed')
      deps.log.info('Restore completed successfully')
      success = true
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
      deps.log.error('Restore failed', { err: error.message })
      setRestoreState('failed', error.message)
    }

    // 4. Run completion callback (migrations + ANALYZE + server restart;
    //    reopens the ORIGINAL file for recovery when the restore failed).
    if (completeFn) {
      try {
        await completeFn(success, error)
      } catch (err) {
        deps.log.error('Restore completion handler failed', {
          err: err instanceof Error ? err.message : String(err),
        })
      }
    } else {
      deps.log.error('No restore completion handler registered')
    }
  })()

  promise.catch((err) => {
    deps.log.error('Restore orchestrator crashed', {
      err: err instanceof Error ? err.message : String(err),
    })
  })
}
