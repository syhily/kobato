import { z } from 'zod'

export interface BackupFileDto {
  key: string
  fileName: string
  size: number
  lastModified: string
  /** The archive is password-encrypted (`.enc` storage suffix) — restores
   *  need the backup encryption password. */
  encrypted: boolean
}

/** Response of POST /api/admin/backup/upload-restore — either the restore
 *  started, or the upload is an encrypted archive parked server-side,
 *  waiting for the follow-up decrypt call with the password. */
export type UploadRestoreResponse = { accepted: true } | { encrypted: true; token: string }

export type RestoreProgressStage =
  | 'decrypting'
  | 'extracting'
  | 'draining'
  | 'restoring'
  | 'completed'
  | 'failed'
  | 'idle'

/** GET /api/admin/backup/restore-progress payload — the merged staging +
 *  restore-machine view the UI polls while the server is still up. */
export interface RestoreProgressDto {
  stage: RestoreProgressStage
  /** 0-100, or null when the stage total is unknown (extraction). */
  percent: number | null
  error?: string
}

// Admin backup wire — the single Zod source the `@kobato/api` backup contract
// composes and the server validates against.

export const backupFileDto = z.object({
  key: z.string(),
  fileName: z.string(),
  size: z.number(),
  lastModified: z.string(),
  encrypted: z.boolean(),
})
export type BackupFileWire = z.infer<typeof backupFileDto>

export const adminBackupStatusOutputDto = z.object({ primaryDriver: z.enum(['s3', 'local']) })
export type AdminBackupStatusOutput = z.infer<typeof adminBackupStatusOutputDto>

export const adminBackupListInput = z
  .object({ limit: z.number().optional(), continuationToken: z.string().optional() })
  .optional()
export type AdminBackupListInput = z.infer<typeof adminBackupListInput>

export const adminBackupListOutputDto = z.object({
  files: z.array(backupFileDto),
  nextContinuationToken: z.string().optional(),
})
export type AdminBackupListOutput = z.infer<typeof adminBackupListOutputDto>

// Optional per-backup password override; absent = the settings encryption
// password. Same floor as the settings schema — a one-off password is never
// stored, so a weak one only buys an unrestorable archive.
export const adminBackupCreateInput = z
  .object({
    password: z.string().min(8, 'admin.settings.backup.error.encryptionPasswordTooShort').max(512).optional(),
  })
  .optional()
export type AdminBackupCreateInput = z.infer<typeof adminBackupCreateInput>

export const adminBackupCreateOutputDto = z.object({
  fileName: z.string(),
  size: z.number(),
  timestamp: z.string(),
})
export type AdminBackupCreateOutput = z.infer<typeof adminBackupCreateOutputDto>

export const adminBackupDeleteInput = z.object({ key: z.string() })
export type AdminBackupDeleteInput = z.infer<typeof adminBackupDeleteInput>

export const adminBackupRestoreInput = z.object({
  key: z.string(),
  password: z.string().max(512).optional(),
})
export type AdminBackupRestoreInput = z.infer<typeof adminBackupRestoreInput>

export const adminBackupRestoreOutputDto = z.union([
  z.object({ accepted: z.boolean() }),
  z.object({ passwordRequired: z.boolean() }),
])
export type AdminBackupRestoreOutput = z.infer<typeof adminBackupRestoreOutputDto>
