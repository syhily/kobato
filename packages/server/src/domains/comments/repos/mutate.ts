import type { Database } from '@kobato/server/infra/db/database'
import type { Comment, NewComment } from '@kobato/server/infra/db/types'

import { invalidateContent } from '@kobato/server/domains/content/invalidate'
import { comment } from '@kobato/server/infra/db/schema/comment'
import { and, eq } from 'drizzle-orm'

// Cache-invalidation invariant: every mutation that changes what the
// sidebar latest-comments list shows emits `{ entity: 'comment' }`
// through the content-invalidation door HERE, inside the repo mutation
// itself, so a caller can never forget it. Two controllers call these
// repos directly, bypassing the service layer — the repo is the only
// layer every write path crosses.
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

// Like the moderation mutations in `services/moderate.ts`, the mutations
// below emit the comment invalidation inline so no caller can forget
// it. The optimistic-lock pair emits only when a row was actually
// updated — a conflicting write (0 rows) leaves the caches alone,
// matching the historical service-level behaviour where the CONFLICT
// throw happened before the invalidation.
export async function updateCommentBodyAndContent(
  db: Database,
  id: number,
  body: unknown,
  content: string,
): Promise<void> {
  await db
    .update(comment)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the canonical body is the Lexical comment dialect (R5a)
    .set({ body: body as NewComment['body'], content })
    .where(eq(comment.id, id))
  invalidateContent(db, { entity: 'comment' })
}

// Fresh-edit variant of `comment.updateOwn`: an owner editing their own
// comment within the grace window (see `updateOwnComment` in
// `@/server/domains/comments/services/moderate`) gets to rewrite the
// PortableText body and its markdown projection in place, bumping
// `updated_at` but NOT flipping `is_pending`. The comment stays in
// whatever moderation state it was already in, and the admin
// notification is skipped.
export async function updateOwnCommentBody(
  db: Database,
  id: number,
  body: unknown,
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await db
    .update(comment)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    .set({ body: body as NewComment['body'], content, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  const affected = Number(result.changes)
  if (affected > 0) {
    invalidateContent(db, { entity: 'comment' })
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
  db: Database,
  id: number,
  body: unknown,
  content: string,
  expectedUpdatedAt: Date,
): Promise<number> {
  const result = await db
    .update(comment)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    .set({ body: body as NewComment['body'], content, isPending: true, updatedAt: new Date() })
    .where(and(eq(comment.id, id), eq(comment.updatedAt, expectedUpdatedAt)))
  const affected = Number(result.changes)
  if (affected > 0) {
    invalidateContent(db, { entity: 'comment' })
  }
  return affected
}
