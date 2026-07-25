import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq } from 'drizzle-orm'

import type { Comment, NewComment } from '@/server/infra/db/types'

import { clearLatestCommentsCache } from '@/server/domains/comments/cache'
import { comment } from '@/server/infra/db/schema/comment'

export async function insertComment(db: NodePgDatabase, values: NewComment): Promise<Comment | null> {
  const res = await db.insert(comment).values(values).returning()
  return res[0] ?? null
}

export async function updateCommentContent(db: NodePgDatabase, id: bigint, content: string): Promise<void> {
  await db.update(comment).set({ content }).where(eq(comment.id, id))
}

// Like `repos/moderation.ts`, the mutations below clear the sidebar
// latest-comments cache inline so no caller can forget it. The
// optimistic-lock pair clears only when a row was actually updated —
// a conflicting write (0 rows) leaves the cache alone, matching the
// historical service-level behaviour where the CONFLICT throw happened
// before the clear.
export async function updateCommentBodyAndContent(
  db: NodePgDatabase,
  id: bigint,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await db.update(comment).set({ body, content }).where(eq(comment.id, id))
  await clearLatestCommentsCache(db)
}

// Fresh-edit variant of `comment.updateOwn`: an owner editing their own
// comment within the grace window (see `updateOwnComment` in
// `@/server/domains/comments/moderation`) gets to rewrite the PortableText body and
// its markdown projection in place, bumping `updated_at` but NOT
// flipping `is_pending`. The comment stays in whatever moderation
// state it was already in, and the admin notification is skipped.
export async function updateOwnCommentBody(
  db: NodePgDatabase,
  id: bigint,
  body: NewComment['body'],
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await db
    .update(comment)
    .set({ body, content, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  const affected = result.rowCount ?? 0
  if (affected > 0) {
    await clearLatestCommentsCache(db)
  }
  return affected
}

// Re-pend variant of `comment.updateOwn`: when an owner edits their own
// comment OUTSIDE the grace window, in addition to rewriting the
// PortableText body and its markdown projection, flip the comment back
// into the moderation queue (`is_pending = true`) and bump
// `updated_at`. The admin-side edit path keeps using
// `updateCommentBodyAndContent` so a moderator's edit does not
// re-queue an already-approved comment.
export async function updateOwnCommentBodyAndPending(
  db: NodePgDatabase,
  id: bigint,
  body: NewComment['body'],
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await db
    .update(comment)
    .set({ body, content, isPending: true, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  const affected = result.rowCount ?? 0
  if (affected > 0) {
    await clearLatestCommentsCache(db)
  }
  return affected
}
