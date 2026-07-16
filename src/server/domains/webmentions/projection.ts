import type { WebmentionRow } from '@/server/infra/db/types'
import type { AdminWebmentionWire } from '@/shared/types/webmentions'

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
