import type { Pool } from 'pg'

import type { Logger } from '@/server/infra/logger'

import { closePool } from '@/server/infra/db/pool'
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
  pool: Pool
  log: Logger
}

/**
 * Fire-and-forget restore that drains the HTTP server before running the
 * restore, so no new requests arrive while `psql` is working. The connection
 * pool is kept open during `restoreFn` so post-restore DB queries (audit
 * logging, admin lookup, etc.) still work. The pool is closed and recreated
 * by the completion callback before the server is restarted.
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

      // 2. Run restore — psql uses its own connection, and the pool
      //    is still available for post-restore DB queries inside restoreFn.
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

    // 3. Run completion callback first (recreates pool, restarts server,
    //    flushes batchers) so it can use the still-open old pool.
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

    // 4. Close the old pool after the completion callback is done.
    // deps.pool is the old pool captured before drain. The completion
    // callback (server.ts) calls recreatePool() which creates a new pool
    // and assigns it to the module-level db/pool variables. We close the
    // old pool here after the callback finishes using it.
    try {
      await closePool(deps.pool)
    } catch (err) {
      deps.log.warn('Pool close error during restore completion', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  })()

  promise.catch((err) => {
    deps.log.error('Restore orchestrator crashed', {
      err: err instanceof Error ? err.message : String(err),
    })
  })
}
