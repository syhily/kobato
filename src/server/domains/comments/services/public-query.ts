import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { CommentAndUser, CommentItem, Comments, LatestComment } from '@/server/domains/comments/types'
import type { EntityTarget } from '@/server/infra/db/target'

import { userSession } from '@/server/domains/auth/primitives'
import { hasAtLeast } from '@/server/domains/auth/rbac'
import { withCommentBadgeTextColor } from '@/server/domains/comments/badge'
import {
  adminUserIds,
  commentsByIds,
  countCommentsAndRoots,
  findChildComments,
  findRootComments,
  latestDistinctCommentIds,
  pendingComments as pendingCommentsRepo,
} from '@/server/domains/comments/repos/public-query'
import { toLatestComment, ensureCommentPage } from '@/server/domains/comments/services/shared'
import { getLogger } from '@/server/infra/logger'
import { getSidebarWidgetCount, requireBlogSettingsSection } from '@/shared/config/blog'
import { idFromString } from '@/shared/utils/id'
import { groupBy } from '@/shared/utils/tools'

const log = getLogger('comments.parse')

export async function pendingComments(): Promise<LatestComment[]> {
  const rows = await pendingCommentsRepo(getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentComments'))
  return rows.map(toLatestComment)
}

export async function latestComments(): Promise<LatestComment[]> {
  const limit = getSidebarWidgetCount(requireBlogSettingsSection('sidebar'), 'recentComments')
  const ids = await adminUserIds()
  const distinctIds = await latestDistinctCommentIds(ids, limit)
  const rows = await commentsByIds(distinctIds, limit)
  return rows.map(toLatestComment)
}

export async function loadComments(
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
    ensurePage ? ensureCommentPage(target) : Promise.resolve(null),
    countCommentsAndRoots(target, pendingArray, currentUserId),
    findRootComments(target, pendingArray, offset, requireBlogSettingsSection('comments').comments.size, currentUserId),
  ])
  const childComments = await findChildComments(
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

export async function parseComments(comments: CommentAndUser[]): Promise<CommentItem[]> {
  const MAX_RID_WALK = 256
  const byId = new Map<string, CommentAndUser>()
  for (const c of comments) {
    byId.set(String(c.id), c)
  }

  const rewritten: CommentAndUser[] = []
  for (const c of comments) {
    if (c.deleteAt !== null) {
      continue
    }
    let nextRid = c.rid
    const ownIdNumeric = Number(c.id)
    const seen = new Set<number>()
    if (Number.isFinite(ownIdNumeric)) {
      seen.add(ownIdNumeric)
    }
    let walked = 0
    for (let i = 0; i < MAX_RID_WALK; i++) {
      walked = i + 1
      if (nextRid === 0 || nextRid === null || nextRid === undefined) {
        walked = -1
        break
      }
      if (seen.has(nextRid)) {
        nextRid = 0
        walked = -1
        break
      }
      seen.add(nextRid)
      const parent = byId.get(String(nextRid))
      if (parent === undefined) {
        nextRid = 0
        walked = -1
        break
      }
      if (parent.deleteAt === null) {
        walked = -1
        break
      }
      nextRid = parent.rid
    }
    if (walked >= MAX_RID_WALK) {
      log.warn('comment rid walk hit MAX_RID_WALK limit, truncating to root', {
        commentId: c.id,
        limit: MAX_RID_WALK,
      })
      nextRid = 0
    }
    rewritten.push({ ...c, rid: nextRid })
  }

  const projected = rewritten.map((comment) => ({
    ...withCommentBadgeTextColor(comment),
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
