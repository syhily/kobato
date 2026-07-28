import { and, count, eq, inArray, isNull } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { commentWithUser } from '@/server/domains/comments/repos/shared'
import { comment } from '@/server/infra/db/schema/comment'
import { user } from '@/server/infra/db/schema/user'

/**
 * By-id comment lookups mounted by the HTTP controllers (moderation,
 * ownership checks, token flows) — the comments domain's sanctioned
 * single-comment read surface.
 */
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
    .where(and(eq(comment.rid, Number(commentId)), eq(comment.isPending, false), isNull(comment.deletedAt)))
  return rows[0]?.count ?? 0
}
