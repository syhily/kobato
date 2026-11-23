import { binaryOutput, fileSchema } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export type UploadRestoreResponse = { accepted: true } | { encrypted: true; token: string }

export const restoreProgressStageDto = z.enum([
  'decrypting',
  'extracting',
  'draining',
  'restoring',
  'completed',
  'failed',
  'idle',
])
export type RestoreProgressStage = z.infer<typeof restoreProgressStageDto>

export const restoreProgressDto = z.object({
  stage: restoreProgressStageDto,
  percent: z.number().nullable(),
  error: z.string().optional(),
})
export type RestoreProgressDto = z.infer<typeof restoreProgressDto>

export const restoreJobStatusDto = z.object({
  phase: z.enum(['idle', 'draining', 'restoring', 'completed', 'failed']),
  startedAt: z.string(),
  error: z.string().optional(),
  configApplied: z.boolean().optional(),
})
export type RestoreJobStatusDto = z.infer<typeof restoreJobStatusDto>

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

export const adminBackupUploadRestoreDecryptInput = z.object({
  token: z.string(),
  password: z.string(),
})
export type AdminBackupUploadRestoreDecryptInput = z.infer<typeof adminBackupUploadRestoreDecryptInput>

export const adminBackupUploadRestoreDecryptOutputDto = z.object({ accepted: z.boolean() })
export type AdminBackupUploadRestoreDecryptOutput = z.infer<typeof adminBackupUploadRestoreDecryptOutputDto>

export const adminBackupUploadRestoreInput = z.object({ file: fileSchema })
export type AdminBackupUploadRestoreInput = z.infer<typeof adminBackupUploadRestoreInput>

export const adminBackupUploadRestoreOutputDto = z.union([
  z.object({ accepted: z.literal(true) }).strict(),
  z.object({ encrypted: z.literal(true), token: z.string() }).strict(),
])
export type AdminBackupUploadRestoreOutput = z.infer<typeof adminBackupUploadRestoreOutputDto>

export const adminBackupDownloadInput = z.object({ key: z.string() })
export type AdminBackupDownloadInput = z.infer<typeof adminBackupDownloadInput>

export const adminBackupDownloadOutput = binaryOutput
export type AdminBackupDownloadOutput = z.infer<typeof adminBackupDownloadOutput>
