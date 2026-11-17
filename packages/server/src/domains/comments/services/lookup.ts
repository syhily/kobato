import { and, count, eq, inArray, isNull } from 'drizzle-orm'

import type { Database } from '../../../infra/db/database'

import { comment } from '../../../infra/db/schema/comment'
import { user } from '../../../infra/db/schema/user'
import { commentWithUser } from '../repos/shared'

/** By-id comment lookups — the domain's sanctioned single-comment read
 *  surface for controllers (moderation, ownership, token flows). */
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

/** Approved direct replies of one comment — the "has replies → no edit" guard. */
export async function countApprovedRepliesOfComment(db: Database, commentId: number): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.rid, commentId), eq(comment.isPending, false), isNull(comment.deletedAt)))
  return rows[0]?.count ?? 0
}
