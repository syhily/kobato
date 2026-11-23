import type { AdminCommentWire, CommentItemWire, LatestComment } from '@kobato/api/contracts/comments'
import type { PendingCommentRow } from '@kobato/db/sqlite/operations/engagement/comment'
import type { AdminComment, CommentAndUser, CommentItem } from '@kobato/server/domains/comments/types'
import type { Assert, Equals } from '@kobato/utils/type-equals'
import type { z } from 'zod'

import { commentBaseDto } from '@kobato/api/contracts/comments'
import { withCommentBadgeTextColor } from '@kobato/server/domains/comments/badge'
import { entityPermalink, trimSiteSuffix } from '@kobato/server/domains/content/urls'

type _publicWireKeyParity = Assert<
  Equals<keyof z.infer<typeof commentBaseDto>, keyof Omit<CommentAndUser, 'ua' | 'ip' | 'email'>>
>

export function toLatestComment(row: PendingCommentRow): LatestComment {
  const slug = row.slug ?? ''
  const path = slug === '' ? '/' : `${entityPermalink(row.type, slug)}/`
  return {
    title: trimSiteSuffix(row.title),
    author: row.author ?? '',
    authorLink: row.authorLink ?? '',
    permalink: `${path}#user-comment-${row.id}`,
  }
}

function asString(value: number | string | null | undefined): string {
  if (typeof value === 'string') {
    return value
  }
  return String(value ?? '')
}

function asNullableString(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return typeof value === 'string' ? value : String(value)
}

function asIso(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) {
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
    content: row.content ?? null,
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
  const item = comment as CommentItem
  if (item.children !== undefined) {
    wire.children = item.children.map((c) => asCommentItemWire(c))
  }
  if (item.childrenTruncated !== undefined) {
    wire.childrenTruncated = item.childrenTruncated
  }
  if (item.childrenTotal !== undefined) {
    wire.childrenTotal = item.childrenTotal
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
