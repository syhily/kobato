import { and, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { EntityTarget, EntityType } from '@/server/infra/db/target'
import type { MyCommentsStatus } from '@/shared/types/comments'

export type { MyCommentsStatus }

import { db } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema/comment'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'
import { escapeLikePattern } from '@/shared/utils/escape-like'

// Common projection: every comment column we expose to the application,
// joined with the public user attributes. Keep the shape stable here so the
// CommentAndUser DTO upstream stays in sync via TypeScript inference.
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

// Pure type derived from the projection above via Drizzle's column-shape
// inference. Re-exported by `services/comments/types.ts` so downstream
// non-server code can refer to it without importing this `.server.ts`
// module directly. Inferring from the projection keeps the DTO and the
// SQL projection in lockstep — adding or removing a column from
// `commentWithUser` propagates to consumers automatically.
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

// Post + page UNION used by `pendingComments` / `commentsByIds` and any
// admin surface that wants to project `(type, owner_id)` back to a
// human-readable slug + title without a polymorphic JOIN.
export function targetSlugTitleSubquery() {
  return db
    .select({
      type: sql<EntityType>`'post'`.as('type'),
      ownerId: post.id,
      slug: post.slug,
      title: post.title,
    })
    .from(post)
    .unionAll(
      db
        .select({
          type: sql<EntityType>`'page'`.as('type'),
          ownerId: page.id,
          slug: page.slug,
          title: page.title,
        })
        .from(page),
    )
    .as('entity')
}

export interface PageOption {
  /** `metric.public_id`. Wire field is named `key` because the Combobox API stays stable. */
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
  status?: 'all' | 'pending' | 'approved'
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
    conditions.push(eq(comment.isPending, true))
  }
  if (filters.status === 'approved') {
    conditions.push(eq(comment.isPending, false))
  }
  return conditions
}

// Welcome-dashboard pending queue. Rolls TWO concerns into a single
// list so the admin landing page can offer a unified inbox:
//
//   - `approval`: `is_pending = true` AND no delete request — newly
//                 posted (first-time author) OR re-pended after an
//                 author edit. Approve / reject buttons act on these.
//   - `deletion`: `delete_requested_at IS NOT NULL` — the author asked
//                 to remove their own row and the admin still has to
//                 accept or refuse. Accept / refuse buttons act on
//                 these.
//
// A row that's both pending-approval AND has a delete request reports as
// `deletion` because that's the more urgent state.
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
  // Mirrors the DB column nullability — `comment.is_pending` is
  // declared nullable so legacy seed rows could be backfilled.
  isPending: boolean | null
  content: string | null
  type: EntityType | null
  ownerId: bigint | null
  pageSlug: string | null
  pageTitle: string | null
  authorName: string
  authorLink: string | null
}

// Comments soft-deleted within this many milliseconds remain visible
// in `/my/*` so the user can see what was removed (with a「已删除」
// badge) before the row drops off entirely. Shared between
// `listMyComments` and `countMyComments` — drift here previously
// caused `hasMore = offset + comments.length < counts.total` to
// underestimate the total and either truncate the last page or hide a
// "load more" button mid-list (see RBAC-REVIEW §O7).
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

// Single source of truth for the visitor-self-service query predicate.
// Wraps `mineVisibleClause` so the soft-delete grace window stays in
// lockstep across list/count, and adds the optional tab-status / text
// filters. Keep the first line literally `mineVisibleClause(userId)`
// so the contract test in `tests/service.my-comments.test.ts` can still
// grep for the shared visibility helper inside this function body.
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
    // ILIKE against the markdown snapshot column `comment.content`
    // (already a plain-text rollback of the PortableText body), so the
    // search hits the same words the user sees rendered. Drizzle
    // parameterises the bound literal so the `%pattern%` interpolation
    // is not a SQL-injection vector; the per-user row volume is
    // bounded by the soft-delete window, so a sequential filter is
    // acceptable here.
    clauses.push(sql`${comment.content} ILIKE ${`%${escapeLikePattern(filters.q.trim())}%`}`)
  }
  return and(...clauses)
}

export interface MyCommentEntity {
  type: EntityType
  ownerId: bigint
  slug: string
  title: string
}

// Cap so the Combobox doesn't try to render thousands of options;
// the title-search input below narrows further when the user has
// commented on more than this.
export const MY_COMMENT_ENTITY_LIMIT = 20

export interface EntitySlugTitle {
  type: EntityType
  slug: string
  title: string
}

// Batch helper: returns the parent comment row (joined with its
// author's `user.name`) for every id in `ids`. Used by the `/my/comments`
// loader to surface the「回复 «name»: «excerpt»」block above each reply
// without issuing one round-trip per row.
export interface ParentCommentRow {
  id: bigint
  userId: bigint
  name: string
  content: string
  deletedAt: Date | null
}
