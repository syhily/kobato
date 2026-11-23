import {
  adminStorageStartMigrationInput,
  adminStorageStatsOutputDto,
  storageMigrationStatusDto,
} from '@kobato/api/contracts/admin/storage'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminStorageContract = {
  stats: defineProcedure({ method: 'GET', path: '/admin/storage/migration-stats' }).output(adminStorageStatsOutputDto),
  migrationStatus: defineProcedure({ method: 'GET', path: '/admin/storage/migration-status' }).output(
    storageMigrationStatusDto,
  ),
  startMigration: defineProcedure({ method: 'POST', path: '/admin/storage/migration/start' })
    .input(adminStorageStartMigrationInput)
    .output(storageMigrationStatusDto),
  cancelMigration: defineProcedure({ method: 'POST', path: '/admin/storage/migration/cancel' }).output(
    storageMigrationStatusDto,
  ),
  resumeMigration: defineProcedure({ method: 'POST', path: '/admin/storage/migration/resume' }).output(
    storageMigrationStatusDto,
  ),
}
