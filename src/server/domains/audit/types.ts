// ---------------------------------------------------------------------------
// Audit Log 类型定义
// ---------------------------------------------------------------------------

export interface AuditContext {
  viewer: { userId: bigint | string; role?: string } | null
  clientAddress: string
  request: Request
}

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

/** Batcher 配置选项 */
export interface BatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

/** 归档任务执行结果 */
export interface ArchiveResult {
  archivedDays: number
  archivedRows: number
  deletedRows: number
}

/** S3 清理结果 */
export interface CleanupResult {
  deletedFiles: number
}
