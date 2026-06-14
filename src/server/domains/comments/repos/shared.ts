import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, gte, isNotNull, isNull, lte, not, or, sql } from 'drizzle-orm'

import type { EntityTarget, EntityType } from '@/server/infra/db/target'
import type { MyCommentsStatus } from '@/shared/types/comments'

export type { MyCommentsStatus }

import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { comment } from '@/server/infra/db/schema/comment'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

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

export function whereTarget(target: EntityTarget) {
  return and(eq(comment.type, target.type), eq(comment.ownerId, target.ownerId))
}

export interface PendingCommentRow {
  id: bigint
  type: EntityType
  ownerId: bigint
  slug: string | null
  title: string | null
  author: string | null
  authorLink: string | null
}

export function targetSlugTitleSubquery(db: NodePgDatabase) {
  return db
    .select({
      type: sql<EntityType>`'post'`.as('type'),
      ownerId: post.id,
      slug: post.slug,
      title: post.title,
      cover: post.cover,
    })
    .from(post)
    .unionAll(
      db
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
  id: bigint
  name: string
}

export interface AdminListFilters {
  target?: EntityTarget
  userId?: bigint
  status?: 'all' | 'pending' | 'approved' | 'deleteRequested'
  q?: string
  match?: 'contains' | 'does-not-contain'
  createdAfter?: Date
  createdBefore?: Date
}

export function buildAdminListConditions(filters: AdminListFilters) {
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
      conditions.push(not(ilikeEscape(comment.content, q)))
    } else {
      conditions.push(ilikeEscape(comment.content, q))
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

export function adminPendingWhere(kind: AdminPendingKind) {
  const live = isNull(comment.deletedAt)
  if (kind === 'approval') {
    return and(live, eq(comment.isPending, true), isNull(comment.deleteRequestedAt))
  }
  if (kind === 'deletion') {
    return and(live, isNotNull(comment.deleteRequestedAt))
  }
  return and(live, or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
}

export interface AdminPendingRow {
  id: bigint
  createdAt: Date
  deleteRequestedAt: Date | null
  isPending: boolean | null
  content: string | null
  type: EntityType | null
  ownerId: bigint | null
  pageSlug: string | null
  pageTitle: string | null
  authorName: string
  authorLink: string | null
}

export const MY_COMMENTS_SOFT_DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000

export function mineVisibleClause(userId: bigint) {
  return and(
    eq(comment.userId, userId),
    or(isNull(comment.deletedAt), gte(comment.deletedAt, new Date(Date.now() - MY_COMMENTS_SOFT_DELETE_GRACE_MS))),
  )
}

export interface MyCommentsFilters {
  status?: MyCommentsStatus
  q?: string
  /**
   * Narrow the result to a specific post / page the user has commented
   * on. URL-driven via `?entity=<type>:<ownerId>` on `/admin/me/comments`.
   */
  entity?: { type: EntityType; ownerId: bigint }
}

export function mineWhere(userId: bigint, filters: MyCommentsFilters = {}) {
  const clauses = [mineVisibleClause(userId)]
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
    clauses.push(ilikeEscape(comment.content, filters.q.trim()))
  }
  return and(...clauses)
}

export interface MyCommentEntity {
  type: EntityType
  ownerId: bigint
  slug: string
  title: string
}

export const MY_COMMENT_ENTITY_LIMIT = 20

export interface EntitySlugTitle {
  type: EntityType
  slug: string
  title: string
}

export interface ParentCommentRow {
  id: bigint
  userId: bigint
  name: string
  content: string
  deletedAt: Date | null
}
