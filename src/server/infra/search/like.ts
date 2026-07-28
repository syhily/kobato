import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, or } from 'drizzle-orm'

import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'
import { corpusIlikeDisjuncts } from '@/server/infra/search/corpus'

// LIKE search — verbatim substring match over the corpus, newest first.
// The only search mode: vector and trigram drivers were removed.

export function likeWhere(baseWhere: SQL, query: string): SQL | undefined {
  return and(baseWhere, or(...corpusIlikeDisjuncts(query)))
}

export async function runLikeSearch(db: NodePgDatabase, baseWhere: SQL, query: string): Promise<string[]> {
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
