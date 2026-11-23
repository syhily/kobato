import type { Database } from '@kobato/db/sqlite/database'
import type { CommentWithUser } from '@kobato/db/sqlite/operations/engagement/comment'
import type { EntityType } from '@kobato/db/sqlite/target'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { likeEscape } from '@kobato/db/sqlite/like-escape'
import { commentWithUser, targetSlugTitleSubquery } from '@kobato/db/sqlite/operations/engagement/comment'
import { comment } from '@kobato/db/sqlite/schema/comment'
import { user } from '@kobato/db/sqlite/schema/user'
import { and, count, desc, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm'

export type MyCommentsStatusCriteria = 'all' | 'pending' | 'deleteRequested' | 'deleted'

export const MY_COMMENTS_SOFT_DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000

export function mineSoftDeleteCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MY_COMMENTS_SOFT_DELETE_GRACE_MS)
}

function mineVisibleClause(userId: number, cutoff: Date) {
  return and(eq(comment.userId, userId), or(isNull(comment.deletedAt), gte(comment.deletedAt, cutoff)))
}

export interface MyCommentsFilters {
  status?: MyCommentsStatusCriteria
  q?: string
  entity?: { type: EntityType; ownerId: number }
}

function mineWhere(userId: number, filters: MyCommentsFilters, cutoff: Date) {
  const clauses = [mineVisibleClause(userId, cutoff)]
  if (filters.status === 'pending') {
    clauses.push(eq(comment.isPending, true))
  } else if (filters.status === 'deleteRequested') {
    clauses.push(isNotNull(comment.deleteRequestedAt))
  } else if (filters.status === 'deleted') {
    clauses.push(isNotNull(comment.deletedAt))
  }
  if (filters.entity) {
    clauses.push(eq(comment.type, filters.entity.type))
    clauses.push(eq(comment.ownerId, filters.entity.ownerId))
  }
  if (filters.q && filters.q.trim() !== '') {
    clauses.push(likeEscape(comment.content, filters.q.trim()))
  }
  return and(...clauses)
}

export interface MyCommentEntity {
  type: EntityType
  ownerId: number
  slug: string
  title: string
}

export const MY_COMMENT_ENTITY_LIMIT = 20

export async function listMyComments(
  db: Database,
  userId: number,
  offset: number,
  limit: number,
  filters: MyCommentsFilters = {},
  cutoff: Date = mineSoftDeleteCutoff(),
): Promise<CommentWithUser[]> {
  return sqliteOf(db)
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(mineWhere(userId, filters, cutoff))
    .orderBy(desc(comment.createdAt))
    .limit(limit)
    .offset(offset)
}

export async function countMyComments(
  db: Database,
  userId: number,
  filters: MyCommentsFilters = {},
  cutoff: Date = mineSoftDeleteCutoff(),
): Promise<{ total: number; pending: number; deleteRequested: number; deleted: number }> {
  const rows = await sqliteOf(db)
    .select({
      total: count(),
      pending: sql<number>`COUNT(*) FILTER (WHERE ${comment.isPending} = TRUE)`.mapWith(Number),
      deleteRequested: sql<number>`COUNT(*) FILTER (WHERE ${comment.deleteRequestedAt} IS NOT NULL)`.mapWith(Number),
      deleted: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NOT NULL)`.mapWith(Number),
    })
    .from(comment)
    .where(mineWhere(userId, filters, cutoff))
  return {
    total: rows[0]?.total ?? 0,
    pending: rows[0]?.pending ?? 0,
    deleteRequested: rows[0]?.deleteRequested ?? 0,
    deleted: rows[0]?.deleted ?? 0,
  }
}

export async function listMyCommentEntities(
  db: Database,
  userId: number,
  options: { q?: string; cutoff?: Date } = {},
): Promise<MyCommentEntity[]> {
  const q = options.q?.trim() ?? ''
  const entity = targetSlugTitleSubquery(db)
  const conditions = [mineVisibleClause(userId, options.cutoff ?? mineSoftDeleteCutoff())]
  if (q !== '') {
    conditions.push(likeEscape(entity.title, q))
  }
  const rows = await sqliteOf(db)
    .selectDistinct({
      type: entity.type,
      ownerId: entity.ownerId,
      slug: entity.slug,
      title: entity.title,
    })
    .from(comment)
    .innerJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(and(...conditions))
    .orderBy(entity.title)
    .limit(MY_COMMENT_ENTITY_LIMIT)
  return rows.map((row) => ({
    type: row.type,
    ownerId: row.ownerId,
    slug: row.slug ?? '',
    title: row.title ?? '',
  }))
}
