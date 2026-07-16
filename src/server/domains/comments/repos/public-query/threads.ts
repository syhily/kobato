import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import type { EntityTarget } from '@/server/infra/db/target'

import { commentWithUser, whereTarget } from '@/server/domains/comments/repos/shared'
import { comment } from '@/server/infra/db/schema/comment'
import { user } from '@/server/infra/db/schema/user'

// Viewer-visibility predicate, shared by the three thread queries below. A
// row is visible when it falls inside the caller-visible pending set and
// has no pending delete request — or when it is the viewer's own comment
// still awaiting approval or deletion, so its author keeps seeing it with
// its moderation state.
function whereViewerVisible(pendingValues: boolean[], currentUserId?: bigint) {
  return or(
    and(inArray(comment.isPending, pendingValues), isNull(comment.deleteRequestedAt)),
    currentUserId !== undefined
      ? and(eq(comment.userId, currentUserId), or(eq(comment.isPending, true), isNotNull(comment.deleteRequestedAt)))
      : sql`1 = 0`,
  )
}

// Computes both totals in a single round-trip using a filtered aggregate so
// loaders don't issue two near-identical queries on every comment render.
export async function countCommentsAndRoots(
  db: NodePgDatabase,
  target: EntityTarget,
  pendingValues: boolean[],
  currentUserId?: bigint,
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
  return { total: Number(row.total), roots: Number(row.roots) }
}

export async function findRootComments(
  db: NodePgDatabase,
  target: EntityTarget,
  pendingValues: boolean[],
  offset: number,
  limit: number,
  currentUserId?: bigint,
) {
  const baseConditions = [whereTarget(target), eq(comment.rootId, 0n), whereViewerVisible(pendingValues, currentUserId)]
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
  db: NodePgDatabase,
  target: EntityTarget,
  pendingValues: boolean[],
  rootIds: bigint[],
  currentUserId?: bigint,
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

export async function findCommentRootId(db: NodePgDatabase, id: bigint): Promise<bigint | null> {
  const rows = await db.select({ rootId: comment.rootId }).from(comment).where(eq(comment.id, id)).limit(1)
  return rows[0]?.rootId ?? null
}
