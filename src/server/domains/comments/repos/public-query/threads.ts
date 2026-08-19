import { and, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityTarget } from '@/server/infra/db/target'

import { commentWithUser, whereTarget } from '@/server/domains/comments/repos/shared'
import { comment } from '@/server/infra/db/schema/comment'
import { user } from '@/server/infra/db/schema/user'

// Viewer-visibility predicate: caller-visible pending rows without a delete
// request, or the viewer's own pending/delete-requested comment.
function whereViewerVisible(pendingValues: boolean[], currentUserId?: number) {
  return or(
    and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
    currentUserId !== undefined
      ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
      : sql`1 = 0`,
  )
}

// Both totals in one round-trip via a filtered aggregate.
export async function countCommentsAndRoots(
  db: Database,
  target: EntityTarget,
  pendingValues: boolean[],
  currentUserId?: number,
): Promise<{ total: number; roots: number }> {
  const baseConditions = [whereTarget(target), whereViewerVisible(pendingValues, currentUserId)]
  const rows = await db
    .select({
      total: count(),
      roots: sql<number>`COUNT(*) FILTER (WHERE ${comment.rootId} = 0)`,
    })
    .from(comment)
    .where(and(...baseConditions))
  const row = rows[0]
  return { total: row.total, roots: row.roots }
}

export async function findRootComments(
  db: Database,
  target: EntityTarget,
  pendingValues: boolean[],
  offset: number,
  limit: number,
  currentUserId?: number,
) {
  const baseConditions = [whereTarget(target), eq(comment.rootId, 0), whereViewerVisible(pendingValues, currentUserId)]
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...baseConditions))
    .limit(limit)
    .orderBy(desc(comment.createdAt), desc(comment.id))
    .offset(offset)
}

export async function findChildComments(
  db: Database,
  target: EntityTarget,
  pendingValues: boolean[],
  rootIds: number[],
  currentUserId?: number,
) {
  if (rootIds.length === 0) {
    return []
  }
  const baseConditions = [
    whereTarget(target),
    inArray(comment.rootId, rootIds),
    whereViewerVisible(pendingValues, currentUserId),
  ]
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(and(...baseConditions))
}

export async function findCommentRootId(db: Database, id: number): Promise<number | null> {
  const rows = await db.select({ rootId: comment.rootId }).from(comment).where(eq(comment.id, id)).limit(1)
  return rows[0]?.rootId ?? null
}
