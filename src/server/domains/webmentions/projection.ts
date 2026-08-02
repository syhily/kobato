import type { WebmentionOutboxRow, WebmentionRow } from '@/server/infra/db/types'
import type {
  AdminWebmentionOutboxWire,
  AdminWebmentionWire,
  PublicWebmentionWire,
} from '@/shared/contracts/webmentions'

export function asAdminWebmentionWire(row: WebmentionRow): AdminWebmentionWire {
  return {
    id: row.id.toString(),
    sourceUrl: row.sourceUrl,
    targetUrl: row.targetUrl,
    targetType: row.targetType,
    status: row.status,
    type: row.type,
    authorName: row.authorName,
    title: row.title,
    summary: row.summary,
    fetchedAt: row.fetchedAt === null ? null : row.fetchedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    moderatedAt: row.moderatedAt === null ? null : row.moderatedAt.toISOString(),
  }
}

export function asAdminWebmentionsWire(rows: WebmentionRow[]): AdminWebmentionWire[] {
  return rows.map(asAdminWebmentionWire)
}

export function asAdminWebmentionOutboxWire(row: WebmentionOutboxRow): AdminWebmentionOutboxWire {
  return {
    id: row.id.toString(),
    sourceUrl: row.sourceUrl,
    targetUrl: row.targetUrl,
    endpoint: row.endpoint,
    status: row.status,
    attempts: row.attempts,
    nextRetryAt: row.nextRetryAt === null ? null : row.nextRetryAt.toISOString(),
    lastError: row.lastError,
    sentAt: row.sentAt === null ? null : row.sentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

export function asAdminWebmentionOutboxListWire(rows: WebmentionOutboxRow[]): AdminWebmentionOutboxWire[] {
  return rows.map(asAdminWebmentionOutboxWire)
}

// Public display projection — only the DTO fields cross the boundary.
export function asPublicWebmentionWire(row: WebmentionRow): PublicWebmentionWire {
  return {
    id: row.id.toString(),
    sourceUrl: row.sourceUrl,
    type: row.type,
    authorName: row.authorName,
    title: row.title,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  }
}

export function asPublicWebmentionsWire(rows: WebmentionRow[]): PublicWebmentionWire[] {
  return rows.map(asPublicWebmentionWire)
}
