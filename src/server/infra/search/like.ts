import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, or } from 'drizzle-orm'

import type { SearchSettings } from '@/shared/config/types'

import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'
import { corpusIlikeDisjuncts } from '@/server/infra/search/corpus'

// LIKE mode — verbatim substring match over the corpus, newest first.
// Also the recall floor for the trgm-degraded and vector-fallback paths.

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

// Nothing beyond the mode and the query changes a LIKE result set — in
// particular the vector similarity threshold must NOT be hashed here.
export function likeCacheKeyParts(settings: SearchSettings['search'], query: string): string[] {
  return [settings.mode, query]
}
