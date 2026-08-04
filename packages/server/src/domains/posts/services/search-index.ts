import type { Database } from '@kobato/server/infra/db/database'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { postSearchIndex } from '@kobato/server/infra/db/schema/content'
import { bodyToPlainText } from '@kobato/shared/lexical/walk'
import { eq } from 'drizzle-orm'

export async function indexPost(
  db: Database,
  postId: number,
  title: string,
  summary: string,
  body: LexicalBody,
): Promise<void> {
  const plainText = bodyToPlainText(body)

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

// Sync (node:sqlite): called inside the delete transaction.
export function removePostIndex(db: Database, postId: number): void {
  db.delete(postSearchIndex).where(eq(postSearchIndex.postId, postId)).run()
}
