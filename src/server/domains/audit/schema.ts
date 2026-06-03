export interface AuditEventInput {
  action: string
  actorId?: bigint | string | null
  actorRole?: string | null
  resourceType: string
  resourceId?: string | null
  details?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
  /** Captured at push time by the batcher. Do not set manually. */
  createdAt?: Date
}

/** Batcher configuration options */
export interface BatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

/** Archive job execution result */
export interface ArchiveResult {
  archivedDays: number
  archivedRows: number
  deletedRows: number
}

/** S3 cleanup result */
export interface CleanupResult {
  deletedFiles: number
}
