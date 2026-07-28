import { eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { PortableTextBody } from '@/shared/pt/schema'

import { postSearchIndex } from '@/server/infra/db/schema/content'
import { bodyToPlainText } from '@/shared/pt/utils'

export async function indexPost(
  db: Database,
  postId: number,
  title: string,
  summary: string,
  body: PortableTextBody,
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
