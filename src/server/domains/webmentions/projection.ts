import type { WebmentionOutboxRow, WebmentionRow } from '@/server/infra/db/types'
import type { AdminWebmentionOutboxWire, AdminWebmentionWire } from '@/shared/contracts/webmentions'

export function asAdminWebmentionWire(row: WebmentionRow): AdminWebmentionWire {
  return {
    id: row.id.toString(),
    sourceUrl: row.sourceUrl,
    targetUrl: row.targetUrl,
    targetType: row.targetType,
    status: row.status,
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
