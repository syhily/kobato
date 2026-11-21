import type { Database } from '@kobato/db/database'

import { comment } from '@kobato/db/schema/comment'
import { user } from '@kobato/db/schema/user'
import { commentWithUser } from '@kobato/server/domains/comments/repos/shared'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'

export async function findCommentWithUserById(db: Database, id: number) {
  const rows = await db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function findCommentsByIds(db: Database, ids: number[]) {
  if (ids.length === 0) {
    return []
  }
  return db
    .select(commentWithUser)
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(inArray(comment.id, ids))
}

export async function countApprovedRepliesOfComment(db: Database, commentId: number): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.rid, commentId), eq(comment.isPending, false), isNull(comment.deletedAt)))
  return rows[0]?.count ?? 0
}
