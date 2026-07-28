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
  /** Close the live database handle. MUST run before `restoreFn` swaps
   * the database files — SQLite keeps the file open, and on Windows a
   * replaced-under-foot file would fail outright (on POSIX it would
   * silently keep writing to an unlinked inode). */
  closeCurrentDatabase(): void
  log: Logger
}

/**
 * Fire-and-forget restore that drains the HTTP server before running the
 * restore, so no new requests arrive while the backup file replaces the
 * live one. The completion callback reopens the database on the new file
 * and restarts the server.
 */
export function performSafeRestore(deps: RestoreOrchestratorDeps, restoreFn: () => Promise<void>): void {
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

      // 2. Close the database handle, then swap the files.
      deps.closeCurrentDatabase()
      setRestoreState('restoring')
      await restoreFn()

      setRestoreState('completed')
      deps.log.info('Restore completed successfully')
      success = true
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
      deps.log.error('Restore failed', { err: error.message })
      setRestoreState('failed', error.message)
    }

    // 3. Run completion callback (reopens the database, restarts the
    //    server, resets batchers).
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
