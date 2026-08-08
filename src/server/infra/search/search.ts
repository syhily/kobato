import type { SQL } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'

import { getCounter, through } from '@/server/infra/cache/registry'
import { getLogger } from '@/server/infra/logger'
import { likeCacheKeyParts, runLikeSearch } from '@/server/infra/search/like'

// Search-result cache: the full ordered slug list per query, so pagination
// never re-runs the DB query. Key = generation + query; empty result sets
// are never cached (cacheWhen on the declaration).

// Visibility gate comes from the caller — infra has zero business knowledge.
export async function searchPosts(
  db: Database,
  baseWhere: SQL,
  query: string,
  limit: number,
  offset: number = 0,
): Promise<{
  hits: string[]
  page: number
  totalPages: number
}> {
  const trimmed = query.trim()
  if (trimmed === '') {
    return { hits: [], page: 1, totalPages: 0 }
  }

  const generation = await getCounter(db, 'searchResult')
  const allSlugs = await through(
    db,
    'searchResult',
    { generation, parts: likeCacheKeyParts(trimmed) },
    () => runLikeSearch(db, baseWhere, trimmed),
    {
      onHit: (cached) =>
        getLogger('search.result').info('Search result cache hit', {
          query: trimmed,
          total: cached.length,
        }),
    },
  )

  const hits = allSlugs.slice(offset, offset + limit)
  return {
    hits,
    page: Math.floor(offset / limit) + 1,
    totalPages: Math.ceil(allSlugs.length / Math.max(limit, 1)),
  }
}
