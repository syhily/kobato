export interface LatestComment {
  title: string
  author: string
  authorLink: string
  permalink: string
}

// Welcome-dashboard moderation inbox row. Same shape for both queues —
// the `kind` discriminator decides which buttons the UI renders.
export type AdminPendingKind = 'all' | 'approval' | 'deletion'

export interface AdminPendingItemDto {
  id: string
  kind: 'approval' | 'deletion'
  authorName: string
  authorLink: string | null
  excerpt: string
  createdAtIso: string
  deleteRequestedAtIso: string | null
  pageTitle: string | null
  pagePermalink: string | null
}

export interface AdminPendingDashboardDto {
  items: AdminPendingItemDto[]
  total: number
  hasMore: boolean
  counts: { all: number; approval: number; deletion: number }
}

import type { CommentBody } from '@/shared/pt/comment-schema'

export interface CommentAndUser {
  id: bigint
  createAt: Date
  updatedAt: Date
  deleteAt: Date | null
  /**
   * Soft "delete-request" marker. The visitor clicked "申请删除" but the
   * admin has not yet acted on it. When set, the comment is still
   * visible (so the author can review their own pending action), but
   * the public comment row gains a quiet warning banner and the inline
   * edit affordance is hidden.
   */
  deleteRequestedAt?: Date | string | null
  /**
   * Canonical PortableText body. Rendered by `<PortableTextBody>` on
   * the public site. The DB also retains a markdown projection of this
   * field under `comment.content`, but that's server-only.
   */
  body: CommentBody
  /**
   * Plain-text / markdown rollback snapshot. Present on server-side
   * `CommentAndUser` values, null on client-projected DTOs.
   */
  content: string | null
  /**
   * Polymorphic entity reference. `'post' | 'page'` (no DB enum).
   * `ownerId` is the stringified bigint. Both are nullable to
   * accommodate orphan rows that have not yet been backfilled.
   */
  type: 'post' | 'page' | null
  ownerId: bigint | null
  userId: bigint
  isVerified: boolean | null
  ua: string | null
  ip: string | null
  rid: number
  isCollapsed: boolean | null
  isPending: boolean | null
  isPinned: boolean | null
  voteUp: number | null
  voteDown: number | null
  rootId: bigint | null
  name: string
  email: string
  emailVerified: boolean
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
}

export interface CommentItem extends CommentAndUser {
  children?: CommentItem[]
}

export interface Comments {
  comments: CommentAndUser[]
  count: number
  roots_count: number
}

export interface AdminComment extends CommentAndUser {
  pageTitle: string | null
  /**
   * The metric's `public_id` UUID for the page the comment belongs
   * to. Drives the admin moderation filter Combobox.
   */
  pagePublicId: string | null
  pageCover: string | null
  /**
   * Fully-qualified public URL for the page this comment belongs to.
   * Powers the per-row "查看文章" overflow-menu item.
   */
  pagePermalink: string | null
}

export interface AdminCommentsResult {
  comments: AdminComment[]
  total: number
  hasMore: boolean
  /**
   * Per-status row counts under the current page/author filter context.
   * Always populated so the moderation segmented control can render its
   * three badges in one round-trip.
   */
  statusCounts: { all: number; pending: number; approved: number }
}

export interface DetailPageComments {
  commentData: Comments | null
  commentItems: CommentItemWire[]
}

export interface CommentReq {
  page_key: string
  name: string
  email: string
  link?: string
  body: CommentBody
  rid?: number
}

export interface ErrorResp {
  msg: string
}

export interface CommentReplyInput {
  page_key: string
  name: string
  email: string
  link?: string
  body: CommentBody
  rid?: number
  subtitle?: string
}

export type ReplyCommentInput = CommentReplyInput

export interface CommentRidInput {
  rid: string
}

export interface CommentEditInput extends CommentRidInput {
  body: CommentBody
}

export interface LoadCommentsInput {
  page_key: string
  offset: number
}

export interface LoadAllCommentsInput {
  offset: number
  limit: number
  pageKey?: string
  userId?: string
  status?: 'all' | 'pending' | 'approved'
  q?: string
  match?: 'contains' | 'does-not-contain'
  createdAfter?: string
  createdBefore?: string
}

export interface FilterAutocompleteInput {
  q?: string
  limit?: number
  ids?: string | string[]
  key?: string
}

// Output DTOs below intentionally use the **wire** comment types
// (`CommentItemWire` / `AdminCommentWire`) rather than the earlier
// `CommentItem` / `AdminComment` interfaces. The wire shapes match
// what `JSON.stringify` actually emits: bigint ids stringified, Date
// timestamps ISO-encoded. The earlier interfaces are kept for the
// server-side query layer.

export interface CommentItemWire {
  id: string
  createAt: string
  updatedAt: string
  deleteAt: string | null
  deleteRequestedAt?: string | null
  body: CommentBody
  type: 'post' | 'page' | null
  ownerId: string | null
  userId: string
  isVerified: boolean | null
  rid: number
  isCollapsed: boolean | null
  isPending: boolean | null
  isPinned: boolean | null
  voteUp: number | null
  voteDown: number | null
  rootId: string | null
  name: string
  emailVerified: boolean
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
  children?: CommentItemWire[]
}

export interface AdminCommentWire {
  id: string
  createAt: string
  updatedAt: string
  deleteAt: string | null
  deleteRequestedAt?: string | null
  body: CommentBody
  type: 'post' | 'page' | null
  ownerId: string | null
  userId: string
  isVerified: boolean | null
  rid: number
  isCollapsed: boolean | null
  isPending: boolean | null
  isPinned: boolean | null
  voteUp: number | null
  voteDown: number | null
  rootId: string | null
  name: string
  emailVerified: boolean
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
  content: string | null
  ua: string | null
  ip: string | null
  email: string
  pageTitle: string | null
  pagePublicId: string | null
  pageCover: string | null
  pagePermalink: string | null
}

export interface ReplyCommentOutput {
  comment: CommentItemWire
}

export interface CommentEditOutput {
  comment: CommentItemWire
}

export interface LoadCommentsOutput {
  comments: CommentItemWire[]
  next: boolean
}

export interface CommentRawOutput {
  body: CommentBody
}

export interface MyCommentsOutput {
  comments: CommentItemWire[]
  /**
   * Map from comment id string to token expiration timestamp (ms).
   * The UI uses this to show "editable for X more minutes" hints.
   */
  expiresAt: Record<string, number>
}

export interface RevokeCommentTokenOutput {
  success: boolean
}

export interface SearchPagesOutput {
  pages: { key: string; title: string | null }[]
}

export interface SearchAuthorsOutput {
  authors: { id: string; name: string }[]
}

export type LoadAllInput = LoadAllCommentsInput

export interface LoadAllOutput {
  comments: AdminCommentWire[]
  total: number
  hasMore: boolean
  /**
   * Counts for each status filter under the SAME page/user filter
   * context. The currently-selected tab's count equals `total`, but we
   * ship all three so the unselected tabs can still render their badges
   * without an extra round-trip.
   */
  statusCounts: { all: number; pending: number; approved: number }
}

export interface FindAvatarInput {
  email: string
}

export interface FindAvatarOutput {
  avatar: string
}

export interface ListPendingDashboardInput {
  kind?: AdminPendingKind
  offset?: number
  limit?: number
}

export type ListPendingDashboardOutput = AdminPendingDashboardDto

/**
 * Status filter for the visitor self-service `/admin/me/comments`
 * view. Lives in shared so the admin view can spell the same union
 * the loader parses without crossing the server-import boundary.
 */
export type MyCommentsStatus = 'all' | 'pending' | 'deleteRequested' | 'deleted'
