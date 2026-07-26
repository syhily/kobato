import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq, sql } from 'drizzle-orm'

import type { PortableTextBody } from '@/shared/pt/schema'

import { postSearchIndex } from '@/server/infra/db/schema/content'
import { getLogger } from '@/server/infra/logger'
import { corpusText } from '@/server/infra/search/corpus'
import { generateEmbedding } from '@/server/infra/search/openai'
import { bodyToPlainText } from '@/shared/pt/utils'

// pgvector column dimension. Must stay in sync with `postSearchIndex.embedding`
// in `@/server/infra/db/schema/content`.
const EMBEDDING_DIMENSIONS = 1536

function normalizeEmbedding(embedding: number[]): number[] {
  if (embedding.length === EMBEDDING_DIMENSIONS) {
    return embedding
  }
  if (embedding.length > EMBEDDING_DIMENSIONS) {
    getLogger('search.indexer').warn('Embedding truncated to target dimension', {
      postId: '<unknown>',
      original: embedding.length,
      target: EMBEDDING_DIMENSIONS,
    })
    return embedding.slice(0, EMBEDDING_DIMENSIONS)
  }
  // Pad with zeros — safe for cosine similarity because extra dimensions
  // contribute 0 to both dot-product and magnitude.
  getLogger('search.indexer').info('Embedding padded to target dimension', {
    original: embedding.length,
    target: EMBEDDING_DIMENSIONS,
  })
  return embedding.concat(Array.from({ length: EMBEDDING_DIMENSIONS - embedding.length }, () => 0))
}

export async function indexPost(
  db: NodePgDatabase,
  postId: bigint,
  title: string,
  summary: string,
  body: PortableTextBody,
): Promise<void> {
  const plainText = bodyToPlainText(body)
  const indexText = corpusText({ title, summary, plainText })

  const rawEmbedding = await generateEmbedding(db, indexText)

  getLogger('search.indexer').info('Embedding generated', {
    postId: String(postId),
    hasEmbedding: rawEmbedding !== null,
    dimensions: rawEmbedding?.length ?? 0,
  })

  const embedding = rawEmbedding ? normalizeEmbedding(rawEmbedding) : null

  await db
    .insert(postSearchIndex)
    .values({
      postId,
      plainText,
      embedding: embedding ?? sql`NULL`,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: postSearchIndex.postId,
      set: {
        plainText,
        embedding: embedding ?? sql`NULL`,
        updatedAt: new Date(),
      },
    })
}

export async function removePostIndex(db: NodePgDatabase, postId: bigint): Promise<void> {
  await db.delete(postSearchIndex).where(eq(postSearchIndex.postId, postId))
}
