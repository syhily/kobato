import { eq } from 'drizzle-orm'

import type { Comment, NewComment } from '@/server/infra/db/types'

import { db } from '@/server/infra/db/pool'
import { comment } from '@/server/infra/db/schema'

export async function insertComment(values: NewComment): Promise<Comment | null> {
  const res = await db.insert(comment).values(values).returning()
  return res[0] ?? null
}

export async function updateCommentContent(id: bigint, content: string): Promise<void> {
  await db.update(comment).set({ content }).where(eq(comment.id, id))
}

export async function updateCommentBodyAndContent(
  id: bigint,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await db.update(comment).set({ body, content }).where(eq(comment.id, id))
}

// Fresh-edit variant of `comment.updateOwn`: an owner editing their own
// comment within the grace window (see `updateOwnComment` in
// `@/server/domains/comments/moderation`) gets to rewrite the PortableText body and
// its markdown projection in place, bumping `updated_at` but NOT
// flipping `is_pending`. The comment stays in whatever moderation
// state it was already in, and the admin notification is skipped.
export async function updateOwnCommentBody(id: bigint, body: NewComment['body'], content: string): Promise<void> {
  await db.update(comment).set({ body, content, updatedAt: new Date() }).where(eq(comment.id, id))
}

// Re-pend variant of `comment.updateOwn`: when an owner edits their own
// comment OUTSIDE the grace window, in addition to rewriting the
// PortableText body and its markdown projection, flip the comment back
// into the moderation queue (`is_pending = true`) and bump
// `updated_at`. The admin-side edit path keeps using
// `updateCommentBodyAndContent` so a moderator's edit does not
// re-queue an already-approved comment.
export async function updateOwnCommentBodyAndPending(
  id: bigint,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await db.update(comment).set({ body, content, isPending: true, updatedAt: new Date() }).where(eq(comment.id, id))
}
