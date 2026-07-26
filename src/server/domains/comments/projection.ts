// Wire-projection helpers for comment payloads.
//
// Drizzle types `comment.id` / `userId` / `ownerId` / `rootId` as
// `bigint` and timestamps as `Date`, neither of which survives
// `JSON.stringify` in the shape the wire DTOs declare. The contract DTOs
// in `@/shared/contracts/comments` model the wire shape — `string` ids,
// ISO timestamps — which is what consumers expect over the network.
//
// These helpers do the projection explicitly and are idempotent:
// pre-converted values (`id` already a string) pass straight through.

import type { AdminCommentWire, CommentItemWire } from '@/shared/contracts/comments'
import type { AdminComment, CommentAndUser, CommentItem } from '@/shared/types/comments'

import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'

function asString(value: bigint | string | null | undefined): string {
  if (typeof value === 'string') {
    return value
  }
  return String(value ?? '')
}

function asNullableString(value: bigint | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return typeof value === 'string' ? value : String(value)
}

function asIso(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) {
    // Empty ISO never happens on a valid comment row; the schema
    // requires a value. Falling back to "" lets the response
    // validator pinpoint the real null source rather than crashing
    // on `.toISOString()`.
    return ''
  }
  return typeof value === 'string' ? value : value.toISOString()
}

function asNullableIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return typeof value === 'string' ? value : value.toISOString()
}

function projectPublicCommentBase(row: CommentAndUser): CommentItemWire {
  return {
    id: asString(row.id),
    createAt: asIso(row.createAt),
    updatedAt: asIso(row.updatedAt),
    deleteAt: asNullableIso(row.deleteAt),
    deleteRequestedAt: row.deleteRequestedAt === undefined ? undefined : asNullableIso(row.deleteRequestedAt),
    body: row.body,
    type: row.type,
    ownerId: asNullableString(row.ownerId),
    userId: asString(row.userId),
    isVerified: row.isVerified,
    rid: row.rid,
    isCollapsed: row.isCollapsed,
    isPending: row.isPending,
    isPinned: row.isPinned,
    voteUp: row.voteUp,
    voteDown: row.voteDown,
    rootId: asNullableString(row.rootId),
    name: row.name,
    emailVerified: row.emailVerified,
    link: row.link,
    badgeName: row.badgeName,
    badgeColor: row.badgeColor,
    badgeTextColor: row.badgeTextColor,
  }
}

function projectAdminCommentBase(
  row: CommentAndUser,
): Omit<AdminCommentWire, 'pageTitle' | 'pagePublicId' | 'pageCover' | 'pagePermalink'> {
  return {
    ...projectPublicCommentBase(row),
    content: row.content,
    ua: row.ua,
    ip: row.ip,
    email: row.email,
  }
}

export function asCommentItemWire(comment: CommentItem | CommentAndUser): CommentItemWire {
  const wire = withCommentBadgeTextColor(projectPublicCommentBase(comment))
  const children = (comment as CommentItem).children
  if (children !== undefined) {
    wire.children = children.map((c) => asCommentItemWire(c))
  }
  return wire
}

export function asCommentItemsWire(comments: CommentItem[]): CommentItemWire[] {
  return comments.map((c) => asCommentItemWire(c))
}

export function asAdminCommentsWire(comments: AdminComment[]): AdminCommentWire[] {
  return comments.map((row) => ({
    ...projectAdminCommentBase(row),
    pageTitle: row.pageTitle,
    pagePublicId: row.pagePublicId,
    pageCover: row.pageCover,
    pagePermalink: row.pagePermalink,
  }))
}
