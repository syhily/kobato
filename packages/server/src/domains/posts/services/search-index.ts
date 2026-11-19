import type { Database } from '@kobato/db/database.ts'
import type { ContentRow } from '@kobato/db/types.ts'

import { postSearchIndex } from '@kobato/db/schema/content.ts'
import { lexicalEditorStateSchema } from '@kobato/lexical/schema.ts'
import { computeBodyText } from '@kobato/server/infra/lexical/lexical-projection.ts'
import { eq } from 'drizzle-orm'

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

export function removePostIndex(db: Database, postId: number): void {
  db.delete(postSearchIndex).where(eq(postSearchIndex.postId, postId)).run()
}
