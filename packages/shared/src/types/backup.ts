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
