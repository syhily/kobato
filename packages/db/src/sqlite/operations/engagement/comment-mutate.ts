import type { Database } from '@kobato/db/sqlite/database'
import type { Comment, NewComment } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { comment } from '@kobato/db/sqlite/schema/comment'
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm'

/**
 * Inserts a comment inside one transaction, resolving its pending flag from the author's approved-comment count
 * (first comment is always pending).
 */
export function insertCommentWithPendingGate(db: Database, values: NewComment): Comment | null {
  return sqliteOf(db).transaction((tx) => {
    const approvedRows = tx
      .select({ count: count() })
      .from(comment)
      .where(and(eq(comment.userId, values.userId as number), eq(comment.isPending, false)))
      .all()
    const approvedCount = approvedRows[0]?.count ?? 0
    const isPending = approvedCount === 0
    const rows = tx
      .insert(comment)
      .values({ ...values, isPending })
      .returning()
      .all()
    return rows[0] ?? null
  })
}

export function insertComment(db: Database, values: NewComment): Comment | null {
  const res = sqliteOf(db).insert(comment).values(values).returning().all()
  return res[0] ?? null
}

export async function updateCommentBodyAndContent(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await sqliteOf(db).update(comment).set({ body, content }).where(eq(comment.id, id))
}

export async function updateOwnCommentBody(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await sqliteOf(db)
    .update(comment)
    .set({ body, content, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  return Number(result.changes)
}

export async function updateOwnCommentBodyAndPending(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await sqliteOf(db)
    .update(comment)
    .set({ body, content, isPending: true, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  return Number(result.changes)
}

export async function approveCommentById(db: Database, id: number): Promise<void> {
  await sqliteOf(db).update(comment).set({ isPending: false }).where(eq(comment.id, id))
}

export async function deleteCommentById(db: Database, id: number): Promise<void> {
  await sqliteOf(db).delete(comment).where(eq(comment.id, id))
}

export async function softDeleteCommentById(db: Database, id: number): Promise<void> {
  await sqliteOf(db).update(comment).set({ deletedAt: new Date() }).where(eq(comment.id, id))
}

export async function bulkApprovePendingByUser(db: Database, userId: number): Promise<number> {
  const updated = await sqliteOf(db)
    .update(comment)
    .set({ isPending: false })
    .where(and(eq(comment.userId, userId), eq(comment.isPending, true), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  return updated.length
}

export async function bulkSoftDeleteCommentsByUser(db: Database, userId: number): Promise<number> {
  const updated = await sqliteOf(db)
    .update(comment)
    .set({ deletedAt: new Date() })
    .where(and(eq(comment.userId, userId), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  return updated.length
}

export async function requestDeleteComment(db: Database, id: number, userId: number): Promise<void> {
  await sqliteOf(db)
    .update(comment)
    .set({ deleteRequestedAt: new Date(), deleteRequestedBy: userId })
    .where(and(eq(comment.id, id), isNull(comment.deletedAt)))
}

export async function clearDeleteRequest(db: Database, id: number, userId: number): Promise<boolean> {
  const updated = await sqliteOf(db)
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(
      and(
        eq(comment.id, id),
        eq(comment.deleteRequestedBy, userId),
        isNull(comment.deletedAt),
        isNotNull(comment.deleteRequestedAt),
      ),
    )
    .returning({ id: comment.id })
  return updated.length > 0
}

export async function adminClearDeleteRequest(db: Database, id: number): Promise<boolean> {
  const updated = await sqliteOf(db)
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(and(eq(comment.id, id), isNotNull(comment.deleteRequestedAt)))
    .returning({ id: comment.id })
  return updated.length > 0
}
