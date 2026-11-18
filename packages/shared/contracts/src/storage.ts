import {
  STORAGE_ENDPOINT_HTTPS_MESSAGE,
  STORAGE_URL_TEMPLATE_MESSAGE,
  isSafeStorageEndpoint,
  isSafeStorageUrlTemplate,
} from '@kobato/settings/sections/assets.ts'
import { z } from 'zod'

// Storage migration wire contract: the single source for the status DTO shared
// by the domain state machine, the admin controller and the admin UI.

/** Phases during which a migration run owns the storage config (persisted on the row). */
export const STORAGE_MIGRATION_IN_FLIGHT_PHASES = ['copying', 'switching', 'catching-up'] as const
export type StorageMigrationInFlightPhase = (typeof STORAGE_MIGRATION_IN_FLIGHT_PHASES)[number]

/** Every phase the singleton row can persist; the wire adds the derived `idle` / `interrupted`.
 *  Persistence twin: `@kobato/db/schema/storage-migration.ts` (parity pinned server-side). */
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

// Admin storage wire — the single Zod source the `@kobato/api` storage
// contract composes and the server validates against.

export const adminStorageStatsOutputDto = z.object({
  s3Primary: z.boolean(),
  images: z.number(),
  music: z.number(),
  branding: z.number(),
  backups: z.number(),
})
export type AdminStorageStatsOutput = z.infer<typeof adminStorageStatsOutputDto>

export const adminStorageS3TargetConfigInput = z
  .object({
    endpoint: z.url(),
    region: z.string().trim().min(1).max(60),
    bucket: z.string().trim().min(1).max(120),
    accessKeyId: z.string().trim().min(1).max(255),
    secretAccessKey: z.string().trim().min(1).max(512),
    forcePathStyle: z.boolean(),
    urlTemplate: z.string().trim().max(500),
  })
  // The same write-path URL rules as the settings section — a migration
  // target must not persist a plaintext endpoint or an open-redirect template.
  .superRefine((value, ctx) => {
    if (!isSafeStorageEndpoint(value.endpoint)) {
      ctx.addIssue({ code: 'custom', path: ['endpoint'], message: STORAGE_ENDPOINT_HTTPS_MESSAGE })
    }
    if (!isSafeStorageUrlTemplate(value.urlTemplate)) {
      ctx.addIssue({ code: 'custom', path: ['urlTemplate'], message: STORAGE_URL_TEMPLATE_MESSAGE })
    }
  })
export type AdminStorageS3TargetConfigInput = z.infer<typeof adminStorageS3TargetConfigInput>

export const adminStorageStartMigrationInput = z.discriminatedUnion('target', [
  z.object({ target: z.literal('local') }),
  z.object({ target: z.literal('s3'), config: adminStorageS3TargetConfigInput }),
])
export type AdminStorageStartMigrationInput = z.infer<typeof adminStorageStartMigrationInput>
