import {
  adminStorageStartMigrationInput,
  adminStorageStatsOutputDto,
  storageMigrationStatusDto,
} from '@kobato/contracts/storage.ts'
import { oc } from '@orpc/contract'

// Admin storage RPC contract — admin base on the server. The S3 config lock
// and the migration state machine stay server-side; these are the wire
// procedures that drive and observe them.
export const adminStorageContract = {
  stats: oc.route({ method: 'GET', path: '/admin/storage/migration-stats' }).output(adminStorageStatsOutputDto),
  migrationStatus: oc
    .route({ method: 'GET', path: '/admin/storage/migration-status' })
    .output(storageMigrationStatusDto),
  startMigration: oc
    .route({ method: 'POST', path: '/admin/storage/migration/start' })
    .input(adminStorageStartMigrationInput)
    .output(storageMigrationStatusDto),
  cancelMigration: oc
    .route({ method: 'POST', path: '/admin/storage/migration/cancel' })
    .output(storageMigrationStatusDto),
  resumeMigration: oc
    .route({ method: 'POST', path: '/admin/storage/migration/resume' })
    .output(storageMigrationStatusDto),
}
