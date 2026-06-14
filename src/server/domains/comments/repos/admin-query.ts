import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import type { EntityType } from '@/server/infra/db/target'

import { resolveEntitiesForComments } from '@/server/domains/comments/repos/public-query/entities'
import {
  adminPendingWhere,
  buildAdminListConditions,
  commentWithUser,
  mineWhere,
  targetSlugTitleSubquery,
  type AdminListFilters,
  type AdminPendingKind,
  type AdminPendingRow,
  type CommentAuthor,
  type CommentWithUser,
  type MyCommentEntity,
  type MyCommentsFilters,
  type PageOption,
} from '@/server/domains/comments/repos/shared'
import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { comment } from '@/server/infra/db/schema/comment'
import { metric } from '@/server/infra/db/schema/metric'
import { user } from '@/server/infra/db/schema/user'

export async function findCommentWithUserAndTarget(db: NodePgDatabase, id: bigint) {
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

// Page-title autocomplete for the comment-moderation filter Combobox.
export async function searchPages(
  db: NodePgDatabase,
  q: string | undefined,
  limit: number,
  publicIds?: string[],
): Promise<PageOption[]> {
  const entity = targetSlugTitleSubquery(db)
  const conditions = [isNull(metric.deletedAt), isNotNull(metric.type), isNotNull(metric.ownerId)]
  if (publicIds && publicIds.length > 0) {
    conditions.push(inArray(metric.publicId, publicIds))
  } else if (q) {
    conditions.push(ilikeEscape(entity.title, q))
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

// Comment-author autocomplete.
export async function searchCommentAuthors(
  db: NodePgDatabase,
  q: string | undefined,
  limit: number,
  ids?: bigint[],
): Promise<CommentAuthor[]> {
  const conditions = [isNull(comment.deletedAt)]
  if (ids && ids.length > 0) {
    conditions.push(inArray(user.id, ids))
  } else if (q) {
    conditions.push(ilikeEscape(user.name, q))
  }
  return db
    .selectDistinct({ id: user.id, name: user.name })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...conditions))
    .orderBy(user.id)
    .limit(limit)
}

export async function countAllComments(db: NodePgDatabase, filters: AdminListFilters): Promise<number> {
  const conditions = buildAdminListConditions(filters)
  const rows = await db
    .select({ counts: count() })
    .from(comment)
    .where(and(...conditions))
  return rows[0].counts
}

// Single-query variant that returns all three status counts at once,
// avoiding the N-round-trip penalty of calling countAllComments three
// times. The base conditions (target, userId, text filter, date bounds)
// are applied in the WHERE; each SELECT arm further narrows by status.
export async function countAdminComments(
  db: NodePgDatabase,
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
    all: Number(rows[0]?.all ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
    approved: Number(rows[0]?.approved ?? 0),
    deleteRequested: Number(rows[0]?.deleteRequested ?? 0),
  }
}

export async function listAdminComments(db: NodePgDatabase, offset: number, limit: number, filters: AdminListFilters) {
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
  db: NodePgDatabase,
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
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    deleteRequestedAt: row.deleteRequestedAt,
    isPending: row.isPending,
    content: row.content,
    type: row.type,
    ownerId: row.ownerId,
    pageSlug: row.pageSlug,
    pageTitle: row.pageTitle,
    authorName: row.authorName,
    authorLink: row.authorLink,
  }))
}

export async function countAdminPendingDashboard(db: NodePgDatabase): Promise<{
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
    all: Number(rows[0]?.all ?? 0),
    approval: Number(rows[0]?.approval ?? 0),
    deletion: Number(rows[0]?.deletion ?? 0),
  }
}

export async function countApprovedRepliesOfComment(db: NodePgDatabase, commentId: bigint): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.rid, Number(commentId)), eq(comment.isPending, false), isNull(comment.deletedAt)))
  return rows[0]?.count ?? 0
}

export async function listMyComments(
  db: NodePgDatabase,
  userId: bigint,
  offset: number,
  limit: number,
  filters: MyCommentsFilters = {},
): Promise<CommentWithUser[]> {
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(mineWhere(userId, filters))
    .orderBy(desc(comment.createdAt))
    .limit(limit)
    .offset(offset)
}

export async function listMyCommentEntities(
  db: NodePgDatabase,
  userId: bigint,
  options: { q?: string } = {},
): Promise<MyCommentEntity[]> {
  const pairs = await db
    .selectDistinct({ type: comment.type, ownerId: comment.ownerId })
    .from(comment)
    .where(mineWhere(userId))
  const resolvable = pairs
    .filter((p): p is { type: EntityType; ownerId: bigint } => p.type !== null && p.ownerId !== null)
    .map((p) => ({ type: p.type, ownerId: p.ownerId }))
  const entityMap = await resolveEntitiesForComments(db, resolvable)
  const q = options.q?.trim().toLowerCase() ?? ''
  const out: MyCommentEntity[] = []
  for (const p of resolvable) {
    const row = entityMap.get(`${p.type}:${p.ownerId}`)
    if (!row) {
      continue
    }
    if (q !== '' && !row.title.toLowerCase().includes(q)) {
      continue
    }
    out.push({ type: row.type, ownerId: p.ownerId, slug: row.slug, title: row.title })
  }
  out.sort((a, b) => a.title.localeCompare(b.title))
  return out.slice(0, 20)
}

export async function countMyComments(
  db: NodePgDatabase,
  userId: bigint,
  filters: MyCommentsFilters = {},
): Promise<{ total: number; pending: number; deleteRequested: number; deleted: number }> {
  const rows = await db
    .select({
      total: count(),
      pending: sql<number>`COUNT(*) FILTER (WHERE ${comment.isPending} = TRUE)`,
      deleteRequested: sql<number>`COUNT(*) FILTER (WHERE ${comment.deleteRequestedAt} IS NOT NULL)`,
      deleted: sql<number>`COUNT(*) FILTER (WHERE ${comment.deletedAt} IS NOT NULL)`,
    })
    .from(comment)
    .where(mineWhere(userId, filters))
  return {
    total: Number(rows[0]?.total ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
    deleteRequested: Number(rows[0]?.deleteRequested ?? 0),
    deleted: Number(rows[0]?.deleted ?? 0),
  }
}
