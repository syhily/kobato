import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import { db } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema'

export async function approveCommentById(id: bigint): Promise<void> {
  await db.update(comment).set({ isPending: false }).where(eq(comment.id, id))
}

export async function deleteCommentById(id: bigint): Promise<void> {
  await db.delete(comment).where(eq(comment.id, id))
}

export async function softDeleteCommentById(id: bigint): Promise<void> {
  await db.update(comment).set({ deletedAt: new Date() }).where(eq(comment.id, id))
}

export async function bulkApprovePendingByUser(userId: bigint): Promise<number> {
  // Returns the number of pending comments that were just approved.
  const updated = await db
    .update(comment)
    .set({ isPending: false })
    .where(and(eq(comment.userId, userId), eq(comment.isPending, true), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  return updated.length
}

export async function bulkSoftDeleteCommentsByUser(userId: bigint): Promise<number> {
  // Soft-deletion mirrors the per-row delete used by the existing admin
  // page. We avoid the hard `DELETE` so moderation actions remain
  // recoverable and downstream like-counts stay consistent.
  const updated = await db
    .update(comment)
    .set({ deletedAt: new Date() })
    .where(and(eq(comment.userId, userId), isNull(comment.deletedAt)))
    .returning({ id: comment.id })
  return updated.length
}

export async function requestDeleteComment(id: bigint, userId: bigint): Promise<void> {
  await db
    .update(comment)
    .set({ deleteRequestedAt: new Date(), deleteRequestedBy: userId })
    .where(and(eq(comment.id, id), isNull(comment.deletedAt)))
}

export async function clearDeleteRequest(id: bigint, userId: bigint): Promise<boolean> {
  const updated = await db
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

/**
 * Admin-side variant of {@link clearDeleteRequest}: clears the pending
 * delete request regardless of who originated it. Used by the
 * "reject delete request" admin action.
 */
export async function adminClearDeleteRequest(id: bigint): Promise<boolean> {
  const updated = await db
    .update(comment)
    .set({ deleteRequestedAt: null, deleteRequestedBy: null })
    .where(and(eq(comment.id, id), isNotNull(comment.deleteRequestedAt)))
    .returning({ id: comment.id })
  return updated.length > 0
}
