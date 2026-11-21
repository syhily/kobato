import { z } from 'zod'

export type UploadRestoreResponse = { accepted: true } | { encrypted: true; token: string }

export type RestoreProgressStage =
  | 'decrypting'
  | 'extracting'
  | 'draining'
  | 'restoring'
  | 'completed'
  | 'failed'
  | 'idle'

export interface RestoreProgressDto {
  stage: RestoreProgressStage
  percent: number | null
  error?: string
}

export const backupFileDto = z.object({
  key: z.string(),
  fileName: z.string(),
  size: z.number(),
  lastModified: z.string(),
  encrypted: z.boolean(),
})
export type BackupFileDto = z.infer<typeof backupFileDto>

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
