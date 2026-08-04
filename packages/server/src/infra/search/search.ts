import type { Database } from '@kobato/server/infra/db/database'
import type { SQL } from 'drizzle-orm'

import { getCounter, through } from '@kobato/server/infra/cache/registry'
import { getLogger } from '@kobato/server/infra/logger'
import { likeCacheKeyParts, runLikeSearch } from '@kobato/server/infra/search/like'

// Search-result cache
//
// The full ordered slug list for a query is cached so pagination never
// re-runs the database query. The cache key incorporates every input
// that could change the result set:
//   - the cache generation (a `kv_cache` counter owned by the
//     `searchResult` cache declaration — bumping it orphans every entry
//     stamped with an older generation, so invalidation never enumerates
//     keys)
//   - the query itself — search is LIKE-only, so nothing else varies
//     the result set
//
// Value is the slug array itself — short strings, negligible overhead.
// Empty result sets are never cached (cacheWhen on the declaration).

// The visibility gate is supplied by the caller (infra has zero business
// knowledge — the "live" rule lives in `@kobato/server/domains/content/schemas/live-gate`).
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
