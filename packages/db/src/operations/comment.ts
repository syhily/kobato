import type { Database } from '@kobato/db/database'
import type { EntityType } from '@kobato/db/target'
import type { Comment, NewComment } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { likeEscape } from '@kobato/db/like-escape'
import { comment } from '@kobato/db/schema/comment'
import { metric } from '@kobato/db/schema/metric'
import { page } from '@kobato/db/schema/page'
import { post } from '@kobato/db/schema/post'
import { user } from '@kobato/db/schema/user'
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lte, not, or, sql } from 'drizzle-orm'

/**
 * Criteria vocabulary mirroring the wire filters (`@kobato/api/contracts/comments`); value parity is pinned by the
 * wire-parity tests.
 */
export type AdminCommentStatusCriteria = 'all' | 'pending' | 'approved' | 'deleteRequested'

export type CommentTextMatchCriteria = 'contains' | 'does-not-contain'

export type MyCommentsStatusCriteria = 'all' | 'pending' | 'deleteRequested' | 'deleted'

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

function targetSlugTitleSubquery(db: Database) {
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

export interface ParentCommentRow {
  id: number
  userId: number
  name: string
  content: string
  deletedAt: Date | null
}

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public thread queries
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sidebar digest
// ---------------------------------------------------------------------------

export async function pendingComments(db: Database, limit: number): Promise<PendingCommentRow[]> {
  const entity = targetSlugTitleSubquery(db)
  const rows = await sqliteOf(db)
    .select({
      id: comment.id,
      type: comment.type,
      ownerId: comment.ownerId,
      slug: entity.slug,
      title: entity.title,
      author: user.name,
      authorLink: user.link,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(eq(comment.isPending, true))
    .orderBy(desc(comment.id))
    .limit(limit)
  return rows
    .filter((r) => r.type !== null && r.ownerId !== null)
    .map((r) => ({
      id: r.id,
      type: r.type as EntityType,
      ownerId: r.ownerId as number,
      slug: r.slug,
      title: r.title,
      author: r.author,
      authorLink: r.authorLink,
    }))
}

export async function adminUserIds(db: Database): Promise<number[]> {
  const rows = await sqliteOf(db).select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
  return rows.map((r) => r.id)
}

export function latestDistinctCommentIdsQuery(adminIds: number[], limit: number) {
  const userFilter = adminIds.length > 0 ? sql`${comment.userId} NOT IN (${sql.join(adminIds, sql`, `)})` : sql`1 = 1`
  return sql`SELECT    id
  FROM      (
            SELECT    id,
                      user_id,
                      created_at,
                      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
            FROM      ${comment}
            WHERE     is_pending = false
                AND   deleted_at IS NULL
                AND   ${userFilter}
            )         t
  WHERE     rn = 1
  ORDER BY  created_at DESC
  LIMIT     ${limit}`
}

export async function latestDistinctCommentIds(db: Database, adminIds: number[], limit: number): Promise<number[]> {
  const rows = sqliteOf(db).all<{ id: number }>(latestDistinctCommentIdsQuery(adminIds, limit))
  return rows.map((row) => row.id)
}

export async function commentsByIds(db: Database, ids: number[], limit: number): Promise<PendingCommentRow[]> {
  if (ids.length === 0) {
    return []
  }
  const entity = targetSlugTitleSubquery(db)
  const rows = await sqliteOf(db)
    .select({
      id: comment.id,
      type: comment.type,
      ownerId: comment.ownerId,
      slug: entity.slug,
      title: entity.title,
      author: user.name,
      authorLink: user.link,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .leftJoin(entity, and(eq(entity.type, comment.type), eq(entity.ownerId, comment.ownerId)))
    .where(inArray(comment.id, ids))
    .orderBy(desc(comment.id))
    .limit(limit)
  return rows
    .filter((r) => r.type !== null && r.ownerId !== null)
    .map((r) => ({
      id: r.id,
      type: r.type as EntityType,
      ownerId: r.ownerId as number,
      slug: r.slug,
      title: r.title,
      author: r.author,
      authorLink: r.authorLink,
    }))
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Inserts a comment inside one transaction, resolving its pending flag from the author's approved-comment count
 * (first comment is always pending).
 */
export function insertCommentWithPendingGate(db: Database, values: NewComment): Comment | null {
  return sqliteOf(db).transaction((tx) => {
    const approvedRows = tx
      .select({ count: count() })
      .from(comment)
      .where(and(eq(comment.userId, values.userId as number), eq(comment.isPending, false)))
      .all()
    const approvedCount = approvedRows[0]?.count ?? 0
    const isPending = approvedCount === 0
    const rows = tx
      .insert(comment)
      .values({ ...values, isPending })
      .returning()
      .all()
    return rows[0] ?? null
  })
}

export function insertComment(db: Database, values: NewComment): Comment | null {
  const res = sqliteOf(db).insert(comment).values(values).returning().all()
  return res[0] ?? null
}

export async function updateCommentBodyAndContent(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await sqliteOf(db).update(comment).set({ body, content }).where(eq(comment.id, id))
}

export async function updateOwnCommentBody(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await sqliteOf(db)
    .update(comment)
    .set({ body, content, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  return Number(result.changes)
}

export async function updateOwnCommentBodyAndPending(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await sqliteOf(db)
    .update(comment)
    .set({ body, content, isPending: true, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  return Number(result.changes)
}

export async function approveCommentById(db: Database, id: number): Promise<void> {
  await sqliteOf(db).update(comment).set({ isPending: false }).where(eq(comment.id, id))
}

export async function deleteCommentById(db: Database, id: number): Promise<void> {
  await sqliteOf(db).delete(comment).where(eq(comment.id, id))
}

export async function softDeleteCommentById(db: Database, id: number): Promise<void> {
  await sqliteOf(db).update(comment).set({ deletedAt: new Date() }).where(eq(comment.id, id))
}

export async function bulkApprovePendingByUser(db: Database, userId: number): Promise<number> {
  const updated = await sqliteOf(db)
    .update(comment)
    .set({ isPending: false })
    .where(and(eq(comment.userId, userId), eq(comment.isPending, true), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  return updated.length
}

export async function bulkSoftDeleteCommentsByUser(db: Database, userId: number): Promise<number> {
  const updated = await sqliteOf(db)
    .update(comment)
    .set({ deletedAt: new Date() })
    .where(and(eq(comment.userId, userId), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  return updated.length
}

export async function requestDeleteComment(db: Database, id: number, userId: number): Promise<void> {
  await sqliteOf(db)
    .update(comment)
    .set({ deleteRequestedAt: new Date(), deleteRequestedBy: userId })
    .where(and(eq(comment.id, id), isNull(comment.deletedAt)))
}

export async function clearDeleteRequest(db: Database, id: number, userId: number): Promise<boolean> {
  const updated = await sqliteOf(db)
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(
      and(
        eq(comment.id, id),
        eq(comment.deleteRequestedBy, userId),
        isNull(comment.deletedAt),
        isNotNull(comment.deleteRequestedAt),
      ),
    )
    .returning({ id: comment.id })
  return updated.length > 0
}

export async function adminClearDeleteRequest(db: Database, id: number): Promise<boolean> {
  const updated = await sqliteOf(db)
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(and(eq(comment.id, id), isNotNull(comment.deleteRequestedAt)))
    .returning({ id: comment.id })
  return updated.length > 0
}
