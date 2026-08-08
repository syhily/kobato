import type { RequestFacts } from '@/server/infra/http/request-facts'

export interface AuditContext {
  viewer: { id: number | string; role?: string } | null
  clientAddress: string
  requestFacts: RequestFacts
}

export interface AuditEventInput {
  action: string
  actorId?: number | string | null
  actorRole?: string | null
  resourceType: string
  resourceId?: string | null
  details?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
  /** Captured at push time by the batcher. Do not set manually. */
  createdAt?: Date
}

export interface BatcherOptions {
  flushIntervalMs: number
  flushThreshold: number
}

export interface ArchiveResult {
  archivedDays: number
  archivedRows: number
  deletedRows: number
}

export interface CleanupResult {
  deletedFiles: number
}
