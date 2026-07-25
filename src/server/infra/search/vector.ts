import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, cosineDistance, desc, eq, gt, sql } from 'drizzle-orm'

import type { SearchSettings } from '@/shared/config/types'

import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'
import { runLikeSearch } from '@/server/infra/search/like'
import { generateEmbedding } from '@/server/infra/search/openai'

// Vector mode — cosine similarity over the stored embeddings, merged with
// a parallel LIKE-recall query so verbatim substring hits are never lost
// below the similarity threshold.

export function vectorSimilarity(embedding: number[]): SQL<number> {
  return sql<number>`1 - (${cosineDistance(postSearchIndex.embedding, embedding)})`
}

export function vectorWhere(baseWhere: SQL, similarity: SQL<number>, threshold: number): SQL | undefined {
  return and(baseWhere, gt(similarity, threshold))
}

export async function runVectorSearch(
  db: NodePgDatabase,
  settings: SearchSettings['search'],
  baseWhere: SQL,
  query: string,
): Promise<string[]> {
  if (!settings.enabled) {
    return runLikeSearch(db, baseWhere, query)
  }

  const embedding = await generateEmbedding(db, query)
  getLogger('search.vector').info('Search vector query', {
    query,
    hasEmbedding: embedding !== null,
    dimensions: embedding?.length ?? 0,
    threshold: settings.similarityThreshold,
  })

  if (embedding === null) {
    // Embedding generation failed → LIKE recall only.
    return runLikeSearch(db, baseWhere, query)
  }

  const similarity = vectorSimilarity(embedding)
  const [vectorRows, likeSlugs] = await Promise.all([
    db
      .select({ slug: post.slug, similarity })
      .from(post)
      .leftJoin(postSearchIndex, eq(post.id, postSearchIndex.postId))
      .where(vectorWhere(baseWhere, similarity, settings.similarityThreshold))
      .orderBy(desc(similarity)),
    runLikeSearch(db, baseWhere, query),
  ])

  getLogger('search.vector').info('Search vector results', {
    query,
    rawRows: vectorRows.length,
    threshold: settings.similarityThreshold,
    topSimilarity: vectorRows[0]?.similarity ?? null,
  })

  // Merge: vector results first, then LIKE results deduplicated.
  const seen = new Set<string>()
  const merged: string[] = []
  for (const row of vectorRows) {
    if (!seen.has(row.slug)) {
      seen.add(row.slug)
      merged.push(row.slug)
    }
  }
  for (const slug of likeSlugs) {
    if (!seen.has(slug)) {
      seen.add(slug)
      merged.push(slug)
    }
  }
  return merged
}

// The similarity threshold and the embedding model both change the vector
// result set, so both are hashed (unlike in like/trgm modes).
export function vectorCacheKeyParts(settings: SearchSettings['search'], query: string): string[] {
  return [settings.mode, query, String(settings.similarityThreshold), settings.model]
}
