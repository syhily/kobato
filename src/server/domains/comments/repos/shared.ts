import { and, eq, gte, isNotNull, isNull, lte, not, or, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget, EntityType } from '@/server/infra/db/target'
import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { CommentAndUser, MyCommentsStatus } from '@/shared/types/comments'

import { likeEscape } from '@/server/infra/db/like-escape'
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

// Compile-time parity between the select map and the shared `CommentAndUser`
// row type. `shared/` cannot import the drizzle schema (layering), so the
// interface is declared there and the drift check lives here where both sides
// are visible: adding a key to either side without the other fails the
// typecheck. `deleteRequestedBy` is deliberately server-only — moderation
// internals never reach the wire-facing type.
type _commentFieldKeyParity = Assert<Equals<keyof CommentWithUser, keyof CommentAndUser | 'deleteRequestedBy'>>

// Type compatibility: every selected column must be assignable to the shared
// declaration (which is deliberately wider in a few nullable spots and widens
// `deleteRequestedAt` to also accept pre-serialized strings).
type _commentFieldTypeParity = Assert<Omit<CommentWithUser, 'deleteRequestedBy'> extends CommentAndUser ? true : false>

export function whereTarget(target: EntityTarget) {
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
  id: number
  name: string
}

export interface AdminListFilters {
  target?: EntityTarget
  userId?: number
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
      conditions.push(not(likeEscape(comment.content, q)))
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

export const MY_COMMENTS_SOFT_DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000

/** Soft-delete cutoff: comments deleted after this instant stay visible to
 *  their author. Pass an explicit `cutoff` for parallel mine-queries. */
export function mineSoftDeleteCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MY_COMMENTS_SOFT_DELETE_GRACE_MS)
}

export function mineVisibleClause(userId: number, cutoff: Date = mineSoftDeleteCutoff()) {
  return and(eq(comment.userId, userId), or(isNull(comment.deletedAt), gte(comment.deletedAt, cutoff)))
}

export interface MyCommentsFilters {
  status?: MyCommentsStatus
  q?: string
  /**
   * Narrow to a specific post/page the user commented on (`?entity=` on
   * `/admin/me/comments`).
   */
  entity?: { type: EntityType; ownerId: number }
}

export function mineWhere(userId: number, filters: MyCommentsFilters = {}, cutoff: Date = mineSoftDeleteCutoff()) {
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
