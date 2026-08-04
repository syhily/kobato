import type { ParentCommentRow } from '@kobato/server/domains/comments/repos/shared'
import type { Database } from '@kobato/server/infra/db/database'

import { comment } from '@kobato/server/infra/db/schema/comment'
import { user } from '@kobato/server/infra/db/schema/user'
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm'

// Sync (node:sqlite): called inside the comment persist transaction.
export function countApprovedCommentsByUser(db: Database, userId: number): number {
  const rows = db
    .select({ count: count() })
    .from(comment)
    .where(and(eq(comment.userId, userId), eq(comment.isPending, false)))
    .all()
  return rows.length > 0 ? rows[0].count : 0
}

export async function recentCommentsForUserDedupe(db: Database, userId: number, since: Date, limit: number) {
  return db
    .select({ contentHash: comment.contentHash })
    .from(comment)
    .where(and(eq(comment.userId, userId), gte(comment.createdAt, since)))
    .orderBy(desc(comment.createdAt), desc(comment.id))
    .limit(limit)
}

export async function findCommentWithSourceUser(db: Database, id: number) {
  const rows = await db
    .select()
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(eq(comment.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function findParentCommentsByIds(db: Database, ids: number[]): Promise<Map<string, ParentCommentRow>> {
  const out = new Map<string, ParentCommentRow>()
  if (ids.length === 0) {
    return out
  }
  const rows = await db
    .select({
      id: comment.id,
      userId: comment.userId,
      name: user.name,
      content: comment.content,
      deletedAt: comment.deletedAt,
    })
    .from(comment)
    .innerJoin(user, eq(comment.userId, user.id))
    .where(inArray(comment.id, ids))
  for (const r of rows) {
    out.set(String(r.id), {
      id: r.id,
      userId: r.userId,
      name: r.name,
      content: r.content ?? '',
      deletedAt: r.deletedAt ?? null,
    })
  }
  return out
}
