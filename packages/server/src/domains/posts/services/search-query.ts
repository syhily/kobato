import type { Database } from '@kobato/db/database.ts'
import type { SQL } from 'drizzle-orm'

import { likeEscape } from '@kobato/db/like-escape.ts'
import { postSearchIndex } from '@kobato/db/schema/content.ts'
import { post } from '@kobato/db/schema/post.ts'
import { getCounter, through } from '@kobato/server/infra/cache/registry.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { and, desc, eq, or, sql } from 'drizzle-orm'

/**
 * The single definition of which post text is searchable; the LIKE
 * disjuncts map over this list.
 */
const corpusFields = [post.title, post.summary, sql`COALESCE(${postSearchIndex.plainText}, '')`]

// Hidden posts are searchable; scheduled posts stay dev-only for authoring checks.
export function searchPostOptions(): { includeHidden: boolean; includeScheduled: boolean } {
  return { includeHidden: true, includeScheduled: import.meta.env.DEV }
}

function likeWhere(baseWhere: SQL, query: string): SQL | undefined {
  const disjuncts = corpusFields.map((field) => likeEscape(field, query))
  return and(baseWhere, or(...disjuncts))
}

async function runLikeSearch(db: Database, baseWhere: SQL, query: string): Promise<string[]> {
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

// Search-result cache: the full ordered slug list per query, so pagination
// never re-runs the DB query. Key = generation + query; empty result sets
// are never cached (cacheWhen on the declaration).

/**
 * Full ordered slug list for a query. The visibility gate is supplied by the
 * caller (`livePostWhere()` in the search loader) — this module owns the
 * searchable corpus, never the visibility policy.
 */
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

  const generation = await getCounter('searchResult')
  const allSlugs = await through(
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
