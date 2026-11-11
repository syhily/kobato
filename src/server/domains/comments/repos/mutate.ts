import { and, eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { Comment, NewComment } from '@/server/infra/db/types'

import { comment } from '@/server/infra/db/schema/comment'

export function insertComment(db: Database, values: NewComment): Comment | null {
  const res = db.insert(comment).values(values).returning().all()
  return res[0] ?? null
}

export async function updateCommentBodyAndContent(
  db: Database,
  id: number,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await db.update(comment).set({ body, content }).where(eq(comment.id, id))
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
  return Number(result.changes)
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
  return Number(result.changes)
}
