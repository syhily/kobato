import type { WebmentionRow } from '@/server/infra/db/types'

// Wire shape for the admin moderation list. bigints and Dates are
// projected to strings/ISO — the oRPC JSON channel cannot carry either.
export interface AdminWebmentionWire {
  id: string
  sourceUrl: string
  targetUrl: string
  targetType: 'post' | 'page'
  status: WebmentionRow['status']
  authorName: string | null
  title: string | null
  summary: string | null
  fetchedAt: string | null
  createdAt: string
  moderatedAt: string | null
}

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
