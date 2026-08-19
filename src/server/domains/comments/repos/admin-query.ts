import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import {
  adminPendingWhere,
  buildAdminListConditions,
  commentWithUser,
  mineSoftDeleteCutoff,
  mineWhere,
  targetSlugTitleSubquery,
  type AdminListFilters,
  type AdminPendingKind,
  type AdminPendingRow,
  type CommentAuthor,
  type CommentWithUser,
  type MyCommentsFilters,
  type PageOption,
} from '@/server/domains/comments/repos/shared'
import { likeEscape } from '@/server/infra/db/like-escape'
import { comment } from '@/server/infra/db/schema/comment'
import { metric } from '@/server/infra/db/schema/metric'
import { user } from '@/server/infra/db/schema/user'

export async function findCommentWithUserAndTarget(db: Database, id: number) {
  const entity = targetSlugTitleSubquery(db)
  const rows = await db
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
  const rows = await db
    .select({ key: metric.publicId, title: entity.title })
    .from(metric)
    .innerJoin(entity, and(eq(entity.type, metric.type), eq(entity.ownerId, metric.ownerId)))
    .where(and(...conditions))
    .orderBy(desc(metric.id))
    .limit(limit)
  return rows.map((r) => ({ key: r.key, title: r.title ?? '无标题' }))
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
  return db
    .selectDistinct({ id: user.id, name: user.name })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...conditions))
    .orderBy(user.id)
    .limit(limit)
}

export async function countAllComments(db: Database, filters: AdminListFilters): Promise<number> {
  const conditions = buildAdminListConditions(filters)
  const rows = await db
    .select({ counts: count() })
    .from(comment)
    .where(and(...conditions))
  return rows[0].counts
}

// Single-query variant of countAllComments — all four status counts in one round trip.
export async function countAdminComments(
  db: Database,
  baseFilters: Omit<AdminListFilters, 'status'>,
): Promise<{ all: number; pending: number; approved: number; deleteRequested: number }> {
  const conditions = buildAdminListConditions({ ...baseFilters, status: 'all' })
  const rows = await db
    .select({
      all: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL)`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = TRUE AND ${comment.deleteRequestedAt} IS NULL)`,
      approved: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.isPending} = FALSE AND ${comment.deleteRequestedAt} IS NULL)`,
      deleteRequested: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NULL AND ${comment.deleteRequestedAt} IS NOT NULL)`,
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

export async function listAdminComments(db: Database, offset: number, limit: number, filters: AdminListFilters) {
  const conditions = buildAdminListConditions(filters)
  const entity = targetSlugTitleSubquery(db)
  return db
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

export async function listAdminPendingDashboard(
  db: Database,
  kind: AdminPendingKind,
  offset: number,
  limit: number,
): Promise<AdminPendingRow[]> {
  const entity = targetSlugTitleSubquery(db)
  const rows = await db
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

export async function listMyComments(
  db: Database,
  userId: number,
  offset: number,
  limit: number,
  filters: MyCommentsFilters = {},
  cutoff: Date = mineSoftDeleteCutoff(),
): Promise<CommentWithUser[]> {
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(mineWhere(userId, filters, cutoff))
    .orderBy(desc(comment.createdAt))
    .limit(limit)
    .offset(offset)
}
