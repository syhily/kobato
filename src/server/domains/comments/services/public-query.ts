import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { EntityTarget } from '@/server/infra/db/target'
import type { CommentAndUser, CommentItem, Comments, LatestComment } from '@/shared/types/comments'

import { userSession } from '@/server/domains/auth/primitives'
import { toLatestComment } from '@/server/domains/comments/projection'
import { countApprovedCommentsByUser } from '@/server/domains/comments/repos/public-query/by-id'
import {
  adminUserIds,
  commentsByIds,
  latestDistinctCommentIds,
  pendingComments as pendingCommentsRepo,
} from '@/server/domains/comments/repos/public-query/digest'
import {
  countCommentsAndRoots,
  findChildComments,
  findRootComments,
} from '@/server/domains/comments/repos/public-query/threads'
import { ensureCommentPage } from '@/server/domains/comments/services/shared'
import { through } from '@/server/infra/cache/registry'
import { getLogger } from '@/server/infra/logger'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount } from '@/shared/config/utils'
import { idFromString } from '@/shared/utils/id'
import { hasAtLeast } from '@/shared/utils/roles'
import { groupBy } from '@/shared/utils/tools'

const log = getLogger('comments.parse')

export async function pendingComments(db: NodePgDatabase): Promise<LatestComment[]> {
  const rows = await pendingCommentsRepo(
    db,
    getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentComments'),
  )
  return rows.map(toLatestComment)
}

/**
 * Whether the user has at least one approved (non-pending) comment —
 * the "established commenter" rule consumed cross-domain, e.g. by the
 * signin flow that lets an anonymous commenter claim their account via
 * password reset.
 */
export async function hasApprovedComments(db: NodePgDatabase, userId: bigint): Promise<boolean> {
  return (await countApprovedCommentsByUser(db, userId)) >= 1
}

export async function latestComments(db: NodePgDatabase): Promise<LatestComment[]> {
  return through(db, 'comments', {}, async () => {
    const limit = getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentComments')
    const ids = await adminUserIds(db)
    const distinctIds = await latestDistinctCommentIds(db, ids, limit)
    const rows = await commentsByIds(db, distinctIds, limit)
    return rows.map(toLatestComment)
  })
}

export async function loadComments(
  db: NodePgDatabase,
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

/**
 * Walk the `rid` chain to find the nearest visible ancestor.
 * Soft-deleted parents are transparent: we resolve through them so the
 * thread doesn't break when a middle comment is removed.
 * Returns 0 when the root is reached or the chain is broken.
 */
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
    const commentIdNumeric = Number(c.id)
    const resolvedRid = Number.isFinite(commentIdNumeric) ? resolveVisibleParentRid(commentIdNumeric, c.rid, byId) : 0
    rewritten.push({ ...c, rid: resolvedRid })
  }

  const projected = rewritten.map((comment) => ({
    ...comment,
    content: null,
  }))
  const childComments = groupBy(
    projected.filter((comment) => !rootCommentFilter(comment)),
    (c) => String(c.rid),
  )

  return projected.filter(rootCommentFilter).map((comment) => commentItems(comment, childComments))
}

function rootCommentFilter(comment: CommentAndUser): boolean {
  return comment.rid === 0 || comment.rid === null || comment.rid === undefined
}

function commentItems(comment: CommentAndUser, childComments: Record<string, CommentAndUser[]>): CommentItem {
  const children = childComments[`${comment.id}`]
  if (children === undefined) {
    return comment
  }

  return { ...comment, children: children.map((child) => commentItems(child, childComments)) }
}
