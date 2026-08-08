export interface LatestComment {
  title: string
  author: string
  authorLink: string
  permalink: string
}

// Welcome-dashboard moderation inbox queue-switching union; row DTOs live in `@/shared/contracts/comments`.
export type AdminPendingKind = 'all' | 'approval' | 'deletion'

import type { AdminCommentWire, AdminPendingDashboardDto, CommentItemWire } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

export interface CommentAndUser {
  id: number
  createAt: Date
  updatedAt: Date
  deleteAt: Date | null
  /** Soft "delete-request" marker: the comment stays visible until the admin acts. */
  deleteRequestedAt?: Date | string | null
  /** Canonical PortableText body; the DB's markdown projection is server-only. */
  body: CommentBody
  /** Plain-text / markdown rollback snapshot (server-side only; null on client DTOs). */
  content: string | null
  /** Polymorphic `'post' | 'page'` ref (no DB enum); null on not-yet-backfilled orphan rows. */
  type: 'post' | 'page' | null
  ownerId: number | null
  userId: number
  isVerified: boolean | null
  ua: string | null
  ip: string | null
  rid: number
  isCollapsed: boolean | null
  isPending: boolean | null
  isPinned: boolean | null
  voteUp: number | null
  voteDown: number | null
  rootId: number | null
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
  /** Thread-cap marker set by `parseComments` when a root's reply thread exceeded the cap. */
  childrenTruncated?: boolean
  childrenTotal?: number
}

export interface Comments {
  comments: CommentAndUser[]
  count: number
  roots_count: number
}

export interface AdminComment extends CommentAndUser {
  pageTitle: string | null
  /** The page's `public_id` UUID; drives the admin moderation filter Combobox. */
  pagePublicId: string | null
  pageCover: string | null
  /** Fully-qualified public URL of the page; powers the per-row 查看文章 overflow item. */
  pagePermalink: string | null
}

export interface AdminCommentsResult {
  comments: AdminComment[]
  total: number
  hasMore: boolean
  /** Per-status row counts under the current filter. */
  statusCounts: { all: number; pending: number; approved: number; deleteRequested: number }
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
  status?: 'all' | 'pending' | 'approved' | 'deleteRequested'
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

// Output DTOs use the wire comment types — ids stringified, timestamps ISO.

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
  /** Map from comment id to token expiry (ms); the UI renders "editable for X more minutes" from it. */
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
  /** Counts per status under the same filter context. */
  statusCounts: { all: number; pending: number; approved: number; deleteRequested: number }
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

/** Status filter for the visitor self-service `/admin/me/comments` view. */
export type MyCommentsStatus = 'all' | 'pending' | 'deleteRequested' | 'deleted'
