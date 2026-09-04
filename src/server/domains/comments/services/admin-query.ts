import { sql } from 'drizzle-orm'

import type { AdminListFilters, AdminPendingKind } from '@/server/domains/comments/repos/shared'
import type { Database } from '@/server/infra/db/database'
import type { AdminPendingDashboardDto, AdminPendingItemDto } from '@/shared/contracts/comments'
import type { AdminCommentsResult } from '@/shared/types/comments'

import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'
import {
  countAdminComments,
  listAdminComments,
  listAdminPendingDashboard,
  searchCommentAuthors,
  searchPages,
} from '@/server/domains/comments/repos/admin-query'
import { asCommentTarget } from '@/server/domains/comments/services/shared'
import { findMetricByPublicId } from '@/server/infra/db/operations/metric'
import { comment } from '@/server/infra/db/schema/comment'
import { entityPermalink } from '@/shared/utils/paths'

const DASHBOARD_EXCERPT_LIMIT = 120

function makeDashboardExcerpt(raw: string | null): string {
  if (!raw) {
    return ''
  }
  // R12: `content` is now degraded HTML, not markdown — strip tags first.
  const trimmed = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (trimmed === '') {
    return ''
  }
  const codepoints = Array.from(trimmed)
  if (codepoints.length <= DASHBOARD_EXCERPT_LIMIT) {
    return trimmed
  }
  return `${codepoints.slice(0, DASHBOARD_EXCERPT_LIMIT).join('')}…`
}

export async function countAdminPendingDashboard(db: Database): Promise<{
  all: number
  approval: number
  deletion: number
}> {
  const rows = await db
    .select({
      all: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND (${comment.isPending} = TRUE OR ${comment.deleteRequestedAt} IS NOT NULL))`,
      approval: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE AND ${comment.deleteRequestedAt} IS NULL)`,
      deletion: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.deleteRequestedAt} IS NOT NULL)`,
    })
    .from(comment)
  return {
    all: rows[0]?.all ?? 0,
    approval: rows[0]?.approval ?? 0,
    deletion: rows[0]?.deletion ?? 0,
  }
}

export async function searchPageOptions(
  db: Database,
  q: string | undefined,
  limit: number,
  publicIds?: string[],
): Promise<Array<{ key: string; title: string }>> {
  return searchPages(db, q, limit, publicIds)
}

export async function searchAuthorOptions(
  db: Database,
  q: string | undefined,
  limit: number,
  ids?: number[],
): Promise<Array<{ id: number; name: string }>> {
  return searchCommentAuthors(db, q, limit, ids)
}

export async function loadAdminPendingDashboard(
  db: Database,
  kind: AdminPendingKind,
  offset: number,
  limit: number,
): Promise<AdminPendingDashboardDto> {
  const [rows, counts] = await Promise.all([
    listAdminPendingDashboard(db, kind, offset, limit),
    countAdminPendingDashboard(db),
  ])
  const items: AdminPendingItemDto[] = rows.map((row) => ({
    id: String(row.id),
    kind: row.deleteRequestedAt !== null ? 'deletion' : 'approval',
    authorName: row.authorName,
    authorLink: row.authorLink,
    excerpt: makeDashboardExcerpt(row.content),
    createdAtIso: row.createdAt.toISOString(),
    deleteRequestedAtIso: row.deleteRequestedAt ? row.deleteRequestedAt.toISOString() : null,
    pageTitle: row.pageTitle,
    pagePermalink: row.pageSlug && row.type ? entityPermalink(row.type, row.pageSlug) : null,
  }))
  const total = kind === 'approval' ? counts.approval : kind === 'deletion' ? counts.deletion : counts.all
  return {
    items,
    total,
    hasMore: offset + items.length < total,
    counts,
  }
}

export interface LoadAllCommentsOptions {
  offset: number
  limit: number
  filterPublicId?: string
  filterUserId?: number
  status?: 'all' | 'pending' | 'approved' | 'deleteRequested'
  filterQ?: string
  filterMatch?: 'contains' | 'does-not-contain'
  filterCreatedAfter?: Date
  filterCreatedBefore?: Date
}

export async function loadAllComments(db: Database, options: LoadAllCommentsOptions): Promise<AdminCommentsResult> {
  const {
    offset,
    limit,
    filterPublicId,
    filterUserId,
    status,
    filterQ,
    filterMatch,
    filterCreatedAfter,
    filterCreatedBefore,
  } = options

  let target: { type: 'post' | 'page'; ownerId: number } | undefined
  if (filterPublicId) {
    const metricRow = await findMetricByPublicId(db, filterPublicId)
    if (metricRow !== null) {
      target = asCommentTarget(metricRow.type, metricRow.ownerId) ?? undefined
    }
    if (!target) {
      return {
        comments: [],
        total: 0,
        hasMore: false,
        statusCounts: { all: 0, pending: 0, approved: 0, deleteRequested: 0 },
      }
    }
  }
  const baseFilters = { target, userId: filterUserId } satisfies Omit<AdminListFilters, 'status'>
  const extraFilters = {
    q: filterQ,
    match: filterMatch,
    createdAfter: filterCreatedAfter,
    createdBefore: filterCreatedBefore,
  } satisfies Omit<AdminListFilters, 'target' | 'userId' | 'status'>
  const filters: AdminListFilters = { ...baseFilters, status, ...extraFilters }
  const [comments, statusCounts] = await Promise.all([
    listAdminComments(db, offset, limit, filters),
    countAdminComments(db, { ...baseFilters, ...extraFilters }),
  ])
  const total =
    status === 'pending'
      ? statusCounts.pending
      : status === 'approved'
        ? statusCounts.approved
        : status === 'deleteRequested'
          ? statusCounts.deleteRequested
          : statusCounts.all

  return {
    comments: comments.map((c) =>
      // Fresh object out of withCommentBadgeTextColor — safe to extend in place.
      Object.assign(withCommentBadgeTextColor(c), {
        content: null,
        pageTitle: c.pageTitle,
        pagePublicId: c.pagePublicId,
        pagePermalink: c.pageSlug && c.type ? entityPermalink(c.type, c.pageSlug) : null,
      }),
    ),
    total,
    hasMore: offset + limit < total,
    statusCounts,
  }
}
