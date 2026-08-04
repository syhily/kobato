// Wire-projection helpers for comment payloads.
//
// Drizzle types `comment.id` / `userId` / `ownerId` / `rootId` as
// `bigint` and timestamps as `Date`, neither of which survives
// `JSON.stringify` in the shape the wire DTOs declare. The contract DTOs
// in `@kobato/shared/contracts/comments` model the wire shape — `string` ids,
// ISO timestamps — which is what consumers expect over the network.
//
// These helpers do the projection explicitly and are idempotent:
// pre-converted values (`id` already a string) pass straight through.

import type { PendingCommentRow } from '@kobato/server/domains/comments/repos/shared'
import type { AdminCommentWire, CommentItemWire } from '@kobato/shared/contracts/comments'
import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { AdminComment, CommentAndUser, CommentItem, LatestComment } from '@kobato/shared/types/comments'

import { withCommentBadgeTextColor } from '@kobato/server/domains/comments/badge'
import { validatePortableTextBody } from '@kobato/shared/legacy-pt/utils'
import { parseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { convertPtBodyToLexical } from '@kobato/shared/lexical/mapping'
import { entityPermalink, trimSiteSuffix } from '@kobato/shared/utils/paths'

// DUAL-SHAPE comment body read until the data migration (R6):
// pre-migration rows hold the PT shape (`Array.isArray`) — converted
// through the one-way PT→Lexical mapping — post-migration rows the
// Lexical shape. Invalid/corrupt values fall back to an empty comment
// body (the wire dialect admits zero blocks), so a bad row never takes
// the whole comments response down.
const EMPTY_COMMENT_BODY: LexicalCommentBody = {
  root: { direction: null, format: '', indent: 0, type: 'root', version: 1, children: [] },
}

export function readCommentBody(value: unknown): LexicalCommentBody {
  if (value === null || value === undefined) {
    return EMPTY_COMMENT_BODY
  }
  if (Array.isArray(value)) {
    try {
      // Gate the converted body through the comment dialect (the one-way
      // mapping emits the full body dialect; comments may only carry the
      // subset).
      return parseLexicalCommentBody(convertPtBodyToLexical(validatePortableTextBody(value)))
    } catch {
      return EMPTY_COMMENT_BODY
    }
  }
  try {
    return parseLexicalCommentBody(value)
  } catch {
    return EMPTY_COMMENT_BODY
  }
}

/** Project a sidebar/digest row into the `LatestComment` wire shape. */
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
    body: readCommentBody(row.body),
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
  // Thread-cap markers set by `parseComments` ride the wire verbatim.
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
