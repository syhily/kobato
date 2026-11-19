import type { Database, DatabaseHandle } from '@kobato/db/database.ts'

import { analyzeDatabase } from '@kobato/db/operations/maintenance.ts'
import { cleanupPreRestoreFiles, rollbackPreRestoreFiles } from '@kobato/server/domains/backup/services/restore.ts'
import { scheduleRegisteredJob } from '@kobato/server/infra/job-registry.ts'
import { restartServer } from '@kobato/server/infra/lifecycle.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'

/** A failed reopen aborts the chain before the restart — never restart into a dead handle. */

export interface RestoreCompletionDeps {
  reopenDatabase(): Promise<DatabaseHandle>
  getDb(): Database
  migrateDatabase(db: Database): Promise<void>
  wipeCache(): Promise<void>
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
        await deps.migrateDatabase(deps.getDb())
        log.info('Database migrations completed after restore')
        analyzeDatabase(deps.getDb())
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
