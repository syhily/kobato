import { eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { ContentRow } from '@/server/infra/db/types'

import { postSearchIndex } from '@/server/infra/db/schema/content'
import { computeBodyText } from '@/server/infra/pt/lexical-projection'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'

// The indexed corpus is the save-time `body_text` projection (plan round
// R14): publish passes the freshly canonicalized Lexical state, the
// revision-row readers prefer the persisted column and only recompute when
// it is NULL.

export async function indexPost(
  db: Database,
  postId: number,
  title: string,
  summary: string,
  plainText: string,
): Promise<void> {
  await db
    .insert(postSearchIndex)
    .values({
      postId,
      plainText,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: postSearchIndex.postId,
      set: {
        plainText,
        updatedAt: new Date(),
      },
    })
}

/**
 * Index from a persisted revision row: the saved `body_text` column wins;
 * a NULL column falls back to computing the projection from the Lexical
 * body. Returns false for legacy PortableText rows (pre-R9a) — the R15
 * backfill converts and re-derives them.
 */
export async function indexPostFromRevision(
  db: Database,
  postId: number,
  title: string,
  summary: string,
  revision: ContentRow,
): Promise<boolean> {
  let plainText = revision.bodyText
  if (plainText === null) {
    const parsed = lexicalEditorStateSchema.safeParse(revision.body)
    if (!parsed.success) {
      return false
    }
    plainText = computeBodyText(parsed.data)
  }
  await indexPost(db, postId, title, summary, plainText)
  return true
}

// Sync (node:sqlite): called inside the delete transaction.
export function removePostIndex(db: Database, postId: number): void {
  db.delete(postSearchIndex).where(eq(postSearchIndex.postId, postId)).run()
}
