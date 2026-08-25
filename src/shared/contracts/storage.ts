import { z } from 'zod'

// Storage migration wire contract — the single source for the status DTO
// shared by the domain state machine (`server/domains/storage/s3-migration`),
// the admin controller, and the admin UI.

/** Phases during which a migration run owns the storage config (persisted on the row). */
export const STORAGE_MIGRATION_IN_FLIGHT_PHASES = ['copying', 'switching', 'catching-up'] as const
export type StorageMigrationInFlightPhase = (typeof STORAGE_MIGRATION_IN_FLIGHT_PHASES)[number]

/** Every phase the singleton row can persist; the wire adds the derived `idle` / `interrupted`. */
export const STORAGE_MIGRATION_PERSISTED_PHASES = [
  ...STORAGE_MIGRATION_IN_FLIGHT_PHASES,
  'completed',
  'failed',
  'cancelled',
] as const
export type StorageMigrationPersistedPhase = (typeof STORAGE_MIGRATION_PERSISTED_PHASES)[number]

export function isStorageMigrationInFlightPhase(phase: string): phase is StorageMigrationInFlightPhase {
  return (STORAGE_MIGRATION_IN_FLIGHT_PHASES as readonly string[]).includes(phase)
}

export const storageMigrationPhaseDto = z.enum(['idle', ...STORAGE_MIGRATION_PERSISTED_PHASES, 'interrupted'])
export type StorageMigrationPhase = z.infer<typeof storageMigrationPhaseDto>

export const storageMigrationDirectionDto = z.enum(['local-to-s3', 's3-to-local', 's3-to-s3'])
export type StorageMigrationDirection = z.infer<typeof storageMigrationDirectionDto>

/** Final source/target consistency check recorded when a run completes. */
export const storageMigrationVerificationDto = z.object({
  sourceCount: z.number(),
  sourceBytes: z.number(),
  targetCount: z.number(),
  targetBytes: z.number(),
  /** Target covers the source (it may hold pre-existing extras). */
  matches: z.boolean(),
  checkedAt: z.string(),
})
export type StorageMigrationVerification = z.infer<typeof storageMigrationVerificationDto>

export const storageMigrationStatusDto = z.object({
  phase: storageMigrationPhaseDto,
  direction: storageMigrationDirectionDto.nullable(),
  target: z.object({ bucket: z.string(), endpoint: z.string() }).nullable(),
  copiedObjects: z.number(),
  copiedBytes: z.number(),
  skippedObjects: z.number(),
  error: z.string().nullable(),
  verification: storageMigrationVerificationDto.nullable(),
  startedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
})
export type StorageMigrationStatus = z.infer<typeof storageMigrationStatusDto>
