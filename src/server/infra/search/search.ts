import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'

import type { SearchSettings } from '@/shared/config/types'

import { getItem, setItem } from '@/server/infra/cache/kv-store'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { getLogger } from '@/server/infra/logger'
import { INFRA_SEARCH_DEFAULTS } from '@/server/infra/search/defaults'
import { likeCacheKeyParts, runLikeSearch } from '@/server/infra/search/like'
import { runTrgmSearch, trgmCacheKeyParts } from '@/server/infra/search/trgm'
import { runVectorSearch, vectorCacheKeyParts } from '@/server/infra/search/vector'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { CACHE_BUCKET_FALLBACKS } from '@/shared/types/cache'

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
// re-runs the embedding API or the database query.  The cache key
// incorporates every input that could change the result set:
//   - cache generation (see below)
//   - the active mode's key parts, owned by its mode module
//     (`infra/search/{like,trgm,vector}.ts`): the mode, the query, and
//     exactly the settings knobs that mode's result set depends on
//     (similarity threshold + embedding model for vector, trigram
//     threshold for trgm, none for like)
//
// Value is the slug array itself (superjson envelope in the `value`
// JSONB column) — short strings, negligible overhead.
//
// Invalidation is a generation stamp, not key enumeration (getKeys caps
// the scan and would silently under-invalidate past the ceiling): every
// key carries a per-installation counter and bumping it makes all
// previously cached entries unreachable — they expire by TTL. Same
// namespace-rollover pattern as the feed cache (plans/003).

function searchCachePrefix(): string {
  const bundle = getBlogSettingsBundleSync()
  return bundle?.cache?.cache.searchResult?.prefix ?? CACHE_BUCKET_FALLBACKS.searchResult.prefix
}

function searchGenerationKey(): string {
  return `${searchCachePrefix()}generation`
}

// The generation is read once per process and cached in module state. A
// failed read is NOT cached (the next search retries) and falls back to
// generation 0 — a missing or unreadable counter must never break
// search. Single-instance self-host is the documented deploy target, so
// only this process bumps the counter and the cached value stays
// authoritative.
let searchCacheGeneration: Promise<number> | null = null

// The counter row lives in `kv_cache` at the `${prefix}generation` key
// with a raw integer JSONB in `value` and NULL `expires_at` (never
// swept). It deliberately bypasses `kv-store`'s `getItem`, which only
// decodes the superjson envelope and would read a raw scalar as a miss.
function parseGeneration(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

function readSearchCacheGeneration(db: NodePgDatabase): Promise<number> {
  searchCacheGeneration ??= db
    .select({ value: kvCache.value })
    .from(kvCache)
    .where(
      and(eq(kvCache.key, searchGenerationKey()), or(isNull(kvCache.expiresAt), gt(kvCache.expiresAt, new Date()))),
    )
    .limit(1)
    .then((rows) => parseGeneration(rows[0]?.value ?? 0))
    .catch((error: unknown) => {
      searchCacheGeneration = null
      getLogger('search.cache').warn('search cache generation read failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return 0
    })
  return searchCacheGeneration
}

/**
 * Test-only seam: drop the process-cached generation so the next search
 * re-reads the counter from `kv_cache`.
 */
export function __resetSearchCacheGenerationForTests(): void {
  searchCacheGeneration = null
}

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

async function searchCacheKey(settings: SearchSettings['search'], query: string, db: NodePgDatabase): Promise<string> {
  const generation = await readSearchCacheGeneration(db)
  const hashInput = cacheKeyParts(settings, query)
  return `${searchCachePrefix()}${generation}:${createHash('sha256').update(hashInput.join('|')).digest('hex')}`
}

async function getCachedSearchResult(db: NodePgDatabase, key: string): Promise<string[] | null> {
  const value = await getItem<unknown>(db, key)
  if (Array.isArray(value) && value.every((s) => typeof s === 'string')) {
    return value
  }
  return null
}

async function setCachedSearchResult(
  db: NodePgDatabase,
  key: string,
  slugs: string[],
  ttlSeconds: number,
): Promise<void> {
  if (slugs.length === 0) {
    return
  }
  await setItem(db, key, slugs, { ttlSeconds, bucket: 'searchResult' })
}

/**
 * Invalidate all cached search results by bumping the generation stamp.
 * Called whenever a post's published / deleted / restored state changes
 * so stale result lists don't survive until their TTL expires.
 *
 * A single INSERT … ON CONFLICT … DO UPDATE keeps the bump atomic
 * (Postgres row lock, the INCR equivalent). Fire-and-forget by contract:
 * invalidation must never bring down the post mutation that triggered
 * it, so database failures are logged and swallowed here — callers
 * neither catch nor inspect the result.
 */
export async function invalidateSearchCache(db: NodePgDatabase): Promise<void> {
  try {
    const result = await db.execute(
      sql`INSERT INTO kv_cache (key, bucket, value, blob, expires_at)
          VALUES (${searchGenerationKey()}, 'searchResult', '1'::jsonb, NULL, NULL)
          ON CONFLICT (key) DO UPDATE SET value = (kv_cache.value::int + 1)::text::jsonb
          RETURNING value`,
    )
    const generation = parseGeneration(result.rows[0]?.value ?? 0)
    searchCacheGeneration = Promise.resolve(generation)
    getLogger('search.cache').info('invalidated search result cache', { generation })
  } catch (error: unknown) {
    getLogger('search.cache').warn('search result cache invalidation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
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
// knowledge — the "live" rule lives in `@/server/domains/content/schema`).
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
  const cacheKey = await searchCacheKey(settings, trimmed, db)

  // Try cache first
  const cached = await getCachedSearchResult(db, cacheKey)
  if (cached !== null) {
    getLogger('search.result').info('Search result cache hit', {
      query: trimmed,
      total: cached.length,
    })
    const hits = cached.slice(offset, offset + limit)
    return {
      hits,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(cached.length / Math.max(limit, 1)),
    }
  }

  // Execute full search
  const allSlugs = await executeSearch(db, settings, baseWhere, trimmed)

  // Write cache (only when non-empty, as requested)
  if (allSlugs.length > 0) {
    const bundle = getBlogSettingsBundleSync()
    const ttl = bundle?.cache?.cache.searchResult?.ttlSeconds ?? CACHE_BUCKET_FALLBACKS.searchResult.ttlSeconds
    await setCachedSearchResult(db, cacheKey, allSlugs, ttl)
  }

  const hits = allSlugs.slice(offset, offset + limit)
  return {
    hits,
    page: Math.floor(offset / limit) + 1,
    totalPages: Math.ceil(allSlugs.length / Math.max(limit, 1)),
  }
}
