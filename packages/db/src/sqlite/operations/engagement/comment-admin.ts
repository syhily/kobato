import type { Database } from '@kobato/db/sqlite/database'
import type { CommentAuthor, PageOption } from '@kobato/db/sqlite/operations/engagement/comment'
import type { EntityType } from '@kobato/db/sqlite/target'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { likeEscape } from '@kobato/db/sqlite/like-escape'
import { commentWithUser, targetSlugTitleSubquery } from '@kobato/db/sqlite/operations/engagement/comment'
import { comment } from '@kobato/db/sqlite/schema/comment'
import { metric } from '@kobato/db/sqlite/schema/metric'
import { user } from '@kobato/db/sqlite/schema/user'
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lte, not, or, sql } from 'drizzle-orm'

/**
 * Criteria vocabulary mirroring the wire filters (`@kobato/api/contracts/comments`); value parity is pinned by the
 * wire-parity tests.
 */
export type AdminCommentStatusCriteria = 'all' | 'pending' | 'approved' | 'deleteRequested'

export type CommentTextMatchCriteria = 'contains' | 'does-not-contain'

export interface AdminCommentListFilters {
  target?: { type: EntityType; ownerId: number }
  userId?: number
  status?: AdminCommentStatusCriteria
  q?: string
  match?: CommentTextMatchCriteria
  createdAfter?: Date
  createdBefore?: Date
}

export function buildAdminListConditions(filters: AdminCommentListFilters) {
  const conditions = [isNull(comment.deletedAt)]
  if (filters.target) {
    conditions.push(eq(comment.type, filters.target.type), eq(comment.ownerId, filters.target.ownerId))
  }
  if (filters.userId) {
    conditions.push(eq(comment.userId, filters.userId))
  }
  if (filters.status === 'pending') {
    conditions.push(eq(comment.isPending, true), isNull(comment.deleteRequestedAt))
  }
  if (filters.status === 'approved') {
    conditions.push(eq(comment.isPending, false), isNull(comment.deleteRequestedAt))
  }
  if (filters.status === 'deleteRequested') {
    conditions.push(isNotNull(comment.deleteRequestedAt))
  }
  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    if (filters.match === 'does-not-contain') {
      const negated = not(likeEscape(comment.content, q))
      if (negated) {
        conditions.push(negated)
      }
    } else {
      conditions.push(likeEscape(comment.content, q))
    }
  }
  if (filters.createdAfter) {
    conditions.push(gte(comment.createdAt, filters.createdAfter))
  }
  if (filters.createdBefore) {
    conditions.push(lte(comment.createdAt, filters.createdBefore))
  }
  return conditions
}

export type AdminPendingKind = 'all' | 'approval' | 'deletion'

function adminPendingWhere(kind: AdminPendingKind) {
  const live = isNull(comment.deletedAt)
  if (kind === 'approval') {
    return and(live, eq(comment.isPending, true), isNull(comment.deleteRequestedAt))
  }
  if (kind === 'deletion') {
    return and(live, isNotNull(comment.deleteRequestedAt))
  }
  return and(live, or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
}

export async function findCommentWithUserAndTarget(db: Database, id: number) {
  const entity = targetSlugTitleSubquery(db)
  const rows = await sqliteOf(db)
    .select({
      comment,
      user,
      metric,
      entitySlug: entity.slug,
      entityTitle: entity.title,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .innerJoin(metric, and(eq(metric.type, comment.type), eq(metric.ownerId, comment.ownerId)))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function searchPages(
  db: Database,
  q: string | undefined,
  limit: number,
  publicIds?: string[],
): Promise<PageOption[]> {
  const entity = targetSlugTitleSubquery(db)
  const conditions = [isNull(metric.deletedAt), isNotNull(metric.type), isNotNull(metric.ownerId)]
  if (publicIds && publicIds.length > 0) {
    conditions.push(inArray(metric.publicId, publicIds))
  } else if (q) {
    conditions.push(likeEscape(entity.title, q))
  }
  const rows = await sqliteOf(db)
    .select({ key: metric.publicId, title: entity.title })
    .from(metric)
    .innerJoin(entity, and(eq(entity.type, metric.type), eq(entity.ownerId, metric.ownerId)))
    .where(and(...conditions))
    .orderBy(desc(metric.id))
    .limit(limit)
  return rows.map((r) => ({ key: r.key, title: r.title ?? '' }))
}

export async function searchCommentAuthors(
  db: Database,
  q: string | undefined,
  limit: number,
  ids?: number[],
): Promise<CommentAuthor[]> {
  const conditions = [isNull(comment.deletedAt)]
  if (ids && ids.length > 0) {
    conditions.push(inArray(user.id, ids))
  } else if (q) {
    conditions.push(likeEscape(user.name, q))
  }
  return sqliteOf(db)
    .selectDistinct({ id: user.id, name: user.name })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...conditions))
    .orderBy(user.id)
    .limit(limit)
}

export async function countAllComments(db: Database, filters: AdminCommentListFilters): Promise<number> {
  const conditions = buildAdminListConditions(filters)
  const rows = await sqliteOf(db)
    .select({ counts: count() })
    .from(comment)
    .where(and(...conditions))
  return rows[0].counts
}

export async function countAdminComments(
  db: Database,
  baseFilters: Omit<AdminCommentListFilters, 'status'>,
): Promise<{ all: number; pending: number; approved: number; deleteRequested: number }> {
  const conditions = buildAdminListConditions({ ...baseFilters, status: 'all' })
  const rows = await sqliteOf(db)
    .select({
      all: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL)`.mapWith(Number),
      pending:
        sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE AND ${comment.deleteRequestedAt} IS NULL)`.mapWith(
          Number,
        ),
      approved:
        sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = FALSE AND ${comment.deleteRequestedAt} IS NULL)`.mapWith(
          Number,
        ),
      deleteRequested:
        sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.deleteRequestedAt} IS NOT NULL)`.mapWith(
          Number,
        ),
    })
    .from(comment)
    .where(and(...conditions))
  return {
    all: rows[0]?.all ?? 0,
    pending: rows[0]?.pending ?? 0,
    approved: rows[0]?.approved ?? 0,
    deleteRequested: rows[0]?.deleteRequested ?? 0,
  }
}

export async function listAdminComments(db: Database, offset: number, limit: number, filters: AdminCommentListFilters) {
  const conditions = buildAdminListConditions(filters)
  const entity = targetSlugTitleSubquery(db)
  return sqliteOf(db)
    .select({
      ...commentWithUser,
      type: comment.type,
      pageSlug: entity.slug,
      pageTitle: entity.title,
      pagePublicId: metric.publicId,
      pageCover: entity.cover,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .leftJoin(metric, and(eq(metric.type, comment.type), eq(metric.ownerId, comment.ownerId)))
    .where(and(...conditions))
    .orderBy(desc(comment.createdAt))
    .limit(limit)
    .offset(offset)
}

export interface AdminPendingRow {
  id: number
  createdAt: Date
  deleteRequestedAt: Date | null
  isPending: boolean | null
  content: string | null
  type: EntityType | null
  ownerId: number | null
  pageSlug: string | null
  pageTitle: string | null
  authorName: string
  authorLink: string | null
}

export async function listAdminPendingDashboard(
  db: Database,
  kind: AdminPendingKind,
  offset: number,
  limit: number,
): Promise<AdminPendingRow[]> {
  const entity = targetSlugTitleSubquery(db)
  const rows = await sqliteOf(db)
    .select({
      id: comment.id,
      createdAt: comment.createdAt,
      deleteRequestedAt: comment.deleteRequestedAt,
      isPending: comment.isPending,
      content: comment.content,
      type: comment.type,
      ownerId: comment.ownerId,
      pageSlug: entity.slug,
      pageTitle: entity.title,
      authorName: user.name,
      authorLink: user.link,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(adminPendingWhere(kind))
    .orderBy(desc(sql`COALESCE(${comment.deleteRequestedAt}, ${comment.createdAt})`), desc(comment.id))
    .limit(limit)
    .offset(offset)
  return rows
}

export async function countAdminPendingDashboard(db: Database): Promise<{
  all: number
  approval: number
  deletion: number
}> {
  const rows = await sqliteOf(db)
    .select({
      all: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND (${comment.isPending} = TRUE OR ${comment.deleteRequestedAt} IS NOT NULL))`.mapWith(
        Number,
      ),
      approval:
        sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE AND ${comment.deleteRequestedAt} IS NULL)`.mapWith(
          Number,
        ),
      deletion:
        sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.deleteRequestedAt} IS NOT NULL)`.mapWith(
          Number,
        ),
    })
    .from(comment)
  return {
    all: rows[0]?.all ?? 0,
    approval: rows[0]?.approval ?? 0,
    deletion: rows[0]?.deletion ?? 0,
  }
}
