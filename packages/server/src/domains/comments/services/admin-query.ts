import type { AdminPendingDashboardDto, AdminPendingItemDto } from '@kobato/api/contracts/comments'
import type { Database } from '@kobato/db/database'
import type { AdminCommentListFilters, AdminPendingKind } from '@kobato/db/operations/comment'
import type { AdminCommentsResult } from '@kobato/server/domains/comments/types'

import {
  countAdminComments,
  countAdminPendingDashboard as countAdminPendingDashboardOp,
  listAdminComments,
  listAdminPendingDashboard,
  searchCommentAuthors,
  searchPages,
} from '@kobato/db/operations/comment'
import { findMetricByPublicId } from '@kobato/db/operations/metric'
import { withCommentBadgeTextColor } from '@kobato/server/domains/comments/badge'
import { asCommentTarget } from '@kobato/server/domains/comments/services/shared'
import { entityPermalink } from '@kobato/server/domains/content/urls'

const DASHBOARD_EXCERPT_LIMIT = 120

function makeDashboardExcerpt(raw: string | null): string {
  if (!raw) {
    return ''
  }
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
  return countAdminPendingDashboardOp(db)
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
  status?: AdminCommentListFilters['status']
  filterQ?: string
  filterMatch?: AdminCommentListFilters['match']
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
  const baseFilters = { target, userId: filterUserId } satisfies Omit<AdminCommentListFilters, 'status'>
  const extraFilters = {
    q: filterQ,
    match: filterMatch,
    createdAfter: filterCreatedAfter,
    createdBefore: filterCreatedBefore,
  } satisfies Omit<AdminCommentListFilters, 'target' | 'userId' | 'status'>
  const filters: AdminCommentListFilters = { ...baseFilters, status, ...extraFilters }
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
      Object.assign(withCommentBadgeTextColor(c), {
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
