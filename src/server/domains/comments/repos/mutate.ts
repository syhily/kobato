import { and, eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { Comment, NewComment } from '@/server/infra/db/types'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { comment } from '@/server/infra/db/schema/comment'

// Cache-invalidation invariant: every comment mutation emits
// `{ entity: 'comment' }` here, inside the repo, so no caller can forget it.
// Sync (node:sqlite): called inside the comment persist transaction.
export function insertComment(db: Database, values: NewComment): Comment | null {
  const res = db.insert(comment).values(values).returning().all()
  const row = res[0] ?? null
  if (row !== null) {
    invalidateContent(db, { entity: 'comment' })
  }
  return row
}

export async function updateCommentContent(db: Database, id: number, content: string): Promise<void> {
  await db.update(comment).set({ content }).where(eq(comment.id, id))
}

// Same inline invalidation as the moderation mutations; the optimistic-lock
// pair emits only when a row was actually updated (a 0-row conflict leaves caches alone).
export async function updateCommentBodyAndContent(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await db.update(comment).set({ body, content }).where(eq(comment.id, id))
  invalidateContent(db, { entity: 'comment' })
}

// Fresh-edit variant of `comment.updateOwn`: an in-grace-window owner edit
// rewrites body + projection without flipping `is_pending` or notifying admins.
export async function updateOwnCommentBody(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await db
    .update(comment)
    .set({ body, content, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  const affected = Number(result.changes)
  if (affected > 0) {
    invalidateContent(db, { entity: 'comment' })
  }
  return affected
}

// Re-pend variant of `comment.updateOwn`: an out-of-grace-window owner edit
// rewrites body + projection and flips the comment back into the queue.
// Moderator edits use `updateCommentBodyAndContent` so they never re-queue.
export async function updateOwnCommentBodyAndPending(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await db
    .update(comment)
    .set({ body, content, isPending: true, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  const affected = Number(result.changes)
  if (affected > 0) {
    invalidateContent(db, { entity: 'comment' })
  }
  return affected
}
