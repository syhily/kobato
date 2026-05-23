import type { AdminListFilters, AdminPendingKind } from '@/server/domains/comments/repos/shared'
import type { AdminCommentsResult } from '@/server/domains/comments/types'
import type { AdminPendingDashboardDto, AdminPendingItemDto } from '@/shared/types/comments'

import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'
import {
  countAdminPendingDashboard,
  countAllComments,
  listAdminComments,
  listAdminPendingDashboard,
  searchCommentAuthors,
  searchPages,
} from '@/server/domains/comments/repos/admin-query'
import { asCommentTarget, entityPermalink } from '@/server/domains/comments/services/shared'
import { findMetricByPublicId } from '@/server/infra/db/operations/metric'

const DASHBOARD_EXCERPT_LIMIT = 120

function makeDashboardExcerpt(raw: string | null): string {
  if (!raw) {
    return ''
  }
  const trimmed = raw.trim()
  if (trimmed === '') {
    return ''
  }
  const codepoints = Array.from(trimmed)
  if (codepoints.length <= DASHBOARD_EXCERPT_LIMIT) {
    return trimmed
  }
  return `${codepoints.slice(0, DASHBOARD_EXCERPT_LIMIT).join('')}…`
}

export async function searchPageOptions(
  q: string | undefined,
  limit: number,
  publicIds?: string[],
): Promise<Array<{ key: string; title: string }>> {
  return searchPages(q, limit, publicIds)
}

export async function searchAuthorOptions(
  q: string | undefined,
  limit: number,
  ids?: bigint[],
): Promise<Array<{ id: bigint; name: string }>> {
  return searchCommentAuthors(q, limit, ids)
}

export async function loadAdminPendingDashboard(
  kind: AdminPendingKind,
  offset: number,
  limit: number,
): Promise<AdminPendingDashboardDto> {
  const [rows, counts] = await Promise.all([
    listAdminPendingDashboard(kind, offset, limit),
    countAdminPendingDashboard(),
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

export async function loadAllComments(
  offset: number,
  limit: number,
  filterPublicId?: string,
  filterUserId?: bigint,
  status?: 'all' | 'pending' | 'approved',
): Promise<AdminCommentsResult> {
  let target: { type: 'post' | 'page'; ownerId: bigint } | undefined
  if (filterPublicId) {
    const metricRow = await findMetricByPublicId(filterPublicId)
    if (metricRow !== null) {
      target = asCommentTarget(metricRow.type, metricRow.ownerId) ?? undefined
    }
    if (!target) {
      return {
        comments: [],
        total: 0,
        hasMore: false,
        statusCounts: { all: 0, pending: 0, approved: 0 },
      }
    }
  }
  const baseFilters = { target, userId: filterUserId } satisfies AdminListFilters
  const filters: AdminListFilters = { ...baseFilters, status }
  const [comments, allCount, pendingCount, approvedCount] = await Promise.all([
    listAdminComments(offset, limit, filters),
    countAllComments({ ...baseFilters, status: 'all' }),
    countAllComments({ ...baseFilters, status: 'pending' }),
    countAllComments({ ...baseFilters, status: 'approved' }),
  ])
  const total = status === 'pending' ? pendingCount : status === 'approved' ? approvedCount : allCount

  return {
    comments: comments.map((c) => ({
      ...withCommentBadgeTextColor(c),
      content: null,
      pageTitle: c.pageTitle,
      pagePublicId: c.pagePublicId,
    })),
    total,
    hasMore: offset + limit < total,
    statusCounts: { all: allCount, pending: pendingCount, approved: approvedCount },
  }
}
