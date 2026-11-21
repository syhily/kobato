import type { Database } from '@kobato/db/database'
import type { Comment, NewComment } from '@kobato/db/types'

import { comment } from '@kobato/db/schema/comment'
import { and, eq } from 'drizzle-orm'

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
