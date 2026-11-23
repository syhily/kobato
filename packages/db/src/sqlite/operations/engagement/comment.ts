import type { Database } from '@kobato/db/sqlite/database'
import type { EntityType } from '@kobato/db/sqlite/target'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { comment } from '@kobato/db/sqlite/schema/comment'
import { page } from '@kobato/db/sqlite/schema/page'
import { post } from '@kobato/db/sqlite/schema/post'
import { user } from '@kobato/db/sqlite/schema/user'
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

export const commentWithUser = {
  id: comment.id,
  createAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  deleteAt: comment.deletedAt,
  content: comment.content,
  body: comment.body,
  type: comment.type,
  ownerId: comment.ownerId,
  userId: comment.userId,
  isVerified: comment.isVerified,
  ua: comment.ua,
  ip: comment.ip,
  rid: comment.rid,
  isCollapsed: comment.isCollapsed,
  isPending: comment.isPending,
  isPinned: comment.isPinned,
  voteUp: comment.voteUp,
  voteDown: comment.voteDown,
  rootId: comment.rootId,
  deleteRequestedAt: comment.deleteRequestedAt,
  deleteRequestedBy: comment.deleteRequestedBy,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  link: user.link,
  badgeName: user.badgeName,
  badgeColor: user.badgeColor,
  badgeTextColor: user.badgeTextColor,
}

export type CommentWithUser = {
  [K in keyof typeof commentWithUser]: (typeof commentWithUser)[K]['_']['notNull'] extends true
    ? (typeof commentWithUser)[K]['_']['data']
    : (typeof commentWithUser)[K]['_']['data'] | null
}

function whereTarget(target: { type: EntityType; ownerId: number }) {
  return and(eq(comment.type, target.type), eq(comment.ownerId, target.ownerId))
}

export interface PendingCommentRow {
  id: number
  type: EntityType
  ownerId: number
  slug: string | null
  title: string | null
  author: string | null
  authorLink: string | null
}

export function targetSlugTitleSubquery(db: Database) {
  return sqliteOf(db)
    .select({
      type: sql<EntityType>`'post'`.as('type'),
      ownerId: post.id,
      slug: post.slug,
      title: post.title,
      cover: post.cover,
    })
    .from(post)
    .unionAll(
      sqliteOf(db)
        .select({
          type: sql<EntityType>`'page'`.as('type'),
          ownerId: page.id,
          slug: page.slug,
          title: page.title,
          cover: page.cover,
        })
        .from(page),
    )
    .as('entity')
}

export interface PageOption {
  key: string
  title: string
}

export interface CommentAuthor {
  id: number
  name: string
}

export interface ParentCommentRow {
  id: number
  userId: number
  name: string
  content: string
  deletedAt: Date | null
}

export async function findCommentWithUserById(db: Database, id: number): Promise<CommentWithUser | null> {
  const rows = await sqliteOf(db)
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function findCommentsByIds(db: Database, ids: number[]): Promise<CommentWithUser[]> {
  if (ids.length === 0) {
    return []
  }
  return sqliteOf(db)
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(inArray(comment.id, ids))
}

export async function countApprovedRepliesOfComment(db: Database, commentId: number): Promise<number> {
  const rows = await sqliteOf(db)
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.rid, commentId), eq(comment.isPending, false), isNull(comment.deletedAt)))
  return rows[0]?.count ?? 0
}

export function countApprovedCommentsByUser(db: Database, userId: number): number {
  const rows = sqliteOf(db)
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.userId, userId), eq(comment.isPending, false)))
    .all()
  return rows.length > 0 ? rows[0].count : 0
}

export async function recentCommentsForUserDedupe(
  db: Database,
  userId: number,
  since: Date,
  limit: number,
): Promise<Array<{ contentHash: string | null }>> {
  return sqliteOf(db)
    .select({ contentHash: comment.contentHash })
    .from(comment)
    .where(and(eq(comment.userId, userId), gte(comment.createdAt, since)))
    .orderBy(desc(comment.createdAt), desc(comment.id))
    .limit(limit)
}

export async function findCommentWithSourceUser(db: Database, id: number) {
  const rows = await sqliteOf(db)
    .select()
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function findParentCommentsByIds(db: Database, ids: number[]): Promise<Map<string, ParentCommentRow>> {
  const out = new Map<string, ParentCommentRow>()
  if (ids.length === 0) {
    return out
  }
  const rows = await sqliteOf(db)
    .select({
      id: comment.id,
      userId: comment.userId,
      name: user.name,
      content: comment.content,
      deletedAt: comment.deletedAt,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(inArray(comment.id, ids))
  for (const r of rows) {
    out.set(String(r.id), {
      id: r.id,
      userId: r.userId,
      name: r.name,
      content: r.content ?? '',
      deletedAt: r.deletedAt ?? null,
    })
  }
  return out
}

function whereViewerVisible(pendingValues: boolean[], currentUserId?: number) {
  return or(
    and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
    currentUserId !== undefined
      ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
      : sql`1 = 0`,
  )
}

export async function countCommentsAndRoots(
  db: Database,
  target: { type: EntityType; ownerId: number },
  pendingValues: boolean[],
  currentUserId?: number,
): Promise<{ total: number; roots: number }> {
  const baseConditions = [whereTarget(target), whereViewerVisible(pendingValues, currentUserId)]
  const rows = await sqliteOf(db)
    .select({
      total: count(),
      roots: sql<number>`COUNT(*) FILTER (WHERE ${comment.rootId} = 0)`.mapWith(Number),
    })
    .from(comment)
    .where(and(...baseConditions))
  const row = rows[0]
  return { total: row.total, roots: row.roots }
}

export async function findRootComments(
  db: Database,
  target: { type: EntityType; ownerId: number },
  pendingValues: boolean[],
  offset: number,
  limit: number,
  currentUserId?: number,
): Promise<CommentWithUser[]> {
  const baseConditions = [whereTarget(target), eq(comment.rootId, 0), whereViewerVisible(pendingValues, currentUserId)]
  return sqliteOf(db)
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...baseConditions))
    .limit(limit)
    .orderBy(desc(comment.createdAt), desc(comment.id))
    .offset(offset)
}

export async function findChildComments(
  db: Database,
  target: { type: EntityType; ownerId: number },
  pendingValues: boolean[],
  rootIds: number[],
  currentUserId?: number,
): Promise<CommentWithUser[]> {
  if (rootIds.length === 0) {
    return []
  }
  const baseConditions = [
    whereTarget(target),
    inArray(comment.rootId, rootIds),
    whereViewerVisible(pendingValues, currentUserId),
  ]
  return sqliteOf(db)
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...baseConditions))
}

export async function commentFingerprintRows(db: Database, target: { type: EntityType; ownerId: number }) {
  return sqliteOf(db)
    .select({
      id: comment.id,
      createAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      deleteAt: comment.deletedAt,
      deleteRequestedAt: comment.deleteRequestedAt,
      body: comment.body,
      content: comment.content,
      userId: comment.userId,
      isVerified: comment.isVerified,
      rid: comment.rid,
      isCollapsed: comment.isCollapsed,
      isPending: comment.isPending,
      isPinned: comment.isPinned,
      voteUp: comment.voteUp,
      voteDown: comment.voteDown,
      rootId: comment.rootId,
      name: user.name,
      emailVerified: user.emailVerified,
      link: user.link,
      badgeName: user.badgeName,
      badgeColor: user.badgeColor,
      badgeTextColor: user.badgeTextColor,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(whereTarget(target))
    .orderBy(comment.id)
}

export async function findCommentRootId(db: Database, id: number): Promise<number | null> {
  const rows = await sqliteOf(db).select({ rootId: comment.rootId }).from(comment).where(eq(comment.id, id)).limit(1)
  return rows[0]?.rootId ?? null
}
