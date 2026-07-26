import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'

import type { SearchSettings } from '@/shared/config/types'

import { getCounter, through } from '@/server/infra/cache/registry'
import { getLogger } from '@/server/infra/logger'
import { INFRA_SEARCH_DEFAULTS } from '@/server/infra/search/defaults'
import { likeCacheKeyParts, runLikeSearch } from '@/server/infra/search/like'
import { runTrgmSearch, trgmCacheKeyParts } from '@/server/infra/search/trgm'
import { runVectorSearch, vectorCacheKeyParts } from '@/server/infra/search/vector'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

function getSearchSettings(): SearchSettings['search'] {
  const bundle = getBlogSettingsBundleSync()
  return bundle?.search?.search ?? INFRA_SEARCH_DEFAULTS
}

// pg_trgm availability probe
//
// The extension can only appear or disappear via a migration, and
// migrations run at boot — so the probe result is cached for the
// process lifetime. A failed probe (transient connection issue) is NOT
// cached: the next search retries.
let trgmAvailability: Promise<boolean> | null = null
let trgmFallbackWarned = false

function probeTrgmAvailability(db: NodePgDatabase): Promise<boolean> {
  trgmAvailability ??= db
    .execute(sql`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`)
    .then((result) => result.rows.length > 0)
    .catch((error: unknown) => {
      trgmAvailability = null
      getLogger('search.trgm').error('pg_trgm availability probe failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    })
  return trgmAvailability
}

/**
 * Test-only seam: force the cached probe result (`true` / `false`) or
 * clear it (`null` → next search re-probes). Also re-arms the one-time
 * fallback warning so tests can observe it again.
 */
export function __setTrgmAvailabilityForTests(available: boolean | null): void {
  trgmAvailability = available === null ? null : Promise.resolve(available)
  trgmFallbackWarned = false
}

// Search-result cache
//
// The full ordered slug list for a query is cached so pagination never
// re-runs the embedding API or the database query. The cache key
// incorporates every input that could change the result set:
//   - the cache generation (a `kv_cache` counter owned by the
//     `searchResult` cache declaration — bumping it orphans every entry
//     stamped with an older generation, so invalidation never enumerates
//     keys)
//   - the active mode's key parts, owned by its mode module
//     (`infra/search/{like,trgm,vector}.ts`): the mode, the query, and
//     exactly the settings knobs that mode's result set depends on
//     (similarity threshold + embedding model for vector, trigram
//     threshold for trgm, none for like)
//
// Value is the slug array itself — short strings, negligible overhead.
// Empty result sets are never cached (cacheWhen on the declaration).

function cacheKeyParts(settings: SearchSettings['search'], query: string): string[] {
  switch (settings.mode) {
    case 'vector':
      return vectorCacheKeyParts(settings, query)
    case 'trgm':
      return trgmCacheKeyParts(settings, query)
    case 'like':
      return likeCacheKeyParts(settings, query)
  }
}

// Core search execution (no pagination — returns the full ordered list).
// Dispatches to the active mode's module; every fallback path lands on
// the LIKE recall floor.

async function executeSearch(
  db: NodePgDatabase,
  settings: SearchSettings['search'],
  baseWhere: SQL,
  query: string,
): Promise<string[]> {
  // --- Trigram mode ---
  if (settings.mode === 'trgm') {
    if (await probeTrgmAvailability(db)) {
      return runTrgmSearch(db, baseWhere, query, settings.trgmThreshold)
    }

    // Extension missing (or probe failed) — degrade to LIKE, warn once.
    if (!trgmFallbackWarned) {
      trgmFallbackWarned = true
      getLogger('search.trgm').warn('pg_trgm extension unavailable — trgm search mode degrading to LIKE', {
        query,
      })
    }
    return runLikeSearch(db, baseWhere, query)
  }

  // --- Vector mode ---
  if (settings.mode === 'vector') {
    return runVectorSearch(db, settings, baseWhere, query)
  }

  // --- LIKE mode ---
  return runLikeSearch(db, baseWhere, query)
}

// Public API

// The visibility gate is supplied by the caller (infra has zero business
// knowledge — the "live" rule lives in `@/server/domains/content/schemas/live-gate`).
export async function searchPosts(
  db: NodePgDatabase,
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

  const settings = getSearchSettings()
  const generation = await getCounter(db, 'searchResult')
  const allSlugs = await through(
    db,
    'searchResult',
    { generation, parts: cacheKeyParts(settings, trimmed) },
    () => executeSearch(db, settings, baseWhere, trimmed),
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
