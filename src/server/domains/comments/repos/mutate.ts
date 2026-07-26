import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq } from 'drizzle-orm'

import type { Comment, NewComment } from '@/server/infra/db/types'

import { invalidateContent } from '@/server/domains/content/invalidate'
import { comment } from '@/server/infra/db/schema/comment'

// Cache-invalidation invariant: every mutation that changes what the
// sidebar latest-comments list shows emits `{ entity: 'comment' }`
// through the content-invalidation door HERE, inside the repo mutation
// itself, so a caller can never forget it. Two controllers call these
// repos directly, bypassing the service layer — the repo is the only
// layer every write path crosses.
export async function insertComment(db: NodePgDatabase, values: NewComment): Promise<Comment | null> {
  const res = await db.insert(comment).values(values).returning()
  const row = res[0] ?? null
  if (row !== null) {
    await invalidateContent(db, { entity: 'comment' })
  }
  return row
}

export async function updateCommentContent(db: NodePgDatabase, id: bigint, content: string): Promise<void> {
  await db.update(comment).set({ content }).where(eq(comment.id, id))
}

// Like the moderation mutations in `services/moderate.ts`, the mutations
// below emit the comment invalidation inline so no caller can forget
// it. The optimistic-lock pair emits only when a row was actually
// updated — a conflicting write (0 rows) leaves the caches alone,
// matching the historical service-level behaviour where the CONFLICT
// throw happened before the invalidation.
export async function updateCommentBodyAndContent(
  db: NodePgDatabase,
  id: bigint,
  body: NewComment['body'],
  content: string,
): Promise<void> {
  await db.update(comment).set({ body, content }).where(eq(comment.id, id))
  await invalidateContent(db, { entity: 'comment' })
}

// Fresh-edit variant of `comment.updateOwn`: an owner editing their own
// comment within the grace window (see `updateOwnComment` in
// `@/server/domains/comments/services/moderate`) gets to rewrite the
// PortableText body and its markdown projection in place, bumping
// `updated_at` but NOT flipping `is_pending`. The comment stays in
// whatever moderation state it was already in, and the admin
// notification is skipped.
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
    await invalidateContent(db, { entity: 'comment' })
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
    await invalidateContent(db, { entity: 'comment' })
  }
  return affected
}
