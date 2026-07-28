import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq } from 'drizzle-orm'

import type { PortableTextBody } from '@/shared/pt/schema'

import { postSearchIndex } from '@/server/infra/db/schema/content'
import { bodyToPlainText } from '@/shared/pt/utils'

export async function indexPost(
  db: NodePgDatabase,
  postId: bigint,
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

export async function removePostIndex(db: NodePgDatabase, postId: bigint): Promise<void> {
  await db.delete(postSearchIndex).where(eq(postSearchIndex.postId, postId))
}
