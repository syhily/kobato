import type { Database } from '@kobato/db/database'

import { searchPostSlugs } from '@kobato/db/operations/post-search'
import { getCounter, through } from '@kobato/server/infra/cache/registry'
import { getLogger } from '@kobato/server/infra/logger'

export function searchPostOptions(): { includeHidden: boolean; includeScheduled: boolean } {
  return { includeHidden: true, includeScheduled: import.meta.env.DEV }
}

async function runLikeSearch(db: Database, query: string): Promise<string[]> {
  const rows = await searchPostSlugs(db, query, searchPostOptions())

  getLogger('search.like').info('Search LIKE results', {
    query,
    rawRows: rows.length,
  })

  return rows
}

export function likeCacheKeyParts(query: string): string[] {
  return [query]
}

export async function searchPosts(
  db: Database,
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

  const generation = await getCounter('searchResult')
  const allSlugs = await through(
    'searchResult',
    { generation, parts: likeCacheKeyParts(trimmed) },
    () => runLikeSearch(db, trimmed),
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
