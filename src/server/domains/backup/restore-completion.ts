import type { Database, DatabaseHandle } from '@/server/infra/db/database'

import { cleanupPreRestoreFiles, rollbackPreRestoreFiles } from '@/server/domains/backup/services/restore'
import { migrateDatabase } from '@/server/infra/db/migrate'
import { scheduleRegisteredJob } from '@/server/infra/job-registry'
import { restartServer } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

/**
 * The restore completion chain behind the machine's `complete` step: rollback
 * → reopen → reschedule → migrate → ANALYZE → cache wipe → restart. A failed
 * reopen aborts the chain before the restart — never restart into a dead
 * handle.
 */

export interface RestoreCompletionDeps {
  /** Idempotent reopen of BOTH engines on the (possibly swapped) files. */
  reopenDatabase(): Promise<DatabaseHandle>
  /** The live content-db handle for the post-restore migration. */
  getDb(): Database
  /** The live handle whose sqlite client runs the post-bulk-load ANALYZE. */
  getDatabaseHandle(): DatabaseHandle
  /** Drop the restored-instance file cache; may reject with a partial-wipe failure. */
  wipeCache(): Promise<void>
  /** Tell admins the cache wipe failed (the restore itself succeeded). */
  notifyCacheWipeFailed(): void
}

const log = getLogger('backup.restore-completion')

export function createRestoreCompletion(
  deps: RestoreCompletionDeps,
): (success: boolean, error?: Error) => Promise<void> {
  return async function completeRestore(success, error) {
    if (!success) {
      log.error('Restore failed, restarting server for recovery', { err: error?.message })
      try {
        await rollbackPreRestoreFiles()
      } catch (rollbackErr) {
        log.error('Pre-restore rollback failed during restore completion', {
          err: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        })
      }
    } else {
      log.info('Restore succeeded, restarting server')
    }

    let recreated = false
    try {
      await deps.reopenDatabase()
      recreated = true
    } catch (recreateErr) {
      log.error('Database reopen failed during restore completion', {
        err: recreateErr instanceof Error ? recreateErr.message : String(recreateErr),
      })
    }

    if (recreated) {
      try {
        scheduleRegisteredJob('audit.scheduler')
      } catch (schedErr) {
        log.warn('Failed to reschedule archive after restore', {
          err: schedErr instanceof Error ? schedErr.message : String(schedErr),
        })
      }
    }

    if (!recreated) {
      // Never restart into a dead handle — stay down rather than 500 against a closed DB.
      log.error('Restore completion aborted: no live database handle; server not restarted')
      return
    }

    try {
      try {
        await migrateDatabase(deps.getDb())
        log.info('Database migrations completed after restore')
        // Bulk-loaded file — refresh planner statistics.
        deps.getDatabaseHandle().client.exec('ANALYZE')
      } catch (migrateErr) {
        log.error('Database migrations failed after restore', {
          err: migrateErr instanceof Error ? migrateErr.message : String(migrateErr),
        })
      }

      if (success) {
        try {
          await deps.wipeCache()
        } catch (wipeErr) {
          log.warn('File cache wipe failed after restore; residual entries may serve until their TTL expires', {
            err: wipeErr instanceof Error ? wipeErr.message : String(wipeErr),
          })
          try {
            deps.notifyCacheWipeFailed()
          } catch (notifyErr) {
            log.warn('Failed to notify admins about the cache wipe failure', {
              err: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
            })
          }
        }
      }

      await restartServer()
      log.info('Restore completion finished, server back online')
      if (success) {
        try {
          await cleanupPreRestoreFiles()
        } catch (cleanupErr) {
          log.warn('Failed to clean pre-restore originals after a successful restore', {
            err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          })
        }
      }
    } catch (restartErr) {
      log.error('Server restart failed during restore completion', {
        err: restartErr instanceof Error ? restartErr.message : String(restartErr),
      })
    }
  }
}
