import type { Database } from '@kobato/db/database.ts'
import type { EntityTarget } from '@kobato/db/target.ts'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage.ts'
import type { BlogSettingsBundle } from '@kobato/shared/config/types.ts'
import type { CommentAndUser, CommentItem, Comments, LatestComment } from '@kobato/shared/types/comments.ts'

import { userSession } from '@kobato/server/domains/auth/primitives.ts'
import { toLatestComment } from '@kobato/server/domains/comments/projection.ts'
import { countApprovedCommentsByUser } from '@kobato/server/domains/comments/repos/public-query/by-id.ts'
import {
  adminUserIds,
  commentsByIds,
  latestDistinctCommentIds,
} from '@kobato/server/domains/comments/repos/public-query/digest.ts'
import {
  commentFingerprintRows,
  countCommentsAndRoots,
  findChildComments,
  findRootComments,
} from '@kobato/server/domains/comments/repos/public-query/threads.ts'
import { ensureCommentPage } from '@kobato/server/domains/comments/services/shared.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { getSidebarWidgetCount } from '@kobato/shared/config/utils.ts'
import { idFromString } from '@kobato/shared/utils/id.ts'
import { hasAtLeast } from '@kobato/shared/utils/roles.ts'
import { createHash } from 'node:crypto'

const log = getLogger('comments.parse')

/** "Established commenter" rule — consumed cross-domain, e.g. the signin
 *  flow's account claim for anonymous commenters. */
export async function hasApprovedComments(db: Database, userId: number): Promise<boolean> {
  return countApprovedCommentsByUser(db, userId) >= 1
}

/**
 * The latest-comments digest for the sidebar. `settings` is the request-pinned
 * snapshot (the caller's `context.settings`) — this function never reads the
 * process snapshot. A straight SQLite read: three small indexed queries.
 */
export async function latestComments(db: Database, settings: BlogSettingsBundle | null): Promise<LatestComment[]> {
  const limit = getSidebarWidgetCount(requireBlogSettingsSection('sidebar', settings), 'recentComments')
  const ids = await adminUserIds(db)
  const distinctIds = await latestDistinctCommentIds(db, ids, limit)
  const rows = await commentsByIds(db, distinctIds, limit)
  return rows.map(toLatestComment)
}

/** Stable digest of the target's public comment representation. Detail pages
 *  fold it into their ETag so comment edits cannot be hidden behind a 304.
 *  Truncated to 32 hex chars: the value ships inside public documents, which
 *  must stay free of 64-hex strings (the anonymous CSRF token's shape). */
export async function commentThreadFingerprint(db: Database, target: EntityTarget): Promise<string> {
  const rows = await commentFingerprintRows(db, target)
  const hash = createHash('sha256')
  for (const row of rows) {
    hash.update(JSON.stringify(row))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 32)
}

export async function loadComments(
  db: Database,
  session: BlogSession,
  target: EntityTarget,
  offset: number,
  options: { ensurePage?: boolean } = {},
): Promise<Comments | null> {
  const ensurePage = options.ensurePage ?? true
  const user = userSession(session)
  const role = user?.role ?? null
  const pendingArray: boolean[] = hasAtLeast(role, 'admin') ? [false, true] : [false]
  const currentUserId = user?.id ? idFromString(user.id) : undefined

  const [, counts, rootComments] = await Promise.all([
    ensurePage ? ensureCommentPage(db, target) : Promise.resolve(null),
    countCommentsAndRoots(db, target, pendingArray, currentUserId),
    findRootComments(
      db,
      target,
      pendingArray,
      offset,
      requireBlogSettingsSection('comments').comments.size,
      currentUserId,
    ),
  ])
  const childComments = await findChildComments(
    db,
    target,
    pendingArray,
    rootComments.map((c) => c.id),
    currentUserId,
  )

  return {
    count: counts.total,
    roots_count: counts.roots,
    comments: [...rootComments, ...childComments],
  }
}

const MAX_RID_WALK = 256

/** Reply-thread cap: truncated threads keep the earliest replies and are
 *  flagged `childrenTruncated`/`childrenTotal` (wire contract). */
export const MAX_THREAD_CHILDREN = 100

/** Walk the `rid` chain to the nearest visible ancestor; soft-deleted
 *  parents are transparent. Returns 0 at the root or a broken chain. */
function resolveVisibleParentRid(commentId: number, rid: number | null, byId: Map<string, CommentAndUser>): number {
  if (rid === 0 || rid === null || rid === undefined) {
    return 0
  }

  const seen = new Set<number>()
  seen.add(commentId)

  let nextRid: number | null = rid
  for (let step = 0; step < MAX_RID_WALK; step++) {
    if (nextRid === 0 || nextRid === null) {
      return 0
    }
    if (seen.has(nextRid)) {
      return 0
    }
    seen.add(nextRid)

    const parent = byId.get(String(nextRid))
    if (parent === undefined) {
      return 0
    }
    if (parent.deleteAt === null) {
      return nextRid
    }
    nextRid = parent.rid
  }

  log.warn('comment rid walk hit MAX_RID_WALK limit, truncating to root', {
    commentId,
    limit: MAX_RID_WALK,
  })
  return 0
}

export async function parseComments(comments: CommentAndUser[]): Promise<CommentItem[]> {
  const byId = new Map<string, CommentAndUser>()
  for (const c of comments) {
    byId.set(String(c.id), c)
  }

  const rewritten: CommentAndUser[] = []
  for (const c of comments) {
    if (c.deleteAt !== null) {
      continue
    }
    const commentIdNumeric = c.id
    const resolvedRid = Number.isFinite(commentIdNumeric) ? resolveVisibleParentRid(commentIdNumeric, c.rid, byId) : 0
    rewritten.push({ ...c, rid: resolvedRid })
  }

  const childComments = Object.groupBy(
    rewritten.filter((comment) => !rootCommentFilter(comment)),
    (c) => String(c.rid),
  )

  return rewritten.filter(rootCommentFilter).map((comment) => capThreadChildren(commentItems(comment, childComments)))
}

function rootCommentFilter(comment: CommentAndUser): boolean {
  return comment.rid === 0 || comment.rid === null || comment.rid === undefined
}

function commentItems(comment: CommentAndUser, childComments: Partial<Record<string, CommentAndUser[]>>): CommentItem {
  const children = childComments[`${comment.id}`]
  if (children === undefined) {
    return comment
  }

  return { ...comment, children: children.map((child) => commentItems(child, childComments)) }
}

function threadChildCount(comment: CommentItem): number {
  const children = comment.children ?? []
  return children.reduce((sum, child) => sum + 1 + threadChildCount(child), 0)
}

/** Keep the first `budget.remaining` descendants in pre-order (the order
 *  the reply query returned them), dropping the rest of the thread. */
function trimThreadChildren(comment: CommentItem, budget: { remaining: number }): CommentItem {
  if (comment.children === undefined) {
    return comment
  }
  if (budget.remaining <= 0) {
    return { ...comment, children: [] }
  }
  const children: CommentItem[] = []
  for (const child of comment.children) {
    if (budget.remaining <= 0) {
      break
    }
    budget.remaining -= 1
    children.push(trimThreadChildren(child, budget))
  }
  return { ...comment, children }
}

function capThreadChildren(root: CommentItem): CommentItem {
  const total = threadChildCount(root)
  if (total <= MAX_THREAD_CHILDREN) {
    return root
  }
  const trimmed = trimThreadChildren(root, { remaining: MAX_THREAD_CHILDREN })
  return { ...trimmed, childrenTruncated: true, childrenTotal: total }
}
