import type { Database } from '@kobato/server/infra/db/database'
import type { SQL } from 'drizzle-orm'

import { postSearchIndex } from '@kobato/server/infra/db/schema/content'
import { post } from '@kobato/server/infra/db/schema/post'
import { getLogger } from '@kobato/server/infra/logger'
import { corpusLikeDisjuncts } from '@kobato/server/infra/search/corpus'
import { and, desc, eq, or } from 'drizzle-orm'

// LIKE search — verbatim substring match over the corpus, newest first.
// The only search mode: vector and trigram drivers were removed.

export function likeWhere(baseWhere: SQL, query: string): SQL | undefined {
  return and(baseWhere, or(...corpusLikeDisjuncts(query)))
}

export async function runLikeSearch(db: Database, baseWhere: SQL, query: string): Promise<string[]> {
  const rows = await db
    .select({ slug: post.slug })
    .from(post)
    .leftJoin(postSearchIndex, eq(post.id, postSearchIndex.postId))
    .where(likeWhere(baseWhere, query))
    .orderBy(desc(post.publishedAt))

  getLogger('search.like').info('Search LIKE results', {
    query,
    rawRows: rows.length,
  })

  return rows.map((r) => r.slug)
}

// Only the query changes a LIKE result set.
export function likeCacheKeyParts(query: string): string[] {
  return [query]
}
