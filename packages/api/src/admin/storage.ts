import {
  adminStorageStartMigrationInput,
  adminStorageStatsOutputDto,
  storageMigrationStatusDto,
} from '@kobato/contracts/storage'
import { oc } from '@orpc/contract'

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
