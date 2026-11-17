import { lexicalEditorStateSchema } from '@kobato/shared/lexical/schema.ts'
import { eq } from 'drizzle-orm'

import type { Database } from '../../../infra/db/database'
import type { ContentRow } from '../../../infra/db/types'

import { postSearchIndex } from '../../../infra/db/schema/content'
import { computeBodyText } from '../../../infra/pt/lexical-projection'

// The indexed corpus is the save-time `body_text` projection: publish passes
// the freshly canonicalized Lexical state, the revision-row readers prefer
// the persisted column and only recompute when it is NULL.

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
 * body. Returns false when the stored body is not a Lexical state.
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
